import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Activity, ArrowDownRight, ArrowUpRight, Archive, Download, Fingerprint, Landmark, Receipt, ShieldCheck,
} from "lucide-react";
import { cn, fmtDateTime, fmtUSD } from "@/lib/utils";
import { errorMessage } from "@/api/client";
import {
  ageText, BackOfficeApi, type FeeKind, type FxKind, type LedgerFormat, useAuditLog, useCleanupPreview,
  useCleanupRun, useFees, useFeesOver, useFx, usePriceAlerts, useRecordFee, useRecordFx, useRunCosts, useWatchers,
} from "@/api/backoffice";
import { askReason } from "@/components/ReasonDialog";
import { downloadBlob } from "@/components/deal/JournalCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LEDGER_FORMATS: { format: LedgerFormat; label: string }[] = [
  { format: "csv", label: "CSV" }, { format: "tally", label: "Tally" }, { format: "zoho", label: "Zoho Books" },
];

/** Journal downloads in the accountant's layouts — one deal, or every deal. */
export function LedgerDownloads({ dealId }: { dealId?: string }) {
  const [busy, setBusy] = useState<LedgerFormat | null>(null);
  async function get(format: LedgerFormat) {
    setBusy(format);
    try {
      const file = dealId ? await BackOfficeApi.journalFile(dealId, format) : await BackOfficeApi.allJournalsFile(format);
      downloadBlob(file, `journal-${dealId ?? "all"}-${format}.csv`);
    } catch (e) {
      toast.error("Could not download the journal", { description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap" data-testid="ledger-downloads">
      <span className="text-[11px] text-muted-foreground">{dealId ? "Journal for the books:" : "All journals:"}</span>
      {LEDGER_FORMATS.map(({ format, label }) => (
        <Button key={format} variant="outline" size="sm" className="h-7 text-[11px] gap-1" disabled={busy !== null}
          onClick={() => get(format)}>
          <Download className="w-3 h-3" /> {busy === format ? "…" : label}
        </Button>
      ))}
    </div>
  );
}

/** Hash-chained audit log: approvals by a person, Kill Switch, clearances, merges … */
export function AuditLogCard() {
  const { data, isLoading } = useAuditLog();
  const [verdict, setVerdict] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  async function verify() {
    setChecking(true);
    try {
      const v = await BackOfficeApi.auditVerify();
      setVerdict(v.ok ? `Chain intact — ${v.entries} entries` : `BROKEN at entry ${v.broken_at}: ${v.why}`);
      (v.ok ? toast.success : toast.error)(v.ok ? "Audit log intact" : "Audit log has a changed or missing entry");
    } catch (e) {
      toast.error("Could not verify", { description: errorMessage(e) });
    } finally {
      setChecking(false);
    }
  }
  const rows = data ?? [];
  return (
    <Card data-testid="audit-log">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-[#28c2a0]" />
            <CardTitle>Audit log</CardTitle>
            <span className="text-[11px] text-muted-foreground">decisions that move money or override a control</span>
          </div>
          <div className="flex items-center gap-2">
            {verdict && <span className={cn("text-[11px]", verdict.startsWith("BROKEN") ? "text-[#ff5d6c]" : "text-[#2ec28a]")}>{verdict}</span>}
            <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={verify} disabled={checking}>
              <ShieldCheck className="w-3.5 h-3.5" /> {checking ? "Checking…" : "Verify chain"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground text-left">
                <tr><th className="py-1 pr-2">#</th><th className="pr-2">When</th><th className="pr-2">Action</th><th className="pr-2">Who</th><th>Subject</th></tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.seq} className="border-t border-border/50 align-top">
                    <td className="py-1 pr-2 tabular-nums text-muted-foreground">{e.seq}</td>
                    <td className="pr-2 whitespace-nowrap">{fmtDateTime(e.at)}</td>
                    <td className="pr-2 font-medium">{e.action}</td>
                    <td className="pr-2">{e.actor}</td>
                    <td className="break-all">{e.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Background watchers: last beat, stale after 3 × interval. */
export function WatchersCard() {
  const { data, isLoading } = useWatchers();
  const rows = data?.watchers ?? [];
  return (
    <Card className={cn(data && !data.ok && "border-[#ff5d6c]/40")} data-testid="watchers">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Background watchers</CardTitle>
          {data && <Badge variant={data.ok ? "success" : "destructive"} className="text-[10px]">
            {data.ok ? "all running" : `${data.stale.length} not running`}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No watcher has reported yet (they beat after their first tick).</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {rows.map((w) => (
              <div key={w.name} className={cn("flex items-center justify-between rounded-md border px-2 py-1.5 text-xs",
                w.stale ? "border-[#ff5d6c]/40 bg-[#ff5d6c]/5" : "border-border")}>
                <span className="font-medium">{w.name.replace(/_/g, " ")}</span>
                <span className={cn("tabular-nums", w.stale ? "text-[#ff5d6c]" : "text-muted-foreground")}>
                  {w.stale ? "stale · " : ""}{ageText(w.last_beat_at ? w.age_seconds : null)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const FEE_LABEL: Record<FeeKind, string> = { escrow: "Escrow provider", payout: "Supplier payout", bank: "Bank charges" };

/** Actual fees from the statements vs what the price assumed (deal page). */
export function FeesCard({ dealId }: { dealId: string }) {
  const { data } = useFees(dealId);
  const record = useRecordFee(dealId);
  const [kind, setKind] = useState<FeeKind>("bank");
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  async function save() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    try {
      await record.mutateAsync({ kind, amount_usd: n, ref: ref.trim() || undefined });
      setAmount(""); setRef("");
      toast.success("Fee recorded — ledger, journal and margin updated");
    } catch (e) {
      toast.error("Not saved", { description: errorMessage(e) });
    }
  }
  return (
    <Card className={cn(data?.over && "border-[#f5a623]/40")} data-testid="fees-card">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Receipt className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Actual fees</CardTitle>
          {data?.over && <Badge variant="destructive" className="text-[10px]">{fmtUSD(data.over_usd)} above the price</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data && (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground text-left">
              <tr><th className="py-1">Fee</th><th>Priced in</th><th>Actual</th><th>Amount</th><th>Source</th></tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.kind} className={cn("border-t border-border/50", l.over && "text-[#f5a623]")}>
                  <td className="py-1">{FEE_LABEL[l.kind]}</td>
                  <td className="tabular-nums">{l.assumed_pct.toFixed(2)} %</td>
                  <td className="tabular-nums">{l.actual_pct == null ? "—" : `${l.actual_pct.toFixed(2)} %`}</td>
                  <td className="tabular-nums">{l.actual_usd ? fmtUSD(l.actual_usd) : "—"}</td>
                  <td className="text-muted-foreground">{l.source ?? "not recorded"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-end gap-2 flex-wrap">
          <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={kind}
            onChange={(e) => setKind(e.target.value as FeeKind)} aria-label="Fee kind">
            {(Object.keys(FEE_LABEL) as FeeKind[]).map((k) => <option key={k} value={k}>{FEE_LABEL[k]}</option>)}
          </select>
          <Input className="h-8 w-28 text-xs" inputMode="decimal" placeholder="USD" value={amount}
            onChange={(e) => setAmount(e.target.value)} aria-label="Amount in USD" />
          <Input className="h-8 w-48 text-xs" placeholder="Statement reference" value={ref}
            onChange={(e) => setRef(e.target.value)} aria-label="Statement reference" />
          <Button size="sm" className="h-8 text-xs" onClick={save} disabled={record.isPending || !(Number(amount) > 0)}>
            Record fee
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const FX_LABEL: Record<FxKind, string> = { po: "PO rate", payout: "Payout bank rate", receipt: "Receipt bank rate" };

/** Exchange rates actually used and the gain / loss on supplier payouts (deal page). */
export function FxCard({ dealId }: { dealId: string }) {
  const { data } = useFx(dealId);
  const record = useRecordFx(dealId);
  const [kind, setKind] = useState<FxKind>("po");
  const [rate, setRate] = useState("");
  const [ref, setRef] = useState("");
  async function save() {
    const n = Number(rate);
    if (!(n > 0)) return;
    try {
      await record.mutateAsync({ kind, rate_inr_per_usd: n, ref: kind === "po" ? undefined : ref.trim() || undefined });
      setRate(""); setRef("");
      toast.success("Rate recorded");
    } catch (e) {
      toast.error("Not saved", { description: errorMessage(e) });
    }
  }
  const gl = data?.gain_loss_usd ?? 0;
  return (
    <Card data-testid="fx-card">
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Landmark className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Exchange rates (INR per USD)</CardTitle>
          {gl !== 0 && <Badge variant={gl > 0 ? "success" : "destructive"} className="text-[10px]">
            FX {gl > 0 ? "gain" : "loss"} {fmtUSD(Math.abs(gl))}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {data && (
          <>
            <div>PO rate: <span className="tabular-nums font-medium">{data.po_rate ?? "not recorded"}</span></div>
            {data.payouts.map((p) => (
              <div key={p.payout_id} className="flex gap-3 tabular-nums">
                <span className="text-muted-foreground">{p.payout_id}</span>
                <span>{fmtUSD(p.amount_usd)}</span>
                <span>{p.rate ? `at ${p.rate} = INR ${p.inr?.toLocaleString()}` : "rate not recorded"}</span>
                {p.gain_loss_usd !== 0 && <span className={p.gain_loss_usd > 0 ? "text-[#2ec28a]" : "text-[#ff5d6c]"}>
                  {p.gain_loss_usd > 0 ? "+" : ""}{fmtUSD(p.gain_loss_usd)}</span>}
              </div>
            ))}
            {data.missing.length > 0 && <p className="text-muted-foreground">Still needed: {data.missing.join("; ")}</p>}
          </>
        )}
        <div className="flex items-end gap-2 flex-wrap pt-1">
          <select className="h-8 rounded-md border border-border bg-background px-2 text-xs" value={kind}
            onChange={(e) => setKind(e.target.value as FxKind)} aria-label="Rate kind">
            {(Object.keys(FX_LABEL) as FxKind[]).map((k) => <option key={k} value={k}>{FX_LABEL[k]}</option>)}
          </select>
          <Input className="h-8 w-24 text-xs" inputMode="decimal" placeholder="84.25" value={rate}
            onChange={(e) => setRate(e.target.value)} aria-label="Rate in INR per USD" />
          {kind !== "po" && <Input className="h-8 w-40 text-xs" placeholder={kind === "payout" ? "Payout id" : "Tranche id"}
            value={ref} onChange={(e) => setRef(e.target.value)} aria-label="Reference" />}
          <Button size="sm" className="h-8 text-xs" onClick={save}
            disabled={record.isPending || !(Number(rate) > 0) || (kind !== "po" && !ref.trim())}>Record rate</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Every deal whose fees run above what was priced in (Money & Margin). */
export function FeesOverCard() {
  const { data } = useFeesOver();
  const rows = data ?? [];
  return (
    <Card className={cn(rows.length > 0 && "border-[#f5a623]/40")} data-testid="fees-over">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#f5a623]" />
            <CardTitle>Fees above the price</CardTitle>
          </div>
          <LedgerDownloads />
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-xs text-muted-foreground">No deal pays more fees than its price assumed.</p> : (
          <ul className="text-xs space-y-1">
            {rows.map((r) => (
              <li key={r.deal_id} className="flex justify-between">
                <Link className="text-primary hover:underline" to={`/deals/${r.deal_id}`}>{r.deal_id}</Link>
                <span>{r.kinds.map((k) => FEE_LABEL[k]).join(", ")}</span>
                <span className="tabular-nums text-[#f5a623]">{fmtUSD(r.over_usd)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Supplier price dips (buy now) and spikes (hold offers) from the price book (Radar). */
export function PriceAlertsCard() {
  const { data } = usePriceAlerts();
  const rows = data ?? [];
  if (rows.length === 0) return null;
  return (
    <Card data-testid="price-alerts">
      <CardContent className="p-3 space-y-1.5">
        <div className="text-sm font-medium">Supplier price moves</div>
        {rows.map((a) => (
          <div key={a.hs_code} className="flex items-center gap-2 text-xs">
            {a.kind === "dip" ? <ArrowDownRight className="w-3.5 h-3.5 text-[#2ec28a]" />
              : <ArrowUpRight className="w-3.5 h-3.5 text-[#ff5d6c]" />}
            <span className="font-medium">HS {a.hs_code}</span>
            <span className={cn("tabular-nums", a.kind === "dip" ? "text-[#2ec28a]" : "text-[#ff5d6c]")}>
              {a.change_pct > 0 ? "+" : ""}{a.change_pct} %</span>
            <span className="text-muted-foreground tabular-nums">
              {fmtUSD(a.base_median_usd_per_mt)} → {fmtUSD(a.recent_median_usd_per_mt)} /MT</span>
            <span className="text-muted-foreground hidden md:inline">— {a.advice}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Prospects the clean-up would close (idle, not parked) and a button to close them (Prospects). */
export function CleanupCard() {
  const { data } = useCleanupPreview();
  const run = useCleanupRun();
  const rows = data ?? [];
  if (rows.length === 0) return null;
  async function closeAll() {
    const ok = await askReason({
      title: `Close ${rows.length} idle prospect${rows.length === 1 ? "" : "s"}`,
      consequence: "Each closes as CANCELLED with the reason \"no activity\"; its open gates are withdrawn. "
        + "Records, offers and correspondence are kept. Park a prospect first to keep it open.",
      reasonLabel: false, confirm: "Close them", tone: "destructive",
    });
    if (!ok) return;
    try {
      const out = await run.mutateAsync();
      toast.success(`${out.closed.length} closed${out.failed.length ? `, ${out.failed.length} not` : ""}`);
    } catch (e) {
      toast.error("Clean-up failed", { description: errorMessage(e) });
    }
  }
  return (
    <Card data-testid="prospect-cleanup">
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Archive className="w-4 h-4 text-muted-foreground" /> Idle prospects ({rows.length})
          </div>
          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={closeAll} disabled={run.isPending}>
            Close idle prospects
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {rows.slice(0, 12).map((r) => (
            <Link key={r.deal_id} to={`/deals/${r.deal_id}`} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground">
              {r.deal_id} · HS {r.hs_code}{r.market ? ` → ${r.market}` : ""} · {r.idle_days} d idle
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


/** What each deal cost to run: LLM, Apify and operator decisions (Money & Margin). */
export function RunCostsCard() {
  const { data } = useRunCosts();
  const rows = (data ?? []).slice(0, 15);
  if (rows.length === 0) return null;
  return (
    <Card data-testid="run-costs">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Cost to run each deal</CardTitle>
          <span className="text-[11px] text-muted-foreground">LLM and Apify spend, operator decisions and how long gates waited</span>
        </div>
      </CardHeader>
      <CardContent>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground text-left">
            <tr><th className="py-1">Deal</th><th>LLM calls</th><th>Apify runs</th><th>Tools USD</th><th>Decisions</th><th>Gate wait (h)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.deal_id} className="border-t border-border/50">
                <td className="py-1"><Link className="text-primary hover:underline" to={`/deals/${r.deal_id}`}>{r.deal_id}</Link></td>
                <td className="tabular-nums">{r.llm_calls}</td>
                <td className="tabular-nums">{r.apify_runs}</td>
                <td className="tabular-nums">{fmtUSD(r.tool_usd)}</td>
                <td className="tabular-nums">{r.decisions}</td>
                <td className="tabular-nums">{r.decision_wait_hours.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
