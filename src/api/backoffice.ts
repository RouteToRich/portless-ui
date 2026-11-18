/** Back-office controls that protect margin and the audit trail (review board B-11):
 * audit log, watcher heartbeats, actual fees, exchange rates, price alerts, prospect
 * clean-up and the accountant exports. Endpoints + React Query hooks in one place. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export interface AuditEntry {
  seq: number;
  at: string;
  action: string;
  actor: string;
  subject: string;
  detail: Record<string, unknown>;
  hash: string;
}
export interface AuditVerify { ok: boolean; entries: number; broken_at?: number; why?: string; last_hash?: string }

export interface WatcherRow {
  name: string;
  last_beat_at: string | null;
  age_seconds: number;
  interval_seconds: number;
  holder: string | null;
  stale: boolean;
}
export interface WatcherStatus { ok: boolean; watchers: WatcherRow[]; stale: string[] }

export type FeeKind = "escrow" | "payout" | "bank";
export interface FeeLine {
  kind: FeeKind;
  assumed_pct: number;
  actual_pct: number | null;
  actual_usd: number;
  applies_to_usd: number;
  source: string | null;
  over: boolean;
  over_usd: number;
}
export interface FeeCheck {
  deal_id: string;
  lines: FeeLine[];
  over: boolean;
  over_usd: number;
  recorded: { fee_id: string; kind: FeeKind; amount_usd: number; ref: string | null; by: string; at: string }[];
}
export interface FeesOver { deal_id: string; over_usd: number; kinds: FeeKind[] }

export type FxKind = "po" | "payout" | "receipt";
export interface FxSummary {
  deal_id: string;
  po_rate: number | null;
  receipt_rates: Record<string, number>;
  payouts: { payout_id: string; amount_usd: number; rate: number | null; inr: number | null; gain_loss_usd: number }[];
  gain_loss_usd: number;
  missing: string[];
}

export interface PriceAlert {
  hs_code: string;
  kind: "dip" | "spike";
  change_pct: number;
  recent_median_usd_per_mt: number;
  base_median_usd_per_mt: number;
  recent_points: number;
  base_points: number;
  advice: string;
}

export interface StaleProspect { deal_id: string; hs_code: string; market: string | null; last_activity_at: string; idle_days: number }

export type LedgerFormat = "csv" | "tally" | "zoho";

export interface RunCosts {
  deal_id: string;
  llm_calls: number;
  llm_tokens: number;
  llm_usd: number;
  apify_runs: number;
  apify_usd: number;
  decisions: number;
  decision_wait_hours: number;
  tool_usd: number;
}

async function blob(path: string): Promise<Blob> {
  const r = await api.get(path, { responseType: "blob" });
  return r.data instanceof Blob ? r.data : new Blob([String(r.data)], { type: "text/csv" });
}

export const BackOfficeApi = {
  audit: (limit = 100) => api.get<AuditEntry[]>("/hitl-approval/audit", { params: { limit } }).then((r) => r.data),
  auditVerify: () => api.get<AuditVerify>("/hitl-approval/audit/verify").then((r) => r.data),
  watchers: () => api.get<WatcherStatus>("/health/watchers").then((r) => r.data),
  fees: (dealId: string) => api.get<FeeCheck>(`/escrow-guard/deals/${dealId}/fees`).then((r) => r.data),
  recordFee: (dealId: string, body: { kind: FeeKind; amount_usd: number; ref?: string }) =>
    api.post<FeeCheck>(`/escrow-guard/deals/${dealId}/fees`, body).then((r) => r.data),
  feesOver: () => api.get<FeesOver[]>("/escrow-guard/fees/over").then((r) => r.data),
  fx: (dealId: string) => api.get<FxSummary>(`/escrow-guard/deals/${dealId}/fx`).then((r) => r.data),
  recordFx: (dealId: string, body: { kind: FxKind; rate_inr_per_usd: number; ref?: string; note?: string }) =>
    api.post<FxSummary>(`/escrow-guard/deals/${dealId}/fx`, body).then((r) => r.data),
  priceAlerts: () => api.get<PriceAlert[]>("/deals/price-alerts").then((r) => r.data),
  cleanupPreview: () => api.get<StaleProspect[]>("/deals/prospects/cleanup").then((r) => r.data),
  cleanupRun: () => api.post<{ closed: string[]; failed: string[] }>("/deals/prospects/cleanup").then((r) => r.data),
  journalFile: (dealId: string, format: LedgerFormat) => blob(`/escrow-guard/deals/${dealId}/journal?format=${format}`),
  allJournalsFile: (format: LedgerFormat) => blob(`/escrow-guard/journals?format=${format}`),
  runCosts: () => api.get<RunCosts[]>("/deals/run-costs").then((r) => r.data),
};

export const useAuditLog = () => useQuery({ queryKey: ["audit-log"], queryFn: () => BackOfficeApi.audit(), refetchInterval: 60_000 });
export const useWatchers = () => useQuery({ queryKey: ["watchers"], queryFn: BackOfficeApi.watchers, refetchInterval: 30_000 });
export const useFees = (dealId: string) => useQuery({ queryKey: ["fees", dealId], queryFn: () => BackOfficeApi.fees(dealId) });
export const useFeesOver = () => useQuery({ queryKey: ["fees-over"], queryFn: BackOfficeApi.feesOver, refetchInterval: 120_000 });
export const useFx = (dealId: string) => useQuery({ queryKey: ["fx", dealId], queryFn: () => BackOfficeApi.fx(dealId) });
export const usePriceAlerts = () => useQuery({ queryKey: ["price-alerts"], queryFn: BackOfficeApi.priceAlerts, refetchInterval: 300_000 });
export const useRunCosts = () => useQuery({ queryKey: ["run-costs"], queryFn: BackOfficeApi.runCosts, refetchInterval: 300_000 });
export const useCleanupPreview = () => useQuery({ queryKey: ["prospect-cleanup"], queryFn: BackOfficeApi.cleanupPreview });

export function useRecordFee(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: FeeKind; amount_usd: number; ref?: string }) => BackOfficeApi.recordFee(dealId, body),
    onSuccess: (data) => {
      qc.setQueryData(["fees", dealId], data);
      qc.invalidateQueries({ queryKey: ["fees-over"] });
      qc.invalidateQueries({ queryKey: ["escrow-journal", dealId] });
    },
  });
}

export function useRecordFx(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: FxKind; rate_inr_per_usd: number; ref?: string; note?: string }) =>
      BackOfficeApi.recordFx(dealId, body),
    onSuccess: (data) => {
      qc.setQueryData(["fx", dealId], data);
      qc.invalidateQueries({ queryKey: ["escrow-journal", dealId] });
    },
  });
}

export function useCleanupRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: BackOfficeApi.cleanupRun,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospect-cleanup"] });
      qc.invalidateQueries({ queryKey: ["prospect-desk"] });
    },
  });
}

/** Pure (unit-testable): "4 min ago" style age. */
export function ageText(seconds: number | null | undefined): string {
  if (seconds == null) return "never";
  if (seconds < 90) return `${Math.round(seconds)} s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 172_800) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
}
