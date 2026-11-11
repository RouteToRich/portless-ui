import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Filter, LayoutGrid, LayoutList } from "lucide-react";
import { cn, fmtUSD, fmtPct, timeAgo } from "@/lib/utils";
import type { Deal, DealStatus, QcStatus } from "@/api/types";
import { useDeals } from "@/api/hooks";
import { StatusBadge } from "@/components/StatusBadge";
import { QueryState } from "@/components/QueryState";
import { DealPipeline } from "@/components/DealPipeline";
import { isProspect } from "@/lib/prospect";
import { QC_STAGE_STATUSES, QC_STATUS_META, QC_STATUS_ORDER, TONE_CLASS, qcStatusOf } from "@/lib/qc";
import { QcStatusChip } from "@/components/QcStatusChip";
import { EscrowStatusChip } from "@/components/EscrowStatusChip";
import { FreightStatusChip } from "@/components/FreightStatusChip";
import { showsEscrow } from "@/lib/escrow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Kanban columns — groups of statuses
const COLUMNS = [
  {
    id: "active",
    label: "Negotiating",
    color: "#4f8cff",
    // DRAFT / MATCHING are prospects (no buyer yes, no supplier chosen) — Prospects page
    statuses: ["NEGOTIATING", "NEGOTIATION_AGREED"] as DealStatus[],
  },
  {
    id: "pi",
    label: "PI Stage",
    color: "#28c2a0",
    statuses: ["PI_SENT", "PI_ACCEPTED"] as DealStatus[],
  },
  {
    id: "escrow",
    label: "Escrow",
    color: "#f5a623",
    statuses: ["ESCROW_PENDING", "ESCROW_FUNDED"] as DealStatus[],
  },
  {
    // The whole inspection stage, PO to report — each card shows its QC status
    // (awaiting date, scheduled, inspected, failed …). A failed inspection
    // (QC_FAILED → DISPUTE) stays here: it is an open problem, not a finished deal.
    id: "qc",
    label: "QC",
    color: "#a78bfa",
    statuses: QC_STAGE_STATUSES,
  },
  {
    id: "transit",
    label: "In Transit",
    color: "#6cb4ff",
    statuses: ["IN_TRANSIT"] as DealStatus[],
  },
  {
    id: "complete",
    label: "Complete",
    color: "#2ec28a",
    statuses: ["CLEARED", "PAID", "CANCELLED", "REFUNDED", "NEGOTIATION_FAILED"] as DealStatus[],
  },
] as const;

function DealCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-1.5 w-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-14 rounded-full" />
      </div>
    </div>
  );
}

interface DealCardProps {
  deal: Deal;
  onClick: () => void;
}

function cmsColor(score: number): string {
  if (score >= 70) return "#2ec28a";
  if (score >= 40) return "#f5a623";
  return "#ff5d6c";
}

/** Composite Match Score chip — matching info stays visible on the deal after
 *  the originating opportunity leaves the Opportunity Radar. */
function CmsChip({ score }: { score: number }) {
  const color = cmsColor(score);
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-semibold"
      style={{ color, borderColor: `${color}66`, background: `${color}1a` }}
      title="Composite Match Score of the winning supplier (Match Engine)"
    >
      CMS {score.toFixed(1)}
    </span>
  );
}

