import { api, authApi } from "./client";
import type {
  DealProfit,
  AutomationCaseDetail,
  AutomationCaseRow,
  AutomationStatus,
  KillSwitchState,
  ComplianceCheck,
  ComplianceRecord,
  LoadingRecord,
  LoadingRecordRequest,
  ApprovalRecord,
  AutonomyLevel,
  BuyerCandidate,
  CatalogueView,
  Counterparty,
  ValidationStatus,
  CreateDealRequest,
  Deal,
  DealException,
  DealJournal,
  DealLedger,
  DealTimeline,
  DealCorrespondenceLog,
  DigestSendResult,
  OperatorDigest,
  ProductLine,
  QuoteRecord,
  MatchBoard,
  BuyerRequirement,
  SupplierOffer,
  RecordMilestoneRequest,
  RfqRecord,
  TrackingPollResult,
  ShipmentView,
  InspectionType,
  DealmakerDealDocuments,
  DocumentRecord,
  DownstreamHealth,
  EmailHistoryRecord,
  EnrichmentResult,
  AcceptanceRequest,
  EscrowRecord,
  FreightRecord,
  MatchScore,
  NegotiationEmailThread,
  NegotiationResponse,
  NegotiationRound,
  NegotiationSession,
  AuthUser,
  Opportunity,
  Organization,
  QcRecord,
  ReadinessReport,
  ResolveApprovalRequest,
  TokenResponse,
  TradeSourcesResponse,
  UpdatePartyRequest,
} from "./types";

// Thin wrappers around the backend (through the gateway at /api/*) and auth-service (/auth/*).

// Sign-in, sign-up and sign-out are auth-service's, through the gateway's
// /auth/* (authApi). `account_id` names PortLess's app account, so a user is
// resolved IN this application (see config/accounts.ts).
export const AuthApi = {
  register: (payload: { email: string; name: string; password: string; account_id: string }) =>
    authApi.post<TokenResponse>("/auth/register", payload).then((r) => r.data),
  login: (payload: { email: string; password: string; account_id: string }) =>
    authApi.post<TokenResponse>("/auth/login", payload).then((r) => r.data),
  // Revokes the token at auth-service. The backend may keep honouring it for
  // up to its token-check cache (60 s); the UI drops it immediately.
  logout: () => authApi.post<void>("/auth/logout").then(() => undefined),
  // The caller as PortLess sees them: organization + Portless-staff flag,
  // which auth-service knows nothing about (backend /identity/me).
  me: () => api.get<AuthUser>("/identity/me").then((r) => r.data),
};

// Organizations admin — Portless platform staff only (403 for everyone else).
export const OrganizationsApi = {
  list: () => api.get<Organization[]>("/identity/organizations").then((r) => r.data),
  create: (name: string) =>
    api.post<Organization>("/identity/organizations", { name }).then((r) => r.data),
  listUsers: () => api.get<AuthUser[]>("/identity/users").then((r) => r.data),
  assignUserOrg: (userId: string, orgId: string) =>
    api
      .patch<AuthUser>(`/identity/users/${userId}/organization`, { org_id: orgId })
      .then((r) => r.data),
};

export const HealthApi = {
  gateway: () => api.get<{ status: string; service: string }>("/health").then((r) => r.data),
  downstream: () => api.get<DownstreamHealth>("/health/downstream").then((r) => r.data),
  // Production readiness gate (shared/readiness.py): every stub / fallback the
  // pipeline is currently running on, ok / warn / fail per check.
  readiness: () => api.get<ReadinessReport>("/health/readiness").then((r) => r.data),
};

