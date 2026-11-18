import { describe, expect, it } from "vitest";
import { approvalStatusLabel, approvalStatusVariant, isSuperseded, supersededText, SUPERSEDED_BY } from "@/lib/approvals";
import { escrowProviderLabel, showsEscrow, ESCROW_STATUS_META } from "@/lib/escrow";

describe("gate status", () => {
  it("labels and colours each status", () => {
    expect(approvalStatusLabel({ status: "PENDING" })).toBe("Pending");
    expect(approvalStatusVariant({ status: "PENDING" })).toBe("warning");
    expect(approvalStatusLabel({ status: "AUTO_APPROVED" })).toBe("Approved");
    expect(approvalStatusVariant({ status: "REJECTED" })).toBe("destructive");
    expect(approvalStatusLabel({ status: "TIMED_OUT" })).toBe("Timed Out");
  });
  it("a superseded gate is closed, not rejected", () => {
    const g = { status: "REJECTED", resolved_by: SUPERSEDED_BY, action: "CONFIRM_MATCH" };
    expect(isSuperseded(g)).toBe(true);
    expect(approvalStatusLabel(g)).toBe("Closed");
    expect(approvalStatusVariant(g)).toBe("secondary");
    expect(supersededText(g)).toBe("Closed — another pair was confirmed");
    expect(supersededText({ ...g, action: "DISPATCH_RFQ" })).toBe("Closed — no longer needed");
  });
});

describe("escrow line", () => {
  it("names the provider", () => {
    expect(escrowProviderLabel("tazapay")).toBe("Tazapay");
    expect(escrowProviderLabel("escrow_com")).toBe("Escrow.com");
    expect(escrowProviderLabel("some_bank")).toBe("some bank");
    expect(escrowProviderLabel(null)).toBeNull();
  });
  it("shows once money is about to be held", () => {
    expect(showsEscrow({ status: "NEGOTIATING", escrow_provider: null, escrow_status: null } as never)).toBe(false);
    expect(showsEscrow({ status: "PI_SENT", escrow_provider: null, escrow_status: null } as never)).toBe(true);
    expect(showsEscrow({ status: "MATCHING", escrow_provider: "tazapay", escrow_status: null } as never)).toBe(true);
  });
  it("every escrow status has a label and a tone", () => {
    for (const meta of Object.values(ESCROW_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(3);
      expect(["ok", "warn", "danger", "info", "muted"]).toContain(meta.tone);
    }
  });
});
