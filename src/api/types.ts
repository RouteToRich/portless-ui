// Types mirror the backend Pydantic DTOs (shared/domain/models.py + service schemas).

export type DealStatus =
  | "DRAFT"
  | "MATCHING"
  | "NEGOTIATING"
  | "NEGOTIATION_AGREED"
  | "NEGOTIATION_FAILED"
  | "PI_SENT"
  | "PI_ACCEPTED"
  | "ESCROW_PENDING"
  | "ESCROW_FUNDED"
  | "PO_ISSUED"
  | "SUPPLIER_DISPATCH_READY"
  | "QC_PASSED"
  | "QC_FAILED"
  | "IN_TRANSIT"
  | "CLEARED"
  | "PAID"
  | "DISPUTE"
  | "CANCELLED"
  | "REFUNDED";

export type AutonomyLevel = "L0" | "L1" | "L2" | "L3";

export type EmailStatus = "ok" | "risky" | "invalid" | "unverified";
export type SanctionsStatus = "clear" | "review" | "block" | "unchecked";

export interface Party {
  party_id?: string | null;
  role: "buyer" | "supplier";
  legal_name: string;
  country: string;
  gstin?: string | null;
  iec?: string | null;
  vat_number?: string | null;
  verification_status?: string | null;
  credit_status?: string | null;
  risk_score?: number | null;
  // Contact — filled by the Apify company-contact-finder actor, the opportunity
  // signal, or an operator edit (contact_source = "operator" is never overwritten).
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  contact_source?: string | null;
  contact_confidence?: number | null;
  email_status?: EmailStatus | string | null;
  // Counterparty screening — Apify counterparty-check actor (OFAC/UN/EU/UK, LEI, VIES).
  sanctions_status?: SanctionsStatus | string | null;
  sanctions_reason?: string | null;
  sanctions_checked_at?: string | null;
  lei?: string | null;
  vat_valid?: boolean | null;
  enriched_at?: string | null;
}

// PATCH /deals/{id}/parties/{role} — operator correction of a counterparty.
export interface UpdatePartyRequest {
  legal_name?: string;
  country?: string;
  email?: string;
  website?: string;
  phone?: string;
  address?: string;
  gstin?: string;
  iec?: string;
  vat_number?: string;
  verification_status?: string;
}

// POST /deals/{id}/enrich — Apify contact finder + sanctions screening result.
export interface PartyEnrichment {
  legal_name?: string | null;
  country?: string | null;
  email?: string | null;
  email_status?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  vat_number?: string | null;
  vat_valid?: boolean | null;
  lei?: string | null;
  contact_source?: string | null;
  contact_confidence?: number | null;
  sanctions_status?: string | null;
  sanctions_reason?: string | null;
  screening?: Record<string, unknown> | null;
}

export interface EnrichmentResult {
  deal_id: string;
  buyer?: PartyEnrichment | null;
  supplier?: PartyEnrichment | null;
  actors_used: string[];
  warnings: string[];
  blocked: boolean;
  deal: Deal;
}

/** One seller candidate's Composite Match Score breakdown (Match Engine),
 *  captured on the deal at creation so matching info survives the originating
 *  opportunity being removed from the Opportunity Radar. */
export interface MatchResult {
  match_id: string;
  supplier_id: string;
  company_name?: string;
  composite_score: number;
  gatekeeper_passed: boolean;
  arbitrage_score: number;
  proximity_score: number;
  reliability_score: number;
  decision: "SOURCE" | "DISCARD";
  fob_price_usd?: number | null;
  supplier_to_port_km?: number | null;
}

export type BuyerCandidateStatus =
  | "pending"
  | "contacted"
  | "followed_up"
  | "interested"
  | "declined"
  | "no_reply"
  | "selected";

/** One buyer the scan identified for the deal — the outreach funnel works
 *  through them in order until one replies with interest
 *  (shared/orchestration/outreach.py). */