// Prospect match board: buyer requirements × supplier offers, scored.
export const MatchApi2 = {
  board: (dealId: string) => api.get<MatchBoard>(`/deals/${dealId}/match-board`).then((r) => r.data),
  evaluate: (dealId: string) => api.post(`/deals/${dealId}/match/evaluate`).then((r) => r.data),
  indicativeOffer: (dealId: string, candidateId: string, offerId: string) =>
    api.post<{ approval_id: string }>(`/deals/${dealId}/match/indicative-offer`, { candidate_id: candidateId, offer_id: offerId })
      .then((r) => r.data),
  confirm: (dealId: string, candidateId: string, offerId: string) =>
    api.post<{ approval_id: string }>(`/deals/${dealId}/match/confirm`, { candidate_id: candidateId, offer_id: offerId })
      .then((r) => r.data),
  setRequirement: (dealId: string, candidateId: string, req: BuyerRequirement) =>
    api.put(`/deals/${dealId}/buyer-candidates/${candidateId}/requirement`, req).then((r) => r.data),
  addOffer: (dealId: string, offer: SupplierOffer) =>
    api.post(`/deals/${dealId}/supplier-offers`, offer).then((r) => r.data),
};

// Knowledge-service (RAG) notes + the outcome feedback loop.
export const LearningApi = {
  learning: () => api.get<{ evidence: Record<string, unknown>; offer_pricing: unknown;
                            track_records: Record<string, unknown>; recent: unknown[] }>("/hitl-approval/learning")
    .then((r) => r.data),
  addNote: (note: { subject_type: string; subject_id: string; text: string; author?: string | null }) =>
    api.post<{ queued: boolean }>("/trade-min/knowledge/notes", note).then((r) => r.data),
  search: (q: string) =>
    api.get<{ enabled: boolean; results: { text: string; metadata: Record<string, string>; graph_fact: boolean }[] }>(
      "/trade-min/knowledge/search", { params: { q } }).then((r) => r.data),
};

// Supplier side of a prospect: the RFQs sent and the quotes back.
export const SourcingApi = {
  rfqs: (dealId: string) => api.get<RfqRecord[]>(`/sourcing/deals/${dealId}/rfqs`).then((r) => r.data),
  quotes: (dealId: string) => api.get<QuoteRecord[]>(`/sourcing/deals/${dealId}/quotes`).then((r) => r.data),
};

export const DealsApi = {
  list: (status?: string) =>
    api.get<Deal[]>("/deals", { params: status ? { status } : undefined }).then((r) => r.data),
  get: (dealId: string) => api.get<Deal>(`/deals/${dealId}`).then((r) => r.data),
  create: (payload: CreateDealRequest) => api.post<Deal>("/deals", payload).then((r) => r.data),
  updateStatus: (dealId: string, targetStatus: string, reason?: string) =>
    api
      .patch<Deal>(`/deals/${dealId}/status`, { target_status: targetStatus, reason })
      .then((r) => r.data),
  // Operator correction of a counterparty (stamped contact_source="operator",
  // never overwritten by a later actor run).
  updateParty: (dealId: string, role: "buyer" | "supplier", payload: UpdatePartyRequest) =>
    api.patch<Deal>(`/deals/${dealId}/parties/${role}`, payload).then((r) => r.data),
  // Identify + verify the parties on the PortLess Apify actors (contact finder,
  // e-mail check, OFAC/UN/EU/UK sanctions + LEI + VIES screening).
  enrich: (dealId: string, opts?: { screen?: boolean; contacts?: boolean }) =>
    api
      .post<EnrichmentResult>(`/deals/${dealId}/enrich`, undefined, {
        params: { screen: opts?.screen ?? true, contacts: opts?.contacts ?? true },
      })
      .then((r) => r.data),
  // Sale − supplier = spread − PortLess costs = profit.
  profit: (dealId: string) =>
    api.get<DealProfit>(`/deals/${dealId}/profit`).then((r) => r.data),
  // Trade compliance: trade / payer / shipment checks, loading + seal, open holds.
  compliance: (dealId: string) =>
    api.get<ComplianceRecord>(`/deals/${dealId}/compliance`).then((r) => r.data),
  complianceCheck: (dealId: string) =>
    api.post<ComplianceCheck>(`/deals/${dealId}/compliance/check`).then((r) => r.data),
  // Every dated fact of the deal from every service, merged and sorted.
  timeline: (dealId: string) =>
    api.get<DealTimeline>(`/deals/${dealId}/timeline`).then((r) => r.data),
  // Every e-mail to / from the buyer and the supplier with its delivery outcome.
  notifications: (dealId: string) =>
    api.get<DealCorrespondenceLog>(`/deals/${dealId}/notifications`).then((r) => r.data),
  // Hand-over pack (deal, parties, PI/PO, document hashes, orders, ledger +
  // journal, approvals, exceptions, correspondence, timeline, SHA-256).
  evidencePackJson: (dealId: string) =>
    api
      .get<Record<string, unknown>>(`/deals/${dealId}/evidence-pack`, { params: { format: "json" } })
      .then((r) => r.data),
  evidencePackHtml: (dealId: string) =>
    fetchFileBlob(`/deals/${dealId}/evidence-pack?format=html`, "text/html"),
  // Buyer outreach funnel (shared/orchestration/outreach.py).
  addBuyerCandidate: (dealId: string, candidate: BuyerCandidate) =>
    api.post<Deal>(`/deals/${dealId}/buyer-candidates`, candidate).then((r) => r.data),
  startOutreach: (dealId: string) =>
    api
      .post<{ deal_id: string; contacted: number; waiting_for_buyer: boolean }>(
        `/deals/${dealId}/outreach/start`
      )
      .then((r) => r.data),
  skipBuyerCandidate: (dealId: string, candidateId: string) =>
    api
      .post<{ deal_id: string; candidate_id: string; advanced?: number; exhausted?: boolean }>(
        `/deals/${dealId}/buyer-candidates/${candidateId}/skip`
      )
      .then((r) => r.data),
};

