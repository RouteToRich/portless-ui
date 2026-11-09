import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DealmakerApi } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** An expired PI cannot be accepted until staff give it a new validity. */
export function ExtendPiButton({ piId, dealId }: { piId: string; dealId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const [reason, setReason] = useState("");
  const extend = useMutation({
    mutationFn: () => DealmakerApi.extendPi(piId, { validity_days: Number(days), reason: reason.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dealmaker-documents", dealId] });
      toast.success("PI validity extended");
      setReason("");
      setOpen(false);
    },
    onError: (e: unknown) => {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "The PI could not be extended");
    },
  });
  const validDays = Number(days) >= 1 && Number(days) <= 60;

  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(true)}>
        Extend PI validity
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend the Proforma Invoice</DialogTitle>
            <DialogDescription>
              The price stays the same and the document is updated with the new date. Tell the buyer yourself.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-[11px]">Valid for (days from today, 1 to 60) *</Label>
            <Input type="number" min={1} max={60} value={days} onChange={(e) => setDays(e.target.value)} />
            <Label className="text-[11px]">Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!validDays || reason.trim().length < 3 || extend.isPending} onClick={() => extend.mutate()}>
              Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
