import { Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deal } from "@/api/types";
import { TONE_CLASS } from "@/lib/qc";
import { ESCROW_STATUS_META, escrowProviderLabel } from "@/lib/escrow";

/** Which escrow provider holds the buyer's money and where it stands
 *  (shared/orchestration/escrow_status.py). Before the escrow opens it shows
 *  the chosen provider only ("Tazapay · chosen by buyer"). */
export function EscrowStatusChip({
  deal,
  className,
}: {
  deal: Pick<Deal, "escrow_provider" | "escrow_provider_source" | "escrow_status" | "escrow_status_detail">;
  className?: string;
}) {
  const provider = escrowProviderLabel(deal.escrow_provider) ?? "Escrow";
  const meta = deal.escrow_status ? ESCROW_STATUS_META[deal.escrow_status] : null;
  const label = meta ? meta.label : deal.escrow_provider_source ? `chosen by ${deal.escrow_provider_source}` : "not chosen yet";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border whitespace-nowrap max-w-full min-w-0",
        TONE_CLASS[meta?.tone ?? "muted"],
        className
      )}
      data-testid="escrow-status"
      data-escrow-provider={deal.escrow_provider ?? ""}
      data-escrow-status={deal.escrow_status ?? ""}
      title={deal.escrow_status_detail ?? `${provider}: ${label}`}
    >
      <Landmark className="w-3 h-3" />
      <span className="truncate">{provider} · {label}</span>
    </span>
  );
}