export const OpportunitiesApi = {
  // counterparties="verified" → each opportunity lists only the buyers / suppliers that
  // passed the scan-time check (counts of the rest in counterparty_counts).
  list: (counterparties: "verified" | "all" = "verified") =>
    api.get<Opportunity[]>("/trade-min/opportunities", { params: { counterparties } }).then((r) => r.data),
  // Opportunities are marked CONVERTED (not deleted) when a deal is created,
  // so the originating record stays fetchable by id for the deal Overview tab.
  get: (opportunityId: string) =>
    api.get<Opportunity>(`/trade-min/opportunities/${opportunityId}`).then((r) => r.data),
  // A scan runs every product × market corridor with paid Apify runs — minutes,
  // not seconds — so it gets its own 15-minute limit instead of the 2-minute default.
  scan: (payload: {
    hs_codes?: string[];
    target_markets?: string[];
    worldwide_search?: boolean;
    product_names?: Record<string, string>;
  }) => api.post<Opportunity[]>("/trade-min/scan", payload, { timeout: 15 * 60 * 1000 }).then((r) => r.data),
  // The HS code picker: codes matching a code prefix or product words, with names.
  hsSearch: (q: string) =>
    api
      .get<{ results: { code: string; name: string | null; description: string | null }[] }>("/trade-min/hs-search", {
        params: { q, limit: 20 },
      })
      .then((r) => r.data.results),
  // Which demand / buyer / seller / enrichment sources the scanner can reach
  // (live / stub / open) — incl. the PortLess-owned Apify actors.
  sources: () => api.get<TradeSourcesResponse>("/trade-min/sources").then((r) => r.data),
};

export interface CounterpartyFilters {
  hs_code?: string;
  market?: string;
  /** ISO-2 country of the company itself — "IN" lists Indian suppliers only. */
  country?: string;
  q?: string;
  limit?: number;
  /** Scan-time check result; omit for every record. */
  validation?: ValidationStatus;
}

// Every buyer / supplier a scan found — with or without an opportunity or deal.
export const CounterpartiesApi = {
  list: (role: "buyer" | "supplier", filters: CounterpartyFilters = {}) =>
    api
      .get<Counterparty[]>(role === "buyer" ? "/trade-min/buyers" : "/trade-min/suppliers", {
        params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")),
      })
      .then((r) => r.data),
  /** Run the sanctions / e-mail / GST-IEC check now for one directory record. */
  validate: (role: "buyer" | "supplier", id: string) =>
    api.post<Counterparty>(`/trade-min/${role}s/${encodeURIComponent(id)}/validate`).then((r) => r.data),
};

export type OnTimeout = "APPROVE" | "REJECT";

