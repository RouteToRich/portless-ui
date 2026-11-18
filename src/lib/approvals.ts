/** How a resolved gate reads to an operator. A gate closed by the system because another
 * decision made it moot (hitl_approval.withdraw_pending → resolved_by "system:superseded",
 * stored as REJECTED) is not a rejection: nobody said no, another pair was confirmed. */

export interface ResolvedLike {
  status: string;
  resolved_by?: string | null;
  action?: string;
}

export const SUPERSEDED_BY = "system:superseded";

export function isSuperseded(a: ResolvedLike): boolean {
  return a.status === "REJECTED" && a.resolved_by === SUPERSEDED_BY;
}

const MATCH_ACTIONS = new Set(["CONFIRM_MATCH", "SEND_INDICATIVE_OFFER"]);

/** "Closed — another pair was confirmed" for a superseded match proposal, else a generic closed text. */
export function supersededText(a: ResolvedLike): string {
  return a.action && MATCH_ACTIONS.has(a.action)
    ? "Closed — another pair was confirmed"
    : "Closed — no longer needed";
}

/** Short badge label for a gate status. */
export function approvalStatusLabel(a: ResolvedLike): string {
  if (isSuperseded(a)) return "Closed";
  switch (a.status) {
    case "PENDING": return "Pending";
    case "APPROVED":
    case "AUTO_APPROVED": return "Approved";
    case "REJECTED": return "Rejected";
    case "TIMED_OUT": return "Timed Out";
    default: return a.status;
  }
}

export type StatusVariant = "warning" | "success" | "destructive" | "secondary" | "outline";

export function approvalStatusVariant(a: ResolvedLike): StatusVariant {
  if (isSuperseded(a)) return "secondary";
  switch (a.status) {
    case "PENDING": return "warning";
    case "APPROVED":
    case "AUTO_APPROVED": return "success";
    case "REJECTED": return "destructive";
    case "TIMED_OUT": return "secondary";
    default: return "outline";
  }
}
