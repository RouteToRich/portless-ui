import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Factory, Search, Telescope, Users } from "lucide-react";
import { useState } from "react";
import { useDealQuotes, useDealRfqs, useDeals } from "@/api/hooks";
import type { Deal } from "@/api/types";
import { cn, timeAgo } from "@/lib/utils";
import { hasUndeliveredMail, isProspect, notDelivered, prospectNextStep } from "@/lib/prospect";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HsCode } from "@/components/HsCode";

const BUYER_ORDER = ["selected", "interested", "followed_up", "contacted", "pending", "no_reply", "declined"] as const;
const BUYER_LABEL: Record<string, string> = {
  selected: "said yes", interested: "said yes", followed_up: "followed up", contacted: "contacted",
  pending: "not contacted yet", no_reply: "no reply", declined: "declined",
};

function ProspectRow({ deal, onOpen }: { deal: Deal; onOpen: () => void }) {
  const { data: rfqs } = useDealRfqs(deal.deal_id);
  const { data: quotes } = useDealQuotes(deal.deal_id);
  const cands = deal.buyer_candidates ?? [];
  const counts = new Map<string, number>();
  for (const c of cands) {
    const key = BUYER_LABEL[c.status] ?? c.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const orderedCounts = BUYER_ORDER.map((s) => BUYER_LABEL[s])
    .filter((label, i, arr) => arr.indexOf(label) === i && counts.has(label))
    .map((label) => [label, counts.get(label)!] as const);

  const dispatches = (rfqs ?? []).flatMap((r) => r.dispatch_results);
  const undeliveredRfq = dispatches.filter(notDelivered).length;
  const undelivered = hasUndeliveredMail(deal) || undeliveredRfq > 0;
  const buyer = deal.parties.find((p) => p.role === "buyer");
  const supplier = deal.parties.find((p) => p.role === "supplier");

  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-xl border border-border bg-popover hover:border-primary/40 transition-colors p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <HsCode code={deal.hs_code} prefix="HS " className="font-mono text-sm font-semibold text-[#4f8cff]" />
          <span className="text-sm">→ {deal.market ?? "—"}</span>
          {deal.quantity_mt != null && <span className="text-xs text-muted-foreground">{deal.quantity_mt} MT</span>}
          <span className="font-mono text-[10px] text-muted-foreground">{deal.deal_id}</span>
          {undelivered && (
            <Badge variant="warning" className="text-[10px] gap-1">
              <AlertTriangle className="w-3 h-3" /> e-mails not delivered
            </Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {deal.created_at ? `started ${timeAgo(deal.created_at)}` : ""}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-secondary/50 border border-border p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Users className="w-3 h-3" /> Buyers
          </p>
          {buyer ? (
            <p className="text-sm"><b>{buyer.legal_name}</b> <span className="text-xs text-[#2ec28a]">said yes</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {cands.length} candidate{cands.length === 1 ? "" : "s"} — nobody has said yes
            </p>
          )}
          <div className="flex gap-1.5 flex-wrap">
            {orderedCounts.map(([label, n]) => (
              <Badge key={label} variant="secondary" className="text-[10px]">{n} {label}</Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-secondary/50 border border-border p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <Factory className="w-3 h-3" /> Suppliers
          </p>
          {supplier ? (
            <p className="text-sm"><b>{supplier.legal_name}</b> <span className="text-xs text-[#2ec28a]">chosen</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {dispatches.length ? `${dispatches.length} asked for a quote` : "no quote request yet"} — none chosen
            </p>
          )}
          <div className="flex gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">{quotes?.length ?? 0} quoted</Badge>
            {undeliveredRfq > 0 && (
              <Badge variant="warning" className="text-[10px]">{undeliveredRfq} request{undeliveredRfq === 1 ? "" : "s"} not delivered</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{prospectNextStep(deal, quotes?.length ?? 0)}</span>
        <span className="flex items-center gap-1 text-primary">Open <ArrowRight className="w-3 h-3" /></span>
      </div>
    </button>
  );
}

export function Prospects() {
  const navigate = useNavigate();
  const { data: deals, isLoading, isError, refetch } = useDeals();
  const [search, setSearch] = useState("");
  const prospects = (deals ?? [])
    .filter(isProspect)
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.hs_code.includes(q) || d.deal_id.toLowerCase().includes(q) || (d.market ?? "").toLowerCase().includes(q)
        || (d.buyer_candidates ?? []).some((c) => c.legal_name.toLowerCase().includes(q));
    })
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const anyUndelivered = prospects.some(hasUndeliveredMail);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Telescope className="w-5 h-5 text-[#4f8cff]" /> Prospects
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Opportunities you started but that are not deals yet. PortLess is asking the buyers whether they
            want the product and asking suppliers for quotes. A prospect becomes a <b>deal</b> on the Deal
            Board once a buyer says yes and a supplier is chosen.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search prospects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 w-56 text-xs"
          />
        </div>
      </div>

      {anyUndelivered && (
        <div className="flex items-start gap-2 rounded-lg border border-[#f5a623]/40 bg-[#f5a623]/10 px-3 py-2 text-xs text-[#f5a623]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>E-mails are not going out.</b> No outbound mailbox is configured (GMAIL_SENDER_ADDRESS /
            app password), so introductions and quote requests were only logged. Set up the mailbox, then
            use <i>Contact next buyers</i> on the prospect to send them for real.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      ) : isError ? (
        <QueryState isError onRetry={refetch}>
          <></>
        </QueryState>
      ) : prospects.length === 0 ? (
        <div className={cn("rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground")}>
          No prospects. Open the Opportunity Radar and press <b>Start deal</b> on an opportunity to start one.
        </div>
      ) : (
        <div className="space-y-3">
          {prospects.map((d) => (
            <ProspectRow key={d.deal_id} deal={d} onOpen={() => navigate(`/deals/${d.deal_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