export interface BuyerCandidate {
  candidate_id: string;
  legal_name: string;
  country: string;
  email?: string | null;
  website?: string | null;
  phone?: string | null;
  source?: string | null;
  fit_score?: number | null;
  pitch_angle?: string | null;
  quantity_mt?: number | null;
  status: BuyerCandidateStatus | string;
  contacted_at?: string | null;
  followed_up_at?: string | null;
  replied_at?: string | null;
  reply_preview?: string | null;
  email_id?: string | null;
  /** Why the last e-mail to this candidate did not go out (e.g. no mailbox configured). */
  send_error?: string | null;
  send_attempts?: number;
  requirement?: BuyerRequirement | null;
  indicative_offer?: IndicativeOffer | null;
  reply_address?: string | null;
}

// Prospect matching — services/deals/schemas.py + shared/orchestration/matchmaking.py
export interface BuyerRequirement {
  grade?: string | null;
  packaging?: string | null;
  quantity_mt?: number | null;
  delivery_window?: string | null;
  delivery_by_days?: number | null;
  incoterm?: string | null;
  destination_port?: string | null;
  target_price_usd_per_mt?: number | null;
  target_price_incoterm?: string | null;
  target_price_basis?: "stated" | "counter" | "accepted_offer" | null;
  certifications?: string[];
  payment_terms?: string | null;
  notes?: string | null;
  source?: string | null;
  confidence?: number | null;
  updated_at?: string | null;
}

export interface IndicativeOffer {
  offer_id: string;
  price_low_usd_per_mt: number;
  price_high_usd_per_mt: number;
  incoterm: string;
  destination_port?: string | null;
  quantity_mt?: number | null;
  sent_at?: string | null;
  response?: "accepted" | "countered" | "declined" | null;
  responded_at?: string | null;
}

export interface SupplierOffer {
  offer_id: string;
  supplier_id: string;
  company_name?: string;
  email?: string | null;
  grade?: string | null;
  fob_price_usd_per_mt?: number | null;
  moq_mt?: number | null;
  capacity_mt_per_month?: number | null;
  lead_time_days?: number | null;
  port_of_loading?: string | null;
  certifications?: string[];
  payment_terms?: string | null;
  validity_days?: number | null;
  gst_verified?: boolean | null;
  iec_active?: boolean | null;
  verification_failed?: boolean;
  quote_id?: string | null;
  source?: string | null;
  origin_deal_id?: string | null;
  received_at?: string | null;
}

export interface PriceEstimate {
  hs_code: string;
  side: "buyer" | "supplier";
  market?: string | null;
  median?: number | null;
  p25?: number | null;
  p75?: number | null;
  sigma?: number | null;
  n_observations: number;
  prior?: number | null;
  prior_source?: string | null;
  confidence: "none" | "prior" | "low" | "medium" | "high";
}

export interface PricePoint {
  value?: number | null;
  basis: string;
  sigma?: number | null;
  incoterm?: string | null;
}

export interface LandedCost {
  fob_usd_per_mt: number;
  freight_usd_per_mt: number;
  inspection_usd_per_mt: number;
  insurance_pct: number;
  escrow_fee_pct: number;
  margin_floor_pct: number;
  incoterm: string;
  cost_usd_per_mt: number;
  min_offer_usd_per_mt: number;
}

export interface PairScore {
  candidate_id: string;
  buyer_name: string;
  buyer_status: string;
  offer_id: string;
  supplier_id: string;
  supplier_name: string;
  origin_deal_id?: string | null;
  quantity_mt: number;
  feasible: boolean;
  blockers: string[];
  missing: string[];
  buyer_price: PricePoint;
  supplier_price: PricePoint;
  landed?: LandedCost | null;
  margin_usd_per_mt?: number | null;
  margin_pct?: number | null;
  p_margin?: number | null;
  spec_fit: number;
  engagement: number;
  reliability: number;
  timing_fit: number;
  probability: number;
  probability_raw?: number | null;
  calibrated?: boolean;
  buyer_history?: { deals: number; signed: number; failed: number; factor: number } | null;
  supplier_history?: { deals: number; completed: number; bad: number; failed: number; factor: number } | null;
  expected_value_usd: number;
  firm: boolean;
  next_step: string;
}

