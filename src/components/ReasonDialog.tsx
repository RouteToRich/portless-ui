import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** One dialog for every decision that needs a reason (review board B-14): park / drop a
 * prospect, do-not-contact, sanctions clear / fail, bulk actions, start a prospect.
 *
 *   const r = await askReason({ title: "Drop prospect", consequence: "…", confirm: "Drop" });
 *   if (!r) return;            // cancelled
 *   r.reason; r.values.days    // the reason and any extra fields
 *
 * The consequence is spelled out above the reason so nobody approves blind. One host
 * (<ReasonDialogHost/>, mounted once in App) shows whichever request is open. */

export interface ReasonField {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  /** Choices for type "select" (value, label). */
  options?: { value: string; label: string }[];
  /** Initial value. */
  initial?: string;
  placeholder?: string;
  required?: boolean;
  /** Upper-case the value (country codes). */
  upper?: boolean;
  /** Free-text hint under the field. */
  hint?: string;
}

export interface ReasonRequest {
  title: string;
  /** What happens when confirmed — shown in full. */
  consequence: string;
  /** Label of the reason box; false = no reason asked (only the fields). */
  reasonLabel?: string | false;
  reasonPlaceholder?: string;
  /** Minimum reason length (default 3). */
  minReason?: number;
  fields?: ReasonField[];
  confirm?: string;
  tone?: "default" | "destructive" | "warning" | "success";
}

export interface ReasonResult {
  reason: string;
  values: Record<string, string>;
}

type Pending = ReasonRequest & { resolve: (r: ReasonResult | null) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function askReason(req: ReasonRequest): Promise<ReasonResult | null> {
  if (current) current.resolve(null); // a newer request replaces an unanswered one
  return new Promise((resolve) => {
    current = { ...req, resolve };
    emit();
  });
}

function close(result: ReasonResult | null) {
  const p = current;
  current = null;
  emit();
  p?.resolve(result);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Pure check (unit-testable): what blocks the confirm button, or null. */
export function reasonProblem(req: ReasonRequest, reason: string, values: Record<string, string>): string | null {
  const min = req.minReason ?? 3;
  if (req.reasonLabel !== false && reason.trim().length < min) return `Give a reason (at least ${min} characters)`;
  for (const f of req.fields ?? []) {
    const v = (values[f.name] ?? "").trim();
    if (f.required && !v) return `${f.label} is required`;
    if (v && f.type === "number" && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return `${f.label} must be a number`;
  }
  return null;
}

export function ReasonDialogHost() {
  const req = useSyncExternalStore(subscribe, () => current);
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setReason("");
    const start: Record<string, string> = {};
    for (const f of req?.fields ?? []) {
      if (f.initial !== undefined) start[f.name] = f.initial;
      else if (f.type === "select" && f.options?.length && f.required) start[f.name] = f.options[0].value;
    }
    setValues(start);
  }, [req]);

  if (!req) return null;
  const problem = reasonProblem(req, reason, values);
  const submit = () => {
    if (problem) return;
    const clean: Record<string, string> = {};
    for (const f of req.fields ?? []) {
      const v = (values[f.name] ?? "").trim();
      clean[f.name] = f.upper ? v.toUpperCase() : v;
    }
    close({ reason: reason.trim(), values: clean });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(null); }}>
      <DialogContent data-testid="reason-dialog" onKeyDown={(e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
      }}>
        <DialogHeader>
          <DialogTitle>{req.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{req.consequence}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {req.reasonLabel !== false && (
            <div className="space-y-1">
              <Label htmlFor="reason-text">{req.reasonLabel ?? "Reason (kept on the record)"}</Label>
              <Textarea id="reason-text" autoFocus rows={3} value={reason} data-testid="reason-text"
                placeholder={req.reasonPlaceholder} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          {(req.fields ?? []).map((f, i) => (
            <div key={f.name} className="space-y-1">
              <Label htmlFor={`reason-${f.name}`}>{f.label}{f.required ? "" : " (optional)"}</Label>
              {f.type === "select" ? (
                <select id={`reason-${f.name}`} data-testid={`reason-field-${f.name}`}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                  value={values[f.name] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                  {!f.required && <option value="">—</option>}
                  {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <Input id={`reason-${f.name}`} autoFocus={req.reasonLabel === false && i === 0}
                  type={f.type === "date" ? "date" : "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.placeholder}
                  value={values[f.name] ?? ""} data-testid={`reason-field-${f.name}`}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
              )}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:gap-0 items-center">
          {problem && <span className="text-xs text-muted-foreground mr-auto">{problem}</span>}
          <Button variant="ghost" onClick={() => close(null)}>Cancel</Button>
          <Button variant={req.tone ?? "default"} disabled={!!problem} onClick={submit} data-testid="reason-confirm">
            {req.confirm ?? "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
