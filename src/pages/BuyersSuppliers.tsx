import { useEffect, useState } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Ban, ChevronLeft, ChevronRight, Factory, Globe, LayoutGrid, List, Mail, Phone, RefreshCw, Search, Sparkles, Users, Zap } from "lucide-react";
import { BookSummary, CompanyCard, CompanyProfileSheet } from "@/components/directory/CompanyViews";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import {
  getWorldwideSearch,
  setWorldwideSearch,
  useCatalogue,
  useCleanDirectory,
  useContactPreference,
  useDirectoryPage,
  useScanOpportunities,
  useTradeSources,
  useValidateCounterparty,
} from "@/api/hooks";
import type { Counterparty, CounterpartyRelationship, ValidationStatus } from "@/api/types";
import { CounterpartiesApi } from "@/api/endpoints";
import { useAuth } from "@/lib/auth";
import { FlagChips, ScanReportCard } from "@/pages/OpportunityRadar";
import { ValidationBadge } from "@/components/ValidationBadge";
import { ScreeningReviewCard } from "@/components/directory/ScreeningReviewCard";
import { DuplicatesCard } from "@/components/directory/DuplicatesCard";
import { SupplierFormDialog, SupplierImportDialog } from "@/components/directory/ManualSupplierDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HsCode } from "@/components/HsCode";
import { HsPicker, type HsChoice } from "@/components/HsPicker";

import { askReason } from "@/components/ReasonDialog";
import { isAutomationMode } from "@/lib/automationMode";
type Role = "buyer" | "supplier";

const SOURCE_LABEL: Record<string, string> = {
  apify_company_search: "Web search",
  apify_us_importers: "US customs",
  apify_alibaba_rfq: "Alibaba RFQ",
  apify_india_suppliers: "Supplier actor",
  alibaba_rfq: "Alibaba API",
  eu_ted: "EU tender",
  indiamart: "IndiaMART",
  tradeindia: "TradeIndia",
};

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function FitBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground">—</span>;
  const variant = score >= 80 ? "success" : score >= 50 ? "info" : "secondary";
  return <Badge variant={variant}>{score}</Badge>;
}

