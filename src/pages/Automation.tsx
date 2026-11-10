import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Play, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AutomationApi } from "@/api/endpoints";
import type { AutomationCaseRow, AutomationStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_LABEL: Record<string, string> = {
  passed: "Passed",
  failed: "Failed",
  not_automated: "Not automated",
  needs_browser: "Needs browser",
  not_run: "Not run",
};
const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "info" | "outline"> = {
  passed: "success",
  failed: "destructive",
  not_automated: "warning",
  needs_browser: "info",
  not_run: "outline",
};

function errorText(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

function isRunning(status?: AutomationStatus) {
  return status?.run?.status === "RUNNING" || status?.run?.status === "STARTING";
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="p-3 rounded-lg bg-secondary border border-border">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-0.5" style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function CaseDetail({ tcId, runId }: { tcId: string; runId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["automation-case", tcId, runId],
    queryFn: () => AutomationApi.caseDetail(tcId, runId),
  });
  if (isLoading || !data) return <Skeleton className="h-16 w-full" />;
  return (
    <div className="space-y-3 text-xs">
      {data.definition.steps.length > 0 && (
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{data.definition.steps.join("\n")}</pre>
      )}
      {data.results.length === 0 && <p className="text-muted-foreground">Not run yet.</p>}
      {data.results.map((r, i) => (
        <div key={i} className="p-2.5 rounded-md border border-border space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
            {Object.keys(r.row ?? {}).length > 0 && (
              <span className="font-mono text-[11px] text-muted-foreground break-all">{JSON.stringify(r.row)}</span>
            )}
            {r.deal_id && <span className="font-mono text-[11px]">{r.deal_id}</span>}
            <span className="text-muted-foreground">{Math.round((r.duration_ms ?? 0) / 100) / 10}s</span>
          </div>
          {r.error && <pre className="whitespace-pre-wrap text-[11px] text-[#ff5d6c]">{r.error}</pre>}
          {r.steps?.length > 0 && (
            <ul className="space-y-0.5">
              {r.steps.map((s, j) => (
                <li key={j} className={s.ok ? "text-muted-foreground" : "text-[#ff5d6c]"}>
                  {s.ok ? "✓" : "✗"} {s.text}
                  {s.detail ? ` (${s.detail})` : ""}
                </li>
              ))}
            </ul>
          )}
          {r.emails?.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">{r.emails.length} e-mail(s) composed, none delivered</summary>
              <div className="mt-2 space-y-2">
                {r.emails.map((m, j) => (
                  <div key={j} className="p-2 rounded bg-secondary">
                    <div className="font-mono text-[11px]">To: {m.to}</div>
                    <div className="font-medium">{m.subject}</div>
                    <pre className="whitespace-pre-wrap font-sans mt-1">{m.body}</pre>
                  </div>
                ))}
              </div>
            </details>
          )}
          {r.transcript && (
            <details>
              <summary className="cursor-pointer font-medium">LLM conversation</summary>
              <pre className="whitespace-pre-wrap font-sans mt-2">{r.transcript}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function CaseRow({ row, runId }: { row: AutomationCaseRow; runId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-start gap-2 p-2.5 text-left hover:bg-secondary/60">
        {open ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
        <span className="font-mono text-[11px] w-24 shrink-0 pt-0.5">{row.tc_id}</span>
        <span className="flex-1 min-w-0 text-xs">
          {row.title}
          {row.error && row.status !== "passed" && <span className="block text-[11px] text-muted-foreground truncate">{row.error}</span>}
        </span>
        <span className="hidden md:block text-[11px] text-muted-foreground w-28 shrink-0 truncate">{row.phase}</span>
        <span className="hidden sm:block text-[11px] text-muted-foreground w-14 shrink-0">{row.kind}</span>
        <span className="text-[11px] text-muted-foreground w-12 shrink-0 text-right">
          {row.passed}/{row.iterations}
        </span>
        <Badge className="shrink-0" variant={STATUS_VARIANT[row.status] ?? "outline"}>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      </button>
      {open && (
        <div className="px-3 pb-3 pl-8">
          <CaseDetail tcId={row.tc_id} runId={runId} />
        </div>
      )}
    </div>
  );
}

export function Automation() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"test_data" | "everything" | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [phase, setPhase] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");

  const status = useQuery({
    queryKey: ["automation-status"],
    queryFn: AutomationApi.status,
    refetchInterval: (q) => (isRunning(q.state.data) ? 3000 : 15000),
  });
  const running = isRunning(status.data);
  const cases = useQuery({
    queryKey: ["automation-cases"],
    queryFn: () => AutomationApi.cases(),
    refetchInterval: running ? 5000 : false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["automation-status"] });
    qc.invalidateQueries({ queryKey: ["automation-cases"] });
    qc.invalidateQueries({ queryKey: ["automation-case"] });
  };
  const start = useMutation({
    mutationFn: AutomationApi.start,
    onSuccess: () => {
      toast.success("Test run started on the automation database");
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "The run could not start")),
  });
  const stop = useMutation({
    mutationFn: AutomationApi.stop,
    onSuccess: () => {
      toast.success("Run stopped");
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "The run could not be stopped")),
  });
  const clear = useMutation({
    mutationFn: AutomationApi.clear,
    onSuccess: (r) => {
      toast.success(`Cleared ${r.deleted} record(s) from ${r.database}`);
      setConfirm(null);
      refresh();
    },
    onError: (e) => toast.error(errorText(e, "The data could not be cleared")),
  });

  const rows = useMemo(() => cases.data?.cases ?? [], [cases.data]);
  const phases = useMemo(() => [...new Set(rows.map((r) => r.phase))].sort(), [rows]);
  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const visible = rows.filter(
    (r) =>
      (statusFilter === "all" || r.status === statusFilter) &&
      (phase === "all" || r.phase === phase) &&
      (kind === "all" || r.kind === kind) &&
      (!search.trim() || `${r.tc_id} ${r.title}`.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const run = status.data?.run;
  const totals = run?.totals ?? {};
  const planned = run?.planned ?? 0;
  const done = run?.done ?? 0;
  const select = "h-8 rounded-md border border-border bg-background px-2 text-xs";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Automation</h1>
        <p className="text-xs text-muted-foreground">
          Runs and every page in this mode use the <span className="font-mono">{status.data?.database ?? "portless_automation"}</span> database.
          Buyers and suppliers are real companies from a live Apify scan; their mailboxes are replaced with .invalid addresses, the LLM gateway
          drafts the e-mails, and no e-mail is delivered. Banks, inspectors and carriers are stubbed.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle>{run ? `Latest run: ${run.run_id}` : "No run yet"}</CardTitle>
            {run && <Badge variant={run.status === "FINISHED" ? "success" : running ? "info" : "warning"}>{run.status}</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {status.isError && <p className="text-sm text-[#ff5d6c]">{errorText(status.error, "The automation service is unavailable.")}</p>}
          {running && planned > 0 && (
            <div className="space-y-1">
              <Progress value={(done / planned) * 100} />
              <p className="text-[11px] text-muted-foreground">
                {done} of {planned} iterations
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <Tile label="Passed" value={totals.passed ?? 0} tone="#2ec28a" />
            <Tile label="Failed" value={totals.failed ?? 0} tone="#ff5d6c" />
            <Tile label="Not automated" value={totals.not_automated ?? 0} tone="#f5a623" />
            <Tile label="Needs browser" value={totals.needs_browser ?? 0} tone="#4f8cff" />
            <Tile label="Test records stored" value={status.data?.test_data_total ?? 0} />
            <Tile label="Live buyers / suppliers" value={`${status.data?.live_counterparties?.buyer ?? 0} / ${status.data?.live_counterparties?.supplier ?? 0}`} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="h-8 text-xs gap-1.5" disabled={running || start.isPending} onClick={() => start.mutate({ scope: "all" })}>
              <Play className="w-3.5 h-3.5" /> Run everything
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={running || start.isPending} onClick={() => start.mutate({ scope: "catalogue" })}>
              Test cases only
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={running || start.isPending} onClick={() => start.mutate({ scope: "journeys" })}>
              LLM journeys only
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={running || start.isPending || phase === "all" || phase === "llm-journeys"} onClick={() => start.mutate({ scope: "catalogue", phase })}>
              Run selected phase
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={running || start.isPending} onClick={() => start.mutate({ scope: "live" })} title="Starts paid Apify runs">
              Refresh live buyers &amp; suppliers
            </Button>
            {running && (
              <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" disabled={stop.isPending} onClick={() => stop.mutate()}>
                <Square className="w-3.5 h-3.5" /> Stop
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" disabled={running} onClick={() => setConfirm("test_data")}>
              <Trash2 className="w-3.5 h-3.5" /> Clear test data
            </Button>
            <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" disabled={running} onClick={() => setConfirm("everything")}>
              <Trash2 className="w-3.5 h-3.5" /> Clear everything
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Test cases ({visible.length} of {rows.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input aria-label="Search test cases" placeholder="Search id or title" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs w-52" />
            <select aria-label="Status" className={select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select aria-label="Phase" className={select} value={phase} onChange={(e) => setPhase(e.target.value)}>
              <option value="all">All phases</option>
              {phases.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select aria-label="Type" className={select} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All types</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          {cases.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="rounded-lg border border-border">
              {visible.map((row) => (
                <CaseRow key={row.tc_id} row={row} runId={cases.data?.run_id ?? null} />
              ))}
              {visible.length === 0 && <p className="p-4 text-sm text-muted-foreground">No test cases match these filters.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "everything" ? "Clear everything?" : "Clear test data?"}</DialogTitle>
            <DialogDescription>
              {confirm === "everything"
                ? "Deletes the deals, e-mails, approvals, run results and the live buyers and suppliers from portless_automation. The next full run pays for a new scan."
                : "Deletes the deals, e-mails and approvals the runs created in portless_automation. Run results and the live buyers and suppliers stay."}{" "}
              The live portless database is not touched. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={clear.isPending} onClick={() => confirm && clear.mutate(confirm)}>
              Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