export interface AutonomyActionPolicy {
  action: string;
  label: string;
  description: string;
  default: AutonomyLevel;
  override: AutonomyLevel | null;
  env: AutonomyLevel | null;
  effective: AutonomyLevel;
  source: "override" | "env" | "default" | "money_ceiling" | "value_threshold" | string;
  follows_deal_profile: boolean;
  money_moving: boolean;
  // v2 gate settings (timeouts, on-timeout default, value threshold)
  timeout_seconds: number;
  timeout_override: number | null;
  default_timeout_seconds: number;
  default_on_timeout: OnTimeout;
  on_timeout_override: OnTimeout | null;
  auto_approve_below_usd: number | null;
  threshold_override: number | null;
}

export interface AutonomyPolicyResponse {
  money_ceiling: AutonomyLevel;
  /** Global value threshold for money gates (null = every money gate waits for a human). */
  money_auto_approve_below_usd: number | null;
  actions: AutonomyActionPolicy[];
}

/** Per-action gate override; omit a key to leave it, null to clear it. */
export interface GateOverride {
  level?: AutonomyLevel | null;
  timeout_seconds?: number | null;
  default_on_timeout?: OnTimeout | null;
  auto_approve_below_usd?: number | null;
}

export interface AutonomyPolicyUpdate {
  levels?: Record<string, AutonomyLevel | null>;
  gates?: Record<string, GateOverride | null>;
  money_auto_approve_below_usd?: number | null;
  set_money_threshold?: boolean;
  updated_by?: string;
}

// Per-action autonomy policy (shared/orchestration/autonomy_policy.py) — the
// Autonomy Settings page reads the effective level / timeout / on-timeout
// default / value threshold per action class and writes overrides; null clears
// an override so env/default applies again.
export const AutomationApi = {
  status: () => api.get<AutomationStatus>("/automation/status").then((r) => r.data),
  cases: (runId?: string | null) =>
    api
      .get<{ run_id: string | null; cases: AutomationCaseRow[] }>("/automation/cases", { params: runId ? { run_id: runId } : undefined })
      .then((r) => r.data),
  caseDetail: (tcId: string, runId?: string | null) =>
    api
      .get<AutomationCaseDetail>(`/automation/cases/${tcId}`, { params: runId ? { run_id: runId } : undefined })
      .then((r) => r.data),
  start: (payload: { scope: "all" | "catalogue" | "journeys" | "live"; phase?: string }) =>
    api.post<{ run_id: string }>("/automation/runs", payload).then((r) => r.data),
  stop: () => api.post("/automation/runs/stop").then((r) => r.data),
  clear: (scope: "test_data" | "everything") =>
    api.post<{ database: string; deleted: number }>("/automation/clear", { scope }).then((r) => r.data),
  diagnostics: () => api.get<Record<string, unknown>>("/automation/diagnostics").then((r) => r.data),
};

export const AutonomyApi = {
  killSwitch: () => api.get<KillSwitchState>("/hitl-approval/kill-switch").then((r) => r.data),
  setKillSwitch: (payload: { paused: boolean; reason: string }) =>
    api.post<KillSwitchState>("/hitl-approval/kill-switch", payload).then((r) => r.data),
  get: () =>
    api.get<AutonomyPolicyResponse>("/hitl-approval/autonomy-policy").then((r) => r.data),
  save: (update: AutonomyPolicyUpdate) =>
    api
      .put<AutonomyPolicyResponse>("/hitl-approval/autonomy-policy", {
        levels: update.levels ?? {},
        gates: update.gates ?? {},
        money_auto_approve_below_usd: update.money_auto_approve_below_usd ?? null,
        set_money_threshold: update.set_money_threshold ?? false,
        updated_by: update.updated_by ?? "operator",
      })
      .then((r) => r.data),
};

// Daily operator digest (shared/orchestration/digest.py): pending gates, deals
// per stage, stalls, open exceptions, money, Apify spend.
export const DigestApi = {
  get: () => api.get<OperatorDigest>("/hitl-approval/digest").then((r) => r.data),
  send: () => api.post<DigestSendResult>("/hitl-approval/digest/send").then((r) => r.data),
};

