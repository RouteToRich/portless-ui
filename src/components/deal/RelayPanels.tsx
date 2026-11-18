import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Calculator, Package, PhoneCall, Ship, Wallet } from "lucide-react";
import { cn, fmtUSD } from "@/lib/utils";
import { errorMessage } from "@/api/client";
import {
  RelaysApi, type QcProviderStatus, useAccuracy, useReordersDue, useCostSheet, useFreightLanes, useMarketCheck, usePacking,
  usePutFreightLane, useRelayRefresh,
} from "@/api/relays";
import { askReason } from "@/components/ReasonDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CALL_NOTE = "Call note (who said it, how, when) — kept in the audit log";

async function run(label: string, fn: () => Promise<unknown>, after: () => void) {
  try {
    await fn();
    toast.success(label);
    after();
  } catch (e) {
    toast.error("Not recorded", { description: errorMessage(e) });
  }
}

/** What the supplier said by phone / WhatsApp, recorded in one click (review board B-18). */
export function SupplierPhonePanel({ dealId }: { dealId: string }) {
  const refresh = useRelayRefresh(dealId);

  async function confirmOrder() {
    const r = await askReason({
      title: "Supplier confirmed the order",
      consequence: "Opens the order-confirmation gate (a person approves it), then the buyer's proforma invoice is "
        + "issued at the supplier's confirmed price.",
      reasonLabel: CALL_NOTE, minReason: 10, confirm: "Record confirmation", tone: "success",
    });
    if (r) await run("Confirmation recorded — approval requested", () => RelaysApi.confirmOrder(dealId, r.reason), refresh);
  }
  async function nextSupplier() {
    const r = await askReason({
      title: "Supplier declined — ask the next one",
      consequence: "This supplier's order request closes; the next-ranked supplier whose own price still clears the "
        + "margin floor gets the firm order request.",
      reasonLabel: CALL_NOTE, minReason: 10, confirm: "Ask the next supplier", tone: "warning",
    });
    if (r) await run("Next supplier asked", () => RelaysApi.nextSupplier(dealId, r.reason), refresh);
  }
  async function poAck() {
    const r = await askReason({
      title: "Supplier acknowledged the PO",
      consequence: "The inspection is booked (on the goods-ready date when known).",
      reasonLabel: CALL_NOTE, minReason: 10, confirm: "Record acknowledgement", tone: "success",
    });
    if (r) await run("PO acknowledged — inspection booking follows", () => RelaysApi.poAck(dealId, r.reason), refresh);
  }
  async function readyDate() {
    const r = await askReason({
      title: "Goods-ready date",
      consequence: "The inspection is booked for this date (never sooner than the booking lead time).",
      reasonLabel: false, confirm: "Record date",
      fields: [
        { name: "date", label: "Goods ready on", type: "date", required: true },
        { name: "produced", label: "Produced %", type: "number", placeholder: "100" },
        { name: "packed", label: "Packed %", type: "number", placeholder: "80" },
        { name: "note", label: "Call note", placeholder: "who said it, when" },
      ],
    });
    if (!r) return;
    const { date, produced, packed, note } = r.values;
    await run("Goods-ready date recorded", () => RelaysApi.readyDate(dealId, {
      ready_date: date, produced_pct: produced ? Number(produced) : undefined,
      packed_pct: packed ? Number(packed) : undefined, note: note || undefined,
    }), refresh);
  }
  async function address() {
    const r = await askReason({
      title: "Supplier's facility address",
      consequence: "Where the inspector goes. Replaces the town the scan knew; the old one stays in the address history. "
        + "A waiting inspection is booked once it is complete.",
      reasonLabel: false, confirm: "Save address",
      fields: [{ name: "address", label: "Full address with PIN code", required: true, placeholder: "Plot 12, SIPCOT, Thanjavur 613005" }],
    });
    if (r) await run("Facility address saved", () => RelaysApi.facilityAddress(dealId, r.values.address), refresh);
  }

  return (
    <Card data-testid="supplier-phone-panel">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PhoneCall className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Supplier said (by phone / WhatsApp)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={confirmOrder}>Confirmed the order</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={nextSupplier}>Declined — next supplier</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={poAck}>Acknowledged the PO</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={readyDate}>Goods-ready date</Button>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={address}>Facility address</Button>
      </CardContent>
    </Card>
  );
}

