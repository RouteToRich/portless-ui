import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, Factory, Hourglass, Search, Target, Telescope, TrendingUp, Users,
} from "lucide-react";
import { useState } from "react";
import { useDealQuotes, useDealRfqs, useDeals, useProspectControl, useProspectDesk, useUsdInr } from "@/api/hooks";
import { inr, rateTitle } from "@/lib/fx";
import { toast } from "sonner";
import type { Deal, DeskAction, ProspectSummary } from "@/api/types";
import { cn, timeAgo } from "@/lib/utils";
import { hasUndeliveredMail, isProspect, notDelivered, prospectNextStep } from "@/lib/prospect";
import { QueryState } from "@/components/QueryState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HsCode } from "@/components/HsCode";

import { askReason } from "@/components/ReasonDialog";
import { CleanupCard } from "@/components/backoffice/BackOfficeCards";
const BUYER_ORDER = ["selected", "interested", "followed_up", "contacted", "pending", "no_reply", "declined"] as const;
const BUYER_LABEL: Record<string, string> = {
  selected: "said yes", interested: "said yes", followed_up: "followed up", contacted: "contacted",
  pending: "not contacted yet", no_reply: "no reply", declined: "declined",
};

const WAITING_LABEL: Record<string, string> = {
  us: "our move", buyers: "waiting for buyers", buyer: "waiting for the buyer", suppliers: "waiting for suppliers",
};

const ACTION_TONE: Record<string, string> = {
  confirm: "text-[#2ec28a]",
  fix_mailbox: "text-[#ff5d6c]",
  drop: "text-[#ff5d6c]",
  park: "text-[#f5a623]",
  push_supplier: "text-[#4f8cff]",
  push_buyer: "text-[#4f8cff]",
  best_and_final: "text-[#4f8cff]",
  send_offer: "text-[#4f8cff]",
  reconfirm_quote: "text-[#f5a623]",
  unpark: "text-muted-foreground",
};

