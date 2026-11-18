import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileCheck2, FileWarning, Landmark, ListChecks, ShieldAlert } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn, fmtUSD } from "@/lib/utils";
import { errorMessage } from "@/api/client";
import {
  RelaysApi, useDgftStatus, useExportCertificates, useRealisation, useRealisationOpen, useRelayRefresh,
} from "@/api/relays";
import { askReason } from "@/components/ReasonDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<string, "success" | "destructive" | "warning" | "outline"> = {
  realised: "success", overdue: "destructive", due_soon: "warning", open: "outline",
};

/** DGFT denied-entity list: how old the loaded copy is, and a CSV upload (compliance officer). */
export function DgftListCard() {
  const { data } = useDgftStatus();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    try {
      const out = await RelaysApi.dgftLoad(await file.text()) as { count: number };
      toast.success(`DGFT denied list loaded: ${out.count} entries`);
      qc.invalidateQueries({ queryKey: ["dgft-status"] });
    } catch (e) {
      toast.error("List not loaded", { description: errorMessage(e) });
    }
  }
  return (
    <Card className={cn(data && (!data.loaded || data.stale) && "border-[#f5a623]/40")} data-testid="dgft-list">
      <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">DGFT denied-entity list</span>
          {data && (data.loaded
            ? <span className={cn(data.stale ? "text-[#f5a623]" : "text-muted-foreground")}>
                {data.count} entries · loaded {data.age_days} days ago by {data.loaded_by}{data.stale ? " — stale, load the current one" : ""}</span>
            : <span className="text-[#f5a623]">not loaded — suppliers cannot be checked</span>)}
        </div>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => input.current?.click()}>
          Upload CSV (name, iec, address, order_ref, notified_on)
        </Button>
      </CardContent>
    </Card>
  );
}

