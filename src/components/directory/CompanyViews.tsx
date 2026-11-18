import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight, Ban, CheckCircle2, Clock, ExternalLink, Flame, Globe, Mail, MessageSquare, Phone, Plus, Search,
  ShieldCheck, Sparkles, Star, TrendingUp,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import {
  useAddToProspect, useCompanyNotes, useContactPreference, useCounterpartyProfile, useDirectorySummary, useValidateCounterparty,
} from "@/api/hooks";
import type { Counterparty, CounterpartyEvent, DirectoryRoleSummary } from "@/api/types";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { HsCode } from "@/components/HsCode";
import { ValidationBadge } from "@/components/ValidationBadge";
import { SupplierFormDialog } from "@/components/directory/ManualSupplierDialogs";
import { CounterpartiesApi } from "@/api/endpoints";
import { FlagChips } from "@/pages/OpportunityRadar";

type Role = "buyer" | "supplier";

export const STAGE_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  traded: { label: "traded", cls: "bg-[#2ec28a]/15 text-[#2ec28a] border-[#2ec28a]/30", dot: "bg-[#2ec28a]" },
  in_deal: { label: "in a deal", cls: "bg-[#28c2a0]/15 text-[#28c2a0] border-[#28c2a0]/30", dot: "bg-[#28c2a0]" },
  quoted: { label: "quoted", cls: "bg-[#4f8cff]/15 text-[#4f8cff] border-[#4f8cff]/30", dot: "bg-[#4f8cff]" },
  interested: { label: "said yes", cls: "bg-[#4f8cff]/15 text-[#4f8cff] border-[#4f8cff]/30", dot: "bg-[#4f8cff]" },
  replied: { label: "replied", cls: "bg-[#a78bfa]/15 text-[#a78bfa] border-[#a78bfa]/30", dot: "bg-[#a78bfa]" },
  contacted: { label: "contacted", cls: "bg-secondary text-foreground border-border", dot: "bg-muted-foreground" },
  new: { label: "never contacted", cls: "bg-secondary text-muted-foreground border-border", dot: "bg-muted-foreground/40" },
  declined: { label: "declined", cls: "bg-[#f5a623]/10 text-[#f5a623] border-[#f5a623]/25", dot: "bg-[#f5a623]" },
  do_not_contact: { label: "do not contact", cls: "bg-[#ff5d6c]/10 text-[#ff5d6c] border-[#ff5d6c]/25", dot: "bg-[#ff5d6c]" },
};

/** Funnel order, first contact to trade. */
export const FUNNEL = ["new", "contacted", "replied", "interested", "quoted", "in_deal", "traded"] as const;

function usd0(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/** ISO-2 → flag emoji (regional indicators); empty for unknown. */
export function flag(cc: string | null | undefined): string {
  const c = (cc ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z0-9& ]/g, " ").split(/\s+/).filter((w) => w && w !== "&");
  return (words[0]?.[0] ?? "?").toUpperCase() + (words[1]?.[0] ?? "").toUpperCase();
}

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function StageChip({ stage }: { stage?: string | null }) {
  const st = STAGE_STYLE[stage ?? "new"] ?? STAGE_STYLE.new;
  return <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded-full border font-medium whitespace-nowrap", st.cls)}>{st.label}</span>;
}

/** A small ring showing the 0–100 score. */
export function ScoreRing({ score, size = 44 }: { score?: number | null; size?: number }) {
  const v = Math.max(0, Math.min(100, score ?? 0));
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const color = v >= 60 ? "#2ec28a" : v >= 35 ? "#4f8cff" : v > 0 ? "#f5a623" : "#6b7280";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title="Score: who to work with first">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={4} className="text-border" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums" style={{ color }}>
        {score == null ? "—" : Math.round(v)}
      </span>
    </div>
  );
}