function usd0(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** The money line: best pair, margin, chance, expected value, walk-away prices. */
function MoneyLine({ s }: { s: ProspectSummary }) {
  if (s.expected_value_usd == null && s.radar_expected_profit_usd == null) {
    return <p className="text-xs text-muted-foreground">No prices yet on either side — worth unknown.</p>;
  }
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs space-y-1">
      {s.best_buyer && s.best_supplier ? (
        <p>
          <span className="text-muted-foreground">Best pair</span>{" "}
          <b>{s.best_buyer}</b> × <b>{s.best_supplier}</b>
          {s.quantity_mt != null && <span className="text-muted-foreground"> · {s.quantity_mt} MT</span>}
          <span className={cn("ml-2 text-[10px] px-1.5 py-0.5 rounded border",
            s.firm ? "border-[#2ec28a]/30 text-[#2ec28a] bg-[#2ec28a]/10" : "border-border text-muted-foreground")}>
            {s.firm ? "firm prices" : "estimate"}
          </span>
        </p>
      ) : (
        <p className="text-muted-foreground">No buyer × supplier pair with prices yet.</p>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-0.5 tabular-nums">
        {s.margin_usd_per_mt != null && (
          <span>Margin <b className={s.margin_usd_per_mt > 0 ? "text-[#2ec28a]" : "text-[#ff5d6c]"}>{usd0(s.margin_usd_per_mt)}/MT</b>
            {s.margin_pct != null && <span className="text-muted-foreground"> ({s.margin_pct.toFixed(1)}%)</span>}</span>
        )}
        {s.probability != null && <span>Chance <b>{Math.round(s.probability * 100)}%</b></span>}
        {s.expected_value_usd != null && <span>Expected value <b>{usd0(s.expected_value_usd)}</b></span>}
        {s.radar_expected_profit_usd != null && (
          <span className="text-muted-foreground" title="What the Opportunity Radar expected when the prospect was started">
            radar estimate {usd0(s.radar_expected_profit_usd)}
          </span>
        )}
      </div>
      {(s.max_supplier_fob_usd_per_mt != null || s.min_buyer_price_usd_per_mt != null) && (
        <p className="text-[11px] text-muted-foreground" title="Prices at which the deal still keeps the margin floor">
          <Target className="w-3 h-3 inline mr-1" />
          Walk-away: supplier ≤ <b className="text-foreground">{usd0(s.max_supplier_fob_usd_per_mt)}</b> FOB
          {s.min_buyer_price_usd_per_mt != null && <> · buyer ≥ <b className="text-foreground">{usd0(s.min_buyer_price_usd_per_mt)}</b></>}
          {(s.supplier_cut_needed_usd_per_mt ?? 0) > 0 && (
            <span className="text-[#f5a623]"> · supplier must come down {usd0(s.supplier_cut_needed_usd_per_mt)}/MT</span>
          )}
        </p>
      )}
    </div>
  );
}

function Actions({ actions }: { actions: DeskAction[] }) {
  if (!actions.length) return null;
  return (
    <ul className="space-y-0.5">
      {actions.slice(0, 4).map((a, i) => (
        <li key={`${a.kind}-${i}`} className={cn("text-xs flex items-start gap-1.5", ACTION_TONE[a.kind] ?? "text-foreground")}>
          <span className="mt-0.5">{i === 0 ? "▶" : "·"}</span>
          <span>{a.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Park / Unpark / Drop — real actions on the row (the row itself opens the prospect). */
function ProspectControls({ dealId, parked, canRetry }: { dealId: string; parked: boolean; canRetry: boolean }) {
  const ctl = useProspectControl();
  const busy = ctl.park.isPending || ctl.unpark.isPending || ctl.drop.isPending || ctl.retrySends.isPending;
  const run = async (e: React.SyntheticEvent, what: "park" | "unpark" | "drop" | "retry") => {
    e.stopPropagation();
    if (busy) return;
    try {
      if (what === "retry") {
        const r = await ctl.retrySends.mutateAsync(dealId);
        const n = (r.outreach_retried ?? 0) + (r.rfq_retried ?? 0);
        toast.success(n ? `${n} e-mail${n === 1 ? "" : "s"} sent again` : "Nothing to retry (no tries left, or no transport failure)");
        return;
      }
      if (what === "unpark") {
        await ctl.unpark.mutateAsync(dealId);
        toast.success("Prospect unparked — reminders run again");
        return;
      }
      const r = await askReason(what === "park"
        ? {
            title: "Park prospect",
            consequence: "Follow-ups, reminders and the stall alarm stop; the prospect and its offers stay. "
              + "It wakes up on the date you give, or when you unpark it.",
            confirm: "Park", tone: "warning",
            fields: [{ name: "days", label: "Park for how many days", type: "number", placeholder: "empty = until unparked" }],
          }
        : {
            title: "Drop prospect",
            consequence: "The prospect closes as CANCELLED and its open gates (match, indicative offer, RFQ, "
              + "outreach) are withdrawn. This cannot be undone.",
            confirm: "Drop", tone: "destructive",
          });
      if (!r) return;
      const reason = r.reason;
      let until: string | undefined;
      if (what === "park") {
        const days = r.values.days;
        const n = Number(days);
        if (days && Number.isFinite(n) && n > 0) until = new Date(Date.now() + n * 86_400_000).toISOString();
        await ctl.park.mutateAsync({ dealId, reason: reason.trim(), until });
        toast.success(until ? `Parked until ${new Date(until).toLocaleDateString()}` : "Parked");
      } else {
        await ctl.drop.mutateAsync({ dealId, reason: reason.trim() });
        toast.success("Prospect dropped");
      }
    } catch (err) {
      toast.error("Not done", { description: err instanceof Error ? err.message : String(err) });
    }
  };
  const btn = "text-[11px] px-2 py-0.5 rounded-md border border-border hover:border-primary/50 cursor-pointer";
  const keys = (what: "park" | "unpark" | "drop" | "retry") => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") run(e, what);
  };
  return (
    <span className="flex items-center gap-1.5 shrink-0" data-testid={`prospect-controls-${dealId}`}>
      {canRetry && (
        <span role="button" tabIndex={0} className={cn(btn, "text-[#4f8cff]")} onClick={(e) => run(e, "retry")} onKeyDown={keys("retry")}
          title="Send again every introduction / quote request that failed in transport">Retry sends</span>
      )}
      {parked ? (
        <span role="button" tabIndex={0} className={btn} onClick={(e) => run(e, "unpark")} onKeyDown={keys("unpark")}>Unpark</span>
      ) : (
        <span role="button" tabIndex={0} className={cn(btn, "text-[#f5a623]")} onClick={(e) => run(e, "park")} onKeyDown={keys("park")}>Park</span>
      )}
      <span role="button" tabIndex={0} className={cn(btn, "text-[#ff5d6c]")} onClick={(e) => run(e, "drop")} onKeyDown={keys("drop")}>Drop</span>
    </span>
  );
}

function ProspectRow({ deal, desk, onOpen }: { deal: Deal; desk?: ProspectSummary; onOpen: () => void }) {
  const { data: rfqs } = useDealRfqs(deal.deal_id);
  const { data: quotes } = useDealQuotes(deal.deal_id);
  const { data: fx } = useUsdInr();
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
  const failedSends = cands.filter((c) => c.send_error && c.status === "pending").length;
  const undelivered = hasUndeliveredMail(deal) || undeliveredRfq > 0 || failedSends > 0;
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
          {desk && (
            <Badge variant={desk.waiting_on === "us" ? "default" : "secondary"} className="text-[10px]" title={desk.waiting_detail}>
              {WAITING_LABEL[desk.waiting_on] ?? desk.waiting_on}
              {desk.idle_days != null && desk.idle_days > 0 ? ` · ${desk.idle_days}d` : ""}
            </Badge>
          )}
          {desk?.stalled && (
            <Badge variant="warning" className="text-[10px] gap-1"><Hourglass className="w-3 h-3" /> stalled</Badge>
          )}
          {desk?.parked && (
            <Badge variant="secondary" className="text-[10px]" title={desk.parked_reason ?? undefined}>
              parked{desk.parked_until ? ` until ${new Date(desk.parked_until).toLocaleDateString()}` : ""}
            </Badge>
          )}
          {undelivered && (
            <Badge variant="warning" className="text-[10px] gap-1">
              <AlertTriangle className="w-3 h-3" /> e-mails not delivered
            </Badge>
          )}
          {(desk?.quotes_expiring ?? 0) > 0 && (
            <Badge variant="warning" className="text-[10px] gap-1"><Clock className="w-3 h-3" /> quote expiring</Badge>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {deal.created_at ? `started ${timeAgo(deal.created_at)}` : ""}
        </span>
      </div>

      {desk && <MoneyLine s={desk} />}
      {desk && (
        <p className={cn("text-[11px]", desk.busy_not_moving ? "text-[#f5a623]" : "text-muted-foreground")}
          title="Effort so far: e-mails out, replies in, decisions a person made, and what the scan that found it cost">
          Effort: {desk.emails_sent ?? 0} e-mail{desk.emails_sent === 1 ? "" : "s"} sent · {desk.replies ?? 0} repl{desk.replies === 1 ? "y" : "ies"}
          {" · "}{desk.operator_touches ?? 0} decision{desk.operator_touches === 1 ? "" : "s"}
          {desk.apify_cost_usd != null ? ` · scan USD ${desk.apify_cost_usd.toFixed(2)}` : ""}
          {desk.busy_not_moving ? " — busy, not moving" : ""}
        </p>
      )}

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
            {failedSends > 0 && <Badge variant="warning" className="text-[10px]">{failedSends} send failed</Badge>}
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
            {desk?.best_quote_usd_per_mt != null && (
              <Badge variant="secondary" className="text-[10px]" title={`Lowest valid supplier FOB — leverage on the others${rateTitle(fx?.rate, fx?.source) ? `. ${rateTitle(fx?.rate, fx?.source)}` : ""}`}>
                best {usd0(desk.best_quote_usd_per_mt)} FOB{inr(desk.best_quote_usd_per_mt, fx?.rate) ? ` (${inr(desk.best_quote_usd_per_mt, fx?.rate)})` : ""}{desk.quote_spread_pct != null ? ` · spread ${desk.quote_spread_pct.toFixed(0)}%` : ""}
              </Badge>
            )}
            {(desk?.quotes_expired ?? 0) > 0 && <Badge variant="warning" className="text-[10px]">{desk?.quotes_expired} expired</Badge>}
            {undeliveredRfq > 0 && (
              <Badge variant="warning" className="text-[10px]">{undeliveredRfq} request{undeliveredRfq === 1 ? "" : "s"} not delivered</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          {desk ? <Actions actions={desk.actions} /> : (
            <span className="text-xs text-muted-foreground">{prospectNextStep(deal, quotes?.length ?? 0)}</span>
          )}
        </div>
        <ProspectControls dealId={deal.deal_id} parked={Boolean(desk?.parked)} canRetry={failedSends > 0 || undeliveredRfq > 0} />
        <span className="flex items-center gap-1 text-primary text-xs shrink-0">Open <ArrowRight className="w-3 h-3" /></span>
      </div>
    </button>
  );
}

type SortKey = "priority" | "value" | "idle" | "newest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Priority" },
  { key: "value", label: "Expected value" },
  { key: "idle", label: "Longest idle" },
  { key: "newest", label: "Newest" },
];

export function Prospects() {
  const navigate = useNavigate();
  const { data: deals, isLoading, isError, refetch } = useDeals();
  const { data: desk } = useProspectDesk();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [only, setOnly] = useState<"all" | "us" | "stalled">("all");
  const byId = new Map((desk ?? []).map((r) => [r.deal_id, r]));

  const prospects = (deals ?? [])
    .filter(isProspect)
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.hs_code.includes(q) || d.deal_id.toLowerCase().includes(q) || (d.market ?? "").toLowerCase().includes(q)
        || (d.buyer_candidates ?? []).some((c) => c.legal_name.toLowerCase().includes(q));
    })
    .filter((d) => {
      const r = byId.get(d.deal_id);
      if (only === "us") return r?.waiting_on === "us";
      if (only === "stalled") return Boolean(r?.stalled);
      return true;
    })
    .sort((a, b) => {
      const ra = byId.get(a.deal_id);
      const rb = byId.get(b.deal_id);
      if (sort === "newest") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      if (sort === "idle") return (rb?.idle_days ?? 0) - (ra?.idle_days ?? 0);
      if (sort === "value") return (rb?.expected_value_usd ?? rb?.radar_expected_profit_usd ?? -1) - (ra?.expected_value_usd ?? ra?.radar_expected_profit_usd ?? -1);
      const us = Number(rb?.waiting_on === "us") - Number(ra?.waiting_on === "us");
      return us !== 0 ? us : (rb?.priority ?? 0) - (ra?.priority ?? 0);
    });
  const anyUndelivered = prospects.some((d) => hasUndeliveredMail(d) || (byId.get(d.deal_id)?.undelivered ?? 0) > 0);

  const rows = desk ?? [];
  const pipeline = rows.reduce((s, r) => s + Math.max(0, r.expected_value_usd ?? r.radar_expected_profit_usd ?? 0), 0);
  const ready = rows.filter((r) => r.actions.some((a) => a.kind === "confirm")).length;
  const ours = rows.filter((r) => r.waiting_on === "us").length;
  const stalled = rows.filter((r) => r.stalled).length;
  const expiring = rows.reduce((s, r) => s + r.quotes_expiring + r.quotes_expired, 0);

  const chip = (active: boolean) =>
    cn("text-xs px-3 py-1 rounded-md border transition-colors",
      active ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:bg-secondary");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Telescope className="w-5 h-5 text-[#4f8cff]" /> Prospects
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Opportunities you started but that are not deals yet, worked like a trading desk: what each is worth,
            whose move it is, the price to push each side to, and the next move. A prospect becomes a <b>deal</b>
            on the Deal Board once a buyer says yes and a supplier is chosen.
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

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: "Pipeline value", value: usd0(pipeline), sub: "expected value, else radar estimate", icon: TrendingUp, color: "#2ec28a" },
          { label: "Ready to confirm", value: String(ready), sub: "firm pairs above the threshold", icon: CheckCircle2, color: "#28c2a0" },
          { label: "Our move", value: String(ours), sub: "prospects waiting on us", icon: Target, color: "#4f8cff" },
          { label: "Stalled", value: String(stalled), sub: "nothing happened for days", icon: Hourglass, color: "#f5a623" },
          { label: "Quotes to reconfirm", value: String(expiring), sub: "expiring or expired", icon: Clock, color: "#ff5d6c" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="flex items-center gap-3 pt-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0" style={{ background: `${c.color}1a` }}>
                  <Icon className="w-4 h-4" style={{ color: c.color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground">{c.label}</p>
                  <p className="text-lg font-bold" style={{ color: c.color }}>{c.value}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.sub}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <CleanupCard />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Sort:</span>
        {SORTS.map((s) => <button key={s.key} onClick={() => setSort(s.key)} className={chip(sort === s.key)}>{s.label}</button>)}
        <span className="text-xs text-muted-foreground ml-3">Show:</span>
        <button onClick={() => setOnly("all")} className={chip(only === "all")}>All</button>
        <button onClick={() => setOnly("us")} className={chip(only === "us")}>Our move</button>
        <button onClick={() => setOnly("stalled")} className={chip(only === "stalled")}>Stalled</button>
      </div>

      {anyUndelivered && (
        <div className="flex items-start gap-2 rounded-lg border border-[#f5a623]/40 bg-[#f5a623]/10 px-3 py-2 text-xs text-[#f5a623]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>E-mails are not going out.</b> No outbound mailbox is configured (GMAIL_SENDER_ADDRESS /
            app password) or the mail server refused the connection, so introductions and quote requests did not
            reach anyone. Set up the mailbox, then use <i>Contact next buyers</i> on the prospect to send them for real.
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
          {only === "all"
            ? <>No prospects. Open the Opportunity Radar and press <b>Start prospect</b> on an opportunity to start one.</>
            : "No prospect matches this view."}
        </div>
      ) : (
        <div className="space-y-3">
          {prospects.map((d) => (
            <ProspectRow key={d.deal_id} deal={d} desk={byId.get(d.deal_id)} onOpen={() => navigate(`/deals/${d.deal_id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