function DealCard({ deal, onClick }: DealCardProps) {
  const buyer = deal.parties.find((p) => p.role === "buyer");
  const supplier = deal.parties.find((p) => p.role === "supplier");
  const sourcedCount = (deal.match_results ?? []).filter((m) => m.decision === "SOURCE").length;
  const qc = qcStatusOf(deal);
  const qcDanger = qc != null && QC_STATUS_META[qc].tone === "danger";

  return (
    <div
      onClick={onClick}
      className={cn(
        "group bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-all duration-150 space-y-2.5",
        qcDanger && "border-l-4 border-l-[#ff5d6c]"
      )}
    >
      {/* HS Code + route */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-foreground font-mono">{deal.hs_code}</p>
          {buyer && supplier && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {buyer.country} → {supplier.country}
            </p>
          )}
        </div>
        <StatusBadge status={deal.status} />
      </div>

      {/* Pipeline mini */}
      <DealPipeline status={deal.status} compact />

      {showsEscrow(deal) && (
        <div className="space-y-1" data-testid="escrow-status-box">
          <EscrowStatusChip deal={deal} />
          {deal.escrow_status_detail && (
            <p className="text-[10px] text-muted-foreground leading-snug">{deal.escrow_status_detail}</p>
          )}
        </div>
      )}

      {deal.freight_status && (
        <div className="space-y-1" data-testid="freight-status-box">
          <FreightStatusChip deal={deal} className="max-w-full" />
          {deal.freight_status_detail && (
            <p className="text-[10px] text-muted-foreground leading-snug break-words">{deal.freight_status_detail}</p>
          )}
        </div>
      )}

      {qc && (
        <div className="space-y-1" data-testid="qc-status-box">
          <QcStatusChip status={qc} />
          {deal.qc_status_detail && (
            <p className="text-[10px] text-muted-foreground leading-snug">{deal.qc_status_detail}</p>
          )}
        </div>
      )}

      {/* Metrics */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          {deal.est_margin_usd != null && (
            <span className="text-muted-foreground">
              Est:{" "}
              <span className="text-foreground font-medium">{fmtUSD(deal.est_margin_usd)}</span>
              {deal.est_margin_pct != null && <span> · {fmtPct(deal.est_margin_pct)}</span>}
            </span>
          )}
          {deal.margin_floor_pct != null && (
            <span className="text-muted-foreground">
              Floor:{" "}
              <span className="text-amber-500 dark:text-[#f5a623] font-medium">{fmtPct(deal.margin_floor_pct)}</span>
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">{timeAgo(deal.created_at)}</span>
      </div>

      {/* Matching info — survives the opportunity's removal from the radar */}
      {(deal.winning_cms != null || sourcedCount > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          {deal.winning_cms != null && <CmsChip score={deal.winning_cms} />}
          {sourcedCount > 0 && (
            <span
              className="text-[10px] text-muted-foreground"
              title="Seller candidates the Match Engine scored as SOURCE"
            >
              {sourcedCount} matched supplier{sourcedCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Buyer/Supplier names */}
      {(buyer || supplier) && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground truncate">
          {buyer && <span className="truncate">{buyer.legal_name}</span>}
          {buyer && supplier && <span className="text-border">↔</span>}
          {supplier && <span className="truncate">{supplier.legal_name}</span>}
        </div>
      )}
    </div>
  );
}

export function DealBoard() {
  const navigate = useNavigate();
  const { data: deals, isLoading, isError, refetch } = useDeals();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const realDeals = (deals ?? []).filter((d) => !isProspect(d));
  const qcAttention = realDeals.filter((d) => {
    const s = qcStatusOf(d);
    return s != null && QC_STATUS_META[s].tone === "danger";
  }).length;
  const [qcFilter, setQcFilter] = useState<QcStatus | null>(null);
  const prospectCount = (deals?.length ?? 0) - realDeals.length;
  const filtered = realDeals.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.hs_code.toLowerCase().includes(q) ||
      d.deal_id.toLowerCase().includes(q) ||
      d.parties.some(
        (p) =>
          p.legal_name.toLowerCase().includes(q) ||
          p.country.toLowerCase().includes(q)
      )
    );
  });

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold">Deal Board</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {realDeals.length} deal{realDeals.length === 1 ? "" : "s"} — a buyer said yes and a supplier is chosen
            {qcAttention > 0 && (
              <>
                {" · "}
                <span className="text-[#ff5d6c] font-semibold" data-testid="qc-attention-count">
                  {qcAttention} inspection{qcAttention === 1 ? "" : "s"} need{qcAttention === 1 ? "s" : ""} attention
                </span>
              </>
            )}
            {prospectCount > 0 && (
              <>
                {" · "}
                <button className="text-primary hover:underline" onClick={() => navigate("/prospects")}>
                  {prospectCount} prospect{prospectCount === 1 ? "" : "s"} not yet deals →
                </button>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search deals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 w-56 text-xs"
            />
          </div>

          {/* View toggle */}
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={cn(
                "flex items-center justify-center w-8 h-8 transition-colors",
                viewMode === "kanban"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "flex items-center justify-center w-8 h-8 transition-colors border-l border-border",
                viewMode === "list"
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button size="sm" className="h-8 gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Deal
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        viewMode === "kanban" ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 pb-2">
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                className="min-w-0 bg-popover border border-border rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </span>
                  <Skeleton className="h-5 w-5 rounded-full" />
                </div>
                {[1, 2].map((i) => <DealCardSkeleton key={i} />)}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )
      ) : isError ? (
        <QueryState isError onRetry={refetch}>
          <></>
        </QueryState>
      ) : viewMode === "kanban" ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 pb-2 flex-1 items-start">
          {COLUMNS.map((col) => {
            const inCol = filtered.filter((d) =>
              (col.statuses as readonly string[]).includes(d.status)
            );
            const isQc = col.id === "qc";
            const qcCounts = new Map<QcStatus, number>();
            if (isQc) {
              for (const d of inCol) {
                const s = qcStatusOf(d);
                if (s) qcCounts.set(s, (qcCounts.get(s) ?? 0) + 1);
              }
            }
            const colDeals = isQc
              ? inCol
                  .filter((d) => !qcFilter || qcStatusOf(d) === qcFilter)
                  .sort((a, b) => {
                    const ra = QC_STATUS_META[qcStatusOf(a) ?? "PASSED"].rank;
                    const rb = QC_STATUS_META[qcStatusOf(b) ?? "PASSED"].rank;
                    return ra - rb;
                  })
              : inCol;
            return (
              <div
                key={col.id}
                className="min-w-0 bg-popover border border-border rounded-xl flex flex-col"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: col.color }}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {col.label}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {inCol.length}
                  </Badge>
                </div>

                {/* QC status breakdown — click to filter the column */}
                {isQc && qcCounts.size > 0 && (
                  <div className="flex flex-wrap gap-1 px-2 pt-2" data-testid="qc-status-filters">
                    {QC_STATUS_ORDER.filter((s) => qcCounts.has(s)).map((s) => (
                      <button
                        key={s}
                        onClick={() => setQcFilter(qcFilter === s ? null : s)}
                        className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold transition-opacity",
                          TONE_CLASS[QC_STATUS_META[s].tone],
                          qcFilter && qcFilter !== s && "opacity-40"
                        )}
                        title={qcFilter === s ? "Show every QC status" : `Show only: ${QC_STATUS_META[s].label}`}
                      >
                        {QC_STATUS_META[s].label} {qcCounts.get(s)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                  {colDeals.length === 0 ? (
                    <p className="text-center text-xs text-muted-foreground py-6">
                      No deals
                    </p>
                  ) : (
                    colDeals.map((deal) => (
                      <DealCard
                        key={deal.deal_id}
                        deal={deal}
                        onClick={() => navigate(`/deals/${deal.deal_id}`)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view — fits the page: fixed column widths, long text truncates,
           secondary columns appear only on wide screens (no horizontal scroll). */
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full table-fixed" data-testid="deal-table">
            <thead>
              <tr className="border-b border-border bg-popover">
                {[
                  ["HS Code", "text-left w-[96px]"],
                  ["Parties", "text-left"],
                  ["Status", "text-left w-[130px]"],
                  ["Escrow", "text-left w-[170px]"],
                  ["Freight", "text-left w-[150px]"],
                  ["QC", "text-left w-[140px]"],
                  ["Pipeline", "text-left w-[130px] hidden xl:table-cell"],
                  ["Match", "text-right w-[96px] hidden 2xl:table-cell"],
                  ["Est. Margin", "text-right w-[110px]"],
                  ["Created", "text-right w-[80px] hidden lg:table-cell"],
                ].map(([label, cls]) => (
                  <th
                    key={label}
                    className={cn(
                      "px-3 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate",
                      cls
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-sm text-muted-foreground">
                    No deals match your search
                  </td>
                </tr>
              ) : (
                filtered.map((deal, idx) => {
                  const buyer = deal.parties.find((p) => p.role === "buyer");
                  const supplier = deal.parties.find((p) => p.role === "supplier");
                  const qc = qcStatusOf(deal);
                  return (
                    <tr
                      key={deal.deal_id}
                      onClick={() => navigate(`/deals/${deal.deal_id}`)}
                      className={cn(
                        "border-b border-border cursor-pointer hover:bg-card transition-colors align-top",
                        idx % 2 === 0 ? "bg-transparent" : "bg-secondary/30",
                        qc != null && QC_STATUS_META[qc].tone === "danger" &&
                          "bg-[rgba(255,93,108,0.06)] shadow-[inset_3px_0_0_#ff5d6c]"
                      )}
                    >
                      <td className="px-3 py-3">
                        <span className="font-mono text-sm font-bold">{deal.hs_code}</span>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={[buyer?.legal_name, supplier?.legal_name].filter(Boolean).join(" ↔ ")}
                        >
                          {buyer?.legal_name}
                          {buyer && supplier && <span className="text-border mx-1">↔</span>}
                          {supplier?.legal_name}
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        <StatusBadge status={deal.status} />
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        {showsEscrow(deal) ? (
                          <EscrowStatusChip deal={deal} className="max-w-full" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-0">
                        {deal.freight_status ? (
                          <FreightStatusChip deal={deal} className="max-w-full" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 min-w-0" title={deal.qc_status_detail ?? undefined}>
                        {qc ? <QcStatusChip status={qc} className="max-w-full" /> : <span className="text-xs text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 hidden xl:table-cell">
                        <DealPipeline status={deal.status} compact />
                      </td>
                      <td className="px-3 py-3 text-right hidden 2xl:table-cell">
                        {deal.winning_cms != null ? (
                          <CmsChip score={deal.winning_cms} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-sm font-medium truncate">
                        {fmtUSD(deal.est_margin_usd)}
                        {deal.est_margin_pct != null && (
                          <span className="ml-1 text-xs text-muted-foreground">{fmtPct(deal.est_margin_pct)}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-muted-foreground hidden lg:table-cell">
                        {timeAgo(deal.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Filter bar hint */}
      {!isLoading && !isError && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3 h-3" />
          <span>
            Showing {filtered.length} of {deals?.length ?? 0} deals
          </span>
        </div>
      )}
    </div>
  );
}
