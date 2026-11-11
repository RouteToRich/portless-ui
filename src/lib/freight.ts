import type { FreightStatus } from "@/api/types";
import { TONE_CLASS } from "@/lib/qc";

type Tone = keyof typeof TONE_CLASS;

/** Mirrors shared/orchestration/freight_status.py::LABELS. */
export const FREIGHT_STATUS_META: Record<FreightStatus, { label: string; tone: Tone }> = {
  NOT_BOOKED:        { label: "Not booked",          tone: "warn" },
  BOOKING_FAILED:    { label: "Booking failed",      tone: "danger" },
  BOOKING_REQUESTED: { label: "Booking requested",   tone: "info" },
  BOOKING_REJECTED:  { label: "Booking rejected",    tone: "danger" },
  BOOKING_CONFIRMED: { label: "Booking confirmed",   tone: "info" },
  DOCS_PENDING:      { label: "VGM / B/L pending",   tone: "warn" },
  BL_ISSUED:         { label: "B/L issued",          tone: "info" },
  LOADED:            { label: "Loaded",              tone: "info" },
  DEPARTED:          { label: "Sailed",              tone: "info" },
  ARRIVED:           { label: "Arrived",             tone: "ok" },
  DISCHARGED:        { label: "Discharged",          tone: "ok" },
  DELIVERED:         { label: "Delivered",           tone: "ok" },
};

/** DCSA event codes in words (Maersk Track & Trace). */
export const EVENT_LABELS: Record<string, string> = {
  GTIN: "Gate in at terminal",
  LOAD: "Loaded on vessel",
  DEPA: "Vessel departed",
  ARRI: "Vessel arrived",
  DISC: "Discharged from vessel",
  GTOT: "Gate out to consignee",
  STUF: "Stuffed",
  STRP: "Stripped",
  PICK: "Picked up",
  DROP: "Delivered to consignee",
  RMVD: "Removed",
  INSP: "Inspected",
};

/** The voyage as steps, for the tracking progress bar. */
export const VOYAGE_STEPS: { key: FreightStatus; label: string }[] = [
  { key: "BOOKING_CONFIRMED", label: "Booked" },
  { key: "BL_ISSUED", label: "B/L" },
  { key: "LOADED", label: "Loaded" },
  { key: "DEPARTED", label: "Sailed" },
  { key: "ARRIVED", label: "Arrived" },
  { key: "DELIVERED", label: "Delivered" },
];

const ORDER: FreightStatus[] = [
  "NOT_BOOKED", "BOOKING_FAILED", "BOOKING_REQUESTED", "BOOKING_REJECTED", "BOOKING_CONFIRMED",
  "DOCS_PENDING", "BL_ISSUED", "LOADED", "DEPARTED", "ARRIVED", "DISCHARGED", "DELIVERED",
];

/** Index of the furthest voyage step reached (−1 before the booking is confirmed). */
export function voyageStep(status: FreightStatus | null | undefined): number {
  if (!status) return -1;
  const rank = ORDER.indexOf(status);
  let reached = -1;
  VOYAGE_STEPS.forEach((step, i) => {
    if (rank >= ORDER.indexOf(step.key)) reached = i;
  });
  if (status === "DOCS_PENDING") reached = 0;
  return reached;
}
