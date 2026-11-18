/** The INR figure shown beside a USD supplier price ("≈ ₹87,360"). Contracts, POs and
 *  payments stay USD; this is only the supplier's own currency for the operator's reading. */
export function inr(usd: number | null | undefined, rate: number | null | undefined): string | null {
  if (usd == null || !rate || !Number.isFinite(usd) || !Number.isFinite(rate)) return null;
  return `≈ ₹${Math.round(usd * rate).toLocaleString("en-IN")}`;
}

/** Tooltip naming the rate and where it comes from. */
export function rateTitle(rate: number | null | undefined, source?: string | null): string | undefined {
  if (!rate) return undefined;
  return `At ${rate.toFixed(2)} INR per USD (${source === "live" ? "live rate" : "fallback rate — NEGOTIATION_FALLBACK_USD_INR_RATE"}); the contract stays in USD`;
}
