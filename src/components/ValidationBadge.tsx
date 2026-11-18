import { ExternalLink, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { CounterpartyValidation } from "@/api/types";
import { cn } from "@/lib/utils";

const STYLE = {
  verified: { label: "Verified", Icon: ShieldCheck, cls: "text-[#2ec28a] border-[#2ec28a]/40 bg-[#2ec28a]/10" },
  unverified: { label: "Unverified", Icon: ShieldQuestion, cls: "text-muted-foreground border-border bg-secondary/40" },
  failed: { label: "Failed", Icon: ShieldAlert, cls: "text-[#ff5d6c] border-[#ff5d6c]/40 bg-[#ff5d6c]/10" },
} as const;

/** The scan-time check of a buyer / supplier: sanctions, e-mail, GST / IEC.
 *  The tooltip lists each check and the reasons; no check yet → "Not checked". */
export function ValidationBadge({ v, className }: { v?: CounterpartyValidation | null; className?: string }) {
  const status = v?.status ?? "unverified";
  const { label, Icon, cls } = STYLE[status];
  const lines = v
    ? [
        `Sanctions: ${v.sanctions ?? "unchecked"}`,
        `E-mail: ${v.email ?? "unchecked"}`,
        ...(v.gst ? [`GST: ${v.gst}`] : []),
        ...(v.iec ? [`IEC: ${v.iec}`] : []),
        ...(v.dgft_denied ? [`DGFT denied list: ${v.dgft_denied}`] : []),
        ...(v.reasons.length ? ["", ...v.reasons.map((r) => `• ${r}`)] : []),
        ...(v.checked_at ? ["", `Checked ${new Date(v.checked_at).toLocaleString()}`] : []),
      ]
    : ["Not checked yet (outside the top buyers / suppliers of the scan, or validation is off)"];
  const evidence = v?.evidence_url && /^https?:\/\//i.test(v.evidence_url) ? v.evidence_url : null;
  const badge = (
    <span
      className={cn("inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0", cls, className)}
      title={lines.join("\n") + (evidence ? "\n\nClick for the screening certificate" : "")}
      data-testid={`validation-${status}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {v ? label : "Not checked"}
      {evidence && <ExternalLink className="w-2 h-2 opacity-70" />}
    </span>
  );
  if (!evidence) return badge;
  // The badge sits inside clickable rows / cards: open the certificate without selecting the row.
  return (
    <a href={evidence} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0">
      {badge}
    </a>
  );
}
