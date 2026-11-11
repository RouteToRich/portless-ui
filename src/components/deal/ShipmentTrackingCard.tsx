import { toast } from "sonner";
import { Anchor, Box, FileCheck2, MapPin, RefreshCw, Scale, Ship } from "lucide-react";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import { useShipment, useTrackShipment } from "@/api/hooks";
import type { ShipmentEvent } from "@/api/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FreightStatusChip } from "@/components/FreightStatusChip";
import { EVENT_LABELS, VOYAGE_STEPS, voyageStep } from "@/lib/freight";

function Fact({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-xs font-semibold truncate", mono && "font-mono")} title={value ?? undefined}>
        {value || "—"}
      </p>
    </div>
  );
}

function EventRow({ e, last }: { e: ShipmentEvent; last: boolean }) {
  const label = EVENT_LABELS[e.code] ?? e.code;
  const where = e.location?.name || e.location?.unlocode;
  return (
    <li className="relative pl-5 pb-3" data-testid="shipment-event">
      {!last && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />}
      <span
        className={cn(
          "absolute left-0 top-1 w-[11px] h-[11px] rounded-full border-2",
          e.milestone ? "bg-[#28c2a0] border-[#28c2a0]" : "bg-card border-muted-foreground/50"
        )}
      />
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate">
            {label}
            {e.classifier !== "ACT" && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">({e.classifier === "EST" ? "estimated" : "planned"})</span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {[where, e.equipment_reference, [e.vessel, e.voyage].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{e.at ? fmtDateTime(e.at) : ""}</span>
      </div>
    </li>
  );
}

/** Carrier booking, containers, B/L / VGM and the container timeline (Maersk Track & Trace). */
export function ShipmentTrackingCard({ dealId }: { dealId: string }) {
  const { data, isLoading } = useShipment(dealId);
  const track = useTrackShipment(dealId);
  const booking = data?.booking;
  const events = [...(data?.events ?? [])].reverse();
  const step = voyageStep(data?.freight_status);

  return (
    <Card data-testid="shipment-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Ship className="w-4 h-4 text-[#6cb4ff]" />
            <CardTitle>Shipment tracking</CardTitle>
            {data?.freight_status && <FreightStatusChip deal={data} />}
          </div>
          {booking && (
            <Button
              size="sm"
              variant="outline"
              disabled={track.isPending}
              onClick={() =>
                track.mutate(undefined, {
                  onSuccess: (r) => toast.success(`Carrier read: ${r.status}${r.milestone ? ` · ${r.milestone}` : ""}`),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Tracking failed"),
                })
              }
              data-testid="track-now"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1", track.isPending && "animate-spin")} />
              Track now
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : !booking ? (
          <p className="text-sm text-muted-foreground">
            {data?.freight_status_detail ?? "No carrier booking yet — it is made once the goods pass the pre-shipment inspection."}
          </p>
        ) : (
          <>
            {/* Voyage progress */}
            <ol className="grid grid-cols-6 gap-1" aria-label="Voyage progress">
              {VOYAGE_STEPS.map((s, i) => (
                <li key={s.key} className="min-w-0 text-center">
                  <div className={cn("h-1.5 rounded-full", i <= step ? "bg-[#28c2a0]" : "bg-border")} />
                  <p className={cn("text-[10px] mt-1 truncate", i <= step ? "text-foreground" : "text-muted-foreground")}>
                    {s.label}
                  </p>
                </li>
              ))}
            </ol>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Fact label={`${booking.provider === "maersk" ? "Maersk" : booking.provider} booking`} value={booking.booking_reference} mono />
              <Fact label="Booking status" value={booking.booking_status ?? booking.status} />
              <Fact label="Vessel / voyage" value={[booking.vessel, booking.voyage].filter(Boolean).join(" ")} />
              <Fact label="Route" value={[booking.origin_port, booking.destination_port].filter(Boolean).join(" → ")} />
              <Fact label="ETD" value={booking.etd} />
              <Fact label="ETA" value={booking.eta} />
              <Fact label="Last milestone" value={booking.last_milestone ? `${booking.last_milestone}${booking.last_milestone_at ? ` · ${timeAgo(booking.last_milestone_at)}` : ""}` : null} />
              <Fact label="Read from carrier" value={booking.last_polled_at ? timeAgo(booking.last_polled_at) : null} />
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                <FileCheck2 className="w-3 h-3" />
                B/L {booking.transport_document_reference ?? "—"} · {booking.ebl_status ?? "not drafted"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
                <Scale className="w-3 h-3" />
                VGM {booking.vgm_status ?? "not due"}
                {booking.vgm_submitted_at && ` · ${timeAgo(booking.vgm_submitted_at)}`}
              </span>
              {booking.delivered_at && (
                <span className="inline-flex items-center gap-1 rounded-md border border-[#2ec28a]/50 text-[#2ec28a] px-2 py-1">
                  <Anchor className="w-3 h-3" />
                  Delivered {timeAgo(booking.delivered_at)}
                </span>
              )}
            </div>

            {/* Containers */}
            {(data?.containers ?? []).length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="shipment-containers">
                {(data?.containers ?? []).map((c) => (
                  <div key={c.equipment_reference} className="rounded-lg border border-border bg-secondary p-2 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Box className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="font-mono text-xs font-semibold truncate">{c.equipment_reference}</span>
                      {c.iso_code && <span className="text-[10px] text-muted-foreground">{c.iso_code}</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate">
                      {[c.seal ? `seal ${c.seal}` : null, c.last_event ? EVENT_LABELS[c.last_event] ?? c.last_event : "awaiting first event",
                        c.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Container events
              </p>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No carrier event yet.</p>
              ) : (
                <ol className="max-h-72 overflow-y-auto pr-1">
                  {events.map((e, i) => (
                    <EventRow key={`${e.event_id ?? i}`} e={e} last={i === events.length - 1} />
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
