import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown while the live approvals stream is down: the list still refreshes by polling, but
 *  new gates may arrive late. Hidden while connected or before the first failure. */
export function StreamBanner({ lostSince, attempts, onReconnect }: {
  lostSince: number | null;
  attempts: number;
  onReconnect: () => void;
}) {
  if (lostSince == null) return null;
  const secs = Math.max(0, Math.round((Date.now() - lostSince) / 1000));
  return (
    <div role="status" data-testid="stream-banner"
      className="flex items-center gap-2 rounded-lg border border-[#f5a623]/40 bg-[#f5a623]/10 px-3 py-2 text-xs">
      <WifiOff className="w-3.5 h-3.5 text-[#f5a623] shrink-0" />
      <span className="flex-1">
        Live updates lost{secs >= 5 ? ` for ${secs < 120 ? `${secs}s` : `${Math.round(secs / 60)} min`}` : ""} — reconnecting
        {attempts > 1 ? ` (try ${attempts})` : ""}. The list still refreshes every 30 s, so new approvals may arrive late.
      </span>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onReconnect}>Reconnect now</Button>
    </div>
  );
}
