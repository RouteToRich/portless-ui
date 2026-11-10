import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Inbox,
  MailWarning,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn, fmtDateTime } from "@/lib/utils";
import { useDealNotifications } from "@/api/hooks";
import type { CorrespondenceEntry, EmailDelivery } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// What each delivery outcome means to an operator, and how it looks.
const DELIVERY_META: Record<
  EmailDelivery,
  { label: string; variant: "success" | "warning" | "destructive" | "outline" | "info" | "secondary"; Icon: React.ElementType }
> = {
  delivered: { label: "Delivered", variant: "success", Icon: CheckCheck },
  logged_only: { label: "Logged only", variant: "warning", Icon: MailWarning },
  pending: { label: "Awaiting approval", variant: "info", Icon: Clock },
  skipped: { label: "Skipped", variant: "outline", Icon: Ban },
  failed: { label: "Failed", variant: "destructive", Icon: X },
  blocked: { label: "Blocked", variant: "destructive", Icon: ShieldAlert },
  rejected: { label: "Rejected", variant: "secondary", Icon: X },
  received: { label: "Received", variant: "info", Icon: Inbox },
};

const DELIVERY_ORDER: EmailDelivery[] = [
  "delivered", "logged_only", "pending", "skipped", "failed", "blocked", "rejected", "received",
];

function DeliveryBadge({ delivery }: { delivery: EmailDelivery }) {
  const meta = DELIVERY_META[delivery] ?? { label: delivery, variant: "secondary" as const, Icon: Clock };
  return (
    <Badge variant={meta.variant} className="gap-1 text-[10px] whitespace-nowrap">
      <meta.Icon className="w-2.5 h-2.5" /> {meta.label}
    </Badge>
  );
}

function EntryRow({ e }: { e: CorrespondenceEntry }) {
  const [open, setOpen] = useState(false);
  const inbound = e.direction === "inbound";
  return (
    <li className="py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-left flex-1" onClick={() => setOpen(!open)} aria-expanded={open}>
          <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
            {open ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
            <span className="truncate">{e.label}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{e.subject}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
            <span className="font-mono truncate max-w-[220px]">
              {inbound ? `from ${e.from_address}` : e.to_address ? `to ${e.to_address}` : "no address on file"}
            </span>
            {e.stage && <span>· {e.stage.replace(/_/g, " ")}</span>}
          </p>
        </button>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <DeliveryBadge delivery={e.delivery} />
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtDateTime(e.at)}</span>
        </div>
      </div>
      {e.delivery_note && e.delivery !== "delivered" && e.delivery !== "received" && (
        <p
          className={cn(
            "mt-1.5 text-[11px] rounded-md border px-2 py-1",
            e.delivery === "failed" || e.delivery === "blocked"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-[rgba(245,166,35,0.4)] bg-[rgba(245,166,35,0.1)] text-[#f5a623]"
          )}
        >
          {e.delivery_note}
        </p>
      )}
      {open && (
        <pre className="mt-2 text-[11px] whitespace-pre-wrap break-words bg-muted/40 rounded-md p-2 font-sans leading-relaxed">
          {e.body || "(no body)"}
        </pre>
      )}
    </li>
  );
}

function PartyColumn({
  party,
  entries,
  summary,
}: {
  party: string;
  entries: CorrespondenceEntry[];
  summary: Partial<Record<EmailDelivery, number>>;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm capitalize flex items-center justify-between gap-2">
          {party}
          <span className="text-[11px] font-normal text-muted-foreground">{entries.length} e-mail(s)</span>
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {DELIVERY_ORDER.filter((d) => summary[d]).map((d) => (
            <span key={d} className="text-[10px] text-muted-foreground">
              <DeliveryBadge delivery={d} /> <span className="ml-0.5">{summary[d]}</span>
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Nothing sent to the {party} yet</p>
        ) : (
          <ol>{entries.map((e) => <EntryRow key={e.email_id} e={e} />)}</ol>
        )}
      </CardContent>
    </Card>
  );
}

export function NotificationsTab({ dealId }: { dealId: string }) {
  const { data, isLoading, isError, refetch } = useDealNotifications(dealId);
  const [noticesOnly, setNoticesOnly] = useState(false);

  const byParty = useMemo(() => {
    const out: Record<string, CorrespondenceEntry[]> = { buyer: [], supplier: [] };
    for (const e of data?.entries ?? []) {
      if (noticesOnly && e.kind !== "notification") continue;
      (out[e.party] ??= []).push(e);
    }
    return out;
  }, [data, noticesOnly]);

  const undelivered = useMemo(
    () => (data?.entries ?? []).filter((e) => e.delivery === "logged_only" || e.delivery === "skipped" || e.delivery === "failed").length,
    [data]
  );

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground flex items-center justify-between">
          Correspondence log unavailable
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {!data.mailbox_configured && (
        <div className="flex items-start gap-2 rounded-lg border border-[rgba(245,166,35,0.4)] bg-[rgba(245,166,35,0.1)] px-3 py-2 text-xs text-[#f5a623]">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            No outbound mailbox is configured, so e-mails are logged on the server and the buyer and supplier
            receive nothing. Set <span className="font-mono">GMAIL_SENDER_ADDRESS</span> and{" "}
            <span className="font-mono">GMAIL_APP_PASSWORD</span> on the backend.
          </span>
        </div>
      )}
      {!data.notifications_enabled && (
        <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
          <Ban className="w-4 h-4 shrink-0 mt-0.5" />
          Status notices are switched off (<span className="font-mono">DEAL_NOTIFICATIONS_ENABLED=false</span>).
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {data.entries.length} e-mail(s)
          {undelivered > 0 && <span className="text-[#f5a623]"> · {undelivered} did not reach the counterparty</span>}
        </p>
        <button
          onClick={() => setNoticesOnly(!noticesOnly)}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-semibold border",
            noticesOnly ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          )}
          aria-pressed={noticesOnly}
        >
          Status notices only
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {["buyer", "supplier"].map((p) => (
          <PartyColumn key={p} party={p} entries={byParty[p] ?? []} summary={data.summary[p] ?? {}} />
        ))}
      </div>
      {Object.keys(byParty)
        .filter((p) => p !== "buyer" && p !== "supplier" && byParty[p].length)
        .map((p) => (
          <PartyColumn key={p} party={p} entries={byParty[p]} summary={data.summary[p] ?? {}} />
        ))}
    </div>
  );
}
