import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mutateAsync = vi.fn();
vi.mock("@/api/hooks", async (orig) => ({ ...(await orig<object>()), useResolveApproval: () => ({ mutateAsync, isPending: false }), useDealLedger: () => ({ data: undefined }) }));
vi.mock("@/lib/auth", async (orig) => ({ ...(await orig<object>()), useAuth: () => ({ user: { email: "cfo@portless.in" } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { toast } from "sonner";
import { HitlApprovalCard } from "@/components/HitlApprovalCard";

afterEach(() => { cleanup(); mutateAsync.mockReset(); });

const base = {
  approval_id: "APR-1", deal_id: "DEAL-ABCDEFGHIJKL", action: "RELEASE_SUPPLIER_PAYOUT", status: "PENDING",
  autonomy_level: "L0", summary: "Pay the supplier 18,000 USD", financial_impact_usd: 18000, risk_flags: [],
  created_at: "2026-11-19T08:00:00Z", expires_at: null, callback_payload: {},
};

describe("HitlApprovalCard", () => {
  it("four-eyes gate: shows signatures and asks for a different second operator", () => {
    render(<HitlApprovalCard approval={{ ...base, required_approvals: 2, approvals: [{ approved_by: "founder@portless.in", approved_at: "2026-11-19T09:00:00Z" }] } as never} />);
    expect(screen.getByText("1 of 2 approvals")).toBeTruthy();
    expect(screen.getByText(/needs a second, different operator/)).toBeTruthy();
    expect(screen.getByText("Countersign")).toBeTruthy();
  });

  it("approve sends the decision and confirms", async () => {
    mutateAsync.mockResolvedValue({ status: "APPROVED" });
    const done = vi.fn();
    render(<HitlApprovalCard approval={base as never} onResolved={done} />);
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ approvalId: "APR-1", payload: { decision: "APPROVE", resolved_by: "cfo@portless.in" } });
    expect(toast.success).toHaveBeenCalled();
  });

  it("a 409 from another operator's decision refreshes instead of failing", async () => {
    mutateAsync.mockRejectedValue({ response: { status: 409, data: { detail: "decided by someone else at the same moment" } } });
    const done = vi.fn();
    render(<HitlApprovalCard approval={base as never} onResolved={done} />);
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("Already resolved — refreshing"));
    expect(done).toHaveBeenCalled();
  });

  it("a refusal from the network allowlist is shown, not swallowed", async () => {
    mutateAsync.mockRejectedValue({ response: { status: 403, data: { detail: "money gates can be approved only from the approved networks" } } });
    render(<HitlApprovalCard approval={base as never} />);
    fireEvent.click(screen.getByText("Approve"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
