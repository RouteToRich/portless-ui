import { useState } from "react";
import { toast } from "sonner";
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

/** Emergency global pause: nothing leaves PortLess until it is resumed. */
export function KillSwitch() {
  const { data } = useKillSwitch();
  const setKillSwitch = useSetKillSwitch();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const paused = data?.paused ?? false;

  async function submit() {
    try {
      await setKillSwitch.mutateAsync({ paused: !paused, reason: reason.trim() });
      toast.success(paused ? "Platform resumed" : "Platform paused");
      setReason("");
      setOpen(false);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "The switch could not be changed");
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={paused ? "destructive" : "outline"}
        className="h-8 text-xs"
        title={paused ? `Paused by ${data?.by}: ${data?.reason}` : "Pause all deals"}
        onClick={() => setOpen(true)}
      >
        {paused ? "Paused: Resume" : "Pause All"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
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
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={paused ? "default" : "destructive"}
              disabled={reason.trim().length < 3 || setKillSwitch.isPending}
              onClick={submit}
            >
              {paused ? "Resume" : "Pause everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