const QC_STATUSES: QcProviderStatus[] = ["CONFIRMED", "INSPECTED", "REPORT_ISSUED", "CANCELLED"];

/** QC actions for portal inspectors (SGS / BV report by e-mail) and any booking. */
export function QcRelayControls({ dealId, tpoId }: { dealId: string; tpoId: string }) {
  const refresh = useRelayRefresh(dealId);
  async function result() {
    const r = await askReason({
      title: "Record what the inspector reported",
      consequence: "REPORT_ISSUED with PASS moves the deal to QC passed (document pack, next tranche, freight); FAIL "
        + "opens a dispute and the re-inspection playbook. Same effect as the provider's signed webhook.",
      reasonLabel: false, confirm: "Record",
      fields: [
        { name: "status", label: "Status", type: "select", required: true, options: QC_STATUSES.map((s) => ({ value: s, label: s })) },
        { name: "result", label: "Result (with REPORT_ISSUED)", type: "select", options: [{ value: "PASS", label: "PASS" }, { value: "FAIL", label: "FAIL" }] },
        { name: "date", label: "Inspection date", type: "date" },
        { name: "report", label: "Report link", placeholder: "https://…" },
        { name: "notes", label: "Notes" },
      ],
    });
    if (!r) return;
    const v = r.values;
    if (v.status === "REPORT_ISSUED" && !v.result) {
      toast.error("A report needs PASS or FAIL");
      return;
    }
    await run("Inspector update recorded", () => RelaysApi.qcStatus(tpoId, {
      status: v.status as QcProviderStatus, result: (v.result || undefined) as "PASS" | "FAIL" | undefined,
      inspection_date: v.date || undefined, report_url: v.report || undefined, notes: v.notes || undefined,
    }), refresh);
  }
  async function reschedule() {
    const r = await askReason({
      title: "Move the inspection",
      consequence: "Cancelled at the provider and booked again for the new date. The deal stays waiting for the inspection.",
      confirm: "Reschedule", tone: "warning",
      fields: [{ name: "date", label: "New inspection date", type: "date", required: true }],
    });
    if (r) await run("Inspection rescheduled", () => RelaysApi.qcReschedule(tpoId, { inspection_date: r.values.date, reason: r.reason }), refresh);
  }
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="qc-relay">
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={result}>Record result</Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px]"
        onClick={() => run("Asked the provider", () => RelaysApi.qcPoll(dealId), refresh)}>Check provider now</Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={reschedule}>Reschedule</Button>
    </div>
  );
}

/** A stage SUBMITTED to the escrow provider that the provider has paid out (seen on its dashboard). */
export function ProviderConfirmedButton({ dealId, escrowId, trancheId }: { dealId: string; escrowId: string; trancheId: string }) {
  const refresh = useRelayRefresh(dealId);
  async function confirm() {
    const r = await askReason({
      title: `Provider paid out ${trancheId}`,
      consequence: "Books the stage RELEASED (money out of escrow) as the provider reported it; the supplier payout "
        + "that it funds can follow. Use only with the provider's own reference.",
      reasonLabel: "Where you saw it (dashboard / statement)", confirm: "Book as released", tone: "warning",
      fields: [{ name: "ref", label: "Provider reference", required: true }],
    });
    if (r) await run(`${trancheId} booked as released`, () => RelaysApi.providerConfirmed(escrowId, trancheId, { provider_ref: r.values.ref, reason: r.reason }), refresh);
  }
  return <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={confirm}>Provider paid out</Button>;
}

