import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CounterpartiesApi, type ManualSupplierInput } from "@/api/endpoints";
import type { Counterparty } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS: { key: keyof ManualSupplierInput; label: string; placeholder?: string; type?: string; wide?: boolean }[] = [
  { key: "name", label: "Legal name *", wide: true },
  { key: "contact_person", label: "Contact person" },
  { key: "email", label: "E-mail", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "website", label: "Website", placeholder: "https://…" },
  { key: "address", label: "Facility address with PIN", placeholder: "Plot 14, SIPCOT, Thanjavur 613005", wide: true },
  { key: "gstin", label: "GSTIN" },
  { key: "iec", label: "IEC" },
  { key: "udyam", label: "Udyam" },
  { key: "fssai", label: "FSSAI" },
  { key: "apeda", label: "APEDA RCMC" },
  { key: "hs_codes", label: "HS codes", placeholder: "100630, 100640" },
  { key: "grades", label: "Grades", placeholder: "Ponni; Sona Masoori" },
  { key: "capacity_mt_per_month", label: "Capacity (MT / month)", type: "number" },
  { key: "moq_mt", label: "MOQ (MT)", type: "number" },
  { key: "usual_price", label: "Usual price per MT", type: "number" },
  { key: "port_of_loading", label: "Port of loading", placeholder: "INMAA" },
  { key: "port_km", label: "Distance to port (km)", type: "number" },
  { key: "bank_name", label: "Bank" },
  { key: "bank_ifsc", label: "IFSC" },
  { key: "bank_account_last4", label: "Account — last 4 digits", placeholder: "4321" },
];

function errText(e: unknown): string {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object" && "message" in d) return String((d as { message: string }).message);
  if (Array.isArray(d)) return d.map((x) => (x as { msg?: string }).msg ?? "").join(" · ");
  return "Not saved";
}

/** Add or edit a local supplier by hand. The same checks as a scanned supplier run on save. */
export function SupplierFormDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing?: Counterparty | null }) {
  const qc = useQueryClient();
  const m = (existing?.manual ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState<Record<string, string>>(() => ({
    name: existing?.name ?? "", email: existing?.email ?? "", phone: existing?.phone ?? "", website: existing?.website ?? "",
    address: existing?.address ?? "", gstin: existing?.gstin ?? "", iec: existing?.iec ?? "",
    hs_codes: (existing?.hs_codes ?? []).join(", "),
    ...Object.fromEntries(Object.entries(m).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => [k, String(v)])),
    grades: Array.isArray(m.grades) ? (m.grades as string[]).join("; ") : "",
    price_currency: String(m.price_currency ?? "INR"), price_basis: String(m.price_basis ?? "EXW"),
  }));
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save(force = false) {
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      if (v === "" || v == null) continue;
      body[k] = ["capacity_mt_per_month", "moq_mt", "usual_price", "port_km"].includes(k) ? Number(v) : v;
    }
    setBusy(true);
    try {
      const rec = existing ? await CounterpartiesApi.editSupplier(existing.id, body as unknown as ManualSupplierInput)
        : await CounterpartiesApi.addSupplier(body as unknown as ManualSupplierInput, force);
      toast.success(`${rec.name} saved`, { description: `Check: ${rec.validation?.status ?? "not run"}` });
      qc.invalidateQueries({ queryKey: ["counterparties"] });
      onClose();
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409 && !existing && window.confirm(`${errText(e)}. Add it anyway?`)) {
        await save(true);
        return;
      }
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "Add a supplier"}</DialogTitle>
          <DialogDescription>
            Saved with source “manual”: a later scan never overwrites it. Sanctions, e-mail and GST / IEC checks run on save.
            Only the last 4 digits of the bank account are kept — the full number goes on the payout rail.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.wide ? "col-span-2" : ""}>
              <Label className="text-[11px]">{f.label}</Label>
              <Input className="h-8 text-xs" type={f.type ?? "text"} placeholder={f.placeholder}
                value={form[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
          <div>
            <Label className="text-[11px]">Price currency</Label>
            <select className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={form.price_currency} onChange={(e) => set("price_currency", e.target.value)}>
              <option value="INR">INR</option><option value="USD">USD</option>
            </select>
          </div>
          <div>
            <Label className="text-[11px]">Price basis</Label>
            <select className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={form.price_basis} onChange={(e) => set("price_basis", e.target.value)}>
              <option value="EXW">Ex-works</option><option value="FOB">FOB</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={busy || !form.name?.trim()} onClick={() => save()}>{busy ? "Saving…" : "Save and check"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ImportReport = Awaited<ReturnType<typeof CounterpartiesApi.importSuppliers>>;

/** CSV import: a dry run first (accepted / duplicates / invalid), then the real import. */
export function SupplierImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await CounterpartiesApi.importSuppliers(csv, dryRun);
      setReport(r);
      if (!dryRun) {
        toast.success(`${r.created.length} supplier(s) imported`);
        qc.invalidateQueries({ queryKey: ["counterparties"] });
      }
    } catch (e: unknown) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReport(null); setCsv(""); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import suppliers from CSV</DialogTitle>
          <DialogDescription>
            Columns: legal_name, email, phone, gstin, iec, hs, capacity, moq, price, currency (INR / USD), basis (EXW / FOB),
            address, port … Excel: save as CSV first. Check first — nothing is saved until you import.
          </DialogDescription>
        </DialogHeader>
        <input type="file" accept=".csv,text/csv" className="text-xs"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setReport(null); } }} />
        {report && (
          <div className="space-y-1 text-xs">
            <p><b>{report.accepted.length}</b> to add · <b>{report.duplicates.length}</b> duplicates · <b>{report.invalid.length}</b> invalid
              {report.created.length ? ` · ${report.created.length} imported` : ""}</p>
            {report.duplicates.slice(0, 8).map((d) => <p key={`d${d.row}`} className="text-muted-foreground">Row {d.row} {d.name}: already {String(d.existing)}</p>)}
            {report.invalid.slice(0, 8).map((d) => <p key={`i${d.row}`} className="text-[#ff5d6c]">Row {d.row} {d.name ?? ""}: {d.errors.join(" · ")}</p>)}
            {report.checks_note && <p className="text-muted-foreground">{report.checks_note}</p>}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={!csv || busy} onClick={() => run(true)}>Check the file</Button>
          <Button size="sm" disabled={!report || !report.dry_run || !report.accepted.length || busy} onClick={() => run(false)}>
            Import {report?.accepted.length ?? 0}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