// Product catalogue / corridors (shared/catalogue.py) — what PortLess sells
// and where; drives scan defaults, actor inputs and outreach e-mails.
export const CatalogueApi = {
  get: () => api.get<CatalogueView>("/trade-min/catalogue").then((r) => r.data),
  save: (products: ProductLine[], updatedBy = "operator") =>
    api
      .put<CatalogueView>("/trade-min/catalogue", { products, updated_by: updatedBy })
      .then((r) => r.data),
};

export const ApprovalsApi = {
  list: (status?: string) =>
    api
      .get<ApprovalRecord[]>("/hitl-approval/approvals", {
        params: status ? { status } : undefined,
      })
      .then((r) => r.data),
  get: (approvalId: string) =>
    api.get<ApprovalRecord>(`/hitl-approval/approvals/${approvalId}`).then((r) => r.data),
  resolve: (approvalId: string, payload: ResolveApprovalRequest) =>
    api
      .post<ApprovalRecord>(`/hitl-approval/approvals/${approvalId}/resolve`, payload)
      .then((r) => r.data),
};

export const ExceptionsApi = {
  get: (exceptionId: string) =>
    api.get<DealException>(`/exceptions/${exceptionId}`).then((r) => r.data),
  list: () => api.get<DealException[]>("/exceptions").then((r) => r.data),
};

export const NegotiationApi = {
  getSessions: (dealId: string) =>
    api
      .get<NegotiationSession[]>("/negotiation-agent/negotiations", {
        params: { deal_id: dealId },
      })
      .then((r) => r.data),
  getSession: (negotiationId: string) =>
    api
      .get<NegotiationSession>(`/negotiation-agent/negotiations/${negotiationId}`)
      .then((r) => r.data),
  getRounds: (negotiationId: string) =>
    api
      .get<NegotiationRound[]>(`/negotiation-agent/negotiations/${negotiationId}/rounds`)
      .then((r) => r.data),
  getEmails: (negotiationId: string) =>
    api
      .get<EmailHistoryRecord[]>(`/negotiation-agent/negotiations/${negotiationId}/emails`)
      .then((r) => r.data),
  getEmailThreads: (dealId?: string) =>
    api
      .get<NegotiationEmailThread[]>("/negotiation-agent/email-threads", {
        params: dealId ? { deal_id: dealId } : undefined,
      })
      .then((r) => r.data),
  runRound: (
    negotiationId: string,
    req: { inbound_price?: number | null; inbound_message?: string | null; party?: string }
  ) =>
    api
      .post<NegotiationResponse>(`/negotiation-agent/negotiations/${negotiationId}/round`, req)
      .then((r) => r.data),
};

// ── Deal sub-resources ──────────────────────────────────────────────────────
// These map the REAL backend response shapes (each service's schemas.py) onto
// the UI types.

// swallow a 404 into `empty` — "no record yet" is a normal state, not an error
function or404<T>(empty: T) {
  return (err: unknown): T => {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404) return empty;
    throw err;
  };
}

// Fill the staged-escrow fields a legacy Stripe hold (or an older fixture)
// leaves out, so the Payments tab can rely on them being present.
function normalizeEscrow(raw: Partial<EscrowRecord> & { escrow_id: string; deal_id: string }): EscrowRecord {
  return {
    escrow_id: raw.escrow_id,
    deal_id: raw.deal_id,
    provider: raw.provider ?? "stripe",
    amount: raw.amount ?? 0,
    currency: raw.currency ?? "USD",
    status: raw.status ?? "PENDING",
    ext_ref: raw.ext_ref ?? null,
    client_secret: raw.client_secret ?? null,
    funded_at: raw.funded_at ?? null,
    funded_amount: raw.funded_amount ?? null,
    created_at: raw.created_at ?? new Date().toISOString(),
    payment_method: raw.payment_method ?? null,
    checkout_url: raw.checkout_url ?? null,
    released_total: raw.released_total ?? 0,
    refunded_total: raw.refunded_total ?? 0,
    fee_pct: raw.fee_pct ?? null,
    fees_total: raw.fees_total ?? 0,
    shortfall: raw.shortfall ?? null,
    settled_at: raw.settled_at ?? null,
    tranches: raw.tranches ?? [],
    inspection_deadline: raw.inspection_deadline ?? null,
    delivery_confirmed_at: raw.delivery_confirmed_at ?? null,
    inspection_opened_at: raw.inspection_opened_at ?? null,
    inspection_trigger: raw.inspection_trigger ?? null,
    buyer_accepted_at: raw.buyer_accepted_at ?? null,
    disputed: raw.disputed ?? false,
    disputed_at: raw.disputed_at ?? null,
    provider_display: raw.provider_display ?? null,
    provider_status: raw.provider_status ?? null,
    provider_checked_at: raw.provider_checked_at ?? null,
    submitted_total: raw.submitted_total ?? 0,
  };
}