function OutcomeBadge({ c }: { c: Counterparty }) {
  // The badge counts what the Opportunity Radar lists now. `opportunity_ids` is
  // history: an opportunity expires, becomes a deal, or is replaced by a newer scan.
  const ever = c.opportunity_ids.length;
  const open = c.open_opportunity_ids?.length ?? ever;
  const past = ever - open;
  const plural = (n: number) => `${n} opportunit${n === 1 ? "y" : "ies"}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <Badge variant={open > 0 ? "teal" : "outline"} className="whitespace-nowrap">
            {open > 0 ? `${plural(open)} open` : ever > 0 ? "No open opportunity" : "No opportunity"}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div>{c.last_outcome || "No scan outcome recorded"}</div>
        {past > 0 && (
          <div className="mt-1 text-muted-foreground">
            Was in {plural(past)} no longer on the radar (expired, turned into a deal, or replaced by a newer scan).
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const STAGE_STYLE: Record<string, { label: string; cls: string }> = {
  traded: { label: "traded", cls: "bg-[#2ec28a]/15 text-[#2ec28a] border-[#2ec28a]/30" },
  in_deal: { label: "in a deal", cls: "bg-[#28c2a0]/15 text-[#28c2a0] border-[#28c2a0]/30" },
  quoted: { label: "quoted", cls: "bg-[#4f8cff]/15 text-[#4f8cff] border-[#4f8cff]/30" },
  interested: { label: "said yes", cls: "bg-[#4f8cff]/15 text-[#4f8cff] border-[#4f8cff]/30" },
  replied: { label: "replied", cls: "bg-secondary text-foreground border-border" },
  contacted: { label: "contacted", cls: "bg-secondary text-muted-foreground border-border" },
  new: { label: "never contacted", cls: "bg-secondary text-muted-foreground border-border" },
  declined: { label: "declined", cls: "bg-[#f5a623]/10 text-[#f5a623] border-[#f5a623]/25" },
  do_not_contact: { label: "do not contact", cls: "bg-[#ff5d6c]/10 text-[#ff5d6c] border-[#ff5d6c]/25" },
};

const STAGE_OPTIONS = ["", "new", "contacted", "replied", "interested", "quoted", "in_deal", "traded", "declined", "do_not_contact"];

function usd0(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** Where PortLess stands with the company: stage, prospects, last contact / reply, deals. */
function RelationshipCell({ rel }: { rel?: CounterpartyRelationship | null }) {
  const stage = rel?.stage ?? "new";
  const st = STAGE_STYLE[stage] ?? STAGE_STYLE.new;
  return (
    <div className="space-y-0.5">
      <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap", st.cls)}>{st.label}</span>
      {rel && (rel.prospects > 0 || rel.deals_won > 0) && (
        <p className="text-[10px] text-muted-foreground whitespace-nowrap">
          {rel.prospects > 0 && `${rel.prospects} prospect${rel.prospects === 1 ? "" : "s"}`}
          {rel.deals_won > 0 && ` · ${rel.deals_won} won`}
          {rel.deals_active > 0 && ` · ${rel.deals_active} live`}
        </p>
      )}
      {rel?.last_reply_at ? (
        <p className="text-[10px] text-muted-foreground">replied {timeAgo(rel.last_reply_at)}</p>
      ) : rel?.last_contact_at ? (
        <p className="text-[10px] text-muted-foreground">contacted {timeAgo(rel.last_contact_at)}</p>
      ) : null}
      {rel?.reply_rate != null && rel.contacted ? (
        <p className="text-[10px] text-muted-foreground">reply rate {Math.round(rel.reply_rate * 100)}%</p>
      ) : null}
    </div>
  );
}

/** Buyers: their stated target and requirement. Suppliers: last quote vs the product's median. */
function PriceCell({ c }: { c: Counterparty }) {
  const rel = c.relationship;
  if (c.role === "buyer") {
    if (!rel?.target_price_usd_per_mt && !rel?.requirement) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="space-y-0.5">
        {rel?.target_price_usd_per_mt != null && <p className="font-mono">{usd0(rel.target_price_usd_per_mt)}/MT target</p>}
        {rel?.requirement && <p className="text-[10px] text-muted-foreground">{rel.requirement}</p>}
      </div>
    );
  }
  const quote = rel?.last_quote_usd_per_mt ?? c.estimated_fob_price_usd;
  if (quote == null) return <span className="text-muted-foreground">—</span>;
  const vs = rel?.quote_vs_median_pct;
  return (
    <div className="space-y-0.5 whitespace-nowrap">
      <p className="font-mono">{usd0(quote)} FOB</p>
      {rel?.last_quote_at && <p className="text-[10px] text-muted-foreground">quoted {timeAgo(rel.last_quote_at)}</p>}
      {vs != null && (
        <p className={cn("text-[10px]", vs < 0 ? "text-[#2ec28a]" : "text-[#f5a623]")}>
          {vs < 0 ? `${Math.abs(vs).toFixed(0)}% below` : `${vs.toFixed(0)}% above`} median
        </p>
      )}
    </div>
  );
}

function ScoreCell({ c }: { c: Counterparty }) {
  if (c.score == null) return <FitBadge score={c.fit_score} />;
  const variant = c.score >= 60 ? "success" : c.score >= 35 ? "info" : "secondary";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span><Badge variant={variant}>{Math.round(c.score)}</Badge></span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-0.5">{(c.score_basis ?? []).map((b) => <div key={b}>{b}</div>)}</div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Do-not-contact switch (staff): outreach skips the company in every prospect. */
function ContactSwitch({ role, c }: { role: Role; c: Counterparty }) {
  const pref = useContactPreference();
  const { user } = useAuth();
  if (!user?.is_portless) return null;
  async function toggle() {
    if (!c.do_not_contact) {
      const r = await askReason({ title: `Do not contact ${c.name}`, consequence: "PortLess stops writing to this company in every prospect: no introduction, RFQ, reconfirmation or follow-up. A deal already running keeps going.",
        confirm: "Do not contact", tone: "destructive" });
      if (!r) return;
      try {
        await pref.mutateAsync({ role, id: c.id, doNotContact: true, reason: r.reason });
        toast.success(`${c.name} is on the do-not-contact list`);
      } catch {
        toast.error("Could not update the contact preference");
      }
      return;
    }
    if (!window.confirm(`Allow PortLess to write to ${c.name} again? (${c.dnc_reason ?? "no reason recorded"})`)) return;
    try {
      await pref.mutateAsync({ role, id: c.id, doNotContact: false });
      toast.success(`${c.name} can be contacted again`);
    } catch {
      toast.error("Could not update the contact preference");
    }
  }
  return (
    <button type="button" onClick={toggle} disabled={pref.isPending}
      className={cn("text-[10px] hover:underline disabled:opacity-50", c.do_not_contact ? "text-primary" : "text-muted-foreground")}
      title={c.do_not_contact ? c.dnc_reason ?? "" : "Never write to this company again (in every prospect)"}>
      {c.do_not_contact ? "Allow contact" : "Do not contact"}
    </button>
  );
}

function Contact({ c }: { c: Counterparty }) {
  if (!c.email && !c.phone) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-0.5 min-w-0">
      {c.email && (
        <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-primary hover:underline truncate">
          <Mail className="w-3 h-3 shrink-0" />
          <span className="truncate">{c.email}</span>
        </a>
      )}
      {c.phone && (
        <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
          <Phone className="w-3 h-3 shrink-0" />
          {c.phone}
        </a>
      )}
    </div>
  );
}

/** The scan-time check, plus "Check now" for a company never checked or due a re-check. */
function CheckCell({ role, c }: { role: Role; c: Counterparty }) {
  const validate = useValidateCounterparty();
  async function run() {
    try {
      const out = await validate.mutateAsync({ role, id: c.id });
      const st = out.validation?.status ?? "unverified";
      toast[st === "verified" ? "success" : st === "failed" ? "error" : "info"](`${c.name}: ${st}`, {
        description: out.validation?.reasons.slice(0, 2).join(" · ") || undefined,
      });
    } catch {
      toast.error(`Could not check ${c.name}`);
    }
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <ValidationBadge v={c.validation} />
      {c.validation?.status !== "verified" && c.validation?.status !== "failed" && (
        <button
          type="button"
          className="text-[10px] text-primary hover:underline disabled:opacity-50"
          onClick={run}
          disabled={validate.isPending}
          title="Run sanctions screening, the e-mail check and (Indian suppliers) GST / IEC now: paid Apify runs"
        >
          {validate.isPending ? "Checking…" : "Check now"}
        </button>
      )}
    </div>
  );
}

/** Selected companies → check (asks the Apify cost first), do not contact, add to a prospect. */
function BulkBar({ role, ids, onDone }: { role: Role; ids: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (!ids.length) return null;
  const run = async (action: "check" | "do_not_contact" | "add_to_prospect") => {
    setBusy(true);
    try {
      let body: Parameters<typeof CounterpartiesApi.bulk>[1] = { ids, action };
      if (action === "check") {
        const est = await CounterpartiesApi.bulk(role, body);
        if (est.confirm_needed && !window.confirm(`Check ${ids.length} compan${ids.length === 1 ? "y" : "ies"}? ${est.note ?? ""}`)) return;
        body = { ...body, confirm: true };
      } else if (action === "do_not_contact") {
        const r = await askReason({ title: `Do not contact ${ids.length} compan${ids.length === 1 ? "y" : "ies"}`,
          consequence: "PortLess stops writing to this company in every prospect: no introduction, RFQ, reconfirmation or follow-up. A deal already running keeps going.", confirm: "Do not contact", tone: "destructive" });
        if (!r) return;
        body = { ...body, reason: r.reason };
      } else {
        const r = await askReason({
          title: `Add ${ids.length} compan${ids.length === 1 ? "y" : "ies"} to a prospect`,
          consequence: "Buyers join the prospect's outreach funnel (introductions follow the outreach gate); "
            + "suppliers join its match board and get the RFQ. Do-not-contact, failed checks and companies "
            + "without an e-mail are refused.",
          reasonLabel: false, confirm: "Add",
          fields: [{ name: "deal", label: "Prospect (deal id)", placeholder: "DEAL-…", required: true }],
        });
        if (!r) return;
        body = { ...body, deal_id: r.values.deal };
      }
      const out = await CounterpartiesApi.bulk(role, body);
      const failed = (out.results ?? []).filter((r) => !r.ok);
      toast[failed.length ? "warning" : "success"](`${out.done ?? 0} done, ${out.failed ?? 0} not`, {
        description: failed.slice(0, 3).map((r) => r.detail).join(" · ") || undefined,
      });
      qc.invalidateQueries({ queryKey: ["counterparties"] });
      qc.invalidateQueries({ queryKey: ["directory-page"] });
      onDone();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Bulk action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs" data-testid="bulk-bar">
      <span className="font-medium">{ids.length} selected</span>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={() => run("check")}>Check</Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={() => run("add_to_prospect")}>Add to prospect</Button>
      <Button size="sm" variant="outline" className="h-7 text-[11px] text-[#ff5d6c]" disabled={busy} onClick={() => run("do_not_contact")}>Do not contact</Button>
      <button className="ml-auto text-muted-foreground hover:text-foreground" onClick={onDone}>Clear</button>
    </div>
  );
}

function CounterpartyTable({ role, rows, selected, onSelect }: {
  role: Role; rows: Counterparty[]; selected: Set<string>; onSelect: (ids: string[], on: boolean) => void;
}) {
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-2 w-6">
              <input type="checkbox" aria-label="Select all on this page" checked={all}
                onChange={(e) => onSelect(rows.map((r) => r.id), e.target.checked)} />
            </th>
            <th className="py-2 pr-3 font-semibold">Company</th>
            <th className="py-2 pr-3 font-semibold" title="Who to work with first: check, reachability, engagement, track record, price">Score</th>
            <th className="py-2 pr-3 font-semibold" title="Where PortLess stands with the company across every prospect and deal">Relationship</th>
            <th className="py-2 pr-3 font-semibold">Check</th>
            <th className="py-2 pr-3 font-semibold">Country</th>
            <th className="py-2 pr-3 font-semibold">Contact</th>
            <th className="py-2 pr-3 font-semibold">HS codes</th>
            <th className="py-2 pr-3 font-semibold">{role === "supplier" ? "Price (FOB)" : "Wants"}</th>
            <th className="py-2 pr-3 font-semibold">Source</th>
            <th className="py-2 pr-3 font-semibold">Outcome</th>
            <th className="py-2 font-semibold">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-b border-border/60 align-top hover:bg-secondary/40">
              <td className="py-2.5 pr-2">
                <input type="checkbox" aria-label={`Select ${c.name}`} checked={selected.has(c.id)}
                  onChange={(e) => onSelect([c.id], e.target.checked)} />
              </td>
              <td className="py-2.5 pr-3 max-w-[240px]">
                <p className="font-medium truncate" title={c.name}>{c.name}</p>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-muted-foreground hover:text-primary truncate"
                  >
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{hostOf(c.website)}</span>
                  </a>
                )}
                {(c.gstin || c.iec) && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {c.gstin && `GSTIN ${c.gstin}`} {c.iec && `IEC ${c.iec}`}
                  </p>
                )}
                {c.do_not_contact && (
                  <p className="text-[10px] text-[#ff5d6c] mt-0.5 flex items-center gap-1" title={c.dnc_reason ?? ""}>
                    <Ban className="w-3 h-3" /> do not contact{c.dnc_reason ? ` — ${c.dnc_reason}` : ""}
                  </p>
                )}
                {(c.flags ?? []).length > 0 && <div className="mt-1"><FlagChips flags={c.flags} /></div>}
              </td>
              <td className="py-2.5 pr-3"><ScoreCell c={c} /></td>
              <td className="py-2.5 pr-3"><RelationshipCell rel={c.relationship} /></td>
              <td className="py-2.5 pr-3">
                <CheckCell role={role} c={c} />
                <div className="mt-1"><ContactSwitch role={role} c={c} /></div>
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <p>{c.country ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground" title="Markets this company was found for">
                  {c.markets.length ? `for ${c.markets.join(", ")}` : "worldwide search"}
                </p>
              </td>
              <td className="py-2.5 pr-3 max-w-[230px]">
                <Contact c={c} />
              </td>
              <td className="py-2.5 pr-3">
                <span className="flex flex-col gap-0.5">
                  {c.hs_codes.map((hs) => <HsCode key={hs} code={hs} className="font-mono whitespace-nowrap" />)}
                </span>
              </td>
              <td className="py-2.5 pr-3"><PriceCell c={c} /></td>
              <td className="py-2.5 pr-3">
                <Badge variant="secondary" className="whitespace-nowrap">
                  {SOURCE_LABEL[c.source] ?? c.source}
                </Badge>
              </td>
              <td className="py-2.5 pr-3">
                <OutcomeBadge c={c} />
              </td>
              <td className="py-2.5 whitespace-nowrap text-muted-foreground" title={fmtDateTime(c.last_seen_at)}>
                {timeAgo(c.last_seen_at)}
                {c.times_seen > 1 && <span className="block text-[10px]">seen {c.times_seen}×</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const SORT_OPTIONS: { value: string; label: string; order: "asc" | "desc" }[] = [
  { value: "score", label: "Best first (score)", order: "desc" },
  { value: "activity", label: "Last activity", order: "desc" },
  { value: "stage", label: "Relationship stage", order: "desc" },
  { value: "added", label: "Newly found", order: "desc" },
  { value: "recent", label: "Last seen in a scan", order: "desc" },
  { value: "name", label: "Name A–Z", order: "asc" },
  { value: "country", label: "Country", order: "asc" },
  { value: "fit", label: "Fit score", order: "desc" },
  { value: "price", label: "Price (target / quote)", order: "asc" },
  { value: "seen", label: "Times found", order: "desc" },
];

const PAGE_SIZES = [30, 60, 120, 240];

function RolePanel({
  role,
  q,
  market,
  hs,
  country,
  check,
  live,
  stage,
  contactable,
  sort,
  order,
  view,
  onOpen,
}: {
  role: Role;
  q: string;
  market: string;
  hs: string;
  country: string;
  check: ValidationStatus | "";
  live: boolean;
  stage: string;
  contactable: boolean;
  sort: string;
  order: "asc" | "desc";
  view: "cards" | "table";
  onOpen: (id: string) => void;
}) {
  const [pageSize, setPageSize] = useState(60);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const select = (ids: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next;
  });
  async function exportCsv() {
    try {
      const blob = await CounterpartiesApi.exportCsv(role, {
        q: q.trim() || undefined, market: market.trim().toUpperCase() || undefined,
        country: country.trim().toUpperCase() || undefined, hs_code: hs.trim() || undefined,
        validation: check || undefined, stage: stage || undefined, contactable: contactable || undefined, sort, order,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `portless-${role}s-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Export failed");
    }
  }
  const filterKey = [q, market, hs, country, check, stage, contactable, sort, order, pageSize].join("|");
  useEffect(() => setPage(0), [filterKey]);
  const { data, isLoading, isError, refetch, isFetching } = useDirectoryPage(
    role,
    {
      q: q.trim() || undefined,
      market: market.trim().toUpperCase() || undefined,
      country: country.trim().toUpperCase() || undefined,
      hs_code: hs.trim() || undefined,
      validation: check || undefined,
      stage: stage || undefined,
      contactable: contactable || undefined,
      sort,
      order,
      offset: page * pageSize,
      limit: pageSize,
    },
    { live }
  );
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? page * pageSize + 1 : 0;
  const to = Math.min(total, (page + 1) * pageSize);
  const withEmail = rows.filter((r) => r.email).length;
  const engaged = rows.filter((r) => ["replied", "interested", "quoted", "in_deal", "traded"].includes(r.relationship?.stage ?? "")).length;
  const dnc = rows.filter((r) => r.do_not_contact).length;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <span className="font-medium text-[#ff5d6c]">Service unavailable</span> — could not load {role === "buyer" ? "buyers" : "suppliers"}.{" "}
        <button className="text-primary hover:underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center space-y-1">
        <p className="text-sm font-medium">
          {live ? `Searching for ${role === "buyer" ? "buyers" : "suppliers"}…` : `No ${role === "buyer" ? "buyers" : "suppliers"} yet`}
        </p>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          {live
            ? "Scan in progress — companies appear here as they are found (refreshing every 10 s)."
            : q || market || hs || country || check || stage || contactable
            ? "Nothing matches these filters."
            : isAutomationMode()
            ? "Search is off in Automation mode (no Apify token, by design). Start a run on the Automation page, or use \"Copy live directory\" there to bring in the live companies as test data."
            : "Run a scan: every company it finds is listed here, even when the scan creates no opportunity or deal. Add your products on the Catalogue page so the search uses product names."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
<div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
        <span>
          Showing <b className="text-foreground">{from}–{to}</b> of <b className="text-foreground">{total}</b> {role === "buyer" ? "buyers" : "suppliers"}
          {" · "}on this page {withEmail} with an e-mail · {engaged} engaged{dnc > 0 && ` · ${dnc} do not contact`}
        </span>
        {isFetching && <RefreshCw className="w-3 h-3 animate-spin" />}
        <span className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={exportCsv} title="Every company matching the filters, as CSV">
            Export CSV
          </Button>
          <select className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]" value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Per page">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="tabular-nums">page {page + 1} of {pages}</span>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </span>
      </div>
      {view === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((c) => <CompanyCard key={c.id} role={role} c={c} onOpen={() => onOpen(c.id)} />)}
        </div>
      ) : (
        <>
          <BulkBar role={role} ids={[...selected]} onDone={() => setSelected(new Set())} />
          <CounterpartyTable role={role} rows={rows} selected={selected} onSelect={select} />
        </>
      )}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2 text-[11px] text-muted-foreground">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={page === 0}
            onClick={() => { setPage(page - 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </Button>
          <span className="tabular-nums">{from}–{to} of {total}</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={page + 1 >= pages}
            onClick={() => { setPage(page + 1); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            Next <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function BuyersSuppliers() {
  const [tab, setTab] = useState<Role>("buyer");
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("");
  const [hs, setHs] = useState("");
  const [country, setCountry] = useState("");
  const [check, setCheck] = useState<ValidationStatus | "">("");
  const [stage, setStage] = useState("");
  const [contactable, setContactable] = useState(false);
  const [sort, setSort] = useState("score");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const clean = useCleanDirectory();
  const { user } = useAuth();
  const [worldwide, setWorldwide] = useState(getWorldwideSearch);
  const indiaOnly = country.trim().toUpperCase() === "IN";
  const scan = useScanOpportunities();
  const qc = useQueryClient();
  // true while a scan runs — started here or on the Opportunity Radar
  const scanning = useIsMutating({ mutationKey: ["scan"] }) > 0;
  const { data: sourcesInfo } = useTradeSources();
  // Totals from the paged endpoint (limit 1): the plain list stops at 200 companies.
  const { data: buyersPage } = useDirectoryPage("buyer", { limit: 1 }, { live: scanning });
  const { data: suppliersPage } = useDirectoryPage("supplier", { limit: 1 }, { live: scanning });
  // While an HS code is chosen (a product search, or the HS filter), the counters count
  // that product only — they start at 0 for a new search and rise as companies are found.
  const hsFilter = hs.trim();
  const { data: hsBuyersPage } = useDirectoryPage("buyer", { hs_code: hsFilter, limit: 1 }, { live: scanning, enabled: !!hsFilter });
  const { data: hsSuppliersPage } = useDirectoryPage("supplier", { hs_code: hsFilter, limit: 1 }, { live: scanning, enabled: !!hsFilter });

  // "Find buyers & suppliers for a product": an HS code picked by product name, the name the
  // Apify search uses (editable), and the markets — one scan for just that product.
  const [pick, setPick] = useState<HsChoice | null>(null);
  const [productName, setProductName] = useState("");
  const [pickMarkets, setPickMarkets] = useState("");
  const { data: cat } = useCatalogue();
  const nameProblem = (() => {
    const n = productName.trim();
    if (!pick) return null;
    if (!n || /^\d+$/.test(n)) return "Give the product a name — a bare HS number finds no companies.";
    if (n.includes(";") || n.includes("…") || n.split(/\s+/).length > 5)
      return `This reads like the official HS text; the search will use “${pick.search_name ?? "a short product name"}” instead. Type a short trade name (2–4 words) to override.`;
    return null;
  })();
  const typedMarkets = pickMarkets.split(/[\s,]+/).map((m) => m.trim().toUpperCase()).filter((m) => /^[A-Z]{2}$/.test(m));
  const lineMarkets = pick ? (cat?.products ?? []).find((p) => p.active && pick.code.startsWith(p.hs_code))?.markets ?? [] : [];
  const fallbackMarkets = lineMarkets.length ? lineMarkets
    : Array.from(new Set((cat?.products ?? []).filter((p) => p.active).flatMap((p) => p.markets))).length
      ? Array.from(new Set((cat?.products ?? []).filter((p) => p.active).flatMap((p) => p.markets)))
      : cat?.defaults.markets ?? [];
  const searchMarkets = typedMarkets.length ? typedMarkets : fallbackMarkets;

  async function handleProductScan() {
    if (!pick) return;
    const name = productName.trim() || pick.search_name || pick.name || "";
    if (!name || /^\d+$/.test(name)) {
      toast.error("Give the product a name to search for (a bare HS number finds no companies).");
      return;
    }
    const markets = typedMarkets;
    setHs(pick.code);
    try {
      const opps = await scan.mutateAsync({
        worldwide,
        hs_codes: [pick.code],
        target_markets: markets,
        product_names: { [pick.code]: name },
      });
      toast.success(`Search for ${name} complete`, {
        description: `${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · the buyers and suppliers found are listed below, best first; "Last search" says what each market returned`,
      });
      setSort("score");
      setOrder("desc");
    } catch {
      toast.warning("The search is still running on the server", {
        description: "Companies found so far are listed; use Refresh to load more.",
      });
    }
  }

  async function handleScan() {
    try {
      const opps = await scan.mutateAsync({ worldwide });
      toast.success("Scan complete", {
        description: `${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} · buyer and supplier lists updated`,
      });
    } catch {
      // The server keeps scanning and recording after the browser stops waiting.
      toast.warning("Scan is still running on the server", {
        description: "Companies found so far are listed; use Refresh to load more.",
      });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Buyers &amp; Suppliers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your trading book: every company the scanner found, where PortLess stands with it across all prospects and deals,
            its prices and score, and who must never be contacted again
            {sourcesInfo && !sourcesInfo.apify.token_present && " · APIFY_TOKEN not set, so no new companies are found"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => qc.invalidateQueries({ queryKey: ["counterparties"] })}
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
        {user?.is_portless && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={clean.isPending}
            title="Store the current clean-up on every record: names cut out of marketing sentences and split from run-together domains, usable e-mails, the company's own country, and buyers that look like Indian exporters flagged"
            onClick={async () => {
              try {
                const out = await clean.mutateAsync();
                toast.success(`Directory cleaned: ${out.changed} record(s) updated`);
              } catch {
                toast.error("Could not clean the directory");
              }
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> Clean directory
          </Button>
        )}
        <Button
          variant={worldwide ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-pressed={worldwide}
          disabled={scanning}
          title={
            worldwide
              ? "On: scans also search importers and suppliers in every country (2 Apify runs per product). Click to scan only the chosen markets and India."
              : "Off: scans search only the chosen markets' buyers and India's suppliers. Click to also search every country."
          }
          onClick={() => {
            setWorldwide(!worldwide);
            setWorldwideSearch(!worldwide);
          }}
        >
          <Globe className="w-3.5 h-3.5" /> Worldwide {worldwide ? "on" : "off"}
        </Button>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleScan} disabled={scanning}>
          {scanning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scanning…
            </>
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" /> Scan now
            </>
          )}
        </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <p className="text-sm font-semibold">Find buyers &amp; suppliers for a product</p>
            <p className="text-[11px] text-muted-foreground">
              Pick the HS code by product name; the Apify search looks for importers in the markets you list (or your catalogue's
              markets) and for suppliers in India{worldwide ? ", plus every country while Worldwide is on" : ""}. Each search costs paid Apify runs.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_auto] gap-2 items-start">
            <HsPicker
              value={pick}
              onChange={(c) => {
                setPick(c);
                setProductName(c?.search_name ?? c?.name ?? "");
              }}
            />
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Name to search for, e.g. basmati rice"
              className="h-8 text-xs"
              aria-label="Product name to search for"
              disabled={!pick}
            />
            <Input
              value={pickMarkets}
              onChange={(e) => setPickMarkets(e.target.value)}
              placeholder="Markets: AE, DE, US"
              className="h-8 text-xs"
              aria-label="Markets to search (country codes)"
              disabled={!pick}
            />
            <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleProductScan} disabled={!pick || scanning}>
              {scanning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              {scanning ? "Searching…" : "Find buyers & suppliers"}
            </Button>
          </div>
          {pick?.description && <p className="text-[10px] text-muted-foreground">HS {pick.code}: {pick.description}</p>}
          {nameProblem && <p className="text-[11px] text-[#f5a623]">{nameProblem}</p>}
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            {scanning && <RefreshCw className="w-3 h-3 animate-spin" />}
            {hsFilter
              ? <>Found for HS {hsFilter}: <b className="text-foreground">{hsBuyersPage?.total ?? 0}</b> buyers · <b className="text-foreground">{hsSuppliersPage?.total ?? 0}</b> suppliers
                  <span>({buyersPage?.total ?? 0} buyers · {suppliersPage?.total ?? 0} suppliers in the whole directory)</span></>
              : <>Directory: <b className="text-foreground">{buyersPage?.total ?? 0}</b> buyers · <b className="text-foreground">{suppliersPage?.total ?? 0}</b> suppliers</>}
          </p>
          {pick && (
            <p className="text-[11px] text-muted-foreground">
              Will search: importers / wholesale distributors of “{(nameProblem ? pick.search_name : productName.trim()) || pick.search_name || pick.name}” in{" "}
              <b className="text-foreground">{searchMarkets.length ? searchMarkets.join(", ") : "the default markets"}</b>
              {!typedMarkets.length && (lineMarkets.length ? " (this product's catalogue markets)" : " (catalogue / default markets — type markets to choose)")}
              {" · "}exporters / manufacturers in <b className="text-foreground">India</b>{worldwide ? " and worldwide" : ""}
              {" · "}about {2 * searchMarkets.length + 2 + (worldwide ? 2 : 0)} paid search lines
            </p>
          )}
        </CardContent>
      </Card>

      {user?.is_portless && tab === "supplier" && (
        <div className="flex gap-2">
          <Button size="sm" className="h-8 text-xs" onClick={() => setAdding(true)}>Add supplier</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setImporting(true)}>Import CSV</Button>
        </div>
      )}
      {adding && <SupplierFormDialog open onClose={() => setAdding(false)} />}
      <SupplierImportDialog open={importing} onClose={() => setImporting(false)} />
      <ScreeningReviewCard />
      {user?.is_portless && <DuplicatesCard role={tab} />}
      <ScanReportCard />

      <Card>
        <CardContent className="pt-4 space-y-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Role)}>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <TabsList>
                <TabsTrigger value="buyer" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Buyers
                </TabsTrigger>
                <TabsTrigger value="supplier" className="gap-1.5">
                  <Factory className="w-3.5 h-3.5" /> Suppliers
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
                <div className="relative w-full sm:w-56">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Name, e-mail, website…"
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {tab === "supplier" && (
                  <Button
                    variant={indiaOnly ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    aria-pressed={indiaOnly}
                    title="Show only suppliers based in India"
                    onClick={() => setCountry(indiaOnly ? "" : "IN")}
                  >
                    India only
                  </Button>
                )}
                <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Check result">
                  {([["", "All"], ["verified", "Verified"], ["unverified", "Unverified"], ["failed", "Failed"]] as const).map(
                    ([value, label]) => (
                      <button
                        key={value || "all"}
                        type="button"
                        onClick={() => setCheck(value)}
                        aria-pressed={check === value}
                        className={cn(
                          "h-8 px-2.5 text-xs border-r border-border last:border-r-0 transition-colors",
                          check === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"
                        )}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Country (DE)"
                  maxLength={2}
                  title="The company's own country (ISO-2)"
                  className="h-8 text-xs w-[110px] uppercase"
                />
                <Input
                  value={market}
                  onChange={(e) => setMarket(e.target.value)}
                  placeholder="Market (AE)"
                  maxLength={2}
                  title="The market the company was found for"
                  className={cn("h-8 text-xs w-[110px] uppercase")}
                />
                <Input
                  value={hs}
                  onChange={(e) => setHs(e.target.value)}
                  placeholder="HS code"
                  className="h-8 text-xs w-[110px] font-mono"
                />
                <select
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  aria-label="Relationship stage"
                >
                  {STAGE_OPTIONS.map((v) => (
                    <option key={v || "all"} value={v}>{v ? (STAGE_STYLE[v]?.label ?? v) : "Any stage"}</option>
                  ))}
                </select>
                <Button
                  variant={contactable ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  aria-pressed={contactable}
                  title="Only companies outreach may write to: not failed, not declined, not on the do-not-contact list, with an e-mail or phone"
                  onClick={() => setContactable(!contactable)}
                >
                  Contactable
                </Button>
                <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="Sort">
                  <select
                    className="h-8 bg-background px-2 text-xs border-0 outline-none"
                    value={sort}
                    onChange={(e) => {
                      const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                      setSort(e.target.value);
                      if (opt) setOrder(opt.order);
                    }}
                    aria-label="Sort by"
                  >
                    {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
                  </select>
                  <button type="button" onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
                    className="h-8 px-2 border-l border-border text-muted-foreground hover:bg-secondary"
                    title={order === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
                    aria-label="Sort direction">
                    {order === "asc" ? <ArrowUpNarrowWide className="w-3.5 h-3.5" /> : <ArrowDownWideNarrow className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label="View">
                  <button type="button" onClick={() => setView("cards")} aria-pressed={view === "cards"} title="Cards"
                    className={cn("h-8 px-2.5", view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary")}>
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} title="Table"
                    className={cn("h-8 px-2.5 border-l border-border", view === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary")}>
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3">
              <BookSummary role={tab} stage={stage} onStage={setStage} onOpen={setOpenId} />
            </div>
            <TabsContent value="buyer" className="mt-3">
              <RolePanel role="buyer" q={q} market={market} hs={hs} country={country} check={check} live={scanning}
                         stage={stage} contactable={contactable} sort={sort} order={order} view={view} onOpen={setOpenId} />
            </TabsContent>
            <TabsContent value="supplier" className="mt-3">
              <RolePanel role="supplier" q={q} market={market} hs={hs} country={country} check={check} live={scanning}
                         stage={stage} contactable={contactable} sort={sort} order={order} view={view} onOpen={setOpenId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <CompanyProfileSheet role={tab} id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
