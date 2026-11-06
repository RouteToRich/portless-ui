import { Factory, Mail, AlertTriangle } from "lucide-react";
import { useDealQuotes, useDealRfqs } from "@/api/hooks";
import type { Deal } from "@/api/types";
import { fmtUSD, timeAgo } from "@/lib/utils";
import { notDelivered } from "@/lib/prospect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Supplier side of a prospect: who was asked for a quote, whether the request
 *  actually went out, and the quotes that came back. No supplier is "the"
 *  supplier until a verified quote wins or an operator confirms one. */
export function SupplierRfqPanel({ deal }: { deal: Deal }) {
  const { data: rfqs, isLoading } = useDealRfqs(deal.deal_id);
  const { data: quotes } = useDealQuotes(deal.deal_id);
  const names = new Map((deal.match_results ?? []).map((m) => [m.supplier_id, m.company_name]));
  const chosen = deal.parties.find((p) => p.role === "supplier");

  const rows = (rfqs ?? []).flatMap((r) => r.dispatch_results.map((d) => ({ rfq: r, d })));
  const byQuote = new Map((quotes ?? []).map((q) => [q.supplier_id, q]));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <Factory className="w-4 h-4 text-[#28c2a0]" />
          <CardTitle>Supplier quotes</CardTitle>
          <span className="text-[10px] text-muted-foreground">
            {rows.length} asked · {quotes?.length ?? 0} quoted
            {chosen ? ` · chosen: ${chosen.legal_name}` : " · none chosen yet"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No request for quotation sent yet — it goes out automatically when the prospect is created
            (DISPATCH_RFQ gate), to the top 3 suppliers the scan found.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ rfq, d }) => {
              const q = byQuote.get(d.supplier_id);
              const failed = !d.success;
              return (
                <li key={`${rfq.rfq_id}-${d.supplier_id}`} className="rounded-lg border border-border bg-secondary/50 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{names.get(d.supplier_id) || d.supplier_id}</p>
                    {chosen?.party_id === d.supplier_id && <Badge variant="success" className="text-[10px]">chosen</Badge>}
                    {q ? (
                      <Badge variant="teal" className="text-[10px]">quoted {fmtUSD(q.unit_price_usd)}/MT</Badge>
                    ) : failed ? (
                      <Badge variant={notDelivered(d) ? "warning" : "destructive"} className="text-[10px]">
                        {notDelivered(d) ? "not delivered" : "failed"}
                      </Badge>
                    ) : d.channel === "portal" ? (
                      <Badge variant="outline" className="text-[10px]">manual dispatch</Badge>
                    ) : (
                      <Badge variant="info" className="text-[10px]">asked · waiting for quote</Badge>
                    )}
                    {q?.re_scored_decision && (
                      <span className="text-[10px] text-muted-foreground">
                        Match Engine: {q.re_scored_decision}
                        {q.re_scored_cms != null ? ` (${q.re_scored_cms.toFixed(0)})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap mt-1">
                    {d.email && <span className="flex items-center gap-1 font-mono"><Mail className="w-3 h-3" />{d.email}</span>}
                    <span className="font-mono">{rfq.rfq_id}</span>
                    {rfq.dispatched_at && <span>{timeAgo(rfq.dispatched_at)}</span>}
                  </div>
                  {failed && d.error && (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-[#f5a623]">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {d.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
