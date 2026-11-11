import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QcStatus } from "@/api/types";
import { QC_STATUS_META, TONE_CLASS } from "@/lib/qc";

/** The deal's inspection status (shared/orchestration/qc_status.py). */
export function QcStatusChip({ status, className }: { status: QcStatus; className?: string }) {
  const meta = QC_STATUS_META[status];
  const Icon = meta.tone === "ok" ? ShieldCheck : meta.tone === "danger" ? ShieldAlert : ShieldQuestion;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border whitespace-nowrap max-w-full min-w-0",
        TONE_CLASS[meta.tone],
        className
      )}
      data-testid="qc-status"
      data-qc-status={status}
      title={`QC: ${meta.label}`}
    >
      <Icon className="w-3 h-3" />
      <span className="truncate">QC · {meta.label}</span>
    </span>
  );
}