export interface MatchBoard {
  deal_id: string;
  hs_code: string;
  market?: string | null;
  status: string;
  priors: { buyer?: number | null; supplier?: number | null; source?: string | null; tariff_pct?: number | null };
  buyer_estimate: PriceEstimate;
  supplier_estimate: PriceEstimate;
  buyers: { candidate_id: string; legal_name: string; country: string; status: string; email?: string | null;
            requirement?: BuyerRequirement | null; indicative_offer?: IndicativeOffer | null }[];
  offers: SupplierOffer[];
  pairs: PairScore[];
  min_probability: number;
  assumptions: Record<string, number | null>;
  next_actions: string[];
  learning?: {
    calibration_active: boolean;
    resolved_matches: number;
    calibration_error?: number | null;
    offer_pricing?: { responses: number; acceptance_rate?: number | null; price_nudge: number };
  };
}

// Sourcing — services/sourcing/schemas.py
export interface RfqDispatchResult {
  supplier_id: string;
  contact_id?: string | null;
  channel: string;
  email?: string | null;
  ext_rfq_id?: string | null;
  success: boolean;
  error?: string | null;
}

export interface RfqRecord {
  rfq_id: string;
  deal_id: string;
  hs_code: string;
  supplier_ids: string[];
  dispatch_results: RfqDispatchResult[];
  quantity_mt?: number | null;
  target_price_usd?: number | null;
  status: "PENDING" | "COMPLETE" | "PARTIAL" | "FAILED" | string;
  dispatched_at?: string | null;
  expires_at?: string | null;
}

export interface QuoteRecord {
  quote_id: string;
  rfq_id: string;
  deal_id: string;
  supplier_id: string;
  company_name?: string;
  unit_price_usd: number;
  quantity_mt?: number | null;
  lead_time_days?: number | null;
  re_scored_cms?: number | null;
  re_scored_decision?: string | null;
  status: string;
  received_at?: string | null;
}

export interface Deal {
  deal_id: string;
  operator_id: string;
  hs_code: string;
  market?: string | null;
  status: DealStatus;
  autonomy_profile: AutonomyLevel;
  margin_floor_pct?: number | null;
  est_margin_usd?: number | null;
  realized_margin_usd?: number | null;
  parties: Party[];
  // Trade-Min / Match Engine linkage (seeded at deal creation)
  opportunity_id?: string | null;
  match_results?: MatchResult[];
  winning_supplier_id?: string | null;
  winning_cms?: number | null;
  buyer_target_price_usd?: number | null;
  buyer_price_source?: string | null;
  /** Shipment quantity the buyer asked for (RFQ lead / negotiation). */
  quantity_mt?: number | null;
  /** Buyer outreach funnel — every identified buyer, in contact order. */
  buyer_candidates?: BuyerCandidate[];
  created_at?: string | null;
  updated_at?: string | null;
}

// GET /deals/{id}/timeline — shared/orchestration/evidence.py::build_timeline
export type TimelineKind =
  | "deal"
  | "status"
  | "outreach"
  | "sourcing"
  | "negotiation"
  | "email"
  | "gate"
  | "document"
  | "operations"
  | "money"
  | "exception";

export interface TimelineEvent {
  at: string;
  kind: TimelineKind | string;
  title: string;
  detail?: string | null;
  ref?: string | null;
  actor?: string | null;
  source?: string | null;
}

export interface DealTimeline {
  deal_id: string;
  status: string;
  events: TimelineEvent[];
  count: number;
  warnings: string[];
}

export interface SellerCandidate {
  candidate_id: string;
  company_name: string;
  location_city?: string | null;
  location_state?: string | null;
  estimated_fob_price_usd?: number | null;
  annual_capacity_mt?: number | null;
  source?: string | null;
  listing_url?: string | null;
  supplier_to_port_km?: number | null;
  // Apify india-supplier actor: contact + credentials
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  gstin?: string | null;
  iec?: string | null;
  fit_score?: number | null;
  price_unit?: string | null;
}

export interface BuyerSignal {
  buyer_name: string;
  buyer_country: string;
  company_id?: string | null;
  signal_type?: string | null;
  source?: string | null;
  unit_price_usd?: number | null;
  price_unit?: string | null;
  estimated_order_value_usd?: number | null;
  annual_volume_mt?: number | null;
  risk_score?: number | null;
  urgency_tier?: number | null;
  contact_url?: string | null;
  // Apify buyer actors: contact + fit
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  fit_score?: number | null;
  fit_reason?: string | null;
  pitch_angle?: string | null;
  quantity?: number | null;
  quantity_unit?: string | null;
  shipments_12m?: number | null;
  hs_codes?: string[];
  last_import_date?: string | null;
}

