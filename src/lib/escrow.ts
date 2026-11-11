import type { Deal, DealEscrowStatus, DealStatus, EscrowProvider } from "@/api/types";
import { TONE_CLASS } from "@/lib/qc";

type Tone = keyof typeof TONE_CLASS;

interface EscrowStatusMeta {
  label: string;
  tone: Tone;
}

/** Mirrors shared/orchestration/escrow_status.py::LABELS. */
export const ESCROW_STATUS_META: Record<DealEscrowStatus, EscrowStatusMeta> = {
  OPEN_FAILED:       { label: "Escrow not opened",        tone: "danger" },
  DISPUTED:          { label: "Disputed",                 tone: "danger" },
  PARTIALLY_FUNDED:  { label: "Part-funded",              tone: "warn" },
  AWAITING_FUNDING:  { label: "Awaiting buyer payment",   tone: "warn" },
  WITH_PROVIDER:     { label: "Payout with provider",     tone: "info" },
  FUNDED:            { label: "Funded",                   tone: "ok" },
  RELEASING:         { label: "Releasing",                tone: "ok" },
  ACCEPTANCE_WINDOW: { label: "Buyer acceptance window",  tone: "info" },
  SETTLED:           { label: "Settled",                  tone: "ok" },
  REFUNDED:          { label: "Refunded",                 tone: "muted" },
};

export const ESCROW_PROVIDER_LABEL: Record<EscrowProvider, string> = {
  tazapay: "Tazapay",
  escrow_com: "Escrow.com",
};

export function escrowProviderLabel(provider: string | null | undefined): string | null {
  if (!provider) return null;
  return ESCROW_PROVIDER_LABEL[provider as EscrowProvider] ?? provider.replace(/_/g, " ");
}

/** Deal statuses at which a provider is (or is about to be) holding money. */
const ESCROW_RELEVANT: DealStatus[] = [
  "PI_SENT",
  "PI_ACCEPTED",
  "ESCROW_PENDING",
  "ESCROW_FUNDED",
  "PO_ISSUED",
  "SUPPLIER_DISPATCH_READY",
  "QC_PASSED",
  "QC_FAILED",
  "IN_TRANSIT",
  "CLEARED",
  "PAID",
  "DISPUTE",
  "REFUNDED",
];

/** Show the escrow line on a deal: once a provider is chosen or the PI is out. */
export function showsEscrow(deal: Pick<Deal, "status" | "escrow_provider" | "escrow_status">): boolean {
  return !!deal.escrow_status || !!deal.escrow_provider || (ESCROW_RELEVANT as string[]).includes(deal.status);
}