export const EscrowApi = {
  // Real API: GET /escrow-guard/deals/{deal_id}/hold → single escrow, 404 when none.
  getHold: (dealId: string) =>
    api
      .get<Partial<EscrowRecord> & { escrow_id: string; deal_id: string }>(
        `/escrow-guard/deals/${dealId}/hold`
      )
      .then((r): EscrowRecord | null => normalizeEscrow(r.data))
      .catch(or404<EscrowRecord | null>(null)),
  // Per-trade money ledger: held / released / fees / payouts / supplier balance +
  // reconciliation issues. Returns an empty ledger (no 404) when there is no escrow.
  getLedger: (dealId: string) =>
    api.get<DealLedger>(`/escrow-guard/deals/${dealId}/ledger`).then((r) => r.data),
  listLedgers: () => api.get<DealLedger[]>("/escrow-guard/ledgers").then((r) => r.data),
  // Operator relays the buyer's acceptance → opens the approval gate; approving
  // it releases the final ACCEPTED-trigger tranche.
  requestAcceptance: (escrowId: string, payload: { accepted_by?: string; notes?: string }) =>
    api
      .post<AcceptanceRequest>(`/escrow-guard/escrows/${escrowId}/request-acceptance`, payload)
      .then((r) => r.data),
  // Buyer dispute within the inspection window — blocks every release.
  dispute: (escrowId: string, payload: { reason: string; raised_by?: string }) =>
    api
      .post<EscrowRecord>(`/escrow-guard/escrows/${escrowId}/dispute`, payload)
      .then((r) => normalizeEscrow(r.data)),
  // Operator asks to refund the undisbursed balance → opens the approval gate;
  // approving it sends the money back to the buyer (DISPUTE → REFUNDED).
  requestRefund: (escrowId: string, payload: { reason: string }) =>
    api
      .post<AcceptanceRequest>(`/escrow-guard/escrows/${escrowId}/request-refund`, payload)
      .then((r) => r.data),
  // Operator confirms delivery → the buyer's acceptance window starts
  // (idempotent; waits for pending proof tranches).
  openWindow: (escrowId: string, payload: { reason: string }) =>
    api
      .post<EscrowRecord>(`/escrow-guard/escrows/${escrowId}/open-window`, payload)
      .then((r) => normalizeEscrow(r.data)),
  // Read the escrow on Tazapay / Escrow.com now: buyer payment, stages paid out.
  pollProvider: (escrowId: string) =>
    api
      .post<EscrowRecord>(`/escrow-guard/escrows/${escrowId}/poll`, {})
      .then((r) => normalizeEscrow(r.data)),
  // Lift a buyer dispute (re-inspection agreed / resolved in PortLess's favour).
  clearDispute: (escrowId: string, payload: { reason: string }) =>
    api
      .post<EscrowRecord>(`/escrow-guard/escrows/${escrowId}/clear-dispute`, payload)
      .then((r) => normalizeEscrow(r.data)),
  // Double-entry journal for the deal (escrow funding, tranche releases with
  // fees and revenue, refunds, supplier payouts). 404 when there is no escrow.
  getJournal: (dealId: string) =>
    api
      .get<DealJournal>(`/escrow-guard/deals/${dealId}/journal`)
      .then((r): DealJournal | null => r.data)
      .catch(or404<DealJournal | null>(null)),
  journalCsv: (dealId: string) =>
    fetchFileBlob(`/escrow-guard/deals/${dealId}/journal?format=csv`, "text/csv"),
};