export interface TariffData {
  applied_duty_pct?: number | null;
  gst_vat_pct?: number | null;
  total_landed_cost_add_pct?: number | null;
  ntb_flags?: string[];
  rules_of_origin?: string | null;
}

export interface Opportunity {
  opportunity_id: string;
  hs_code: string;
  market: string;
  arbitrage_rank: number;
  source?: string | null;
  status?: "ACTIVE" | "MARGINAL" | "EXPIRED" | "CONVERTED" | null;
  seller_candidates?: SellerCandidate[];
  buyer_signals?: BuyerSignal[];
  // Enrichment fields returned by GET /trade-min/opportunities (EnrichedOpportunity)
  currency?: string | null;
  scanned_at?: string | null;
  demand_index?: number | null;
  price_gap_pct?: number | null;
  net_price_gap_pct?: number | null;
  active_rfq_count?: number | null;
  active_tender_count?: number | null;
  urgency_tier?: number | null;
  tariff_data?: TariffData | null;
  tariff_viable?: boolean | null;
  confidence_score?: number | null;
  expires_at?: string | null;
  // What the destination market actually pays per MT (UN Comtrade unit value
  // via the export-market actor) — the real buyer price anchor.
  price_benchmark_usd_per_mt?: number | null;
  price_benchmark_source?: string | null;
}

// GET /trade-min/sources — which demand / buyer / seller / enrichment sources
// the scanner can reach right now (incl. the PortLess-owned Apify actors).
export type SourceMode = "live" | "stub" | "open";
export type SourceRole = "demand" | "buyers" | "sellers" | "tariff" | "enrichment" | "screening";

/** A buyer or supplier a scan found (GET /trade-min/buyers | /trade-min/suppliers) —
 *  kept whether or not the scan produced an opportunity or a deal. */
export interface Counterparty {
  id: string;
  role: "buyer" | "supplier";
  name: string;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  contact_url: string | null;
  source: string;
  sources: string[];
  fit_score: number | null;
  fit_reason: string | null;
  gstin: string | null;
  iec: string | null;
  /** Suppliers: USD/MT when the source states a price. */
  estimated_fob_price_usd: number | null;
  hs_codes: string[];
  markets: string[];
  opportunity_ids: string[];
  /** "opportunity <id>" or why the latest scan produced none. */
  last_outcome: string;
  times_seen: number;
  first_seen_at: string;
  last_seen_at: string;
}

export interface TradeSource {
  name: string;
  label: string;
  role: SourceRole | string;
  provider: string;
  actor?: string | null;
  mode: SourceMode | string;
  detail: string;
  /** External slot: the actor is built outside /actor-pipeline (e.g. carrier tracking). */
  external?: boolean;
}

export interface TradeSourcesResponse {
  apify: {
    token_present: boolean;
    owner: string;
    ai_tier: boolean;
    max_items: number;
    /** APIFY_MAX_RUNS_PER_DAY (0 / absent = unlimited) and runs started today. */
    max_runs_per_day?: number | null;
    runs_today?: number | null;
  };
  live_count: number;
  total: number;
  sources: TradeSource[];
}

// GET/PUT /trade-min/catalogue — shared/catalogue.py
export interface ProductLine {
  product_id: string;
  hs_code: string;
  name: string;
  products: string[];
  markets: string[];
  seller_profile?: string | null;
  default_quantity_mt?: number | null;
  min_order_mt?: number | null;
  active: boolean;
  notes?: string | null;
}

export interface CatalogueCorridor {
  hs_code: string;
  name: string;
  market: string;
}

export interface CatalogueView {
  products: ProductLine[];
  updated_by?: string | null;
  updated_at?: string | null;
  corridors: CatalogueCorridor[];
  defaults: { hs_codes: string[]; markets: string[] };
  active: boolean;
}

// GET /hitl-approval/digest — shared/orchestration/digest.py
export interface DigestApprovalRow {
  count: number;
  oldest_hours: number;
  money_usd: number;
  countersign: number;
}

