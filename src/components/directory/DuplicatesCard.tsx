import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { CounterpartiesApi } from "@/api/endpoints";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Probable duplicate companies of one role (same company e-mail domain, phone, or name in one
 *  country). Staff confirm each merge; the kept record carries the others' history. Hidden when
 *  there are none. */
export function DuplicatesCard({ role }: { role: "buyer" | "supplier" }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["counterparties", "duplicates", role],
    queryFn: () => CounterpartiesApi.duplicates(role),
    staleTime: 60_000,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const groups = data ?? [];
  if (!groups.length) return null;

  async function merge(g: { ids: string[]; names: string[]; keep_suggested: string }) {
    const keepName = g.names[g.ids.indexOf(g.keep_suggested)] ?? g.names[0];
    if (!window.confirm(`Merge ${g.names.filter((n) => n !== keepName).join(", ")} into ${keepName}? Their history moves to ${keepName}; the other records are removed.`)) return;
    setBusy(g.keep_suggested);
    try {
      await CounterpartiesApi.merge(role, g.keep_suggested, g.ids.filter((i) => i !== g.keep_suggested));
      toast.success(`Merged into ${keepName}`);
      qc.invalidateQueries({ queryKey: ["counterparties"] });
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg ?? "Merge failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card data-testid="duplicates">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Copy className="w-4 h-4 text-muted-foreground" />
          Possible duplicate {role}s ({groups.length})
        </div>
        <ul className="divide-y divide-border">
          {groups.slice(0, 10).map((g) => (
            <li key={g.ids.join("|")} className="py-1.5 flex items-center gap-2 text-xs">
              <span className="flex-1 min-w-0 truncate" title={g.names.join(" · ")}>
                {g.names.join(" · ")} <span className="text-muted-foreground">— same {g.reasons.join(", ")}</span>
              </span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy !== null} onClick={() => merge(g)}>
                Merge
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