interface RawShieldOrder {
  tpo_id: string;
  deal_id: string;
  order_type: "QC" | "FREIGHT" | "CHA";
  provider: string;
  status: string;
  ext_ref?: string | null;
  eta?: string | null;
  qc_result?: string | null;
  container_number?: string | null;
  last_milestone?: string | null;
  last_milestone_at?: string | null;
  delivered_at?: string | null;
  created_at: string;
}

// Real API: GET /shield-link/deals/{deal_id}/orders → all TPOs (QC + freight + CHA)
const getShieldOrders = (dealId: string) =>
  api
    .get<{ orders: RawShieldOrder[] }>(`/shield-link/deals/${dealId}/orders`)
    .then((r) => r.data.orders ?? []);

// Provider statuses → the UI's display vocabulary (SGS says PASS/FAIL, the
// freight flow ends at COMPLETED; the UI renders PASSED/FAILED/CLEARED).
function qcStatus(o: RawShieldOrder): QcRecord["status"] {
  const s = (o.qc_result ?? o.status).toUpperCase();
  if (s === "PASS" || s === "PASSED") return "PASSED";
  if (s === "FAIL" || s === "FAILED") return "FAILED";
  if (s === "IN_PROGRESS") return "IN_PROGRESS";
  return "BOOKED";
}
function freightStatus(o: RawShieldOrder): FreightRecord["status"] {
  // The carrier milestone is the most precise state when one was recorded.
  const m = (o.last_milestone ?? "").toUpperCase();
  if (o.delivered_at || m === "DELIVERED") return "DELIVERED";
  if (m === "CLEARED") return "CLEARED";
  if (m === "ARRIVED") return "ARRIVED";
  if (m === "DEPARTED" || m === "IN_TRANSIT") return "IN_TRANSIT";
  const s = o.status.toUpperCase();
  if (s === "COMPLETED" || s === "CLEARED") return "CLEARED";
  if (s === "ARRIVED") return "ARRIVED";
  if (s === "IN_TRANSIT" || s === "IN_PROGRESS") return "IN_TRANSIT";
  return "BOOKED";
}

export const ShieldApi = {
  getQc: (dealId: string) =>
    getShieldOrders(dealId).then((orders): QcRecord[] =>
      orders
        .filter((o) => o.order_type === "QC")
        .map((o) => ({
          qc_id: o.tpo_id,
          deal_id: o.deal_id,
          provider: o.provider,
          status: qcStatus(o),
          report_url: null,
          booked_at: o.created_at,
        }))
    ),
  getFreight: (dealId: string) =>
    getShieldOrders(dealId).then((orders): FreightRecord[] =>
      orders
        .filter((o) => o.order_type === "FREIGHT")
        .map((o) => ({
          tpo_id: o.tpo_id,
          deal_id: o.deal_id,
          provider: o.provider,
          status: freightStatus(o),
          bl_number: o.ext_ref ?? null,
          eta: o.eta ?? null,
          container_number: o.container_number ?? null,
          last_milestone: o.last_milestone ?? null,
          last_milestone_at: o.last_milestone_at ?? null,
          delivered_at: o.delivered_at ?? null,
        }))
    ),
  // Operator / tracking milestone by TPO id (no provider signature). DELIVERED
  // opens the buyer's acceptance window on the escrow.
  // Inspector's supervised loading (container + seal) — freight waits for it.
  recordLoading: (dealId: string, payload: LoadingRecordRequest) =>
    api
      .post<{ status: string; deal_id: string; loading: LoadingRecord | null }>(
        `/shield-link/deals/${dealId}/loading`,
        { source: "operator", ...payload }
      )
      .then((r) => r.data),
  recordMilestone: (tpoId: string, payload: RecordMilestoneRequest) =>
    api
      .post<{ status: string; milestone: string; deal_id: string; last_milestone?: string }>(
        `/shield-link/freight/${tpoId}/milestone`,
        { source: "operator", ...payload }
      )
      .then((r) => r.data),
  // Read the deal's shipment now: Maersk booking + Track & Trace + B/L (or the tracking actor).
  pollTracking: (dealId: string) =>
    api.post<TrackingPollResult>(`/shield-link/deals/${dealId}/track`).then((r) => r.data),
  // Booking, containers, B/L / VGM state and the container event timeline.
  getShipment: (dealId: string) =>
    api.get<ShipmentView>(`/shield-link/deals/${dealId}/shipment`).then((r) => r.data),
  // Staff record the buyer's inspection requirement (DUPRO / PSI / PEO).
  setInspectionPlan: (dealId: string, types: InspectionType[], reason = "") =>
    api.put<Deal>(`/deals/${dealId}/inspection-plan`, { types, reason }).then((r) => r.data),
};