export interface OperatorDigest {
  generated_at: string;
  text?: string;
  approvals: {
    pending_total?: number;
    by_action?: Record<string, DigestApprovalRow>;
    oldest_hours?: number;
    items?: {
      approval_id: string;
      deal_id: string;
      action: string;
      age_hours?: number | null;
      financial_impact_usd?: number | null;
      deep_link?: string | null;
    }[];
  };
  deals: {
    active?: number;
    by_status?: Record<string, number>;
    stalled?: { deal_id: string; status: string; hours: number }[];
    waiting_for_buyer?: number;
  };
  exceptions: {
    open_total?: number;
    by_status?: Record<string, number>;
    items?: { exception_id: string; deal_id: string; status: string; category?: string | null; age_hours?: number | null }[];
  };
  money: {
    escrows?: number;
    in_escrow?: number;
    released_total?: number;
    net_to_portless?: number;
    payouts_total?: number;
    supplier_balance_due?: number;
    unreconciled?: string[];
    disputed?: number;
    windows_open?: number;
    currency?: string;
  };
  apify: { runs_today?: number; max_runs_per_day?: number };
  warnings: string[];
}

export interface DigestSendResult {
  telegram: boolean;
  email: { to: string; outcome: string }[];
  text: string;
}

// GET /health/readiness — production readiness gate (shared/readiness.py).
export type ReadinessStatus = "ok" | "warn" | "fail";

export interface ReadinessCheck {
  id: string;
  category: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
}

export interface ReadinessReport {
  profile: "dev" | "staging" | "production" | string;
  enforced: boolean;
  ready: boolean;
  fail_count: number;
  warn_count: number;
  generated_at: string;
  checks: ReadinessCheck[];
}

export interface Approval {
  approval_id: string;
  deal_id: string;
  action: string;
  summary?: string | null;
  financial_impact_usd?: number | null;
  risk_flags: string[];
  status: string;
  expires_at?: string | null;
  default_on_timeout: string;
  deep_link?: string | null;
}

/** One operator's APPROVE on a four-eyes gate (FOUR_EYES_THRESHOLD_USD). */
export interface ApprovalSignature {
  approved_by: string;
  approved_at: string;
  note?: string | null;
}

export interface ApprovalRecord {
  approval_id: string;
  deal_id: string;
  action: string;
  summary: string | null;
  financial_impact_usd: number | null;
  risk_flags: string[];
  autonomy_level: AutonomyLevel;
  status: "PENDING" | "APPROVED" | "REJECTED" | "AUTO_APPROVED" | "TIMED_OUT";
  expires_at: string | null;
  default_on_timeout: "APPROVE" | "REJECT";
  deep_link: string | null;
  callback_payload: Record<string, unknown>;
  decision: "APPROVE" | "REJECT" | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  modified_body: string | null;
  // Four-eyes: money gates at/above the threshold need two distinct approvers.
  required_approvals?: number;
  approvals?: ApprovalSignature[];
  approvals_remaining?: number;
  created_at: string;
  updated_at: string;
}

export interface DealException {
  exception_id: string;
  deal_id: string;
  category?: string | null;
  status: string;
  remediation_plan: string[];
}

export type DownstreamHealth = Record<string, string>;

// Auth
// The caller as PortLess sees them (backend GET /identity/me): auth-service's
// identity plus the organization and Portless-staff flag kept by PortLess.
export interface AuthUser {
  user_id: string;
  email: string;
  name: string;
  org_id: string | null;
  is_portless: boolean;
  created_at?: string | null;
  /** A record from before sign-in moved to auth-service — nobody can sign in as it. */
  legacy?: boolean;
}

// auth-service's TokenResponse (POST /auth/login, /auth/register, /auth/refresh-token).
export interface TokenResponse {
  access_token: string;
  token_type: string;
  user?: {
    user_id: string;
    email: string;
    name: string;
    accounts?: { account_id: string; name?: string; selected?: boolean }[];
    is_admin?: boolean;
  };
}

// Organizations (Portless platform staff only — see /identity/organizations, /identity/users)
export interface Organization {
  org_id: string;
  name: string;
  created_by: string;
  known_emails: string[];
  created_at: string;
}

export interface CreateDealRequest {
  operator_id: string;
  hs_code: string;
  market: string;
  autonomy_profile?: AutonomyLevel;
  margin_floor_pct?: number | null;
  opportunity_id?: string | null;
  parties?: Party[];
}

