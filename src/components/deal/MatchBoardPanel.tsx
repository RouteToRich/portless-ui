import { useState } from "react";
import { toast } from "sonner";
import { Scale, RefreshCw, Send, Handshake, Pencil, Plus, AlertTriangle, StickyNote } from "lucide-react";
import { useAddKnowledgeNote, useKnowledgeSearch, useMatchActions, useMatchBoard } from "@/api/hooks";
import type { BuyerRequirement, Deal, MatchBoard, PairScore, PriceEstimate, SupplierOffer } from "@/api/types";
import { cn, fmtUSD } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASIS_LABEL: Record<string, { label: string; variant: "success" | "info" | "secondary" | "warning" }> = {
  quoted: { label: "quoted", variant: "success" },
  stated: { label: "stated", variant: "success" },
  counter: { label: "counter", variant: "success" },
  accepted_offer: { label: "accepted", variant: "success" },
  estimate: { label: "estimate", variant: "warning" },
  unknown: { label: "unknown", variant: "secondary" },
};

function errText(e: unknown, fallback: string) {
  return (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback;
}

function money(v?: number | null) {
  return v != null ? fmtUSD(v) : "—";
}

function EstimateTile({ title, est, hint }: { title: string; est: PriceEstimate; hint: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="text-lg font-bold mt-1">{est.median != null ? `${fmtUSD(est.median)}/MT` : "unknown"}</p>
      <p className="text-[11px] text-muted-foreground">
        {est.p25 != null && est.p75 != null ? `range ${fmtUSD(est.p25)}–${fmtUSD(est.p75)} · ` : ""}
        {est.n_observations} observation{est.n_observations === 1 ? "" : "s"} · confidence {est.confidence}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

function PriceCell({ value, basis, incoterm }: { value?: number | null; basis: string; incoterm?: string | null }) {
  const b = BASIS_LABEL[basis] ?? { label: basis, variant: "secondary" as const };
  return (
    <div className="space-y-0.5">
      <p className="font-mono">{money(value)}{incoterm ? <span className="text-muted-foreground text-[10px]"> {incoterm}</span> : null}</p>
      <Badge variant={b.variant} className="text-[9px] h-4 px-1.5">{b.label}</Badge>
    </div>
  );
}

function PairRow({ pair, dealId, minP }: { pair: PairScore; dealId: string; minP: number }) {
  const { offer, confirm } = useMatchActions(dealId);
  const canOffer = pair.feasible && !pair.firm && pair.supplier_price.basis === "quoted";
  const canConfirm = pair.blockers.length === 0 && pair.buyer_price.value != null && pair.supplier_price.value != null;
  const pct = Math.round(pair.probability * 100);

  async function run(kind: "offer" | "confirm") {
    try {
      const m = kind === "offer" ? offer : confirm;
      await m.mutateAsync({ candidateId: pair.candidate_id, offerId: pair.offer_id });
      toast.success(kind === "offer" ? "Indicative offer waiting for your approval" : "Match waiting for your approval", {
        description: "Open the Approvals Inbox to send / confirm it.",
      });
    } catch (e) {
      toast.error(errText(e, kind === "offer" ? "Could not prepare the offer" : "Could not propose the match"));
    }
  }

  return (
    <tr className={cn("border-b border-border align-top", !pair.feasible && "opacity-60")}>
      <td className="py-2 pr-3">
        <p className="font-medium">{pair.buyer_name}</p>
        <p className="text-[10px] text-muted-foreground">{pair.buyer_status} · {pair.quantity_mt} MT</p>
        {pair.buyer_history && (
          <p className="text-[10px] text-muted-foreground">history: {pair.buyer_history.signed} signed / {pair.buyer_history.failed} failed</p>
        )}
      </td>
      <td className="py-2 pr-3">
        <p className="font-medium">{pair.supplier_name}</p>
        {pair.origin_deal_id && <p className="text-[10px] text-muted-foreground">quote from {pair.origin_deal_id}</p>}
        {pair.supplier_history && (
          <p className="text-[10px] text-muted-foreground">
            history: {pair.supplier_history.completed} completed / {pair.supplier_history.bad} disputed
          </p>
        )}
      </td>
      <td className="py-2 pr-3"><PriceCell {...pair.buyer_price} /></td>
      <td className="py-2 pr-3"><PriceCell value={pair.supplier_price.value} basis={pair.supplier_price.basis} incoterm="FOB" /></td>
      <td className="py-2 pr-3 font-mono" title={pair.landed ? `FOB ${pair.landed.fob_usd_per_mt} + freight ${pair.landed.freight_usd_per_mt} + inspection ${pair.landed.inspection_usd_per_mt}/MT, insurance ${pair.landed.insurance_pct}%, escrow fee ${pair.landed.escrow_fee_pct}%, margin floor ${pair.landed.margin_floor_pct}%` : undefined}>
        {money(pair.landed?.min_offer_usd_per_mt)}
      </td>
      <td className={cn("py-2 pr-3 font-mono", (pair.margin_pct ?? 0) < (pair.landed?.margin_floor_pct ?? 8) ? "text-[#f5a623]" : "text-[#2ec28a]")}>
        {pair.margin_pct != null ? `${pair.margin_pct.toFixed(1)}%` : "—"}
      </td>
      <td className="py-2 pr-3">
        <span className={cn("font-bold", pct >= minP * 100 ? "text-[#2ec28a]" : pct > 0 ? "text-foreground" : "text-muted-foreground")}>{pct}%</span>
        {pair.calibrated && pair.probability_raw != null && (
          <p className="text-[10px] text-muted-foreground" title="Adjusted to how often similar predictions actually signed">
            calibrated (raw {Math.round(pair.probability_raw * 100)}%)
          </p>
        )}
        {pair.p_margin != null && <p className="text-[10px] text-muted-foreground">margin {Math.round(pair.p_margin * 100)}%</p>}
      </td>
      <td className="py-2 pr-3 max-w-[260px]">
        <p className="text-[11px]">{pair.next_step}</p>
        {pair.blockers.length > 1 && <p className="text-[10px] text-[#e5484d]">{pair.blockers.slice(1).join(" · ")}</p>}
        {pair.missing.length > 0 && <p className="text-[10px] text-muted-foreground">missing: {pair.missing.join(", ")}</p>}
      </td>
      <td className="py-2 whitespace-nowrap space-x-1">
        {canOffer && (
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={offer.isPending} onClick={() => run("offer")}>
            <Send className="w-3 h-3" /> Offer
          </Button>
        )}
        {canConfirm && (
          <Button size="sm" className="h-7 text-[11px] gap-1" disabled={confirm.isPending} onClick={() => run("confirm")}
                  title="Propose this pair as the deal (CONFIRM_MATCH approval)">
            <Handshake className="w-3 h-3" /> Match
          </Button>
        )}
      </td>
    </tr>
  );
}

function RequirementDialog({ dealId, buyer, onClose }: {
  dealId: string; buyer: MatchBoard["buyers"][number]; onClose: () => void;
}) {
  const { setRequirement } = useMatchActions(dealId);
  const r = buyer.requirement ?? {};
  const [f, setF] = useState({
    grade: r.grade ?? "", quantity_mt: r.quantity_mt?.toString() ?? "", destination_port: r.destination_port ?? "",
    incoterm: r.incoterm ?? "CIF", target_price_usd_per_mt: r.target_price_usd_per_mt?.toString() ?? "",
    delivery_window: r.delivery_window ?? "", delivery_by_days: r.delivery_by_days?.toString() ?? "",
    certifications: (r.certifications ?? []).join(", "),
  });
  const num = (v: string) => (v.trim() ? Number(v) : null);
  async function save() {
    const req: BuyerRequirement = {
      ...r, grade: f.grade || null, quantity_mt: num(f.quantity_mt), destination_port: f.destination_port || null,
      incoterm: f.incoterm || null, target_price_usd_per_mt: num(f.target_price_usd_per_mt),
      target_price_incoterm: f.target_price_usd_per_mt ? f.incoterm || "CIF" : null,
      target_price_basis: f.target_price_usd_per_mt ? (r.target_price_basis ?? "stated") : null,
      delivery_window: f.delivery_window || null, delivery_by_days: num(f.delivery_by_days),
      certifications: f.certifications.split(",").map((c) => c.trim()).filter(Boolean),
    };
    try {
      await setRequirement.mutateAsync({ candidateId: buyer.candidate_id, req });
      toast.success("Requirement saved — the board is re-scored");
      onClose();
    } catch (e) {
      toast.error(errText(e, "Could not save the requirement"));
    }
  }
  const field = (key: keyof typeof f, label: string, placeholder = "") => (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input value={f[key]} placeholder={placeholder} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="h-8 text-xs" />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What {buyer.legal_name} wants</DialogTitle>
          <DialogDescription>Correct what was read from their e-mails, or fill in what they told you by phone.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field("grade", "Grade / spec", "refined USP 99.7%")}
          {field("quantity_mt", "Quantity (MT)")}
          {field("destination_port", "Destination port")}
          {field("incoterm", "Incoterm", "CIF")}
          {field("target_price_usd_per_mt", "Target price USD/MT")}
          {field("delivery_by_days", "Needed within (days)")}
          {field("delivery_window", "Delivery window (text)")}
          {field("certifications", "Certificates (comma)", "COA, Halal")}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={setRequirement.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferDialog({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const { addOffer } = useMatchActions(dealId);
  const [f, setF] = useState({ supplier_id: "", company_name: "", email: "", fob: "", moq: "", capacity: "", lead: "", grade: "" });
  const num = (v: string) => (v.trim() ? Number(v) : null);
  async function save() {
    if (!f.supplier_id.trim() || !f.fob.trim()) {
      toast.error("Supplier id (e.g. its domain) and FOB price are required");
      return;
    }
    const offer: SupplierOffer = {
      offer_id: `OFR-OP-${Date.now().toString(36).toUpperCase()}`, supplier_id: f.supplier_id.trim(),
      company_name: f.company_name || f.supplier_id, email: f.email || null, fob_price_usd_per_mt: num(f.fob),
      moq_mt: num(f.moq), capacity_mt_per_month: num(f.capacity), lead_time_days: num(f.lead), grade: f.grade || null,
      source: "operator",
    };
    try {
      await addOffer.mutateAsync(offer);
      toast.success("Offer added — the board is re-scored");
      onClose();
    } catch (e) {
      toast.error(errText(e, "Could not add the offer"));
    }
  }
  const field = (key: keyof typeof f, label: string, placeholder = "") => (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input value={f[key]} placeholder={placeholder} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="h-8 text-xs" />
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a supplier offer</DialogTitle>
          <DialogDescription>A quote you received outside the RFQ e-mail (phone, WhatsApp, trade fair).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field("supplier_id", "Supplier id", "almsgroup.in")}
          {field("company_name", "Company name")}
          {field("email", "E-mail")}
          {field("fob", "FOB price USD/MT")}
          {field("moq", "MOQ (MT)")}
          {field("capacity", "Capacity MT/month")}
          {field("lead", "Lead time (days)")}
          {field("grade", "Grade / spec")}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={addOffer.isPending}>Add offer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NoteDialog({ deal, board, onClose }: { deal: Deal; board: MatchBoard; onClose: () => void }) {
  const add = useAddKnowledgeNote();
  const subjects = [
    ...board.buyers.map((b) => ({ key: `buyer|${b.candidate_id}`, label: `Buyer — ${b.legal_name}` })),
    ...board.offers.map((o) => ({ key: `supplier|${o.supplier_id}`, label: `Supplier — ${o.company_name || o.supplier_id}` })),
    { key: `product|${deal.hs_code}`, label: `Product — HS ${deal.hs_code}` },
    ...(deal.market ? [{ key: `market|${deal.market}`, label: `Market — ${deal.market}` }] : []),
    { key: `deal|${deal.deal_id}`, label: `This prospect — ${deal.deal_id}` },
  ];
  const [subject, setSubject] = useState(subjects[0]?.key ?? "");
  const [text, setText] = useState("");
  const [q, setQ] = useState(board.buyers[0]?.legal_name ?? `HS ${deal.hs_code}`);
  const search = useKnowledgeSearch(q);

  async function save() {
    const [subject_type, subject_id] = subject.split("|");
    try {
      const res = await add.mutateAsync({ subject_type, subject_id, text });
      toast.success(res.queued ? "Remembered — the negotiation agent will see it" : "Not stored (knowledge-service off)");
      onClose();
    } catch (e) {
      toast.error(errText(e, "Could not store the note"));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Memory (knowledge-service)</DialogTitle>
          <DialogDescription>
            Notes are read by the negotiation agent and the reply reader — never by the money decisions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-[11px]">About</Label>
          <select value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs">
            {subjects.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <Label className="text-[11px]">Note</Label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
                    placeholder="e.g. Only buys with LC at sight; rejected a shipment in 2025 for moisture above 0.5 %"
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
        </div>
        <div className="space-y-1.5 pt-2 border-t border-border">
          <Label className="text-[11px]">What PortLess already remembers</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-8 text-xs" />
          <div className="max-h-48 overflow-auto space-y-1">
            {search.data && !search.data.enabled && (
              <p className="text-[11px] text-muted-foreground">knowledge-service is not configured on this backend.</p>
            )}
            {search.data?.results.map((r, i) => (
              <p key={i} className="text-[11px] rounded border border-border px-2 py-1">
                <span className="text-muted-foreground">[{r.graph_fact ? "graph" : r.metadata.kind ?? "doc"}]</span> {r.text}
              </p>
            ))}
            {search.data?.enabled && search.data.results.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Nothing yet.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={save} disabled={add.isPending || text.trim().length < 3}>Remember</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function reqSummary(r?: BuyerRequirement | null) {
  if (!r) return "nothing known yet";
  const parts = [
    r.grade, r.quantity_mt != null ? `${r.quantity_mt} MT` : null,
    r.incoterm && r.destination_port ? `${r.incoterm} ${r.destination_port}` : r.destination_port || r.incoterm,
    r.target_price_usd_per_mt != null ? `target ${fmtUSD(r.target_price_usd_per_mt)}/MT (${r.target_price_basis ?? "stated"})` : null,
    r.delivery_window, (r.certifications ?? []).length ? (r.certifications ?? []).join("/") : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "nothing known yet";
}

/** Match board: every buyer × supplier pair of the prospect, scored on price
 *  (stated or price-book estimate), landed cost, margin and chance of closing. */
export function MatchBoardPanel({ deal }: { deal: Deal }) {
  const { data: board, isLoading } = useMatchBoard(deal.deal_id);
  const { evaluate } = useMatchActions(deal.deal_id);
  const [editing, setEditing] = useState<MatchBoard["buyers"][number] | null>(null);
  const [adding, setAdding] = useState(false);
  const [noting, setNoting] = useState(false);

  async function rescore() {
    try {
      const res = (await evaluate.mutateAsync()) as { gates?: { action: string }[] };
      const n = res?.gates?.length ?? 0;
      toast.success(n ? `${n} approval${n === 1 ? "" : "s"} opened` : "Re-scored — nothing to propose yet");
    } catch (e) {
      toast.error(errText(e, "Could not re-score"));
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#a78bfa]" />
            <CardTitle>Match board</CardTitle>
            <span className="text-[10px] text-muted-foreground">which buyer × which supplier is most likely to sign</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setNoting(true)}>
              <StickyNote className="w-3.5 h-3.5" /> Note / memory
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setAdding(true)}>
              <Plus className="w-3.5 h-3.5" /> Add offer
            </Button>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={rescore} disabled={evaluate.isPending}>
              <RefreshCw className="w-3.5 h-3.5" /> Re-score
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !board ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <EstimateTile title={`Buyers pay (CIF ${board.market ?? ""})`} est={board.buyer_estimate}
                            hint={`Comtrade market price${board.priors.buyer ? ` ${fmtUSD(board.priors.buyer)}` : " unknown"} + every target, counter and agreed price`} />
              <EstimateTile title="Suppliers ask (FOB India)" est={board.supplier_estimate}
                            hint={`India export price${board.priors.supplier ? ` ${fmtUSD(board.priors.supplier)}` : " unknown"} + every quote received`} />
              <div className="rounded-lg border border-border bg-secondary/50 p-3 text-[11px] space-y-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Landed-cost assumptions</p>
                <p>Freight {money(board.assumptions.freight_usd_per_mt)}/MT · insurance {board.assumptions.insurance_pct}%</p>
                <p>Inspection {money(board.assumptions.inspection_usd_per_shipment)}/shipment · escrow fee {board.assumptions.escrow_fee_pct}%</p>
                <p>Margin floor {board.assumptions.margin_floor_pct}%{board.assumptions.import_duty_pct != null ? ` · buyer's import duty ${board.assumptions.import_duty_pct}%` : ""}</p>
                <p className="text-muted-foreground">Match proposed at ≥ {Math.round(board.min_probability * 100)}% chance with firm prices</p>
                {board.learning && (
                  <p className="text-muted-foreground">
                    {board.learning.calibration_active
                      ? `Chances calibrated on ${board.learning.resolved_matches} past matches`
                      : `${board.learning.resolved_matches} past matches resolved — calibration starts at 20`}
                  </p>
                )}
              </div>
            </div>

            {board.next_actions.length > 0 && (
              <ul className="text-xs space-y-1">
                {board.next_actions.map((a) => (
                  <li key={a} className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 text-[#f5a623] shrink-0" />{a}</li>
                ))}
              </ul>
            )}

            {board.pairs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase text-muted-foreground">
                      <th className="text-left py-1.5 pr-3">Buyer</th>
                      <th className="text-left py-1.5 pr-3">Supplier</th>
                      <th className="text-left py-1.5 pr-3">Buyer price</th>
                      <th className="text-left py-1.5 pr-3">Supplier FOB</th>
                      <th className="text-left py-1.5 pr-3" title="Lowest price PortLess can offer and keep its margin floor">Our minimum</th>
                      <th className="text-left py-1.5 pr-3">Margin</th>
                      <th className="text-left py-1.5 pr-3">Chance</th>
                      <th className="text-left py-1.5 pr-3">Next step</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {board.pairs.slice(0, 15).map((p) => (
                      <PairRow key={`${p.candidate_id}-${p.offer_id}`} pair={p} dealId={deal.deal_id} minP={board.min_probability} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No pairs yet — pairs appear once at least one supplier has quoted. Buyers' requirements fill in as they reply.
              </p>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">What buyers want</p>
                <ul className="space-y-1.5">
                  {board.buyers.map((b) => (
                    <li key={b.candidate_id} className="rounded-md border border-border px-2.5 py-1.5 text-[11px] flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{b.legal_name} <span className="text-muted-foreground font-normal">· {b.status}</span></p>
                        <p className="text-muted-foreground">{reqSummary(b.requirement)}</p>
                        {b.indicative_offer && (
                          <p className="text-[10px]">
                            Offered {fmtUSD(b.indicative_offer.price_low_usd_per_mt)}–{fmtUSD(b.indicative_offer.price_high_usd_per_mt)} {b.indicative_offer.incoterm}
                            {" → "}{b.indicative_offer.response ?? "no reply yet"}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(b)} title="Edit requirement">
                        <Pencil className="w-3 h-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">What suppliers offer</p>
                {board.offers.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No quote yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {board.offers.map((o) => (
                      <li key={o.offer_id} className="rounded-md border border-border px-2.5 py-1.5 text-[11px]">
                        <p className="font-medium">
                          {o.company_name || o.supplier_id}
                          {o.verification_failed && <Badge variant="destructive" className="ml-1 text-[9px] h-4">verification failed</Badge>}
                          {o.gst_verified && o.iec_active && <Badge variant="success" className="ml-1 text-[9px] h-4">GST+IEC ok</Badge>}
                        </p>
                        <p className="text-muted-foreground">
                          {[o.fob_price_usd_per_mt != null ? `FOB ${fmtUSD(o.fob_price_usd_per_mt)}/MT` : null, o.grade,
                            o.moq_mt != null ? `MOQ ${o.moq_mt} MT` : null,
                            o.capacity_mt_per_month != null ? `${o.capacity_mt_per_month} MT/month` : null,
                            o.lead_time_days != null ? `${o.lead_time_days} days lead` : null, o.port_of_loading,
                            o.origin_deal_id && o.origin_deal_id !== deal.deal_id ? `from ${o.origin_deal_id}` : null,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
      {editing && <RequirementDialog dealId={deal.deal_id} buyer={editing} onClose={() => setEditing(null)} />}
      {adding && <OfferDialog dealId={deal.deal_id} onClose={() => setAdding(false)} />}
      {noting && board && <NoteDialog deal={deal} board={board} onClose={() => setNoting(false)} />}
    </Card>
  );
}
