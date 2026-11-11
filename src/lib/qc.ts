import type { Deal, DealStatus, QcStatus } from "@/api/types";

/** Deal statuses that belong to the inspection stage: from the PO to the report. */
export const QC_STAGE_STATUSES: DealStatus[] = [
  "PO_ISSUED",
  "SUPPLIER_DISPATCH_READY",
  "QC_PASSED",
  "QC_FAILED",
  "DISPUTE",
];

type Tone = "danger" | "warn" | "info" | "ok" | "muted";

interface QcStatusMeta {
  label: string;
  tone: Tone;
  /** Lower = needs attention sooner; orders the cards in the QC column. */
  rank: number;
}

/** Mirrors shared/orchestration/qc_status.py::LABELS. */
export const QC_STATUS_META: Record<QcStatus, QcStatusMeta> = {
  FAILED:              { label: "Failed",                      tone: "danger", rank: 0 },
  BOOKING_FAILED:      { label: "Booking failed",              tone: "danger", rank: 1 },
  RESULT_PENDING:      { label: "Decision needed",             tone: "danger", rank: 2 },
  OVERDUE:             { label: "Report overdue",              tone: "danger", rank: 3 },
  AWAITING_PO_ACK:     { label: "Awaiting PO acknowledgement", tone: "warn",   rank: 4 },
  AWAITING_READY_DATE: { label: "Awaiting goods-ready date",   tone: "warn",   rank: 5 },
  NOT_BOOKED:          { label: "Not booked",                  tone: "warn",   rank: 6 },
  REINSPECTION:        { label: "Re-inspection booked",        tone: "info",   rank: 7 },
  REQUESTED:           { label: "Booking requested",           tone: "info",   rank: 8 },
  SCHEDULED:           { label: "Scheduled",                   tone: "info",   rank: 9 },
  INSPECTED:           { label: "Inspected — report due",      tone: "info",   rank: 10 },
  PASSED:              { label: "Passed",                      tone: "ok",     rank: 11 },
};

export const QC_STATUS_ORDER = (Object.keys(QC_STATUS_META) as QcStatus[]).sort(
  (a, b) => QC_STATUS_META[a].rank - QC_STATUS_META[b].rank
);

export const TONE_CLASS: Record<Tone, string> = {
  danger: "bg-[rgba(255,93,108,0.15)] text-[#ff5d6c] border-[rgba(255,93,108,0.4)]",
  warn: "bg-[rgba(245,166,35,0.15)] text-[#f5a623] border-[rgba(245,166,35,0.4)]",
  info: "bg-[rgba(79,140,255,0.15)] text-[#4f8cff] border-[rgba(79,140,255,0.4)]",
  ok: "bg-[rgba(46,194,138,0.15)] text-[#2ec28a] border-[rgba(46,194,138,0.4)]",
  muted: "bg-[rgba(154,169,196,0.12)] text-muted-foreground border-border",
};

/**
 * The deal's QC status: the backend's own value, or — for a deal stored
 * before the backend kept one — the closest reading of the deal status.
 */
export function qcStatusOf(deal: Pick<Deal, "status" | "qc_status">): QcStatus | null {
  if (deal.qc_status) return deal.qc_status;
  switch (deal.status) {
    case "PO_ISSUED":
      return "NOT_BOOKED";
    case "SUPPLIER_DISPATCH_READY":
      return "REQUESTED";
    case "QC_PASSED":
    case "IN_TRANSIT":
    case "CLEARED":
    case "PAID":
      return "PASSED";
    case "QC_FAILED":
    case "DISPUTE":
      return "FAILED";
    default:
      return null;
  }
}

export function isQcStage(status: DealStatus | string | null | undefined): boolean {
  return !!status && (QC_STAGE_STATUSES as string[]).includes(status);
}

/** A deal whose inspection failed (QC_FAILED → DISPUTE, reached only from QC_FAILED). */
export function isQcFailed(status: DealStatus | string | null | undefined): boolean {
  return status === "QC_FAILED" || status === "DISPUTE";
}
