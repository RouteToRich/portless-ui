import type { Deal, RfqDispatchResult } from "@/api/types";

/** Statuses of a *prospect*: a product × market pursuit whose buyer has not said
 *  yes and whose supplier has not been chosen. It becomes a deal when both are
 *  decided (the backend moves it to NEGOTIATING). */
export const PROSPECT_STATUSES = ["DRAFT", "MATCHING"] as const;

export function isProspect(deal: Pick<Deal, "status">): boolean {
  return (PROSPECT_STATUSES as readonly string[]).includes(deal.status);
}

/** True when the backend recorded that an e-mail was only logged, never sent. */
export function notDelivered(d: Pick<RfqDispatchResult, "success" | "error">): boolean {
  return !d.success && /not delivered/i.test(d.error ?? "");
}

export function hasUndeliveredMail(deal: Deal): boolean {
  return (deal.buyer_candidates ?? []).some((c) => Boolean(c.send_error));
}

/** One line: what the prospect is waiting for. */
export function prospectNextStep(deal: Deal, quotes: number): string {
  const cands = deal.buyer_candidates ?? [];
  const buyerYes = cands.find((c) => c.status === "selected" || c.status === "interested");
  const buyer = deal.parties.find((p) => p.role === "buyer");
  const supplier = deal.parties.find((p) => p.role === "supplier");
  const haveBuyer = Boolean(buyerYes || buyer);
  if (!haveBuyer && !supplier) return quotes ? "Waiting for a buyer to say yes · quotes in, supplier not chosen yet" : "Waiting for a buyer to say yes and for supplier quotes";
  if (!haveBuyer) return "Supplier chosen — waiting for a buyer to say yes";
  if (!supplier) return quotes ? "Buyer interested — choose a supplier from the quotes" : "Buyer interested — waiting for supplier quotes";
  return "Buyer and supplier decided — negotiation opens next";
}
