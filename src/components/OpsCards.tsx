import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Anchor, BadgeDollarSign, Coins, Gauge, MessageCircle, Repeat } from "lucide-react";
import { cn, fmtUSD } from "@/lib/utils";
import { errorMessage } from "@/api/client";
import { OpsApi, useCosts, useDemurrage, useFxReference, useInterest, useSupplierPerformance } from "@/api/ops";
import { askReason } from "@/components/ReasonDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STAGE_TONE: Record<string, "success" | "destructive" | "warning" | "outline" | "secondary"> = {
  ok: "outline", warning: "warning", running: "destructive", stopped: "secondary",
};

/** Reference exchange rates (System Health): which currencies have a usable rate, record one. */
export function FxReferenceCard() {
  const { data } = useFxReference();
  const qc = useQueryClient();
  async function record() {
    const r = await askReason({
      title: "Record a reference exchange rate",
      consequence: "Units of the currency per 1 USD. E-mails to that country's parties then show their own currency beside USD; "
        + "contracts and payments stay in USD. Recorded in the audit log.",
      reasonLabel: false, confirm: "Record",
      fields: [
        { name: "currency", label: "Currency (3 letters)", required: true, upper: true, placeholder: "AED" },
        { name: "rate", label: "Units per USD", type: "number", required: true, placeholder: "3.6725" },
        { name: "source", label: "Source", required: true, placeholder: "RBI reference rate / bank card rate" },
      ],
    });
    if (!r) return;
    try {
      await OpsApi.recordFx({ currency: r.values.currency, rate: Number(r.values.rate), source: r.values.source });
      toast.success(`${r.values.currency} rate recorded`);
      qc.invalidateQueries({ queryKey: ["fx-reference"] });
    } catch (e) {
      toast.error("Rate not recorded", { description: errorMessage(e) });
    }
  }
  async function refresh() {
    try {
      const out = await OpsApi.refreshFx();
      if (out.ok) toast.success(`Reference feed: ${out.recorded.join(", ") || "nothing new"}`);
      else toast.error("Reference feed not reached", { description: out.reason });
      qc.invalidateQueries({ queryKey: ["fx-reference"] });
    } catch (e) {
      toast.error("Refresh failed", { description: errorMessage(e) });
    }
  }
  const usable = Object.values(data?.usable ?? {});
  return (
    <Card data-testid="fx-reference">
      <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Coins className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Reference exchange rates</span>
          {usable.length === 0
            ? <span className="text-muted-foreground">none recorded — USD / INR uses the static fallback</span>
            : usable.map((r) => (
              <span key={r.currency} className="tabular-nums" title={`${r.source}${r.as_of ? ` · ${r.as_of.slice(0, 10)}` : ""}`}>
                {r.currency} {r.rate}
              </span>))}
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={refresh}>Refresh from feed</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={record}>Record rate</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** What running PortLess cost over the last 30 days (System Health). */
export function PlatformCostsCard() {
  const { data } = useCosts(30);
  if (!data) return null;
  const t = data.totals;
  return (
    <Card data-testid="platform-costs">
      <CardContent className="p-3 space-y-1.5 text-xs">
        <div className="flex items-center gap-2 text-sm font-medium"><BadgeDollarSign className="w-4 h-4" /> Running costs · last {data.days} days</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          <span>Total <b>{fmtUSD(t.total_usd)}</b></span>
          <span>LLM {fmtUSD(t.llm_usd)} ({t.llm_calls} calls)</span>
          <span>Apify {fmtUSD(t.apify_usd)} ({t.apify_runs} runs)</span>
          <span>Web search {fmtUSD(t.tavily_usd)} ({t.tavily_searches})</span>
          <span>Fixed {fmtUSD(t.fixed_usd)}</span>
          {data.cost_per_completed_deal_usd != null && <span>Per completed deal <b>{fmtUSD(data.cost_per_completed_deal_usd)}</b></span>}
          {data.apify_budget?.max_runs_per_day != null && <span>Apify today {data.apify_budget.runs_today} / {data.apify_budget.max_runs_per_day}</span>}
        </div>
        <p className="text-muted-foreground">{data.note}{Object.keys(data.fixed_monthly).length === 0 ? " Fixed costs: set COST_FIXED_MONTHLY_USD." : ""}</p>
      </CardContent>
    </Card>
  );
}

/** Demurrage (container at the port) and detention (empty not returned) against the free days (deal page). */
export function DemurrageCard({ dealId }: { dealId: string }) {
  const { data } = useDemurrage(dealId);
  const qc = useQueryClient();
  if (!data || data.clocks.length === 0) return null;
  async function returned() {
    const r = await askReason({
      title: "Empty container returned",
      consequence: "The buyer returned the empty container to the carrier's depot: the detention clock stops. Recorded with your name.",
      reasonLabel: false, confirm: "Record",
      fields: [
        { name: "at", label: "Returned on", type: "date" },
        { name: "evidence", label: "Evidence (EIR / carrier e-mail)" },
      ],
    });
    if (!r) return;
    try {
      await OpsApi.emptyReturned(dealId, { returned_at: r.values.at || undefined, evidence: r.values.evidence || undefined });
      toast.success("Empty return recorded");
      qc.invalidateQueries({ queryKey: ["demurrage", dealId] });
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) });
    }
  }
  const detentionRunning = data.clocks.some((c) => c.kind === "detention" && !c.stopped_at);
  return (
    <Card className={cn(data.attention.length > 0 && "border-[#f5a623]/40")} data-testid="demurrage">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Anchor className="w-4 h-4 text-[#28c2a0]" /><CardTitle>Container free days</CardTitle></div>
          {detentionRunning && <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={returned}>Empty returned</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 text-xs">
        {data.clocks.map((c) => (
          <div key={`${c.tpo_id}-${c.kind}`} className="flex flex-wrap items-center gap-2">
            <span className="font-medium capitalize">{c.kind}</span>
            <span className="tabular-nums">{c.days_used} of {c.free_days} free days</span>
            {c.cost_so_far_usd > 0 && <span className="tabular-nums text-[#ff5d6c]">{fmtUSD(c.cost_so_far_usd)} so far</span>}
            <Badge variant={STAGE_TONE[c.stage]} className="text-[10px]">{c.stage}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Interest a provider or bank credited on the escrow funds (deal page). */
export function EscrowInterestCard({ dealId }: { dealId: string }) {
  const { data } = useInterest(dealId);
  const qc = useQueryClient();
  async function record() {
    const r = await askReason({
      title: "Record interest on escrow funds",
      consequence: "Interest PortLess keeps raises the deal's realised margin; interest owed to the buyer is booked as owed back. Recorded in the audit log.",
      reasonLabel: false, confirm: "Record",
      fields: [
        { name: "amount", label: "Amount USD", type: "number", required: true },
        { name: "ref", label: "Statement reference", required: true },
        { name: "period", label: "Period (e.g. Nov 2026)" },
        { name: "whose", label: "Belongs to", type: "select", required: true,
          options: [{ value: "portless", label: "PortLess" }, { value: "buyer", label: "The buyer" }] },
      ],
    });
    if (!r) return;
    try {
      await OpsApi.recordInterest(dealId, { amount_usd: Number(r.values.amount), ref: r.values.ref, period: r.values.period || undefined,
        belongs_to: r.values.whose === "buyer" ? "buyer" : "portless" });
      toast.success("Interest recorded");
      for (const k of ["escrow-interest", "escrow-ledger"]) qc.invalidateQueries({ queryKey: [k, dealId] });
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) });
    }
  }
  const rows = data ?? [];
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs" data-testid="escrow-interest">
      {rows.map((i) => (
        <span key={i.interest_id} className="tabular-nums">{fmtUSD(i.amount_usd)} interest {i.period ?? ""} ({i.belongs_to === "buyer" ? "owed to buyer" : "ours"})</span>
      ))}
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={record}>Record escrow interest</Button>
    </div>
  );
}

/** How a supplier did on real deals, and the WhatsApp confirmation (company profile). */
export function SupplierPerformanceCard({ id, phone, whatsapp }: { id: string; phone?: string | null; whatsapp?: string | null }) {
  const { data } = useSupplierPerformance(id);
  const qc = useQueryClient();
  const p = data?.performance;
  async function confirmWhatsapp() {
    const r = await askReason({
      title: "Supplier answered on WhatsApp",
      consequence: "Records that this supplier is reachable on WhatsApp at the number on file. A phone-only supplier with an active GST registration then counts as verified.",
      reasonLabel: false, confirm: "Record",
      fields: [{ name: "evidence", label: "What they said / screenshot link" }],
    });
    if (!r) return;
    try {
      await OpsApi.phoneCheck(id, "confirmed", r.values.evidence || undefined);
      toast.success("WhatsApp confirmed");
      qc.invalidateQueries({ queryKey: ["counterparty-profile"] });
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) });
    }
  }
  return (
    <section className="rounded-lg border border-border p-3 space-y-1.5 text-xs" data-testid="supplier-performance">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" /> On real deals</p>
      {!p ? <p className="text-muted-foreground">No deal with this supplier yet.</p> : (
        <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
          <span>{p.deals} deal(s), {p.completed} completed</span>
          {p.qc_pass_rate != null && <span className={cn(p.qc_pass_rate < 0.8 && "text-[#ff5d6c]")}>QC passed {p.qc_passed} of {p.qc_inspections}</span>}
          {(p.on_time_ready + p.late_ready) > 0 && <span className={cn(p.late_ready > 0 && "text-[#f5a623]")}>ready on time {p.on_time_ready} of {p.on_time_ready + p.late_ready}</span>}
          {p.disputes > 0 && <span className="text-[#ff5d6c]">{p.disputes} dispute(s)</span>}
          {p.requoted_up > 0 && <span className="text-[#f5a623] flex items-center gap-0.5"><Repeat className="w-3 h-3" />raised its price {p.requoted_up}×</span>}
        </div>
      )}
      {phone && (
        <div className="flex items-center gap-2 pt-1">
          <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span>WhatsApp: {whatsapp ?? "unknown"}</span>
          {whatsapp !== "confirmed" && <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={confirmWhatsapp}>Answered on WhatsApp</Button>}
        </div>
      )}
    </section>
  );
}
