import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLE = {
  verified: { label: "Verified", Icon: ShieldCheck, cls: "text-[#2ec28a] border-[#2ec28a]/40 bg-[#2ec28a]/10" },
  unverified: { label: "Unverified", Icon: ShieldQuestion, cls: "text-muted-foreground border-border bg-secondary/40" },
  failed: { label: "Failed", Icon: ShieldAlert, cls: "text-[#ff5d6c] border-[#ff5d6c]/40 bg-[#ff5d6c]/10" },
} as const;

/** The scan-time check of a counterparty when only its status (and reasons) travelled with
 *  it onto the deal: a buyer candidate's `validation_status`, a match result's `verification`. */
export function CheckChip({ status, reasons, className }: { status?: string | null; reasons?: string[]; className?: string }) {
  const key = (status && status in STYLE ? status : "unverified") as keyof typeof STYLE;
  const { label, Icon, cls } = STYLE[key];
  const title = status
    ? [`Scan-time check: ${label.toLowerCase()}`, ...(reasons?.length ? ["", ...reasons.map((r) => `• ${r}`)] : [])].join("\n")
    : "Not checked at scan time";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0", cls, className)}
      title={title}
      data-testid={`check-${status ?? "none"}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {status ? label : "Not checked"}
    </span>
  );
}
