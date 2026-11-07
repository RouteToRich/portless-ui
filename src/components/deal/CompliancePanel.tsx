import { useState } from "react";
import { toast } from "sonner";
import { Scale, RefreshCw, Container, ShieldAlert, ShieldCheck, Lock } from "lucide-react";
import { cn, fmtDateTime } from "@/lib/utils";
import { useComplianceActions, useDealCompliance } from "@/api/hooks";
import type { ComplianceCheck, ComplianceFinding, Deal } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function statusVariant(status: string | undefined) {
  if (status === "block") return "destructive" as const;
  if (status === "review") return "warning" as const;
  if (status === "clear") return "success" as const;
  return "secondary" as const;
}

function FindingRow({ f }: { f: ComplianceFinding }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 text-xs",
        f.severity === "block" && "text-[#ff5d6c]",
        f.severity === "review" && "text-[#f5a524]",
        f.severity === "info" && "text-muted-foreground"
      )}
    >
      <span className="font-mono text-[10px] mt-0.5 shrink-0">{f.severity.toUpperCase()}</span>
      <span>{f.message}</span>
    </li>
  );
}

function CheckBlock({ title, check }: { title: string; check: ComplianceCheck | null }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        {check ? (
          <Badge variant={statusVariant(check.status)} className="capitalize">{check.status}</Badge>
        ) : (
          <Badge variant="secondary">not run</Badge>
        )}
      </div>
      {check && check.findings.length > 0 && (
        <ul className="space-y-1">
          {check.findings.map((f) => <FindingRow key={f.code} f={f} />)}
        </ul>
      )}
      {check && (
        <p className="text-[10px] text-muted-foreground">
          {check.stage} · {fmtDateTime(check.checked_at)}
        </p>
      )}
    </div>
  );
}

const splitList = (s: string) => s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

export function CompliancePanel({ deal }: { deal: Deal }) {
  const { data } = useDealCompliance(deal.deal_id);
  const { recheck, recordLoading } = useComplianceActions(deal.deal_id);
  const [open, setOpen] = useState(false);
  const [containers, setContainers] = useState("");
  const [seals, setSeals] = useState("");
  const [qty, setQty] = useState("");
  const [hs, setHs] = useState(deal.hs_code ?? "");
  const [ref, setRef] = useState("");
  const [photos, setPhotos] = useState("");

  const holds = data?.holds ?? [];
  const loading = data?.loading;
  const awaitingSeal = deal.status === "QC_PASSED" && !(loading?.seal_numbers?.length);

  async function runCheck() {
    try {
      const res = await recheck.mutateAsync();
      toast.success(`Trade check: ${res.status}`);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Trade check failed");
    }
  }

  async function submitLoading() {
    const c = splitList(containers);
    const s = splitList(seals);
    if (!c.length || !s.length) {
      toast.error("Container and seal numbers are both required");
      return;
    }
    try {
      await recordLoading.mutateAsync({
        container_numbers: c,
        seal_numbers: s,
        loaded_quantity_mt: qty ? Number(qty) : null,
        hs_code: hs.trim() || null,
        inspector_ref: ref.trim() || null,
        photos: splitList(photos),
      });
      toast.success("Loading recorded", {
        description: "The shipment check runs now; freight and the QC tranche follow when it matches the PI / PO.",
      });
      setOpen(false);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? "Could not record the loading");
    }
  }

  return (
    <Card className={cn(holds.length > 0 && "border-[#f5a524]/40")}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-[#4f8cff]" />
            <CardTitle>Trade compliance</CardTitle>
            {holds.length > 0 ? (
              <Badge variant="warning" className="gap-1"><ShieldAlert className="w-3 h-3" /> {holds.length} hold(s)</Badge>
            ) : (
              <Badge variant="success" className="gap-1"><ShieldCheck className="w-3 h-3" /> no holds</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setOpen(true)}>
              <Container className="w-3.5 h-3.5" /> Record loading + seal
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={runCheck} disabled={recheck.isPending}>
              <RefreshCw className={cn("w-3.5 h-3.5", recheck.isPending && "animate-spin")} /> Re-check
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {holds.length > 0 && (
          <p className="text-xs text-[#f5a524]">
            Every PO, freight, customs, tranche and payout gate on this deal waits for a person while these are open:{" "}
            <span className="font-mono">{holds.join(", ")}</span>. Approving such a gate accepts its review flags.
          </p>
        )}
        {awaitingSeal && (
          <p className="text-xs text-[#f5a524] flex items-start gap-1.5">
            <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            QC passed — freight and the QC-stage tranche wait for the inspector's supervised loading
            (container + seal numbers).
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CheckBlock title="Product · destination · parties · price" check={data?.trade ?? null} />
          <CheckBlock title="Who paid the escrow" check={data?.payer ?? null} />
          <CheckBlock title="Container vs paperwork" check={data?.shipment ?? null} />
        </div>
        {loading && (
          <p className="text-[11px] text-muted-foreground">
            Loaded: container <span className="font-mono">{loading.container_numbers.join(", ")}</span> · seal{" "}
            <span className="font-mono">{loading.seal_numbers.join(", ")}</span>
            {loading.loaded_quantity_mt != null && ` · ${loading.loaded_quantity_mt} MT`}
            {loading.hs_code && ` · HS ${loading.hs_code}`} · {loading.source}
            {data?.bl_seal_numbers?.length ? ` · B/L seal ${data.bl_seal_numbers.join(", ")}` : ""}
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supervised loading</DialogTitle>
            <DialogDescription>
              From the inspector's stuffing report: what went into which container and the seal they applied.
              The bill-of-lading seal must later match it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px]">Container number(s)</Label>
              <Input value={containers} onChange={(e) => setContainers(e.target.value)} placeholder="MSKU1234565" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Seal number(s)</Label>
              <Input value={seals} onChange={(e) => setSeals(e.target.value)} placeholder="SGS-778899" className="h-8 text-xs font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Loaded quantity (MT)</Label>
                <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">HS code on the report</Label>
                <Input value={hs} onChange={(e) => setHs(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Inspector report ref</Label>
              <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Photo links (stuffing / seal)</Label>
              <Input value={photos} onChange={(e) => setPhotos(e.target.value)} placeholder="https://…" className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={recordLoading.isPending}>Cancel</Button>
            <Button size="sm" onClick={submitLoading} disabled={recordLoading.isPending}>
              {recordLoading.isPending ? "Recording…" : "Record loading"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
