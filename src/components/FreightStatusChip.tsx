import { Ship } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deal } from "@/api/types";
import { TONE_CLASS } from "@/lib/qc";
import { FREIGHT_STATUS_META } from "@/lib/freight";

/** Where the shipment stands with the carrier (shared/orchestration/freight_status.py). */
export function FreightStatusChip({
  deal,
  className,
}: {
  deal: Pick<Deal, "freight_status" | "freight_status_detail">;
  className?: string;
}) {
  if (!deal.freight_status) return null;
  const meta = FREIGHT_STATUS_META[deal.freight_status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border whitespace-nowrap max-w-full min-w-0",
        TONE_CLASS[meta.tone],
        className
      )}
      data-testid="freight-status"
      data-freight-status={deal.freight_status}
      title={deal.freight_status_detail ?? `Freight: ${meta.label}`}
    >
      <Ship className="w-3 h-3 flex-shrink-0" />
      <span className="truncate">Freight · {meta.label}</span>
    </span>
  );
}
