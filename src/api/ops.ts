/** Reference exchange rates, running costs, demurrage / detention, escrow interest, supplier
 * performance and the phone check (backend shared/fx_rates.py, cost_meter.py, demurrage.py,
 * escrow_interest.py, supplier_performance.py, phone_check.py). */
import { useQuery } from "@tanstack/react-query";
import { api } from "./client";

export interface FxRate { currency: string; rate: number; source: string; kind?: string; recorded_by?: string; as_of: string | null }
export interface FxReference { usable: Record<string, FxRate>; history: FxRate[]; max_age_days: number }

export interface CostDay {
  day: string; llm_calls: number; llm_usd: number; apify_runs: number; apify_usd: number;
  tavily_searches: number; tavily_usd: number; fixed_usd: number; total_usd: number;
}
export interface CostReport {
  days: number; per_day: CostDay[];
  totals: CostDay & { variable_usd: number; total_usd: number };
  fixed_monthly: Record<string, number>; booked_to_deals_usd: number; completed_deals: number;
  cost_per_completed_deal_usd: number | null;
  apify_budget: { runs_today: number; max_runs_per_day: number | null } | null; note: string;
}

export interface FreeDaysClock {
  tpo_id: string; kind: "demurrage" | "detention"; started_at: string; stopped_at: string | null;
  days_used: number; free_days: number; days_left: number; stage: "ok" | "warning" | "running" | "stopped";
  containers: number; cost_so_far_usd: number;
}
export interface Demurrage { deal_id: string; clocks: FreeDaysClock[]; attention: FreeDaysClock[] }

export interface InterestRow { interest_id: string; amount_usd: number; period: string | null; ref: string; belongs_to: "portless" | "buyer"; by: string; at: string }

export interface SupplierPerformance {
  deals: number; completed: number; cancelled: number; qc_inspections: number; qc_passed: number; qc_failed: number;
  qc_pass_rate: number | null; on_time_ready: number; late_ready: number; disputes: number; price_kept: number;
  requoted_up: number; deal_ids: string[];
}

export const OpsApi = {
  fxReference: () => api.get<FxReference>("/deals/fx/reference").then((r) => r.data),
  recordFx: (body: { currency: string; rate: number; source: string }) => api.post<FxRate>("/deals/fx/reference", body).then((r) => r.data),
  refreshFx: () => api.post<{ ok: boolean; recorded: string[]; reason?: string }>("/deals/fx/reference/refresh", {}).then((r) => r.data),
  costs: (days = 30) => api.get<CostReport>(`/health/costs?days=${days}`).then((r) => r.data),
  demurrage: (dealId: string) => api.get<Demurrage>(`/shield-link/deals/${dealId}/demurrage`).then((r) => r.data),
  emptyReturned: (dealId: string, body: { returned_at?: string; evidence?: string }) =>
    api.post(`/shield-link/deals/${dealId}/empty-returned`, body).then((r) => r.data),
  interest: (dealId: string) => api.get<InterestRow[]>(`/escrow-guard/deals/${dealId}/interest`).then((r) => r.data),
  recordInterest: (dealId: string, body: { amount_usd: number; ref: string; period?: string; belongs_to: "portless" | "buyer" }) =>
    api.post(`/escrow-guard/deals/${dealId}/interest`, body).then((r) => r.data),
  supplierPerformance: (id: string) =>
    api.get<{ performance: SupplierPerformance | null; has_history: boolean }>(`/trade-min/suppliers/${encodeURIComponent(id)}/performance`).then((r) => r.data),
  phoneCheck: (id: string, whatsapp: "confirmed" | "not_reachable" | "unknown", evidence?: string) =>
    api.post(`/trade-min/suppliers/${encodeURIComponent(id)}/phone-check`, { whatsapp, evidence }).then((r) => r.data),
};

export const useFxReference = () => useQuery({ queryKey: ["fx-reference"], queryFn: OpsApi.fxReference });
export const useCosts = (days = 30) => useQuery({ queryKey: ["platform-costs", days], queryFn: () => OpsApi.costs(days) });
export const useDemurrage = (dealId: string) => useQuery({ queryKey: ["demurrage", dealId], queryFn: () => OpsApi.demurrage(dealId) });
export const useInterest = (dealId: string) => useQuery({ queryKey: ["escrow-interest", dealId], queryFn: () => OpsApi.interest(dealId) });
export const useSupplierPerformance = (id: string | null, enabled = true) =>
  useQuery({ queryKey: ["supplier-performance", id], queryFn: () => OpsApi.supplierPerformance(id!), enabled: !!id && enabled });
