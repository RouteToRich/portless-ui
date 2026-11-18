import { Fragment, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  Zap,
  TrendingUp,
  Globe,
  BarChart2,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Factory,
  Users,
  Percent,
  Handshake,
  AlertTriangle,
} from "lucide-react";
import { cn, countdown, fmtPct, fmtUSD, timeAgo } from "@/lib/utils";
import {
  useOpportunities,
  useScanOpportunities,
  useScanReport,
  useCatalogue,
  useCreateDeal,
  useTradeSources,
  useRescoreOpportunity,
  useConfirmHsPolicy,
  getCounterpartyView,
  setCounterpartyView,
  type CounterpartyView,
} from "@/api/hooks";
import type { Opportunity, OpportunityRescore, PairMatch, ReadinessCheck, TradeSource } from "@/api/types";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { HsCode } from "@/components/HsCode";
import { SourcingStatusBadge, useOpportunitySourcing } from "@/components/SourcingStatusBadge";
import { ValidationBadge } from "@/components/ValidationBadge";

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}

// Source chip colours by reachability mode (GET /trade-min/sources).
function modeVariant(mode: string): "success" | "info" | "secondary" | "warning" {
  switch (mode) {
    case "live": return "success";
    case "open": return "info";
    default: return "secondary";
  }
}

const ROLE_ORDER = ["demand", "buyers", "sellers", "tariff", "enrichment", "screening"] as const;