/** Every PortLess cost between the supplier and the buyer's port, plus the market check. */
export function CostSheetCard({ dealId }: { dealId: string }) {
  const { data: sheet } = useCostSheet(dealId);
  const { data: market } = useMarketCheck(dealId);
  if (!sheet && !market) return null;
  const verdictTone = market?.verdict === "go" ? "success" : market?.verdict === "avoid" ? "destructive" : "outline";
  return (
    <Card data-testid="cost-sheet">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Calculator className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Cost sheet</CardTitle>
          {market && <Badge variant={verdictTone} className="text-[10px]">market: {market.verdict}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {sheet && (
          <>
            <table className="w-full">
              <thead className="text-muted-foreground text-left"><tr><th className="py-1">Cost</th><th>Per MT</th><th>% of price</th><th>Source</th></tr></thead>
              <tbody>
                {sheet.lines.map((l) => (
                  <tr key={l.key} className="border-t border-border/50">
                    <td className="py-1">{l.label}{l.note ? <span className="text-muted-foreground"> — {l.note}</span> : null}</td>
                    <td className="tabular-nums">{l.usd_per_mt ? fmtUSD(l.usd_per_mt) : "—"}</td>
                    <td className="tabular-nums">{l.pct_of_price ? `${l.pct_of_price} %` : "—"}</td>
                    <td className={cn(l.source === "quote" ? "text-[#2ec28a]" : "text-muted-foreground")}>{l.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-4">
              <span>Supplier price: <b>{sheet.supplier_price_usd_per_mt ? fmtUSD(sheet.supplier_price_usd_per_mt) : "—"}</b> {sheet.supplier_price_basis}</span>
              <span>Lowest buyer price at the {sheet.margin_floor_pct ?? "—"} % floor: <b>{sheet.min_buyer_price_usd_per_mt ? fmtUSD(sheet.min_buyer_price_usd_per_mt) : "—"}</b></span>
              {sheet.net_margin_at_agreed_pct != null && <span>Net margin at the agreed price: <b>{sheet.net_margin_at_agreed_pct} %</b></span>}
            </div>
            {sheet.container_plan && sheet.container_plan.capacity_mt > 0 && (
              <p>Containers: {sheet.container_plan.containers_20}×20′ + {sheet.container_plan.containers_40}×40′ · capacity{" "}
                {sheet.container_plan.capacity_mt} MT · {sheet.container_plan.fill_pct} % full
                {sheet.container_plan.fill_suggestion_mt > 0 && <b> — offer {sheet.container_plan.fill_suggestion_mt} MT more to fill them</b>}</p>
            )}
            {sheet.warnings.length > 0 && <p className="text-[#f5a623]">{sheet.warnings.join(" · ")}</p>}
          </>
        )}
        {market && <p className="text-muted-foreground">{market.summary}</p>}
      </CardContent>
    </Card>
  );
}

/** What the buyer asked for in packing, what it costs, what the inspector checks. */
export function PackingCard({ dealId }: { dealId: string }) {
  const { data } = usePacking(dealId);
  const refresh = useRelayRefresh(dealId);
  async function edit() {
    const r = await askReason({
      title: "Buyer's packing",
      consequence: "Read like a buyer e-mail (bag type and weight, liner, marking / private label, pallets, fumigation, "
        + "container lining, or 'standard is fine'); priced on the cost sheet and passed to the supplier, PI, PO and inspector.",
      reasonLabel: "What the buyer asked for", minReason: 3, confirm: "Save packing",
    });
    if (r) await run("Packing saved", () => RelaysApi.setPacking(dealId, r.reason), refresh);
  }
  return (
    <Card data-testid="packing-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#28c2a0]" />
            <CardTitle>Packing</CardTitle>
            {data?.special && <Badge variant="outline" className="text-[10px]">special</Badge>}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={edit}>Set packing</Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        <p>{data?.description ?? "Not known yet — the agreement waits for it."}</p>
        {data && data.surcharge_usd_per_mt > 0 && (
          <p>Adds {fmtUSD(data.surcharge_usd_per_mt)} / MT {data.in_supplier_price ? "(in the supplier's price)" : "(paid by PortLess until the supplier includes it)"}</p>
        )}
        {data && data.qc_checks.length > 0 && <p className="text-muted-foreground">Inspector checks: {data.qc_checks.join(" · ")}</p>}
      </CardContent>
    </Card>
  );
}

/** Forwarder / staff freight quotes per lane (radar profit uses them) — Radar. */
export function FreightLanesCard() {
  const { data } = useFreightLanes();
  const put = usePutFreightLane();
  async function add() {
    const r = await askReason({
      title: "Freight quote for a lane",
      consequence: "The radar and the match board price this lane from the quote (for LANE_QUOTE_MAX_AGE_DAYS) instead of the regional estimate.",
      reasonLabel: false, confirm: "Save quote",
      fields: [
        { name: "market", label: "Destination country (2 letters)", required: true, upper: true, placeholder: "AE" },
        { name: "type", label: "Container", type: "select", required: true, options: [{ value: "dry", label: "Dry (20GP)" }, { value: "reefer", label: "Reefer (20RF)" }] },
        { name: "usd", label: "USD per container", type: "number", required: true },
        { name: "mt", label: "MT per container", type: "number", placeholder: "20" },
        { name: "note", label: "Who quoted, reference" },
      ],
    });
    if (!r) return;
    const v = r.values;
    try {
      await put.mutateAsync({ market: v.market, container_type: v.type, usd_per_container: Number(v.usd),
        container_mt: v.mt ? Number(v.mt) : undefined, note: v.note || undefined });
      toast.success("Freight quote saved");
    } catch (e) {
      toast.error("Not saved", { description: errorMessage(e) });
    }
  }
  const rows = data ?? [];
  return (
    <Card data-testid="freight-lanes">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-sm font-medium"><Ship className="w-4 h-4 text-muted-foreground" /> Freight per lane</div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={add}>Add quote</Button>
        </div>
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">No lane quotes — the radar uses regional estimates.</p> : (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {rows.map((l) => (
              <span key={`${l.market}-${l.container_type}`} className="rounded border border-border px-1.5 py-0.5">
                {l.origin_port} → {l.market} {l.container_type}: {fmtUSD(l.usd_per_container)} ({fmtUSD(l.usd_per_mt)}/MT) · {l.provider}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Radar estimate vs realised margin on settled deals, and the correction it drives — Radar. */
export function AccuracyCard() {
  const { data } = useAccuracy();
  if (!data || data.rows.length === 0) return null;
  return (
    <Card data-testid="profit-accuracy">
      <CardContent className="p-3 space-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-sm font-medium"><Wallet className="w-4 h-4 text-muted-foreground" /> How right the radar was</div>
        {data.overall && <p>{data.overall.deals} settled deals: realised ÷ estimated margin ×{data.overall.median_ratio}</p>}
        <div className="flex flex-wrap gap-1.5">
          {data.rows.slice(0, 12).map((r) => (
            <Link key={r.deal_id} to={`/deals/${r.deal_id}`} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground">
              {r.deal_id} · HS {r.hs_code}: {fmtUSD(r.estimated_margin_usd)} → {fmtUSD(r.realised_margin_usd)} (×{r.ratio})
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


/** Repeat a completed deal: same buyer, supplier, product and market; the supplier is asked for a fresh quote. */
export function ReorderButton({ dealId }: { dealId: string }) {
  const navigate = useNavigate();
  async function go() {
    const r = await askReason({
      title: "Reorder",
      consequence: "Starts a new prospect with the same buyer and supplier, product and market; the last agreed price "
        + "becomes the buyer's target and the supplier gets the RFQ for a fresh quote. Screening and compliance run again.",
      reasonLabel: false, confirm: "Start reorder", tone: "success",
      fields: [{ name: "qty", label: "Quantity in MT", type: "number", placeholder: "same as last time" }],
    });
    if (!r) return;
    try {
      const out = await RelaysApi.reorder(dealId, r.values.qty ? Number(r.values.qty) : undefined);
      toast.success(`Reorder ${out.deal_id} started`);
      navigate(`/deals/${out.deal_id}`);
    } catch (e) {
      toast.error("Reorder not started", { description: errorMessage(e) });
    }
  }
  return <Button size="sm" variant="success" className="h-8 text-xs" onClick={go} data-testid="reorder">Reorder</Button>;
}

/** Buyers whose usual next order is near (Prospects). */
export function ReordersDueCard() {
  const { data } = useReordersDue();
  const rows = data ?? [];
  if (rows.length === 0) return null;
  return (
    <Card data-testid="reorders-due">
      <CardContent className="p-3 space-y-1.5 text-xs">
        <div className="text-sm font-medium">Reorders due ({rows.length})</div>
        {rows.map((r) => (
          <div key={r.deal_id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{r.buyer ?? "Buyer"}</span>
            <span className="text-muted-foreground">HS {r.hs_code} → {r.market} · every {r.usual_gap_days} d · next ~{r.next_order_due}
              {r.overdue_days ? ` (${r.overdue_days} d overdue)` : ""}</span>
            <Link className="text-primary hover:underline" to={`/deals/${r.deal_id}`}>last deal {r.deal_id}</Link>
            <ReorderButton dealId={r.deal_id} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