/** The key fact to act on: a buyer's target / requirement, a supplier's quote vs the others. */
function KeyFact({ c }: { c: Counterparty }) {
  const rel = c.relationship;
  if (c.role === "buyer") {
    if (rel?.target_price_usd_per_mt || rel?.requirement) {
      return (
        <p className="text-[11px]">
          <span className="text-muted-foreground">Wants </span>
          {rel?.requirement ?? ""}
          {rel?.target_price_usd_per_mt != null && <b className="ml-1">{usd0(rel.target_price_usd_per_mt)}/MT</b>}
        </p>
      );
    }
    return <p className="text-[11px] text-muted-foreground">Requirement not known yet</p>;
  }
  const quote = rel?.last_quote_usd_per_mt ?? c.estimated_fob_price_usd;
  if (quote == null) return <p className="text-[11px] text-muted-foreground">No price yet</p>;
  const vs = rel?.quote_vs_median_pct;
  return (
    <p className="text-[11px]">
      <b>{usd0(quote)}</b> <span className="text-muted-foreground">FOB/MT</span>
      {vs != null && (
        <span className={cn("ml-1.5", vs < 0 ? "text-[#2ec28a]" : "text-[#f5a623]")}>
          {vs < 0 ? `${Math.abs(vs).toFixed(0)}% below` : `${vs.toFixed(0)}% above`} median
        </span>
      )}
    </p>
  );
}

function activityLine(c: Counterparty): string {
  const rel = c.relationship;
  const bits: string[] = [];
  if (rel?.prospects) bits.push(`${rel.prospects} prospect${rel.prospects === 1 ? "" : "s"}`);
  if (rel?.deals_won) bits.push(`${rel.deals_won} won`);
  if (rel?.last_reply_at) bits.push(`replied ${timeAgo(rel.last_reply_at)}`);
  else if (rel?.last_contact_at) bits.push(`contacted ${timeAgo(rel.last_contact_at)}`);
  else if (rel?.last_quote_at) bits.push(`quoted ${timeAgo(rel.last_quote_at)}`);
  if (!bits.length) bits.push(`found ${timeAgo(c.first_seen_at)}`);
  return bits.join(" · ");
}