/** Certificates the shipment needs before it sails, and recording one (deal page). */
export function ExportCertificatesCard({ dealId }: { dealId: string }) {
  const { data } = useExportCertificates(dealId);
  const refresh = useRelayRefresh(dealId);
  if (!data) return null;
  async function record(kind: string, label: string) {
    const r = await askReason({
      title: `Record: ${label}`,
      consequence: "The certificate's number goes on the deal and the shipment check stops asking for it.",
      reasonLabel: false, confirm: "Record",
      fields: [
        { name: "number", label: "Certificate number", required: true },
        { name: "date", label: "Issued on", type: "date" },
        { name: "issuer", label: "Issued by" },
        { name: "evidence", label: "Where the copy is (link / e-mail)" },
      ],
    });
    if (!r) return;
    try {
      await RelaysApi.recordCertificate(dealId, { kind, number: r.values.number, issued_on: r.values.date || undefined,
        issuer: r.values.issuer || undefined, evidence: r.values.evidence || undefined });
      toast.success(`${label} recorded`);
      refresh();
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) });
    }
  }
  return (
    <Card data-testid="export-certificates">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Export certificates</CardTitle>
          {data.missing.length > 0 && <Badge variant="warning" className="text-[10px]">{data.missing.length} missing</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 text-xs">
        {data.required.map((c) => (
          <div key={c.kind} className="flex items-center justify-between gap-2">
            <span>{c.label}</span>
            {c.certificate ? (
              <span className="text-[#2ec28a] tabular-nums">{c.certificate.number}{c.certificate.issued_on ? ` · ${c.certificate.issued_on}` : ""}</span>
            ) : (
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => record(c.kind, c.label)}>Record</Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Shipping Bills, realisation deadline and the manual CHA filing (deal page). */
export function CustomsRealisationCard({ dealId }: { dealId: string }) {
  const { data } = useRealisation(dealId);
  const refresh = useRelayRefresh(dealId);
  async function manual() {
    const r = await askReason({
      title: "Customs broker filed the Shipping Bill",
      consequence: "Records the CHA's filing while ICEGATE is not connected: customs counts as filed and the "
        + "realisation clock for the export proceeds starts from the Shipping Bill date.",
      reasonLabel: false, confirm: "Record filing",
      fields: [
        { name: "sb", label: "Shipping Bill number", required: true },
        { name: "date", label: "Shipping Bill date", type: "date", required: true },
        { name: "leo", label: "Let Export Order date", type: "date" },
        { name: "port", label: "Port (e.g. INNSA1)" },
        { name: "evidence", label: "Where the copy is (link / e-mail)" },
      ],
    });
    if (!r) return;
    try {
      await RelaysApi.manualCustoms(dealId, { shipping_bill_number: r.values.sb, shipping_bill_date: r.values.date,
        let_export_order_date: r.values.leo || undefined, port: r.values.port || undefined, evidence: r.values.evidence || undefined });
      toast.success("Shipping Bill recorded");
      refresh();
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) });
    }
  }
  const rows = data?.shipping_bills ?? [];
  return (
    <Card data-testid="customs-realisation">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#28c2a0]" />
            <CardTitle>Shipping Bill & export proceeds</CardTitle>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={manual}>Record CHA filing</Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        {rows.length === 0 ? <p className="text-muted-foreground">No Shipping Bill yet.</p> : rows.map((r) => (
          <div key={r.shipping_bill_number ?? "sb"} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">SB {r.shipping_bill_number}</span>
            <span className="text-muted-foreground">{r.shipping_bill_date}</span>
            <span className="tabular-nums">realised {fmtUSD(r.realised)} of {fmtUSD(r.invoice_value)}</span>
            {r.outstanding > 0 && <span className="tabular-nums">· {fmtUSD(r.outstanding)} outstanding by {r.deadline}</span>}
            <Badge variant={STATUS_TONE[r.status] ?? "outline"} className="text-[10px]">{r.status.replace("_", " ")}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** A money approver accepts a deal's exposure above a limit (the withheld PI then goes out). */
export function AcceptExposureButton({ dealId }: { dealId: string }) {
  const refresh = useRelayRefresh(dealId);
  async function go() {
    const r = await askReason({
      title: "Accept the exposure",
      consequence: "This deal exceeds an exposure limit (per deal, buyer, supplier, day or escrow total). Accepting "
        + "lets the Proforma Invoice go out on the next try. Recorded in the audit log with your name.",
      reasonLabel: "Why the risk is acceptable", minReason: 10, confirm: "Accept exposure", tone: "warning",
    });
    if (!r) return;
    try {
      await RelaysApi.acceptExposure(dealId, r.reason);
      toast.success("Exposure accepted");
      refresh();
    } catch (e) {
      toast.error("Not accepted", { description: errorMessage(e) });
    }
  }
  return <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={go}><FileWarning className="w-3.5 h-3.5" /> Accept exposure</Button>;
}

/** Export proceeds overdue or due soon across all deals (Money & Margin). */
export function RealisationOpenCard() {
  const { data } = useRealisationOpen();
  const rows = (data ?? []).filter((r) => r.status !== "open").slice(0, 12);
  if (rows.length === 0) return null;
  return (
    <Card className="border-[#f5a623]/40" data-testid="realisation-open">
      <CardContent className="p-3 space-y-1 text-xs">
        <div className="flex items-center gap-1.5 text-sm font-medium"><ListChecks className="w-4 h-4" /> Export proceeds to realise</div>
        {rows.map((r) => (
          <div key={`${r.deal_id}-${r.shipping_bill_number}`} className="flex flex-wrap gap-2 items-center">
            <Link className="text-primary hover:underline" to={`/deals/${r.deal_id}`}>{r.deal_id}</Link>
            <span>SB {r.shipping_bill_number}</span>
            <span className="tabular-nums">{fmtUSD(r.outstanding)} by {r.deadline}</span>
            <Badge variant={STATUS_TONE[r.status] ?? "outline"} className="text-[10px]">{r.status.replace("_", " ")}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Staff know both buyer and supplier: straight to the negotiation (Prospects). */
export function PrearrangedTradeButton() {
  const navigate = useNavigate();
  async function go() {
    const r = await askReason({
      title: "New pre-arranged trade",
      consequence: "Buyer and supplier are both known: no outreach or matching. Screening and trade compliance run, "
        + "then the negotiation opens from these two prices.",
      reasonLabel: false, confirm: "Start trade", tone: "success",
      fields: [
        { name: "hs", label: "HS code", required: true, placeholder: "10063020" },
        { name: "market", label: "Buyer's country (2 letters)", required: true, upper: true, placeholder: "AE" },
        { name: "qty", label: "Quantity MT", type: "number", required: true },
        { name: "buyer", label: "Buyer company", required: true },
        { name: "buyer_email", label: "Buyer e-mail" },
        { name: "buyer_price", label: "Buyer price USD/MT (CIF)", type: "number", required: true },
        { name: "supplier", label: "Supplier company", required: true },
        { name: "supplier_email", label: "Supplier e-mail" },
        { name: "supplier_price", label: "Supplier price USD/MT (FOB)", type: "number", required: true },
        { name: "written", label: "Supplier quote in writing?", type: "select", required: true,
          options: [{ value: "no", label: "No (phone)" }, { value: "yes", label: "Yes" }] },
      ],
    });
    if (!r) return;
    const v = r.values;
    try {
      const out = await RelaysApi.prearranged({
        hs_code: v.hs, market: v.market, quantity_mt: Number(v.qty),
        buyer: { legal_name: v.buyer, email: v.buyer_email || undefined, country: v.market },
        supplier: { legal_name: v.supplier, email: v.supplier_email || undefined, country: "IN" },
        buyer_price_usd: Number(v.buyer_price), supplier_price_usd: Number(v.supplier_price),
        supplier_quote_written: v.written === "yes",
      });
      toast.success(`Trade ${out.deal_id} started`);
      navigate(`/deals/${out.deal_id}`);
    } catch (e) {
      toast.error("Not started", { description: errorMessage(e) });
    }
  }
  return <Button size="sm" className="h-8 text-xs" onClick={go} data-testid="prearranged-trade">New pre-arranged trade</Button>;
}
