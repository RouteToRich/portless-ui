import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AutonomyApi } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useKillSwitch, useSetKillSwitch } from "@/api/hooks";

/** Emergency global pause: nothing leaves PortLess until it is resumed.
 *  "Unreadable" is different from a pause: the stored state could not be read (the
 *  database did not answer), so the platform holds for safety — resuming cannot fix
 *  that, re-reading can. */
export function KillSwitch() {
  const { data } = useKillSwitch();
  const setKillSwitch = useSetKillSwitch();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);
  const paused = data?.paused ?? false;
  const unreadable = Boolean(data?.unreadable);
  const reasonOk = reason.trim().length >= 3;

  async function submit() {
    try {
      await setKillSwitch.mutateAsync({ paused: !paused, reason: reason.trim() });
      toast.success(paused ? "Platform resumed" : "Platform paused");
      setReason("");
      setOpen(false);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(paused ? "The platform could not be resumed" : "The platform could not be paused", {
        description: typeof detail === "string" ? detail : "The server did not answer — try again in a moment.",
        duration: 10000,
      });
    }
  }

  async function recheck() {
    setChecking(true);
    try {
      const state = await AutonomyApi.recheckKillSwitch();
      qc.setQueryData(["kill-switch"], state);
      if (state.unreadable) {
        toast.error("Still unreadable", { description: "The database is not answering yet. The platform stays stopped for safety." });
      } else if (state.paused) {
        toast.info(`The platform is paused by ${state.by ?? "staff"}`, { description: state.reason ?? undefined });
      } else {
        toast.success("The platform is running", { description: "The state could be read again — nobody had paused it." });
        setOpen(false);
      }
    } catch {
      toast.error("The server did not answer — try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <Button
        data-testid="kill-switch"
        data-state={unreadable ? "unreadable" : paused ? "paused" : "running"}
        size="sm"
        variant={paused ? "destructive" : "outline"}
        className="h-8 text-xs gap-1"
        title={unreadable ? "The pause state cannot be read — the database is not answering"
          : paused ? `Paused by ${data?.by}: ${data?.reason}` : "Pause all deals"}
        onClick={() => setOpen(true)}
      >
        {unreadable ? <><AlertTriangle className="w-3.5 h-3.5" /> State unreadable</> : paused ? "Paused: Resume" : "Pause All"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {unreadable ? (
            <>
              <DialogHeader>
                <DialogTitle>Pause state cannot be read</DialogTitle>
                <DialogDescription>
                  Nobody paused the platform. The server could not read the pause state from the database, so it
                  holds everything for safety: no money, orders or e-mail move until the state can be read again.
                  Resuming cannot fix this — the resume could not be saved either. Check again once the database
                  answers; if it keeps failing, look at the database status (Atlas) on System Health.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
                <Button onClick={recheck} disabled={checking} className="gap-1">
                  <RefreshCw className={checking ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} /> Check again
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{paused ? "Resume the platform" : "Pause all deals"}</DialogTitle>
                <DialogDescription>
                  {paused
                    ? `Paused by ${data?.by}: ${data?.reason}. Resuming lets approvals, money, orders and e-mail move again.`
                    : "Stops approvals, escrow releases, payouts, refunds, POs, QC and freight orders, customs filings and all e-mail. Provider updates and replies are still recorded."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label className="text-[11px]">Reason *</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={paused ? "e.g. bank incident cleared" : "e.g. suspected fraud on a payout"} />
                {!reasonOk && (
                  <p className="text-[10px] text-muted-foreground">A reason of at least 3 characters is required — it is recorded in the audit history.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant={paused ? "default" : "destructive"}
                  disabled={!reasonOk || setKillSwitch.isPending}
                  onClick={submit}
                >
                  {setKillSwitch.isPending ? "Saving…" : paused ? "Resume" : "Pause everything"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