/** One company as a card: who, where it stands, the key fact, the next move. */
export function CompanyCard({ role, c, onOpen }: { role: Role; c: Counterparty; onOpen: () => void }) {
  const validate = useValidateCounterparty();
  const isNew = Date.now() - new Date(c.first_seen_at).getTime() < 7 * 86400000;
  const hot = Boolean(c.relationship?.last_reply_at || c.relationship?.last_quote_at)
    && Date.now() - new Date(c.relationship?.last_reply_at ?? c.relationship?.last_quote_at ?? 0).getTime() < 14 * 86400000;
  return (
    <div
      className={cn(
        "group rounded-xl border bg-popover p-3.5 flex flex-col gap-2.5 transition-all hover:border-primary/50 hover:shadow-md cursor-pointer",
        c.do_not_contact ? "border-[#ff5d6c]/30 opacity-75" : "border-border",
      )}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#4f8cff]/25 to-[#28c2a0]/25 flex items-center justify-center text-sm font-bold shrink-0">
          {initials(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate" title={c.name}>{c.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {flag(c.country)} {c.country ?? "—"}
            {c.website && <> · {hostOf(c.website)}</>}
          </p>
        </div>
        <ScoreRing score={c.score} />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StageChip stage={c.relationship?.stage} />
        <ValidationBadge v={c.validation} />
        {isNew && <Badge variant="info" className="text-[9px] h-4 px-1.5 gap-0.5"><Sparkles className="w-2.5 h-2.5" />new</Badge>}
        {hot && <Badge variant="warning" className="text-[9px] h-4 px-1.5 gap-0.5"><Flame className="w-2.5 h-2.5" />hot</Badge>}
        {c.do_not_contact && <Badge variant="destructive" className="text-[9px] h-4 px-1.5 gap-0.5"><Ban className="w-2.5 h-2.5" />do not contact</Badge>}
      </div>

      <KeyFact c={c} />

      <div className="flex flex-wrap gap-1">
        {c.hs_codes.slice(0, 3).map((hs) => (
          <span key={hs} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border">
            <HsCode code={hs} className="font-mono" />
          </span>
        ))}
        {c.hs_codes.length > 3 && <span className="text-[10px] text-muted-foreground">+{c.hs_codes.length - 3}</span>}
      </div>
      {(c.flags ?? []).filter((f) => f !== "name_from_domain").length > 0 && (
        <FlagChips flags={c.flags} skip={["name_from_domain"]} />
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
          <Clock className="w-3 h-3 shrink-0" />{activityLine(c)}
        </span>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {c.email && (
            <a href={`mailto:${c.email}`} className="p-1 rounded hover:bg-secondary" title={c.email}><Mail className="w-3.5 h-3.5 text-muted-foreground" /></a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="p-1 rounded hover:bg-secondary" title={c.phone}><Phone className="w-3.5 h-3.5 text-muted-foreground" /></a>
          )}
          {(c.validation == null || c.validation.status === "unverified") && !c.do_not_contact && (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" disabled={validate.isPending}
              title="Sanctions, e-mail and GST / IEC check now (paid Apify runs)"
              onClick={async () => {
                try {
                  const out = await validate.mutateAsync({ role, id: c.id });
                  toast.info(`${c.name}: ${out.validation?.status ?? "unverified"}`);
                } catch {
                  toast.error(`Could not check ${c.name}`);
                }
              }}>
              <ShieldCheck className="w-3 h-3 mr-0.5" />{validate.isPending ? "…" : "Check"}
            </Button>
          )}
          <Button size="sm" className="h-6 px-2 text-[10px] gap-0.5" onClick={onOpen}>
            Open <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The book at a glance: the funnel from first contact to trade, new this week, hot companies. */
export function BookSummary({ role, onStage, stage, onOpen }: {
  role: Role; stage: string; onStage: (s: string) => void; onOpen: (id: string) => void;
}) {
  const { data } = useDirectorySummary();
  const s: DirectoryRoleSummary | undefined = data?.[role];
  if (!s) return <Skeleton className="h-28 w-full rounded-xl" />;
  const max = Math.max(1, ...FUNNEL.map((k) => s.stages[k] ?? 0));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr_1fr] gap-3">
      <div className="rounded-xl border border-border bg-popover p-3.5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-[#4f8cff]" /> Pipeline</p>
          <p className="text-[10px] text-muted-foreground">
            {s.total} {role}s · {s.verified} verified · {s.contactable} contactable{s.do_not_contact ? ` · ${s.do_not_contact} do not contact` : ""}
          </p>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {FUNNEL.map((k) => {
            const n = s.stages[k] ?? 0;
            const active = stage === k;
            return (
              <button key={k} type="button" onClick={() => onStage(active ? "" : k)}
                className={cn("flex flex-col items-stretch gap-1 rounded-lg p-1.5 border transition-colors text-left",
                  active ? "border-primary/50 bg-primary/10" : "border-transparent hover:bg-secondary")}
                title={`Show ${STAGE_STYLE[k].label}`}>
                <div className="h-10 flex items-end">
                  <div className={cn("w-full rounded-sm", STAGE_STYLE[k].dot)} style={{ height: `${Math.max(6, (n / max) * 100)}%` }} />
                </div>
                <span className="text-sm font-bold tabular-nums">{n}</span>
                <span className="text-[9px] text-muted-foreground leading-tight">{STAGE_STYLE[k].label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-popover p-3.5">
        <p className="text-xs font-semibold flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3.5 h-3.5 text-[#28c2a0]" /> New this week · {s.new_this_week}</p>
        <div className="space-y-0.5 text-[11px]">
          {s.new_by_product.slice(0, 3).map(([hs, n]) => (
            <p key={hs} className="flex justify-between"><HsCode code={hs} className="font-mono" /><span className="text-muted-foreground">{n}</span></p>
          ))}
          {s.new_by_country.length > 0 && (
            <p className="text-muted-foreground pt-0.5">{s.new_by_country.slice(0, 4).map(([cc, n]) => `${flag(cc)} ${cc} ${n}`).join(" · ")}</p>
          )}
          {s.new_this_week === 0 && <p className="text-muted-foreground">No new companies — run a search</p>}
        </div>
      </div>
      <div className="rounded-xl border border-border bg-popover p-3.5">
        <p className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
          {s.hot.length ? <><Flame className="w-3.5 h-3.5 text-[#f5a623]" /> Hot — replied or quoted</> : <><Star className="w-3.5 h-3.5 text-[#f5a623]" /> Best scored</>}
        </p>
        <div className="space-y-1">
          {(s.hot.length ? s.hot : s.top).slice(0, 4).map((h) => (
            <button key={h.id} type="button" onClick={() => onOpen(h.id)}
              className="w-full flex items-center justify-between gap-2 text-[11px] hover:text-primary text-left">
              <span className="truncate">{flag(h.country)} {h.name}</span>
              <StageChip stage={h.stage} />
            </button>
          ))}
          {!s.hot.length && !s.top.length && <p className="text-[11px] text-muted-foreground">Nothing yet</p>}
        </div>
      </div>
    </div>
  );
}

const EVENT_ICON: Record<string, typeof Clock> = {
  found: Search, contacted: Mail, followed_up: Mail, replied: MessageSquare, offer: TrendingUp,
  offer_response: TrendingUp, quoted: TrendingUp, party: CheckCircle2, traded: CheckCircle2, do_not_contact: Ban,
};

function Timeline({ events }: { events: CounterpartyEvent[] }) {
  const navigate = useNavigate();
  if (!events.length) return <p className="text-xs text-muted-foreground">Nothing has happened with this company yet.</p>;
  return (
    <ol className="relative border-l border-border ml-2 space-y-2.5">
      {events.map((e, i) => {
        const Icon = EVENT_ICON[e.kind] ?? Clock;
        return (
          <li key={`${e.at}-${i}`} className="ml-4">
            <span className="absolute -left-[9px] flex items-center justify-center w-[18px] h-[18px] rounded-full bg-popover border border-border">
              <Icon className="w-2.5 h-2.5 text-muted-foreground" />
            </span>
            <p className="text-xs">{e.text}</p>
            <p className="text-[10px] text-muted-foreground">
              {timeAgo(e.at)}
              {e.deal_id && <button type="button" className="ml-1.5 text-primary hover:underline" onClick={() => navigate(`/deals/${e.deal_id}`)}>{e.deal_id}</button>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Staff notes on the company and their follow-up dates (due ones also reach the digest). */
function NotesSection({ role, company }: { role: Role; company: Counterparty }) {
  const notes = useCompanyNotes();
  const [text, setText] = useState("");
  const [remind, setRemind] = useState("");
  const list = [...(company.notes ?? [])].reverse();
  async function save() {
    if (!text.trim()) return;
    try {
      await notes.add.mutateAsync({ role, id: company.id, text: text.trim(),
        remindAt: remind ? new Date(`${remind}T09:00:00`).toISOString() : undefined });
      setText("");
      setRemind("");
      toast.success("Note saved");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Note not saved");
    }
  }
  return (
    <section className="space-y-2" data-testid="company-notes">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notes and follow-ups</p>
      <textarea className="w-full rounded-md border border-border bg-background p-2 text-xs" rows={2}
        placeholder="A call, a meeting, what they said…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-muted-foreground">Remind me on</label>
        <input type="date" className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px]"
          value={remind} onChange={(e) => setRemind(e.target.value)} />
        <Button size="sm" className="h-7 text-xs ml-auto" onClick={save} disabled={notes.add.isPending || !text.trim()}>Add note</Button>
      </div>
      {list.length > 0 && (
        <ul className="space-y-1.5">
          {list.map((n) => {
            const due = n.remind_at && !n.done_at && new Date(n.remind_at) <= new Date();
            return (
              <li key={n.note_id} className="rounded-md border border-border p-2 text-xs">
                <p className="whitespace-pre-wrap">{n.text}</p>
                <p className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span>{n.by} · {timeAgo(n.at)}</span>
                  {n.remind_at && (
                    <span className={cn(due && "text-[#f5a623] font-medium")}>
                      {n.done_at ? "follow-up done" : `follow up ${new Date(n.remind_at).toLocaleDateString()}${due ? " (due)" : ""}`}
                    </span>
                  )}
                  {n.remind_at && !n.done_at && (
                    <button className="ml-auto text-primary hover:underline"
                      onClick={() => notes.done.mutate({ role, id: company.id, noteId: n.note_id })}>Mark done</button>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The company's profile as a side panel: facts, score basis, actions, prospects, timeline. */
export function CompanyProfileSheet({ role, id, onClose }: { role: Role; id: string | null; onClose: () => void }) {
  const { data: p, isLoading } = useCounterpartyProfile(role, id);
  const add = useAddToProspect();
  const pref = useContactPreference();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dealId, setDealId] = useState("");
  const [editing, setEditing] = useState(false);
  const c = p?.company;

  async function addTo(target: string) {
    if (!c || !target) return;
    try {
      const out = await add.mutateAsync({ role, id: c.id, dealId: target });
      toast.success(`${c.name} added to ${out.deal_id}`, { description: out.next });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Could not add to the prospect");
    }
  }

  async function toggleDnc() {
    if (!c) return;
    if (!c.do_not_contact) {
      const reason = window.prompt(`Why should PortLess never write to ${c.name} again?`);
      if (!reason?.trim()) return;
      await pref.mutateAsync({ role, id: c.id, doNotContact: true, reason: reason.trim() });
      toast.success(`${c.name} is on the do-not-contact list`);
    } else if (window.confirm(`Allow PortLess to write to ${c.name} again?`)) {
      await pref.mutateAsync({ role, id: c.id, doNotContact: false });
      toast.success(`${c.name} can be contacted again`);
    }
  }

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-full max-w-xl translate-x-0 translate-y-0 rounded-none sm:rounded-none overflow-y-auto data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-top-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 content-start">
        {isLoading || !c || !p ? (
          <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3 pr-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#4f8cff]/30 to-[#28c2a0]/30 flex items-center justify-center text-base font-bold shrink-0">
                  {initials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">{c.name}</DialogTitle>
                  <DialogDescription className="text-xs">
                    {flag(c.country)} {c.country ?? "—"} · {role} · found {timeAgo(c.first_seen_at)}{c.times_seen > 1 ? ` · seen ${c.times_seen}×` : ""}
                  </DialogDescription>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    <StageChip stage={c.relationship?.stage} />
                    <ValidationBadge v={c.validation} />
                    <FlagChips flags={c.flags} />
                  </div>
                </div>
                <ScoreRing score={c.score} size={52} />
              </div>
            </DialogHeader>

            {/* Next actions */}
            <section className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Next moves</p>
              {p.next_actions.length === 0 && <p className="text-xs text-muted-foreground">Nothing to do right now.</p>}
              {p.next_actions.map((a, i) => (
                <div key={`${a.kind}-${i}`} className="flex items-center justify-between gap-2">
                  <p className={cn("text-xs", a.kind === "blocked" ? "text-[#ff5d6c]" : "text-foreground")}>{i === 0 ? "▶ " : "· "}{a.label}</p>
                  {a.kind === "open_deal" && a.deal_id && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => navigate(`/deals/${a.deal_id}`)}>Open</Button>
                  )}
                  {a.kind === "add_to_prospect" && a.deal_id && (
                    <Button size="sm" className="h-6 text-[10px] gap-0.5" disabled={add.isPending} onClick={() => addTo(a.deal_id!)}>
                      <Plus className="w-3 h-3" />Add
                    </Button>
                  )}
                  {a.kind === "open_opportunity" && (
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => navigate("/radar")}>Radar</Button>
                  )}
                </div>
              ))}
              {p.open_prospects.length > 1 && !p.blocked_reason && (
                <div className="flex items-center gap-2 pt-1">
                  <select className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs" value={dealId}
                    onChange={(e) => setDealId(e.target.value)} aria-label="Prospect to add to">
                    <option value="">Add to another open prospect…</option>
                    {p.open_prospects.map((o) => (
                      <option key={o.deal_id} value={o.deal_id}>{o.deal_id} · {o.hs_code} → {o.market} · {o.buyers} buyers · {o.quotes} quotes</option>
                    ))}
                  </select>
                  <Button size="sm" className="h-7 text-xs" disabled={!dealId || add.isPending} onClick={() => addTo(dealId)}>Add</Button>
                </div>
              )}
            </section>

            {/* Contact + facts */}
            <section className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Contact</p>
                {c.email ? <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-primary hover:underline truncate"><Mail className="w-3 h-3" />{c.email}</a> : <p className="text-muted-foreground">no e-mail</p>}
                {c.phone && <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3 h-3" />{c.phone}</a>}
                {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-primary truncate"><Globe className="w-3 h-3" />{hostOf(c.website)}<ExternalLink className="w-2.5 h-2.5" /></a>}
                {(c.gstin || c.iec) && <p className="text-[10px] text-muted-foreground">{c.gstin && `GSTIN ${c.gstin}`} {c.iec && `IEC ${c.iec}`}</p>}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Trade facts</p>
                <KeyFact c={c} />
                {c.relationship?.reply_rate != null && c.relationship.contacted ? <p className="text-muted-foreground">Reply rate {Math.round(c.relationship.reply_rate * 100)}%</p> : null}
                <p className="text-muted-foreground">Markets: {c.markets.length ? c.markets.join(", ") : "worldwide search"}</p>
                <div className="flex flex-wrap gap-1">{c.hs_codes.map((hs) => <span key={hs} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary border border-border"><HsCode code={hs} className="font-mono" /></span>)}</div>
              </div>
            </section>

            {/* Score basis */}
            {(c.score_basis ?? []).length > 0 && (
              <section className="text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Why this score</p>
                <div className="flex flex-wrap gap-1">{(c.score_basis ?? []).map((b) => <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary border border-border">{b}</span>)}</div>
              </section>
            )}

            {/* Engagements */}
            {p.engagements.length > 0 && (
              <section className="text-xs space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Prospects and deals</p>
                {p.engagements.map((e) => (
                  <button key={`${e.deal_id}-${e.as}`} type="button" onClick={() => navigate(`/deals/${e.deal_id}`)}
                    className="w-full flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 hover:border-primary/40 text-left">
                    <span className="min-w-0">
                      <span className="font-mono text-[11px]">{e.deal_id}</span>
                      <span className="text-muted-foreground"> · <HsCode code={e.hs_code} className="font-mono" /> → {e.market}</span>
                      {e.reply && <span className="block text-[10px] text-muted-foreground truncate">“{e.reply}”</span>}
                      {e.offer && <span className="block text-[10px] text-muted-foreground">offer {e.offer}</span>}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-[10px]">{e.as === "quote" && e.price_usd_per_mt ? `${usd0(e.price_usd_per_mt)} FOB` : e.status.replace(/_/g, " ")}</span>
                      <span className="block text-[10px] text-muted-foreground">{e.prospect ? "prospect" : e.deal_status.replace(/_/g, " ").toLowerCase()}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            {(p.correspondence?.length ?? 0) > 0 && (
              <section data-testid="company-correspondence">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  E-mails ({p.correspondence!.length})
                </p>
                <ul className="space-y-1">
                  {p.correspondence!.slice(0, 20).map((m) => (
                    <li key={m.email_id} className="text-xs flex items-start gap-2">
                      <span className={cn("shrink-0 text-[10px] font-medium", m.direction === "inbound" ? "text-[#2ec28a]" : "text-[#4f8cff]")}>
                        {m.direction === "inbound" ? "IN" : "OUT"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate" title={m.subject}>{m.subject}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.address} · {m.deal_id}{m.at ? ` · ${timeAgo(m.at)}` : ""}{m.status && m.status !== "sent" && m.status !== "received" ? ` · ${m.status}` : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {user?.is_portless && role === "supplier" && (
              <section className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Supply first: find a buyer for this supplier's lot</span>
                <Button size="sm" className="h-7 text-[11px] ml-auto" onClick={async () => {
                  const market = window.prompt("Which market? (2-letter country code, e.g. AE)")?.trim().toUpperCase();
                  if (!market) return;
                  const qty = Number(window.prompt("Quantity in MT? (empty = default)") || "0");
                  try {
                    const out = await CounterpartiesApi.startProspect(c.id, market, undefined, qty || undefined);
                    toast.success(`Prospect ${out.deal_id} started`, {
                      description: `${out.buyers} buyer(s) from the directory, ${out.introductions} introduction(s) going out`,
                    });
                    navigate(`/deals/${out.deal_id}`);
                  } catch (e: unknown) {
                    const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
                    toast.error(msg ?? "Could not start the prospect");
                  }
                }}>Start a prospect</Button>
              </section>
            )}
            {user?.is_portless && role === "supplier" && c.source === "manual" && (
              <section className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Added by hand{c.manual?.added_by ? ` by ${String(c.manual.added_by)}` : ""}</span>
                <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto" onClick={() => setEditing(true)}>Edit</Button>
              </section>
            )}
            {editing && <SupplierFormDialog open existing={c} onClose={() => setEditing(false)} />}

            {user?.is_portless && <NotesSection role={role} company={c} />}

            {/* Timeline */}
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Timeline</p>
              <Timeline events={p.timeline} />
            </section>

            {user?.is_portless && (
              <section className="pt-2 border-t border-border flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {c.do_not_contact ? `Do not contact — ${c.dnc_reason ?? ""}` : "PortLess may write to this company"}
                </p>
                <Button size="sm" variant={c.do_not_contact ? "outline" : "ghost"} className="h-7 text-xs gap-1" onClick={toggleDnc} disabled={pref.isPending}>
                  <Ban className="w-3 h-3" />{c.do_not_contact ? "Allow contact" : "Do not contact"}
                </Button>
              </section>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