function SourceChips({ sources }: { sources: TradeSource[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {ROLE_ORDER.map((role) => {
        const items = sources.filter((s) => s.role === role);
        if (items.length === 0) return null;
        return (
          <div key={role} className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-0.5">
              {role}
            </span>
            {items.map((s) => (
              <Badge
                key={s.name}
                variant={modeVariant(s.mode)}
                className="text-[9px] h-4 px-1.5 font-medium cursor-default"
                title={`${s.detail}${s.actor ? `\nActor: ${s.actor}` : ""}\nMode: ${s.mode}`}
              >
                {s.label}
                {s.provider === "apify" && <span className="ml-1 opacity-70">⚡</span>}
              </Badge>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function fitChip(score: number | null | undefined) {
  if (score == null) return null;
  const color = score >= 70 ? "#2ec28a" : score >= 45 ? "#f5a623" : "#9aa9c4";
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0"
      style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
      title="Actor fit score (0–100)"
    >
      fit {score}
    </span>
  );
}

function Metric({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "warn" | "bad"; hint?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 border border-border px-3 py-2" title={hint}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          "text-sm font-semibold mt-0.5",
          tone === "good" && "text-[#2ec28a]",
          tone === "warn" && "text-[#f5a623]",
          tone === "bad" && "text-[#ff5d6c]"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** "2 unverified · 1 failed hidden" under a list shown in the verified-only view. */
function HiddenHint({ opp, role }: { opp: Opportunity; role: "buyers" | "suppliers" }) {
  if (opp.counterparty_filter !== "verified") return null;
  const c = opp.counterparty_counts?.[role];
  const hidden = (c?.unverified ?? 0) + (c?.failed ?? 0);
  if (!c || hidden === 0) return null;
  return (
    <p className="text-[10px] text-muted-foreground mt-1.5">
      {[c.unverified ? `${c.unverified} unverified` : null, c.failed ? `${c.failed} failed` : null]
        .filter(Boolean)
        .join(" · ")}{" "}
      hidden: switch the counterparty view to "All" to see them
    </p>
  );
}

// Inline detail panel revealed when an opportunity row is expanded — surfaces
// the full seller/buyer lists and the enrichment metrics that don't fit in the
// summary row.
function OpportunityDetail({ opp }: { opp: Opportunity }) {
  const sellers = opp.seller_candidates ?? [];
  const buyers = opp.buyer_signals ?? [];
  const t = opp.tariff_data;

  return (
    <div className="p-4 space-y-4 bg-secondary/20">
      {/* Enrichment metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Metric label="Demand Index" value={opp.demand_index != null ? opp.demand_index.toFixed(0) : "—"} />
        <Metric label="Gross Gap" value={pct(opp.price_gap_pct)} />
        <Metric
          label="Net Gap"
          value={pct(opp.net_price_gap_pct)}
          tone={opp.net_price_gap_pct != null ? (opp.net_price_gap_pct >= 15 ? "good" : opp.net_price_gap_pct >= 8 ? "warn" : "bad") : undefined}
        />
        <Metric
          label="Confidence"
          value={opp.confidence_score != null ? `${opp.confidence_score.toFixed(0)}%` : "—"}
          hint={opp.confidence_basis?.length ? `Points: ${opp.confidence_basis.join(" · ")}` : undefined}
        />
        <Metric label="Urgency Tier" value={opp.urgency_tier != null ? `T${opp.urgency_tier}` : "—"} />
        <Metric label="Active RFQs" value={opp.active_rfq_count != null ? String(opp.active_rfq_count) : "—"} />
      </div>

      {/* Real buyer-side price anchor from the export-market actor */}
      {opp.price_benchmark_usd_per_mt != null && (
        <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs flex items-center gap-2 flex-wrap">
          <span className="font-semibold">Market pays {fmtUSD(opp.price_benchmark_usd_per_mt)}/MT</span>
          <span className="text-muted-foreground">
            · UN Comtrade unit value via {opp.price_benchmark_source ?? "export-market actor"} — anchors the
            negotiation corridor instead of the 1.25× FOB heuristic
          </span>
        </div>
      )}

      {/* Tariff */}
      {t && (
        <div className="rounded-lg border border-border bg-popover px-3 py-2.5">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Percent className="w-3.5 h-3.5 text-[#f5a623]" />
            <span className="text-xs font-semibold">Tariff &amp; Landed Cost</span>
            {opp.tariff_viable === false && (
              <Badge variant="destructive" className="text-[9px] ml-1">Not viable</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Applied duty: <span className="text-foreground font-medium">{pct(t.applied_duty_pct)}</span>
              {t.verified === false && <span className="ml-1 text-[#f5a623]" title="No tariff source answered">(unverified)</span>}
            </span>
            <span title="Shown for reference: a business importer reclaims VAT, so it is not subtracted from the gap">
              VAT (reclaimable): <span className="text-foreground font-medium">{pct(t.gst_vat_pct)}</span>
            </span>
            <span>Net gap after duty + freight: <span className="text-foreground font-medium">{pct(opp.net_price_gap_pct)}</span></span>
            {t.rules_of_origin && (
              <span>Rules of origin: <span className="text-foreground font-medium">{t.rules_of_origin}</span></span>
            )}
          </div>
          {t.ntb_flags && t.ntb_flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {t.ntb_flags.map((f, i) => (
                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-[#f5a623]/10 text-[#f5a623] border border-[#f5a623]/20">
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <ReadinessList opp={opp} />

      <ProfitPanel opp={opp} />

      <CorridorFacts opp={opp} />

      {opp.rescore && <RescoreSummary r={opp.rescore} />}

      <PairMatches pairs={opp.pair_matches ?? []} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sellers */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Factory className="w-3.5 h-3.5 text-[#28c2a0]" />
            <span className="text-xs font-semibold">Seller Candidates ({sellers.length})</span>
          </div>
          {sellers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {opp.counterparty_filter === "verified" ? "No verified sellers yet" : "No sellers found"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {sellers.map((s) => (
                <div
                  key={s.candidate_id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-popover border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate flex items-center gap-1.5">
                      {s.company_name}
                      {s.source && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal shrink-0">
                          {s.source.replace("apify_", "⚡ ")}
                        </Badge>
                      )}
                      {fitChip(s.fit_score)}
                      <ValidationBadge v={s.validation} />
                      <FlagChips flags={s.flags} />
                    </p>
                    {s.fit_reason && (
                      <p className="text-[10px] text-muted-foreground/90 italic line-clamp-1" title={s.fit_reason}>{s.fit_reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {[s.location_city, s.location_state].filter(Boolean).join(", ") || "—"}
                      {s.annual_capacity_mt != null && ` · ${s.annual_capacity_mt.toLocaleString()} MT/yr`}
                      {s.supplier_to_port_km != null && ` · ${s.supplier_to_port_km} km to port`}
                    </p>
                    {(s.email || s.website || s.gstin) && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {s.email && <span className="font-mono">{s.email}</span>}
                        {s.website && (
                          <>
                            {s.email && " · "}
                            <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
                              website
                            </a>
                          </>
                        )}
                        {s.gstin && ` · GSTIN ${s.gstin}`}
                      </p>
                    )}
                  </div>
                  <span className="text-xs font-semibold shrink-0 text-[#28c2a0]" title="Estimated FOB, USD per MT">
                    {s.estimated_fob_price_usd != null ? (
                      `$${s.estimated_fob_price_usd.toFixed(2)}`
                    ) : s.fob_estimate_usd_per_mt != null ? (
                      <span className="text-muted-foreground font-normal" title={`Estimate, not a quote: ${s.fob_estimate_basis ?? "price book"}`}>
                        ~${s.fob_estimate_usd_per_mt.toFixed(0)} est.
                      </span>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <HiddenHint opp={opp} role="suppliers" />
        </div>

        {/* Buyers */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Users className="w-3.5 h-3.5 text-[#4f8cff]" />
            <span className="text-xs font-semibold">Buyer Signals ({buyers.length})</span>
          </div>
          {buyers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {opp.counterparty_filter === "verified" ? "No verified buyers yet" : "No buyer signals"}
            </p>
          ) : (
            <div className="space-y-1.5">
              {buyers.map((b, i) => {
                const link = b.website ?? b.contact_url ?? null;
                return (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg bg-popover border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate flex items-center gap-1.5">
                        {b.buyer_name}
                        {b.source && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-normal shrink-0">
                            {b.source.replace("apify_", "⚡ ")}
                          </Badge>
                        )}
                        {fitChip(b.fit_score)}
                        <ValidationBadge v={b.validation} />
                        <FlagChips flags={b.flags} />
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {b.buyer_country}
                        {b.signal_type && ` · ${b.signal_type}`}
                        {b.quantity != null && ` · ${b.quantity.toLocaleString()} ${b.quantity_unit ?? ""}`.trimEnd()}
                        {b.shipments_12m != null && ` · ${b.shipments_12m} shipments/12m`}
                        {b.risk_score != null && ` · risk ${b.risk_score}`}
                        {link && (
                          <>
                            {" · "}
                            <a href={link} target="_blank" rel="noopener noreferrer" className="text-[#4f8cff] hover:underline">
                              {b.website ? "website" : "contact"}
                            </a>
                          </>
                        )}
                      </p>
                      {b.pitch_angle && (
                        <p className="text-[10px] text-muted-foreground/90 italic line-clamp-2" title={b.pitch_angle}>
                          “{b.pitch_angle}”
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {b.unit_price_usd != null && (
                        <p className="text-xs font-semibold text-[#4f8cff]" title={b.price_unit ?? "unit price"}>
                          ${b.unit_price_usd.toFixed(2)}
                          {b.price_unit === "USD/MT" && <span className="text-[9px] font-normal">/MT</span>}
                        </p>
                      )}
                      {b.estimated_order_value_usd != null && (
                        <p className="text-[10px] text-muted-foreground">
                          ${b.estimated_order_value_usd.toLocaleString()} order
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <HiddenHint opp={opp} role="buyers" />
        </div>
      </div>
    </div>
  );
}

// ── Buyer × seller pair matching ────────────────────────────────────────────

const GRADE_STYLE: Record<string, string> = {
  Perfect: "bg-[#2ec28a]/15 text-[#2ec28a] border-[#2ec28a]/30",
  Strong: "bg-[#28c2a0]/15 text-[#28c2a0] border-[#28c2a0]/30",
  Good: "bg-[#4f8cff]/15 text-[#4f8cff] border-[#4f8cff]/30",
  Fair: "bg-[#f5a623]/15 text-[#f5a623] border-[#f5a623]/30",
  Weak: "bg-[#ff5d6c]/10 text-[#ff5d6c] border-[#ff5d6c]/25",
  Blocked: "bg-muted text-muted-foreground border-border",
};

function scoreColor(v: number | null): string {
  if (v == null) return "bg-muted";
  return v >= 75 ? "bg-[#2ec28a]" : v >= 50 ? "bg-[#f5a623]" : "bg-[#ff5d6c]";
}

function PairRow({ p }: { p: PairMatch }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-popover border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
        <span className="text-sm font-bold w-9 text-right tabular-nums">{p.score.toFixed(0)}</span>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border shrink-0", GRADE_STYLE[p.grade])}>{p.grade}</span>
        <span className="text-xs min-w-0 flex-1 truncate">
          <span className="font-medium">{p.buyer_name}</span>
          <span className="text-muted-foreground"> ({p.buyer_country}) ⇄ </span>
          <span className="font-medium">{p.seller_name}</span>
        </span>
        {p.recommended && (
          <Badge variant="success" className="text-[9px] h-4 px-1.5 shrink-0">Recommended</Badge>
        )}
        {p.verified === false && (
          <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#f5a623]/40 text-[#f5a623] shrink-0"
            title={`Not verified: ${(p.unverified_sides ?? []).join(" and ") || "a side"} — run the check before relying on this pair`}>
            unverified {(p.unverified_sides ?? []).join(" + ")}
          </span>
        )}
        {p.margin_pct != null && (
          <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline" title="Margin after landed cost">
            {p.margin_pct.toFixed(1)}% margin
          </span>
        )}
        <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline" title="Share of the score backed by real data">
          {(p.confidence * 100).toFixed(0)}% data
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            <span>Buyer's view: <span className="text-foreground font-medium">{p.buyer_view.toFixed(0)}</span></span>
            <span>Seller's view: <span className="text-foreground font-medium">{p.seller_view.toFixed(0)}</span></span>
            {p.buyer_price_usd_per_mt != null && (
              <span>Buyer price: <span className="text-foreground font-medium">${p.buyer_price_usd_per_mt.toFixed(0)}/MT</span>
                {p.buyer_price_basis === "market_benchmark" && " (market benchmark)"}</span>
            )}
            {p.landed_cost_usd_per_mt != null && (
              <span>Landed cost: <span className="text-foreground font-medium">${p.landed_cost_usd_per_mt.toFixed(0)}/MT</span></span>
            )}
          </div>
          {p.blockers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {p.blockers.map((b) => (
                <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff5d6c]/10 text-[#ff5d6c] border border-[#ff5d6c]/25">{b}</span>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {p.factors.map((f) => (
              <div key={f.key} className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] w-40 shrink-0 truncate">{f.label}</span>
                  <Progress value={f.score ?? 0} className="h-1.5 flex-1" indicatorClassName={scoreColor(f.score)} />
                  <span className="text-[11px] w-8 text-right tabular-nums">{f.score == null ? "?" : f.score.toFixed(0)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate" title={f.reason}>{f.reason}</p>
              </div>
            ))}
          </div>
          {p.improve.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold mb-0.5">To raise this score</p>
              <ul className="list-disc pl-4 text-[11px] text-muted-foreground space-y-0.5">
                {p.improve.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The latest pre-deal rescore: each pair before → after, what was filled, what the deal still has to get. */
function RescoreSummary({ r }: { r: OpportunityRescore }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 space-y-2" data-testid="rescore-summary">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold">Rescored before the deal</span>
        <span className="text-[10px] text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
      </div>
      <div className="space-y-1">
        {r.pairs.map((p) => {
          const up = p.after.score - p.before.score;
          return (
            <div key={`${p.buyer}-${p.seller}`} className="text-xs flex items-center gap-2 flex-wrap">
              <span className="font-medium">{p.buyer} ⇄ {p.seller}</span>
              <span className="tabular-nums text-muted-foreground">
                {p.before.score.toFixed(0)} {p.before.grade} →{" "}
                <span className="text-foreground font-semibold">{p.after.score.toFixed(0)} {p.after.grade}</span>
              </span>
              <span className={cn("text-[10px] tabular-nums", up > 0 ? "text-[#2ec28a]" : up < 0 ? "text-[#ff5d6c]" : "text-muted-foreground")}>
                {up > 0 ? `+${up.toFixed(0)}` : up.toFixed(0)}
              </span>
              {p.blockers.length > 0 && <Badge variant="destructive" className="text-[9px]">{p.blockers[0]}</Badge>}
            </div>
          );
        })}
      </div>
      {r.changes.length > 0 ? (
        <ul className="text-[10px] text-muted-foreground list-disc pl-4 space-y-0.5">
          {r.changes.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      ) : (
        <p className="text-[10px] text-muted-foreground">Nothing new could be filled automatically (no Apify token, or nothing found).</p>
      )}
      <p className="text-[10px] text-muted-foreground italic">{r.note}</p>
    </div>
  );
}

function PairMatches({ pairs }: { pairs: PairMatch[] }) {
  if (pairs.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Handshake className="w-3.5 h-3.5 text-[#2ec28a]" />
        <span className="text-xs font-semibold">Best Buyer ⇄ Seller Matches</span>
        <span className="text-[10px] text-muted-foreground">
          scored on 10 factors from both sides · open a row for the breakdown
        </span>
      </div>
      <div className="space-y-1.5">
        {pairs.map((p) => <PairRow key={`${p.buyer_index}-${p.seller_id}`} p={p} />)}
      </div>
    </div>
  );
}

/** The market score (0–100): demand × net price gap after duty and freight. */
function ScoreBar({ score }: { score: number }) {
  const safe = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const tone = safe >= 70 ? "#2ec28a" : safe >= 40 ? "#f5a623" : "#ff5d6c";
  return (
    <div className="flex items-center gap-2">
      <Progress value={safe} className="h-1.5 flex-1" indicatorClassName={safe >= 70 ? "bg-[#2ec28a]" : safe >= 40 ? "bg-[#f5a623]" : "bg-[#ff5d6c]"} />
      <span className="text-xs font-bold w-8 text-right tabular-nums" style={{ color: tone }}>
        {safe.toFixed(0)}
      </span>
    </div>
  );
}

// ── Labels ──────────────────────────────────────────────────────────────────

const FLAG_INFO: Record<string, { label: string; tone: "warn" | "bad" | "good" | "info"; hint: string }> = {
  price_check_needed: { label: "Check price", tone: "warn", hint: "The gross gap is implausibly large: most likely a different grade or origin mix, not a real arbitrage" },
  tariff_unverified: { label: "Duty unverified", tone: "warn", hint: "No tariff source answered: the 0 % duty is not confirmed" },
  no_supplier_price: { label: "No supplier price", tone: "info", hint: "The supplier price is an estimate (mandi or India's export average) until a supplier quotes" },
  below_margin_floor: { label: "Under margin floor", tone: "warn", hint: "The estimated margin is under the margin floor" },
  negative_margin: { label: "Loss at these prices", tone: "bad", hint: "The buyer price does not cover the landed cost" },
  india_cheaper_than_leader: { label: "India cheaper", tone: "good", hint: "India sells into this market below the leading other origin: lead with price in the introduction" },
  role_suspect: { label: "Looks like an Indian exporter", tone: "bad", hint: "Indian legal form, domain, phone or 'exporter from India' text: not an importer in the market. Kept out of matching and outreach" },
  product_mismatch: { label: "Other product", tone: "warn", hint: "The supplier's own site names another product, not this one" },
  name_from_domain: { label: "Name from website", tone: "info", hint: "The company name was read from its website address" },
  wrong_market: { label: "Other country", tone: "warn", hint: "Found when searching this market, but the company is based in another country" },
  export_blocked: { label: "Export forbidden", tone: "bad", hint: "Prohibited product or embargoed market — the trade check would stop the deal" },
  export_review: { label: "Export policy unconfirmed", tone: "warn", hint: "The HS code's export policy is not confirmed (restricted, state trading or never checked)" },
  market_news_avoid: { label: "News: avoid", tone: "bad", hint: "The market news check says avoid this trade now" },
  market_news_caution: { label: "News: caution", tone: "warn", hint: "The market news check says caution" },
  stale_market_data: { label: "Old prices", tone: "warn", hint: "The Comtrade figures behind these prices are more than two years old" },
};

const TONE_STYLE: Record<string, string> = {
  warn: "bg-[#f5a623]/10 text-[#f5a623] border-[#f5a623]/25",
  bad: "bg-[#ff5d6c]/10 text-[#ff5d6c] border-[#ff5d6c]/25",
  good: "bg-[#2ec28a]/10 text-[#2ec28a] border-[#2ec28a]/25",
  info: "bg-secondary text-muted-foreground border-border",
};

export function FlagChips({ flags, skip = [] }: { flags?: string[]; skip?: string[] }) {
  const shown = (flags ?? []).filter((f) => !skip.includes(f));
  if (shown.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((f) => {
        const info = FLAG_INFO[f] ?? { label: f.replace(/_/g, " "), tone: "info" as const, hint: f };
        return (
          <span key={f} title={info.hint} className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium shrink-0", TONE_STYLE[info.tone])}>
            {info.label}
          </span>
        );
      })}
    </span>
  );
}

const BUYER_BASIS: Record<string, string> = {
  buyer_quote: "a buyer's own price",
  price_book: "the PortLess price book",
  india_to_market: "what the market pays for India's goods (Comtrade)",
  market_average: "the market's all-origin average (Comtrade)",
};
const SUPPLIER_BASIS: Record<string, string> = {
  supplier_quote: "supplier prices",
  price_book: "the PortLess price book",
  mandi: "Agmarknet mandi prices + export mark-up",
  india_export_average: "India's average export price (every grade)",
};

function fmtUsd0(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function priceTag(estimated: boolean) {
  return (
    <span
      className={cn("text-[9px] px-1 py-0.5 rounded border ml-1", estimated ? TONE_STYLE.info : TONE_STYLE.good)}
      title={estimated ? "At least one price is an estimate, not a quote" : "Both prices come from the counterparties"}
    >
      {estimated ? "estimate" : "quoted"}
    </span>
  );
}

// ── Detail panels ───────────────────────────────────────────────────────────

/** From buyer price to expected profit, line by line, each with its basis. */
export function ProfitPanel({ opp }: { opp: Opportunity }) {
  const p = opp.profit;
  if (!p) return null;
  const row = (label: string, value: string, sub?: string | null, strong?: boolean, color?: string) => (
    <div className={cn("flex items-baseline justify-between gap-3 py-1", strong && "border-t border-border mt-1 pt-1.5")}>
      <div className="min-w-0">
        <span className={cn("text-xs", strong ? "font-semibold" : "text-muted-foreground")}>{label}</span>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
      <span className={cn("text-xs tabular-nums shrink-0", strong && "font-bold text-sm")} style={{ color }}>{value}</span>
    </div>
  );
  const freightSub = p.freight_usd_per_mt != null
    ? `sea freight ${fmtUsd0(p.freight_usd_per_mt)}/MT · ${p.freight_basis?.startsWith("lane_quote") ? p.freight_basis.replace("lane_quote", "lane quote") : "regional estimate until a lane quote"}${p.container_type === "reefer" ? " · reefer" : ""}`
    : null;
  const trend = p.mandi_trend;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5" data-testid="profit-panel">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <span className="text-xs font-semibold">Expected profit</span>
        {priceTag(p.estimated)}
        <span className="text-[10px] text-muted-foreground">per MT, lot of {p.lot_mt} MT ({p.lot_basis})</span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
        <div>
          {row("Buyer price (CIF)", p.buyer_price_usd_per_mt != null ? `${fmtUsd0(p.buyer_price_usd_per_mt)}/MT` : "—",
            p.buyer_price_basis ? `from ${BUYER_BASIS[p.buyer_price_basis] ?? p.buyer_price_basis}` : null)}
          {row("Supplier price (FOB India)", p.supplier_price_usd_per_mt != null ? `− ${fmtUsd0(p.supplier_price_usd_per_mt)}/MT` : "—",
            [p.supplier_price_note ?? (p.supplier_price_basis ? `from ${SUPPLIER_BASIS[p.supplier_price_basis] ?? p.supplier_price_basis}` : null),
             p.supplier_price_low_usd_per_mt != null && p.supplier_price_high_usd_per_mt != null
               ? `range ${fmtUsd0(p.supplier_price_low_usd_per_mt)}–${fmtUsd0(p.supplier_price_high_usd_per_mt)}` : null]
              .filter(Boolean).join(" · ") || null)}
          {row("Freight, inspection, insurance, escrow fee",
            p.landed_cost_usd_per_mt != null && p.supplier_price_usd_per_mt != null
              ? `− ${fmtUsd0(p.landed_cost_usd_per_mt - p.supplier_price_usd_per_mt)}/MT` : "—", freightSub)}
          {row("Export incentives (RoDTEP + drawback)",
            p.incentive_usd_per_mt != null ? `+ ${fmtUsd0(p.incentive_usd_per_mt)}/MT` : "not counted",
            p.incentive_basis ?? "no confirmed rate for this HS code")}
          {row("Margin", p.margin_usd_per_mt != null ? `${fmtUsd0(p.margin_usd_per_mt)}/MT · ${fmtPct(p.margin_pct)}` : "—",
            [p.margin_floor_pct != null ? `margin floor ${p.margin_floor_pct.toFixed(0)}%` : null,
             p.correction_basis ? `corrected: ${p.correction_basis}` : null].filter(Boolean).join(" · ") || null, true,
            p.margin_usd_per_mt == null ? undefined : p.margin_usd_per_mt > 0 ? (p.meets_floor ? "#2ec28a" : "#f5a623") : "#ff5d6c")}
        </div>
        <div>
          {row(`Per container (${p.container_mt} MT${p.container_type === "reefer" ? ", reefer" : ""})`, fmtUsd0(p.margin_per_container_usd))}
          {row(`Per lot (${p.lot_mt} MT)`, p.margin_usd_per_mt != null ? fmtUsd0(p.margin_usd_per_mt * p.lot_mt) : "—")}
          {row("Chance of closing", p.p_close != null ? `${(p.p_close * 100).toFixed(0)}%` : "—", p.p_close_basis.join(" · "))}
          {row("Expected profit", fmtUsd0(p.expected_profit_usd),
            p.expected_profit_low_usd != null && p.expected_profit_high_usd != null
              ? `range ${fmtUsd0(p.expected_profit_low_usd)} – ${fmtUsd0(p.expected_profit_high_usd)} (${p.range_basis})`
              : "margin × lot × chance of closing", true,
            p.expected_profit_usd == null ? undefined : p.expected_profit_usd > 0 ? "#2ec28a" : "#ff5d6c")}
          {p.annual_potential_usd != null && row("Profit potential per year", fmtUsd0(p.annual_potential_usd), p.annual_basis)}
        </div>
      </div>
      {trend && (
        <p className={cn("text-[11px] mt-1.5", trend.direction === "rising" ? "text-[#2ec28a]" : trend.direction === "falling" ? "text-[#f5a623]" : "text-muted-foreground")}>
          Mandi price {trend.direction} {trend.change_pct > 0 ? "+" : ""}{trend.change_pct}% over {trend.days} days — {trend.advice}
        </p>
      )}
      <MissingTips opp={opp} />
    </div>
  );
}

/** What the estimate still lacks, and where to get it. */
function MissingTips({ opp }: { opp: Opportunity }) {
  const tips = opp.profit?.missing ?? [];
  if (tips.length === 0) return null;
  return (
    <div className="mt-2 border-t border-border pt-1.5">
      <p className="text-[11px] font-semibold mb-0.5">What's missing and where to get it</p>
      <ul className="space-y-0.5">
        {tips.map((t) => (
          <li key={t.what} className="text-[11px] text-muted-foreground">
            <span className="text-foreground">{t.what}:</span> {t.how}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CHECK_STYLE: Record<string, string> = {
  ok: "bg-[#2ec28a]",
  warn: "bg-[#f5a623]",
  fail: "bg-[#ff5d6c]",
};

/** One dot per check in the table row: green ok, amber warn, red fail. */
function ReadinessDots({ checks }: { checks?: ReadinessCheck[] }) {
  if (!checks || checks.length === 0) return null;
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  return (
    <div className="flex items-center gap-1" title={checks.map((c) => `${c.status.toUpperCase()} · ${c.label}: ${c.detail}`).join("\n")}>
      {checks.map((c) => <span key={c.key} className={cn("w-1.5 h-1.5 rounded-full", CHECK_STYLE[c.status])} />)}
      <span className={cn("text-[10px] ml-1", fails ? "text-[#ff5d6c]" : warns ? "text-[#f5a623]" : "text-[#2ec28a]")}>
        {fails ? `${fails} blocking` : warns ? `${warns} to check` : "ready"}
      </span>
    </div>
  );
}

/** The ready-to-start checklist, in the order the deal meets each check. */
export function ReadinessList({ opp }: { opp: Opportunity }) {
  const checks = opp.readiness ?? [];
  const confirm = useConfirmHsPolicy();
  const { user } = useAuth();
  if (checks.length === 0) return null;
  const ep = opp.export_policy;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5" data-testid="readiness">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold">Ready to start?</span>
        <ReadinessDots checks={checks} />
      </div>
      <ul className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-0.5">
        {checks.map((c) => (
          <li key={c.key} className="text-[11px] flex items-start gap-1.5">
            <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", CHECK_STYLE[c.status])} />
            <span><span className="text-foreground">{c.label}</span> <span className="text-muted-foreground">— {c.detail}</span></span>
          </li>
        ))}
      </ul>
      {ep?.severity === "review" && ep.status === "unverified" && user?.is_portless && (
        <Button
          size="sm" variant="outline" className="h-7 text-xs mt-2"
          disabled={confirm.isPending}
          onClick={async () => {
            if (!window.confirm(`Confirm that HS ${opp.hs_code} is FREE to export under ITC-HS Schedule 2 (not prohibited, restricted or SCOMET)? This is recorded with your name.`)) return;
            try {
              await confirm.mutateAsync({ hs: opp.hs_code, status: "free", note: `checked against ITC-HS Schedule 2 from the radar by ${user.email}` });
              toast.success("Export policy recorded", { description: `HS ${opp.hs_code}: free to export` });
            } catch {
              toast.error("Could not record the export policy");
            }
          }}
        >
          Confirm free to export
        </Button>
      )}
    </div>
  );
}

/** What the market pays, what India gets, trend and the competing origins. */
export function CorridorFacts({ opp }: { opp: Opportunity }) {
  const has = opp.market_avg_usd_per_mt != null || opp.india_to_market_usd_per_mt != null || (opp.competitors ?? []).length > 0;
  if (!has && !opp.market_check && !(opp.import_requirements ?? []).length) return null;
  const stale = opp.data_period && /^\d{4}/.test(opp.data_period) && Number(opp.data_period.slice(0, 4)) < new Date().getFullYear() - 2;
  const news = opp.market_check;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2.5 space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold">Market</span>
        {opp.data_period && (
          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", stale ? TONE_STYLE.warn : TONE_STYLE.info)}
            title="Year of the UN Comtrade figures behind these prices">
            Comtrade {opp.data_period}{stale ? " · old" : ""}
          </span>
        )}
        {(opp.market_data_flags ?? []).filter((f) => f !== "stale_period").map((f) => (
          <span key={f} className={cn("text-[10px] px-1.5 py-0.5 rounded border", TONE_STYLE.info)}>{f.replace(/_/g, " ")}</span>
        ))}
        {opp.scan_cost && (
          <span className="text-[10px] text-muted-foreground ml-auto" title="Apify runs this opportunity's scan and rescores cost">
            scan cost {opp.scan_cost.runs} run(s) · ${opp.scan_cost.usd.toFixed(2)}
          </span>
        )}
      </div>
      {has && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Pays for India's goods: <span className="text-foreground font-medium">{fmtUsd0(opp.india_to_market_usd_per_mt)}/MT</span></span>
          <span>All-origin average: <span className="text-foreground font-medium">{fmtUsd0(opp.market_avg_usd_per_mt)}/MT</span></span>
          <span>India's export average (FOB): <span className="text-foreground font-medium">{fmtUsd0(opp.india_world_fob_usd_per_mt)}/MT</span></span>
          {opp.import_value_usd != null && <span>Imports: <span className="text-foreground font-medium">{fmtUsd0(opp.import_value_usd)}/yr</span></span>}
          {opp.import_growth_pct != null && (
            <span>YoY: <span className={cn("font-medium", opp.import_growth_pct >= 0 ? "text-[#2ec28a]" : "text-[#ff5d6c]")}>
              {opp.import_growth_pct >= 0 ? "+" : ""}{opp.import_growth_pct.toFixed(1)}%</span></span>
          )}
          {opp.india_share_pct != null && <span>India's share: <span className="text-foreground font-medium">{opp.india_share_pct.toFixed(1)}%</span></span>}
          {opp.freight_pct != null && <span>Freight ≈ <span className="text-foreground font-medium">{opp.freight_pct.toFixed(1)}%</span> of price</span>}
        </div>
      )}
      {(opp.competitors ?? []).length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Competing origins:{" "}
          {(opp.competitors ?? []).map((c, i) => (
            <span key={c.country}>
              {i > 0 && " · "}
              <span className="text-foreground">{c.country}</span>
              {c.share_pct != null && ` ${c.share_pct.toFixed(0)}%`}
              {c.unit_value_usd_per_mt != null && ` at ${fmtUsd0(c.unit_value_usd_per_mt)}/MT`}
            </span>
          ))}
          {opp.india_price_advantage_pct != null && (
            <span className={cn("ml-2 font-medium", opp.india_price_advantage_pct > 0 ? "text-[#2ec28a]" : "text-[#f5a623]")}>
              India {opp.india_price_advantage_pct > 0 ? `${opp.india_price_advantage_pct.toFixed(0)}% cheaper` : `${Math.abs(opp.india_price_advantage_pct).toFixed(0)}% dearer`} than the leader
            </span>
          )}
        </div>
      )}
      {news && news.verdict && news.verdict !== "unchecked" && (
        <p className={cn("text-[11px]", news.verdict === "avoid" ? "text-[#ff5d6c]" : news.verdict === "caution" ? "text-[#f5a623]" : "text-[#2ec28a]")}>
          News check: <b>{news.verdict}</b>{news.summary ? ` — ${news.summary}` : ""}
          {news.checked_at && <span className="text-muted-foreground"> ({timeAgo(news.checked_at)})</span>}
        </p>
      )}
      {(opp.import_requirements ?? []).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Destination needs: <span className="text-foreground">{(opp.import_requirements ?? []).join(" · ")}</span>
        </p>
      )}
      {opp.export_policy?.message && (
        <p className="text-[11px] text-muted-foreground">
          Export policy: <span className={cn(opp.export_policy.severity === "review" ? "text-[#f5a623]" : "text-foreground")}>{opp.export_policy.message}</span>
          {opp.export_policy.destination_message && <> · {opp.export_policy.destination_message}</>}
        </p>
      )}
      {opp.gap_note && (
        <p className="text-[11px] text-[#f5a623] flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {opp.gap_note}
        </p>
      )}
    </div>
  );
}

// ── Scan dialog + report ────────────────────────────────────────────────────

function ScanDialog({ open, onClose, onScan, pending }: {
  open: boolean;
  onClose: () => void;
  onScan: (opts: { hs_codes?: string[]; target_markets?: string[]; product_names?: Record<string, string> }) => void;
  pending: boolean;
}) {
  const { data: cat } = useCatalogue();
  const products = (cat?.products ?? []).filter((p) => p.active);
  const productCodes = products.length ? products.map((p) => p.hs_code) : cat?.defaults.hs_codes ?? [];
  const marketOptions = Array.from(new Set([...(products.flatMap((p) => p.markets)), ...(cat?.defaults.markets ?? [])])).sort();
  const [hs, setHs] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [extra, setExtra] = useState("");
  const toggle = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const extraMarkets = extra.split(/[,\s]+/).map((m) => m.trim().toUpperCase()).filter((m) => /^[A-Z]{2}$/.test(m));
  const allMarkets = Array.from(new Set([...markets, ...extraMarkets]));
  const names: Record<string, string> = {};
  for (const p of products) if (hs.includes(p.hs_code)) names[p.hs_code] = p.name;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Scan for opportunities</DialogTitle>
          <DialogDescription>
            Pick products and markets, or leave both empty to scan every catalogue product in its own markets.
            Each product × market costs Apify runs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold mb-1.5">Products</p>
            <div className="flex flex-wrap gap-1.5">
              {productCodes.map((code) => {
                const p = products.find((x) => x.hs_code === code);
                return (
                  <button key={code} type="button" onClick={() => toggle(hs, code, setHs)}
                    className={cn("text-xs px-2 py-1 rounded-md border", hs.includes(code) ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-secondary")}>
                    {p ? `${p.name} · ` : ""}<span className="font-mono">{code}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold mb-1.5">Markets</p>
            <div className="flex flex-wrap gap-1.5">
              {marketOptions.map((m) => (
                <button key={m} type="button" onClick={() => toggle(markets, m, setMarkets)}
                  className={cn("text-xs px-2 py-1 rounded-md border font-mono", markets.includes(m) ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-secondary")}>
                  {m}
                </button>
              ))}
            </div>
            <Input className="mt-2 h-8 text-xs" placeholder="More markets, ISO-2 (e.g. NL, SA, JP)" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {hs.length || allMarkets.length
              ? `${hs.length || "catalogue"} product(s) × ${allMarkets.length || "their"} market(s)`
              : "Whole catalogue"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pending} onClick={() => onScan({
            hs_codes: hs.length ? hs : undefined,
            target_markets: allMarkets.length ? allMarkets : undefined,
            product_names: Object.keys(names).length ? names : undefined,
          })}>
            <Zap className="w-3.5 h-3.5 mr-1" /> Scan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScanReportCard() {
  const { data: report } = useScanReport();
  const [open, setOpen] = useState(false);
  if (!report) return null;
  const dropped = report.corridors.filter((c) => c.result !== "opportunity");
  return (
    <div className="rounded-xl border border-border bg-popover px-4 py-2.5" data-testid="scan-report">
      <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        <span className="text-xs font-semibold">Last scan</span>
        <span className="text-[11px] text-muted-foreground">
          {timeAgo(report.finished_at ?? report.started_at)} · {report.corridors.length} product × market ·{" "}
          <span className="text-[#2ec28a]">{report.opportunities} opportunit{report.opportunities === 1 ? "y" : "ies"}</span> ·{" "}
          <span>{report.dropped} dropped</span>
          {report.errors > 0 && <span className="text-[#ff5d6c]"> · {report.errors} failed</span>}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {report.corridors.map((c) => (
            <li key={`${c.hs_code}-${c.market}`} className="text-[11px] flex items-start gap-2">
              <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", c.result === "opportunity" ? "bg-[#2ec28a]" : c.result === "error" ? "bg-[#ff5d6c]" : "bg-muted-foreground/50")} />
              <span className="font-mono shrink-0">{c.hs_code} → {c.market}</span>
              <span className="text-muted-foreground">{c.reason}</span>
            </li>
          ))}
          {dropped.length === 0 && <li className="text-[11px] text-muted-foreground">Nothing was dropped.</li>}
        </ul>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

type SortBy = "profit" | "annual" | "container" | "urgent" | "score" | "market";

const SORTS: { key: SortBy; label: string }[] = [
  { key: "profit", label: "Expected profit" },
  { key: "annual", label: "Profit per year" },
  { key: "container", label: "Margin / container" },
  { key: "urgent", label: "Time-sensitive" },
  { key: "score", label: "Market score" },
  { key: "market", label: "Market" },
];

function sortValue(o: Opportunity, by: SortBy): number {
  if (by === "profit") return o.profit?.expected_profit_usd ?? Number.NEGATIVE_INFINITY;
  if (by === "container") return o.profit?.margin_per_container_usd ?? Number.NEGATIVE_INFINITY;
  if (by === "annual") return o.profit?.annual_potential_usd ?? Number.NEGATIVE_INFINITY;
  if (by === "urgent") return (o.urgency_tier ?? 1) * 1000 + (o.active_rfq_count ?? 0) + (o.active_tender_count ?? 0);
  return o.arbitrage_rank;
}

function counts(opp: Opportunity, role: "buyers" | "suppliers") {
  const c = opp.counterparty_counts?.[role];
  if (!c) return null;
  return c;
}

export function OpportunityRadar() {
  const { user } = useAuth();
  const [view, setView] = useState<CounterpartyView>(getCounterpartyView);
  const { data, isLoading, isError, refetch } = useOpportunities(view);
  const { data: sourcesInfo } = useTradeSources();
  const scan = useScanOpportunities();
  const createDeal = useCreateDeal();
  const rescore = useRescoreOpportunity();
  const [sortBy, setSortBy] = useState<SortBy>("profit");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [fProduct, setFProduct] = useState("");
  const [fMarket, setFMarket] = useState("");
  const [fMinMargin, setFMinMargin] = useState("");
  const [fViable, setFViable] = useState(false);
  const [fHideRunning, setFHideRunning] = useState(false);

  const all = data ?? [];
  const productOptions = Array.from(new Set(all.map((o) => o.hs_code))).sort();
  const marketOptions = Array.from(new Set(all.map((o) => o.market))).sort();
  const minMargin = fMinMargin.trim() === "" ? null : Number(fMinMargin);

  const opportunities = all
    .filter((o) => !fProduct || o.hs_code === fProduct)
    .filter((o) => !fMarket || o.market === fMarket)
    .filter((o) => minMargin == null || Number.isNaN(minMargin) || (o.profit?.margin_pct ?? Number.NEGATIVE_INFINITY) >= minMargin)
    .filter((o) => !fViable || o.tariff_viable !== false)
    .filter((o) => !fHideRunning || (o.corridor_deals ?? []).length === 0)
    .sort((a, b) => (sortBy === "market" ? a.market.localeCompare(b.market) : sortValue(b, sortBy) - sortValue(a, sortBy)));
  const { data: sourcing } = useOpportunitySourcing(opportunities.map((o) => o.opportunity_id));

  const totalExpected = opportunities.reduce((s, o) => s + Math.max(0, o.profit?.expected_profit_usd ?? 0), 0);
  const bestContainer = opportunities.reduce<Opportunity | null>(
    (best, o) => ((o.profit?.margin_per_container_usd ?? Number.NEGATIVE_INFINITY) > (best?.profit?.margin_per_container_usd ?? Number.NEGATIVE_INFINITY) ? o : best),
    null,
  );
  const needCheck = opportunities.filter((o) => (o.flags ?? []).some((f) => f === "price_check_needed" || f === "tariff_unverified")).length;

  async function handleScan(opts: Parameters<typeof scan.mutateAsync>[0]) {
    setScanOpen(false);
    try {
      const found = await scan.mutateAsync(opts);
      toast.success("Scan complete", { description: `${found.length} opportunit${found.length === 1 ? "y" : "ies"} found · see "Last scan" for what was dropped and why` });
    } catch {
      toast.error("Scan failed", { description: "Check API connectivity. What was found so far is kept." });
    }
  }

  /** Fill the best pairs' gaps and score them again; returns the best score after. */
  async function runRescore(opp: Opportunity): Promise<boolean> {
    const before = opp.best_match_score;
    const id = toast.loading("Rescoring the best buyer ⇄ seller pairs…", {
      description: "Counterparty check, supplier address / GSTIN, port distance, supplier price estimate",
    });
    try {
      const out = await rescore.mutateAsync({ id: opp.opportunity_id, view });
      const after = out.best_match_score;
      toast.success("Rescored", {
        id,
        description:
          `Best match ${before != null ? before.toFixed(0) : "—"} → ${after != null ? after.toFixed(0) : "—"}` +
          (out.rescore?.changes.length ? ` · ${out.rescore.changes.length} fact(s) filled` : " · nothing new found"),
      });
      return true;
    } catch {
      toast.error("Rescore failed", { id, description: "The deal can still start from the scan's scores." });
      return false;
    }
  }

  async function handleStartDeal(opp: Opportunity) {
    const fails = (opp.readiness ?? []).filter((c) => c.status === "fail");
    if (fails.length > 0) {
      const ok = window.confirm(
        "This prospect is not ready to start:\n\n" +
          fails.map((c) => `• ${c.label}: ${c.detail}`).join("\n") +
          "\n\nStart anyway?",
      );
      if (!ok) return;
    }
    const running = opp.corridor_deals ?? [];
    if (running.length > 0) {
      const ok = window.confirm(
        `${running.length} deal(s) already running for HS ${opp.hs_code} → ${opp.market} (${running.map((d) => `${d.deal_id} ${d.status}`).join(", ")}). ` +
          "Starting another prospect writes to the same buyers again. Start anyway?",
      );
      if (!ok) return;
    }
    // Rescore first so the deal starts from the checked, better-scored pair
    // (the backend skips its own rescore when this one ran in the last hour).
    await runRescore(opp);
    try {
      const deal = await createDeal.mutateAsync({
        operator_id: user?.user_id ?? "unknown-operator",
        hs_code: opp.hs_code,
        market: opp.market,
        opportunity_id: opp.opportunity_id,
      });
      toast.success("Prospect started", {
        description: `${deal.deal_id} — PortLess is contacting the buyers and asking suppliers for quotes. Track it under Prospects.`,
      });
    } catch {
      toast.error("Could not start the prospect");
    }
  }

  const chip = (active: boolean) =>
    cn("text-xs px-3 py-1 rounded-md border transition-colors",
      active ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-secondary");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Opportunity Radar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ranked by expected profit: buyer price − supplier price − freight, inspection, insurance and escrow fee, × lot × chance of closing.{" "}
            {sourcesInfo
              ? `${sourcesInfo.live_count} of ${sourcesInfo.total} data sources reachable · ` +
                (sourcesInfo.apify.token_present
                  ? `Apify actors connected as ${sourcesInfo.apify.owner}`
                  : "APIFY_TOKEN not set — buyer/seller identification actors are skipped")
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setScanOpen(true)} disabled={scan.isPending}>
            {scan.isPending ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
            ) : (
              <><Zap className="w-3.5 h-3.5" /> Scan…</>
            )}
          </Button>
        </div>
      </div>
      <ScanDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} pending={scan.isPending} />

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Opportunities", value: String(opportunities.length), sub: all.length !== opportunities.length ? `of ${all.length}` : "open now", icon: Zap, color: "#4f8cff" },
          { label: "Expected profit (sum)", value: fmtUsd0(totalExpected), sub: "margin × lot × chance", icon: TrendingUp, color: "#2ec28a" },
          {
            label: "Best margin / container",
            value: fmtUsd0(bestContainer?.profit?.margin_per_container_usd),
            sub: bestContainer ? `HS ${bestContainer.hs_code} → ${bestContainer.market}` : "—",
            icon: BarChart2, color: "#28c2a0",
          },
          { label: "Need a price check", value: String(needCheck), sub: "implausible gap or unverified duty", icon: AlertTriangle, color: "#f5a623" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="flex items-center gap-3 pt-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0" style={{ background: `${s.color}1a` }}>
                  <Icon className="w-5 h-5" style={{ color: s.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{s.sub}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Data sources — live / open / stub, incl. the PortLess Apify actors (⚡) */}
      {sourcesInfo && sourcesInfo.sources.length > 0 && (
        <div className="rounded-xl border border-border bg-popover px-4 py-3">
          <SourceChips sources={sourcesInfo.sources} />
        </div>
      )}

      <ScanReportCard />

      {/* Sort + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Sort:</span>
        {SORTS.map((s) => (
          <button key={s.key} onClick={() => setSortBy(s.key)} className={chip(sortBy === s.key)}>{s.label}</button>
        ))}
        <span
          className="text-xs text-muted-foreground ml-3"
          title="Verified: sanctions screening clear, a deliverable e-mail and no GST / IEC red flag (checked at scan time for the top buyers and suppliers of each opportunity)"
        >
          Buyers &amp; suppliers:
        </span>
        {(["verified", "all"] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setCounterpartyView(v); }}
            className={chip(view === v)}
            data-testid={`radar-counterparties-${v}`}
          >
            {v === "verified" ? "Verified only" : "All"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-muted-foreground">Filter:</span>
        <select className="h-7 rounded-md border border-border bg-background px-2 text-xs" value={fProduct} onChange={(e) => setFProduct(e.target.value)} aria-label="Product">
          <option value="">All products</option>
          {productOptions.map((h) => <option key={h} value={h}>HS {h}</option>)}
        </select>
        <select className="h-7 rounded-md border border-border bg-background px-2 text-xs" value={fMarket} onChange={(e) => setFMarket(e.target.value)} aria-label="Market">
          <option value="">All markets</option>
          {marketOptions.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <Input className="h-7 w-32 text-xs" type="number" placeholder="Min margin %" value={fMinMargin} onChange={(e) => setFMinMargin(e.target.value)} />
        <label className="flex items-center gap-1 cursor-pointer text-muted-foreground">
          <input type="checkbox" checked={fViable} onChange={(e) => setFViable(e.target.checked)} /> Tariff viable
        </label>
        <label className="flex items-center gap-1 cursor-pointer text-muted-foreground" title="Hide products × markets that already have a deal running">
          <input type="checkbox" checked={fHideRunning} onChange={(e) => setFHideRunning(e.target.checked)} /> Hide running deals
        </label>
      </div>

      {/* Opportunities */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
          <Zap className="w-8 h-8 opacity-30" />
          <p className="text-sm">Could not load opportunities</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : all.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
          <Zap className="w-10 h-10 opacity-20" />
          <p className="text-sm">No opportunities detected yet</p>
          <p className="text-xs text-center max-w-sm">
            A scan reads UN Comtrade demand and prices through the export-market actor, finds importers and
            Indian suppliers by web search, checks duty on World Bank WITS and estimates the profit per product × market.
          </p>
          <Button size="sm" onClick={() => setScanOpen(true)} disabled={scan.isPending}>
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Run First Scan
          </Button>
        </div>
      ) : opportunities.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No opportunity matches these filters.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead>
              <tr className="bg-popover border-b border-border">
                <th className="w-8 px-2 py-3" />
                {[
                  ["Product", ""],
                  ["Market", "Scanned / expires"],
                  ["Expected profit", "Margin × lot × chance of closing"],
                  ["Margin", "Per MT and per container, after freight, inspection, insurance and escrow fee"],
                  ["Market pays · India supplier", "Buyer price vs supplier price per MT, each with its basis"],
                  ["Trend", "Import growth YoY and India's share of the market"],
                  ["Market score", "Demand × net price gap after duty and freight (0–100)"],
                  ["Best match", "Best buyer ⇄ seller pair score"],
                  ["Buyers · Sellers", "Verified / all"],
                  ["RFQ / Price", "Supplier side of the deal made from this opportunity"],
                ].map(([h, t]) => (
                  <th key={h} title={t} className="text-left px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                ))}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opp, idx) => {
                const p = opp.profit;
                const isConverted = opp.status === "CONVERTED";
                const isExpanded = expandedId === opp.opportunity_id;
                const running = opp.corridor_deals ?? [];
                const bc = counts(opp, "buyers");
                const sc = counts(opp, "suppliers");
                const best = (opp.pair_matches ?? [])[0];
                return (
                  <Fragment key={opp.opportunity_id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : opp.opportunity_id)}
                      className={cn("border-b border-border hover:bg-card transition-colors cursor-pointer",
                        isExpanded ? "bg-card" : idx % 2 === 0 ? "bg-transparent" : "bg-secondary/30")}
                    >
                      <td className="px-2 py-3 text-center align-middle">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground inline" /> : <ChevronRight className="w-4 h-4 text-muted-foreground inline" />}
                      </td>
                      <td className="px-3 py-3">
                        <HsCode code={opp.hs_code} className="font-mono font-bold text-sm" />
                        <div className="mt-1"><ReadinessDots checks={opp.readiness} /></div>
                        <div className="mt-1"><FlagChips flags={opp.flags} skip={["no_supplier_price"]} /></div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-sm"><Globe className="w-3.5 h-3.5 text-muted-foreground" />{opp.market}</div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {timeAgo(opp.scanned_at)}{opp.expires_at ? ` · expires ${countdown(opp.expires_at)}` : ""}
                        </p>
                        {(opp.urgency_tier ?? 1) >= 3 && (
                          <span
                            className={cn("inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded border font-medium", TONE_STYLE.warn)}
                            title={[
                              opp.active_rfq_count ? `${opp.active_rfq_count} active RFQ(s)` : null,
                              opp.active_tender_count ? `${opp.active_tender_count} tender(s)` : null,
                              opp.urgency_tier === 4 ? "supply disruption at a competing origin" : null,
                            ].filter(Boolean).join(" · ") || `urgency tier ${opp.urgency_tier}`}
                          >
                            time-sensitive · T{opp.urgency_tier}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <p className={cn("text-sm font-bold tabular-nums", (p?.expected_profit_usd ?? 0) > 0 ? "text-[#2ec28a]" : p?.expected_profit_usd != null ? "text-[#ff5d6c]" : "text-muted-foreground")}>
                          {fmtUsd0(p?.expected_profit_usd)}
                        </p>
                        {p?.p_close != null && <p className="text-[10px] text-muted-foreground">{(p.p_close * 100).toFixed(0)}% chance · {p.lot_mt} MT</p>}
                        {p?.expected_profit_low_usd != null && p?.expected_profit_high_usd != null && (
                          <p className="text-[10px] text-muted-foreground" title={p.range_basis ?? undefined}>
                            {fmtUsd0(p.expected_profit_low_usd)} – {fmtUsd0(p.expected_profit_high_usd)}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {p?.margin_usd_per_mt != null ? (
                          <>
                            <p className="font-semibold tabular-nums">
                              {fmtUsd0(p.margin_usd_per_mt)}/MT
                              <span className="text-muted-foreground font-normal"> · {fmtPct(p.margin_pct)}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">{fmtUsd0(p.margin_per_container_usd)} / container{priceTag(p.estimated)}</p>
                          </>
                        ) : <span className="text-muted-foreground">needs both prices</span>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p className="tabular-nums" title={p?.buyer_price_basis ? BUYER_BASIS[p.buyer_price_basis] : undefined}>
                          {fmtUsd0(p?.buyer_price_usd_per_mt ?? opp.price_benchmark_usd_per_mt)}
                          <span className="text-muted-foreground"> · </span>
                          <span title={p?.supplier_price_note ?? (p?.supplier_price_basis ? SUPPLIER_BASIS[p.supplier_price_basis] : undefined)}>
                            {fmtUsd0(p?.supplier_price_usd_per_mt)}
                          </span>
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate max-w-[170px]">
                          {p?.supplier_price_basis ? `supplier: ${p.supplier_price_basis.replace(/_/g, " ")}` : "no supplier price"}
                          {opp.data_period ? ` · ${opp.data_period}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {opp.import_growth_pct != null ? (
                          <p className={cn("font-medium", opp.import_growth_pct >= 0 ? "text-[#2ec28a]" : "text-[#ff5d6c]")}>
                            {opp.import_growth_pct >= 0 ? "+" : ""}{opp.import_growth_pct.toFixed(0)}% YoY
                          </p>
                        ) : <p className="text-muted-foreground">—</p>}
                        {opp.india_share_pct != null && <p className="text-[10px] text-muted-foreground">India {opp.india_share_pct.toFixed(0)}% share</p>}
                      </td>
                      <td className="px-3 py-3 w-36">
                        <ScoreBar score={opp.arbitrage_rank} />
                        {opp.confidence_score != null && <p className="text-[10px] text-muted-foreground mt-0.5" title={opp.confidence_basis?.length ? `Points: ${opp.confidence_basis.join(" · ")}` : undefined}>data confidence {opp.confidence_score.toFixed(0)}%</p>}
                      </td>
                      <td className="px-3 py-3">
                        {best ? (
                          <div className="text-xs" title={`${best.buyer_name} ⇄ ${best.seller_name}`}>
                            <span className="font-bold tabular-nums mr-1.5">{best.score.toFixed(0)}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", GRADE_STYLE[best.grade])}>{best.grade}</span>
                            {best.verified === false && (
                              <span className="ml-1 text-[9px] text-[#f5a623]" title="No pair with both sides verified yet">unverified</span>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p title="Buyers: verified / all">
                          <Users className="w-3 h-3 inline mr-1 text-[#4f8cff]" />
                          {bc ? `${bc.verified ?? 0}/${(bc.verified ?? 0) + (bc.unverified ?? 0) + (bc.failed ?? 0)}` : (opp.buyer_signals ?? []).length}
                        </p>
                        <p title="Sellers: verified / all">
                          <Factory className="w-3 h-3 inline mr-1 text-[#28c2a0]" />
                          {sc ? `${sc.verified ?? 0}/${(sc.verified ?? 0) + (sc.unverified ?? 0) + (sc.failed ?? 0)}` : (opp.seller_candidates ?? []).length}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <SourcingStatusBadge status={sourcing?.[opp.opportunity_id]} />
                      </td>
                      <td className="px-3 py-3">
                        {running.length > 0 && (
                          <Badge variant="warning" className="text-[9px] mb-1" title={running.map((d) => `${d.deal_id} · ${d.status}`).join("\n")}>
                            {running.length} deal{running.length > 1 ? "s" : ""} running
                          </Badge>
                        )}
                        {isConverted ? (
                          <Badge variant="outline" className="text-[10px] gap-1">Deal Started</Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs gap-1"
                              title="Fill what can be filled without contacting anyone (counterparty check, supplier address / GSTIN, port distance, estimated supplier price) and score the best pairs again"
                              onClick={(e) => { e.stopPropagation(); setExpandedId(opp.opportunity_id); runRescore(opp); }}
                              disabled={rescore.isPending}
                            >
                              <RefreshCw className={cn("w-3 h-3", rescore.isPending && "animate-spin")} /> Rescore
                            </Button>
                            <Button
                              size="sm" className="h-7 text-xs gap-1"
                              title="Rescores the best pairs first, then starts the prospect"
                              onClick={(e) => { e.stopPropagation(); handleStartDeal(opp); }}
                              disabled={createDeal.isPending || rescore.isPending}
                            >
                              <ArrowUpRight className="w-3 h-3" /> Start prospect
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-border">
                        <td colSpan={12} className="p-0">
                          <OpportunityDetail opp={opp} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