// Negotiation types
export interface NegotiationSession {
  negotiation_id: string;
  deal_id: string;
  trade_match_id: string;
  buyer_id: string;
  seller_id: string;
  product_code: string;
  status: "STARTED" | "ROUND" | "AGREED" | "FAILED" | "HITL_PENDING" | "ESCALATED";
  round_no: number;
  current_bid: number | null;
  current_ask: number | null;
  agreed_price: number | null;
  margin_at_current: number | null;
  hitl_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface NegotiationRound {
  round_id: string;
  negotiation_id: string;
  deal_id: string;
  round_no: number;
  party: "buyer" | "supplier";
  channel: string;
  inbound_price: number | null;
  inbound_message: string | null;
  outbound_message: string;
  orchestrator_routing: string;
  margin_at_round: number | null;
  hitl_required: boolean;
  created_at: string;
}

export interface EmailHistoryRecord {
  email_id: string;
  negotiation_id: string;
  deal_id: string;
  round_no: number;
  direction: "outbound" | "inbound";
  party: "buyer" | "supplier";
  to_address: string;
  from_address: string;
  subject: string;
  body: string;
  original_body: string | null;
  approval_id: string | null;
  status:
    | "draft"
    | "pending_approval"
    | "sent"
    | "modified_sent"
    | "rejected"
    | "failed"
    | "blocked"
    | "received";
  /** negotiation (agent draft) · followup · notification (templated deal e-mail) */
  kind?: "negotiation" | "followup" | "notification";
  /** Why the send-time safety check refused it (status "blocked"). */
  block_reason?: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NegotiationResponse {
  round: NegotiationRound;
  session: NegotiationSession;
}

export interface NegotiationEmailThread extends NegotiationSession {
  buyer_target_price: number;
  supplier_quote_price: number;
  emails: EmailHistoryRecord[];
  pending_approval_count: number;
}

export interface RunRoundRequest {
  inbound_price?: number | null;
  inbound_message?: string | null;
  party?: "buyer" | "supplier";
}

// Escrow, QC, Freight, Docugen — mirror services/escrow_guard/schemas.py
export type EscrowStatus =
  | "PENDING"
  | "PARTIALLY_FUNDED"
  | "FUNDED"
  | "RELEASED"
  | "REFUNDED"
  | "FAILED";
export type TrancheTrigger = "PO_ISSUED" | "QC_PASSED" | "CLEARED" | "ACCEPTED";

export interface Tranche {
  tranche_id: string;
  trigger: TrancheTrigger | string;
  pct: number;
  amount?: number | null;
  status: "PENDING" | "RELEASED";
  proof_refs: string[];
  ext_ref?: string | null;
  released_at?: string | null;
}

// GET /escrow-guard/deals/{id}/hold — EscrowResponse
export interface EscrowRecord {
  escrow_id: string;
  deal_id: string;
  provider: string;
  amount: number;
  currency: string;
  status: EscrowStatus | string;
  ext_ref?: string | null;
  client_secret?: string | null;
  funded_at?: string | null;
  funded_amount?: number | null;
  created_at: string;
  payment_method?: string | null;
  checkout_url?: string | null;
  released_total: number;
  refunded_total: number;
  fee_pct?: number | null;
  fees_total: number;
  shortfall?: number | null;
  settled_at?: string | null;
  tranches: Tranche[];
  inspection_deadline?: string | null;
  /** Goods delivered (carrier milestone / operator); window opens once proof tranches released. */
  delivery_confirmed_at?: string | null;
  inspection_opened_at?: string | null;
  /** What opened the window: delivery / proof / fallback / operator. */
  inspection_trigger?: string | null;
  buyer_accepted_at?: string | null;
  disputed: boolean;
  disputed_at?: string | null;
}

// GET /escrow-guard/deals/{id}/journal — services/escrow_guard/journal.py
export interface JournalEntry {
  seq: number;
  at?: string | null;
  event: string;
  debit: string;
  credit: string;
  amount: number;
  currency: string;
  ref?: string | null;
  memo?: string | null;
}

export interface DealJournal {
  deal_id: string;
  currency: string;
  escrow_id?: string | null;
  provider?: string | null;
  entries: JournalEntry[];
  balances: Record<string, number>;
  debits_total: number;
  credits_total: number;
  balanced: boolean;
  issues: string[];
  accounts: Record<string, string>;
  generated_at: string;
}

export type PayoutKind = "supplier_payout" | "supplier_balance";

// PayoutResponse
export interface PayoutRecord {
  payout_id: string;
  deal_id: string;
  payee_id: string;
  amount: number;
  currency: string;
  status: "REQUESTED" | "PROCESSING" | "COMPLETED" | "FAILED" | string;
  ext_ref?: string | null;
  completed_at?: string | null;
  created_at: string;
  kind: PayoutKind | string;
  total_owed?: number | null;
}

// GET /escrow-guard/deals/{id}/ledger and GET /escrow-guard/ledgers
export interface DealLedger {
  deal_id: string;
  currency: string;
  provider?: string | null;
  escrow_id?: string | null;
  status?: string | null;
  principal: number;
  funded_amount?: number | null;
  shortfall?: number | null;
  released_total: number;
  refunded_total: number;
  outstanding: number;
  fees_total: number;
  net_to_portless: number;
  payouts_total: number;
  payouts_pending: number;
  available_for_payout: number;
  supplier_owed?: number | null;
  supplier_balance_due?: number | null;
  realized_margin?: number | null;
  tranches: Tranche[];
  payouts: PayoutRecord[];
  inspection_deadline?: string | null;
  disputed: boolean;
  settled: boolean;
  reconciled: boolean;
  issues: string[];
}

export interface QcRecord {
  qc_id: string;
  deal_id: string;
  provider: string;
  status: "BOOKED" | "IN_PROGRESS" | "PASSED" | "FAILED";
  report_url: string | null;
  booked_at: string;
}

export type FreightMilestone = "DEPARTED" | "IN_TRANSIT" | "ARRIVED" | "CLEARED" | "DELIVERED";

export interface FreightRecord {
  tpo_id: string;
  deal_id: string;
  provider: string;
  status: "BOOKED" | "IN_TRANSIT" | "ARRIVED" | "CLEARED" | "DELIVERED";
  bl_number: string | null;
  eta: string | null;
  container_number?: string | null;
  last_milestone?: FreightMilestone | string | null;
  last_milestone_at?: string | null;
  delivered_at?: string | null;
}

// POST /shield-link/freight/{ref}/milestone
export interface RecordMilestoneRequest {
  milestone: FreightMilestone;
  location?: string | null;
  timestamp?: string | null;
  notes?: string | null;
  source?: string;
}

// POST /shield-link/deals/{id}/track
export interface TrackingPollResult {
  status: "no_booking" | "no_reference" | "stub" | "unchanged" | "ok" | "no_event" | "error" | "ignored" | string;
  deal_id: string;
  tpo_id?: string;
  milestone?: string;
  error?: string;
}

export interface DocumentRecord {
  document_id: string;
  deal_id: string;
  document_type: string;
  status: string;
  file_url: string | null;
  created_at: string;
}

// Match score — mirrors shared/domain/models.py MatchScore (the CMS formula's
// actual components: arbitrage / proximity / reliability, not price/margin/risk).
export interface MatchScore {
  composite_score: number;
  arbitrage_score: number;
  proximity_score: number;
  reliability_score: number;
  gatekeeper_passed?: boolean;
}

// DealMaker contracts (PI/PO) for a deal — GET /dealmaker/deals/{id}/documents.
// storage_uri is a Google Drive webViewLink when Drive is configured.
export interface DealmakerContract {
  status: string;
  storage_uri?: string | null;
  total_value?: number | null;
  agreed_price?: number | null;
  issued_at?: string | null;
}
export interface DealmakerDealDocuments {
  deal_id: string;
  pi: (DealmakerContract & { pi_id: string }) | null;
  po: (DealmakerContract & { po_id: string }) | null;
}

// SSE event
export interface ApprovalStreamEvent {
  event: string;
  data: ApprovalRecord;
}

// Resolve payload
export interface ResolveApprovalRequest {
  decision: "APPROVE" | "REJECT";
  resolved_by: string;
  note?: string;
  modified_body?: string;
}
