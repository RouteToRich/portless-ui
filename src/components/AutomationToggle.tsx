import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { setAutomationMode, useAutomationMode } from "@/lib/automationMode";

/** Top-bar switch between the live console and the automation dashboard. */
export function AutomationToggle() {
  const on = useAutomationMode();
  const navigate = useNavigate();
  const qc = useQueryClient();

  function toggle() {
    setAutomationMode(!on);
    qc.clear(); // nothing from one database may show under the other
    navigate(on ? "/" : "/automation");
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Automation mode"
      title={on ? "Leave automation mode" : "Show test runs on the automation database"}
      onClick={toggle}
      className={cn(
        "flex items-center gap-2 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors",
        on ? "border-[#f5a623] text-[#f5a623] bg-[rgba(245,166,35,0.12)]" : "border-border text-muted-foreground hover:bg-secondary",
      )}
    >
      <FlaskConical className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Automation</span>
      <span className={cn("relative w-7 h-4 rounded-full transition-colors", on ? "bg-[#f5a623]" : "bg-secondary")}>
        <span className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all", on ? "left-3.5" : "left-0.5")} />
      </span>
    </button>
  );
}