interface RawDocugenDoc {
  doc_id: string;
  deal_id: string;
  doc_type: string;
  status: string;
  storage_uri?: string | null;
  created_at: string;
}

export const DocugenApi = {
  // Real API: GET /docugen/deals/{deal_id}/documents. storage_uri is a Google
  // Drive webViewLink (or a local file:// URI when Drive isn't configured).
  getDocuments: (dealId: string) =>
    api
      .get<{ documents: RawDocugenDoc[] }>(`/docugen/deals/${dealId}/documents`)
      .then((r): DocumentRecord[] =>
        (r.data.documents ?? []).map((d) => ({
          document_id: d.doc_id,
          deal_id: d.deal_id,
          document_type: d.doc_type,
          status: d.status,
          file_url: d.storage_uri ?? null,
          created_at: d.created_at,
        }))
      ),
};

export const DealmakerApi = {
  // PI + PO for the deal (storage_uri is the Drive link once issued).
  getDealDocuments: (dealId: string) =>
    api
      .get<DealmakerDealDocuments>(`/dealmaker/deals/${dealId}/documents`)
      .then((r) => r.data),
  extendPi: (piId: string, payload: { validity_days: number; reason: string }) =>
    api.post(`/dealmaker/pi/${piId}/extend`, payload).then((r) => r.data),
};

// ── Document file streaming ─────────────────────────────────────────────────
// The stored files live in the platform's private Google Drive; the backend
// streams them through its own credentials (GET …/file). Fetched as a Blob via
// the authenticated client because a plain <a href> can't send the bearer token.
async function fetchFileBlob(path: string, fallbackType = "text/html"): Promise<Blob> {
  const r = await api.get(path, { responseType: "blob" });
  if (r.data instanceof Blob) return r.data;
  // A non-Blob body (plain string / JSON) — coerce so View/Download still work.
  return new Blob([typeof r.data === "string" ? r.data : JSON.stringify(r.data)], {
    type: fallbackType,
  });
}

export const FilesApi = {
  documentFile: (docId: string) => fetchFileBlob(`/docugen/documents/${docId}/file`),
  piFile: (piId: string) => fetchFileBlob(`/dealmaker/pi/${piId}/file`),
  poFile: (poId: string) => fetchFileBlob(`/dealmaker/po/${poId}/file`),
};

interface RawMatchScore {
  composite_score: number;
  arbitrage_score: number;
  proximity_score: number;
  reliability_score: number;
  gatekeeper_passed: boolean;
}

export const MatchApi = {
  // Real API: GET /match-engine/scores/{deal_id} — 404 when the score store
  // has no entry (e.g. in-memory store reset); callers fall back to the
  // deal's own winning_cms snapshot.
  getScore: (dealId: string) =>
    api
      .get<RawMatchScore>(`/match-engine/scores/${dealId}`)
      .then((r): MatchScore => ({
        composite_score: r.data.composite_score,
        arbitrage_score: r.data.arbitrage_score,
        proximity_score: r.data.proximity_score,
        reliability_score: r.data.reliability_score,
        gatekeeper_passed: r.data.gatekeeper_passed,
      }))
      .catch(or404<MatchScore | null>(null)),
};
