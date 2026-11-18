/** Staff relays for what a supplier or provider said outside e-mail (phone, WhatsApp,
 * portal), plus the deal's cost sheet / market check / packing and the radar's lane freight
 * and profit accuracy (review board B-18). Every relay is recorded with the person in the
 * audit log on the backend. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type QcProviderStatus = "REQUESTED" | "CONFIRMED" | "INSPECTED" | "REPORT_ISSUED" | "CANCELLED";

export interface CostSheetLine {
  key: string;
  label: string;
  usd_per_mt: number;
  pct_of_price: number;
  paid_by: string;
  source: string;
  note: string;
}
export interface CostSheet {
  quantity_mt: number;
  market: string | null;
  supplier_price_basis: string;
  lines: CostSheetLine[];
  fixed_usd_per_mt: number;
  pct_of_price: number;
  warnings: string[];
  inspection_phases?: number;
  container_plan?: { containers_20: number; containers_40: number; capacity_mt: number; fill_pct: number;
    spare_mt: number; fill_suggestion_mt: number };
  supplier_price_usd_per_mt: number | null;
  margin_floor_pct: number | null;
  min_buyer_price_usd_per_mt: number | null;
  agreed_price_usd_per_mt: number | null;
  net_margin_at_agreed_pct: number | null;
}
export interface MarketCheck { verdict: string; summary: string; reasons: string[]; risks: string[] }
export interface PackingView {
  description: string | null;
  special: boolean;
  surcharge_usd_per_mt: number;
  in_supplier_price: boolean;
  qc_checks: string[];
}
export interface LaneRate {
  market: string;
  container_type: string;
  origin_port: string;
  usd_per_container: number;
  container_mt: number;
  usd_per_mt: number;
  provider: string;
  quoted_at: string | null;
  note: string | null;
}
export interface AccuracyRow {
  deal_id: string; hs_code: string; market: string;
  estimated_margin_usd: number; realised_margin_usd: number; ratio: number;
}
export interface Accuracy {
  rows: AccuracyRow[];
  by_hs: Record<string, { deals: number; median_ratio: number }>;
  overall: { deals: number; median_ratio: number } | null;
}

export interface ReorderDue {
  deal_id: string; buyer: string | null; hs_code: string; market: string; orders: number;
  usual_gap_days: number; next_order_due: string; overdue_days: number;
}

export const RelaysApi = {
  confirmOrder: (dealId: string, reason: string) =>
    api.post(`/deals/${dealId}/supplier-commitment/confirm`, { reason }).then((r) => r.data),
  nextSupplier: (dealId: string, reason: string) =>
    api.post(`/deals/${dealId}/supplier-commitment/next`, { reason }).then((r) => r.data),
  poAck: (dealId: string, reason: string) =>
    api.post(`/deals/${dealId}/supplier-commitment/po-ack`, { reason }).then((r) => r.data),
  readyDate: (dealId: string, body: { ready_date: string; produced_pct?: number; packed_pct?: number; note?: string }) =>
    api.post(`/shield-link/deals/${dealId}/qc-readiness`, body).then((r) => r.data),
  facilityAddress: (dealId: string, address: string) =>
    api.patch(`/deals/${dealId}/parties/supplier`, { address }).then((r) => r.data),
  qcStatus: (ref: string, body: { status: QcProviderStatus; result?: "PASS" | "FAIL"; inspection_date?: string;
    report_url?: string; notes?: string }) => api.post(`/shield-link/qc/${ref}/status`, body).then((r) => r.data),
  qcPoll: (dealId: string) => api.post(`/shield-link/deals/${dealId}/qc/poll`, {}).then((r) => r.data),
  qcReschedule: (tpoId: string, body: { inspection_date: string; reason: string }) =>
    api.post(`/shield-link/qc/${tpoId}/reschedule`, body).then((r) => r.data),
  providerConfirmed: (escrowId: string, trancheId: string, body: { provider_ref: string; reason: string }) =>
    api.post(`/escrow-guard/escrows/${escrowId}/tranches/${trancheId}/provider-confirmed`, body).then((r) => r.data),
  costSheet: (dealId: string) => api.get<CostSheet>(`/deals/${dealId}/cost-sheet`).then((r) => r.data)
    .catch((e) => { if (e?.response?.status === 404) return null; throw e; }),
  marketCheck: (dealId: string) => api.get<MarketCheck>(`/deals/${dealId}/market-check`).then((r) => r.data)
    .catch((e) => { if (e?.response?.status === 404) return null; throw e; }),
  packing: (dealId: string) => api.get<PackingView>(`/deals/${dealId}/packing`).then((r) => r.data),
  setPacking: (dealId: string, text: string) => api.put(`/deals/${dealId}/packing`, { text }).then((r) => r.data),
  freightLanes: () => api.get<LaneRate[]>("/trade-min/freight-lanes").then((r) => r.data),
  putFreightLane: (body: { market: string; container_type: string; usd_per_container: number; container_mt?: number; note?: string }) =>
    api.put("/trade-min/freight-lanes", body).then((r) => r.data),
  accuracy: () => api.get<Accuracy>("/trade-min/profit/accuracy").then((r) => r.data),
  reorder: (dealId: string, quantityMt?: number) =>
    api.post<{ deal_id: string }>(`/deals/${dealId}/reorder`, quantityMt ? { quantity_mt: quantityMt } : {}).then((r) => r.data),
  reordersDue: () => api.get<ReorderDue[]>("/deals/reorders/due").then((r) => r.data),
};

export const useCostSheet = (dealId: string) => useQuery({ queryKey: ["cost-sheet", dealId], queryFn: () => RelaysApi.costSheet(dealId) });
export const useMarketCheck = (dealId: string) => useQuery({ queryKey: ["market-check", dealId], queryFn: () => RelaysApi.marketCheck(dealId) });
export const usePacking = (dealId: string) => useQuery({ queryKey: ["packing", dealId], queryFn: () => RelaysApi.packing(dealId) });
export const useFreightLanes = () => useQuery({ queryKey: ["freight-lanes"], queryFn: RelaysApi.freightLanes });
export const useReordersDue = () => useQuery({ queryKey: ["reorders-due"], queryFn: RelaysApi.reordersDue });
export const useAccuracy = () => useQuery({ queryKey: ["profit-accuracy"], queryFn: RelaysApi.accuracy });

/** After a relay: everything on the deal page that may have moved. */
export function useRelayRefresh(dealId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of ["deal", "supplier-commitment", "qc-records", "escrow-hold", "escrow-ledger", "approvals",
      "packing", "cost-sheet", "deal-timeline"]) {
      qc.invalidateQueries({ queryKey: [key, dealId] });
    }
    qc.invalidateQueries({ queryKey: ["approvals"] });
  };
}

export function usePutFreightLane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: RelaysApi.putFreightLane,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["freight-lanes"] }),
  });
}
