import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

// GET /trade-min/opportunities/sourcing-status — per opportunity with a deal: RFQs sent,
// quotes with the best price, and whether a supplier confirmed the order at its price.
export type SourcingStatus = {
  deal_id: string;
  deal_status: string;
  stage: "confirmed" | "awaiting_confirmation" | "quoted" | "rfq_sent" | "no_rfq";
  rfqs_sent: number;
  suppliers_asked: number;
  quotes: number;
  best_quote_usd_per_mt: number | null;
  best_quote_supplier: string | null;
  confirmed: boolean;
  confirmed_price_usd_per_mt: number | null;
  confirmed_supplier: string | null;
  awaiting_supplier: string | null;
  requested_price_usd_per_mt?: number | null;
};

export function useOpportunitySourcing(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["opportunity-sourcing", key],
    queryFn: () =>
      api
        .get<{ status: Record<string, SourcingStatus> }>("/trade-min/opportunities/sourcing-status", { params: { ids: key } })
        .then((r) => r.data.status),
    enabled: ids.length > 0,
    refetchInterval: 30_000,
  });
}

const usd = (v: number | null | undefined) =>
  v == null ? "—" : `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}/MT`;

/** One line telling how far the supplier side of an opportunity has got. */
export function SourcingStatusBadge({ status }: { status: SourcingStatus | undefined }) {
  if (!status) return <span className="text-xs text-muted-foreground">No RFQ yet</span>;
  const s = status;
  const view: Record<SourcingStatus["stage"], { label: string; detail: string; tone: string }> = {
    confirmed: {
      label: "Price confirmed",
      detail: `${s.confirmed_supplier ?? "Supplier"} confirmed the order at ${usd(s.confirmed_price_usd_per_mt)}`,
      tone: "border-[#28c2a0]/50 text-[#28c2a0] bg-[#28c2a0]/10",
    },
    awaiting_confirmation: {
      label: "Awaiting confirmation",
      detail: `${s.awaiting_supplier ?? "Supplier"} asked to confirm at ${usd(s.requested_price_usd_per_mt)}`,
      tone: "border-[#f5a524]/50 text-[#f5a524] bg-[#f5a524]/10",
    },
    quoted: {
      label: `${s.quotes} quote${s.quotes === 1 ? "" : "s"}`,
      detail: `Best ${usd(s.best_quote_usd_per_mt)}${s.best_quote_supplier ? ` · ${s.best_quote_supplier}` : ""}`,
      tone: "border-[#4f8cff]/50 text-[#4f8cff] bg-[#4f8cff]/10",
    },
    rfq_sent: {
      label: "RFQ sent",
      detail: `${s.suppliers_asked} supplier${s.suppliers_asked === 1 ? "" : "s"} asked · no price yet`,
      tone: "border-border text-muted-foreground",
    },
    no_rfq: { label: "No RFQ yet", detail: `Deal ${s.deal_id} · ${s.deal_status}`, tone: "border-border text-muted-foreground" },
  };
  const v = view[s.stage];
  return (
    <div className="text-xs space-y-0.5" title={`Deal ${s.deal_id} (${s.deal_status}) — ${v.detail}`}>
      <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium", v.tone)}>{v.label}</span>
      <p className="text-muted-foreground truncate max-w-[180px]">{v.detail}</p>
    </div>
  );
}
