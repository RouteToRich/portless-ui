import { ExternalLink, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import { useResolveScreening, useScreeningReview } from "@/api/hooks";
import type { Counterparty } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";

import { askReason } from "@/components/ReasonDialog";
/** Companies whose sanctions screening returned "review" (a possible list match, or a list
 * that was unavailable). They stay unverified — never contacted as verified — until staff
 * clear or fail them with a reason. Hidden while the queue is empty. */
export function ScreeningReviewCard() {
  const { data } = useScreeningReview();
  const resolve = useResolveScreening();
  const rows = data ?? [];
  if (rows.length === 0) return null;

  async function decide(c: Counterparty, decision: "clear" | "fail") {
    const r = await askReason(decision === "clear"
      ? {
          title: `Clear ${c.name}`,
          consequence: "Records that this company is NOT the listed entity. A second, different person must "
            + "confirm before it counts as verified and can be contacted. Both decisions stay in the audit log.",
          reasonLabel: "Why is it not the listed entity?", confirm: "Clear", tone: "success",
        }
      : {
          title: `Fail ${c.name}`,
          consequence: "Records that this company IS (or may be) the listed entity. It is never contacted "
            + "and never becomes a deal party. Takes effect at once.",
          reasonLabel: "Why is it the listed entity?", confirm: "Fail", tone: "destructive",
        });
    if (!r) return;
    const reason = r.reason;
    try {
      await resolve.mutateAsync({ role: c.role, id: c.id, decision, reason: reason.trim() });
      const pending = decision === "clear" && !(c.screening_reviews ?? []).some((r) => r.decision === "clear" && r.pending);
      toast.success(pending ? `${c.name}: first clear recorded — a second person must confirm`
        : `${c.name} ${decision === "clear" ? "cleared" : "failed"}`);
    } catch (e) {
      toast.error("Not saved", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <Card className="border-[#f5a623]/40" data-testid="screening-review">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldQuestion className="w-4 h-4 text-[#f5a623]" />
          Sanctions screening needs a person ({rows.length})
        </div>
        <p className="text-[11px] text-muted-foreground">
          A possible list match or an unavailable list. Each stays unverified until you clear or fail it.
        </p>
        <ul className="divide-y divide-border">
          {rows.map((c) => {
            const v = c.validation;
            const evidence = v?.evidence_url && /^https?:\/\//i.test(v.evidence_url) ? v.evidence_url : null;
            const firstClear = [...(c.screening_reviews ?? [])].reverse().find((r) => r.decision === "clear" && r.pending);
            return (
              <li key={c.id} className="py-1.5 flex items-start gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {c.name}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {c.role} · {c.country ?? "—"}
                      {v?.checked_at ? ` · screened ${timeAgo(v.checked_at)}` : ""}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{v?.sanctions_reason ?? "No reason given by the screening"}</div>
                  {firstClear && (
                    <div className="text-[11px] text-[#f5a623]">
                      Cleared by {firstClear.by} — a second, different person must confirm (“{firstClear.reason}”)
                    </div>
                  )}
                  {evidence && (
                    <a href={evidence} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5">
                      screening certificate <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={resolve.isPending}
                  onClick={() => decide(c, "clear")}>{firstClear ? "Confirm clear" : "Clear"}</Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px] text-[#ff5d6c]" disabled={resolve.isPending}
                  onClick={() => decide(c, "fail")}>Fail</Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
