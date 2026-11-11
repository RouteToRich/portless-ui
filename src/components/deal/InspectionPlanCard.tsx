import { useState } from "react";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSetInspectionPlan } from "@/api/hooks";
import type { Deal, InspectionPhase, InspectionType } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TONE_CLASS } from "@/lib/qc";

const PHASES: { type: InspectionType; label: string; when: string }[] = [
  { type: "DUPRO", label: "During Production (DUPRO)", when: "about a third produced — catches problems while they can be fixed" },
  { type: "PSI", label: "Pre-Shipment (PSI)", when: "fully produced and packed, supervised loading and sealing — always done" },
  { type: "PEO", label: "Pre-Customs Clearance (PEO)", when: "at the port before the export filing — customs waits for it" },
];

const STATE_TONE: Record<InspectionPhase["status"], keyof typeof TONE_CLASS> = {
  PLANNED: "muted",
  BOOKED: "info",
  SCHEDULED: "info",
  INSPECTED: "info",
  DECISION_NEEDED: "danger",
  PASSED: "ok",
  FAILED: "danger",
  BOOKING_FAILED: "danger",
};

/** The buyer's inspection requirement and where each phase stands (staff can change the plan). */
export function InspectionPlanCard({ deal }: { deal: Deal }) {
  const plan = new Set<InspectionType>(deal.inspection_types?.length ? deal.inspection_types : ["PSI"]);
  const [draft, setDraft] = useState<Set<InspectionType>>(plan);
  const save = useSetInspectionPlan(deal.deal_id);
  const lines = new Map((deal.inspections ?? []).map((l) => [l.type, l]));
  const changed = [...draft].sort().join() !== [...plan].sort().join();

  return (
    <Card data-testid="inspection-plan">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-[#a78bfa]" />
          <CardTitle>Inspection plan</CardTitle>
          {deal.inspection_types_source && (
            <span className="text-[10px] text-muted-foreground">chosen by {deal.inspection_types_source}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {PHASES.map((p) => {
          const line = lines.get(p.type);
          const on = draft.has(p.type);
          return (
            <label
              key={p.type}
              className={cn(
                "flex items-start gap-3 rounded-lg border border-border p-2.5 min-w-0",
                on ? "bg-secondary" : "opacity-70"
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={on}
                disabled={p.type === "PSI"}
                onChange={(e) => {
                  const next = new Set(draft);
                  if (e.target.checked) next.add(p.type);
                  else next.delete(p.type);
                  setDraft(next);
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.label}</p>
                  {line && (
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", TONE_CLASS[STATE_TONE[line.status]])}>
                      {line.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">{p.when}</p>
                {line && (line.inspection_date || line.order_number) && (
                  <p className="text-[10px] text-muted-foreground truncate">
                    {[line.provider?.toUpperCase(), line.inspection_date, line.order_number].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </label>
          );
        })}
        {changed && (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={save.isPending}
              onClick={() =>
                save.mutate([...draft], {
                  onSuccess: () => toast.success("Inspection plan saved"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save the plan"),
                })
              }
            >
              Save plan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
