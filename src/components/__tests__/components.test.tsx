import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { EscrowStatusChip } from "@/components/EscrowStatusChip";
import { QueryState } from "@/components/QueryState";

afterEach(() => cleanup());

describe("EscrowStatusChip", () => {
  it("shows provider and status", () => {
    render(<EscrowStatusChip deal={{ escrow_provider: "tazapay", escrow_provider_source: "buyer", escrow_status: "PARTIALLY_FUNDED", escrow_status_detail: "30,000 of 50,000 received" } as never} />);
    const chip = screen.getByTestId("escrow-status");
    expect(chip.textContent).toBe("Tazapay · Part-funded");
    expect(chip.getAttribute("title")).toBe("30,000 of 50,000 received");
    expect(chip.dataset.escrowStatus).toBe("PARTIALLY_FUNDED");
  });
  it("before the escrow opens: who chose the provider", () => {
    render(<EscrowStatusChip deal={{ escrow_provider: "escrow_com", escrow_provider_source: "buyer", escrow_status: null, escrow_status_detail: null } as never} />);
    expect(screen.getByTestId("escrow-status").textContent).toBe("Escrow.com · chosen by buyer");
  });
  it("nothing chosen yet", () => {
    render(<EscrowStatusChip deal={{ escrow_provider: null, escrow_provider_source: null, escrow_status: null, escrow_status_detail: null } as never} />);
    expect(screen.getByTestId("escrow-status").textContent).toBe("Escrow · not chosen yet");
  });
});

describe("QueryState", () => {
  it("loading, error with retry, empty, then the content", () => {
    const retry = vi.fn();
    const { rerender } = render(<QueryState isLoading><p>rows</p></QueryState>);
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(<QueryState isError onRetry={retry}><p>rows</p></QueryState>);
    expect(screen.getByText("Service unavailable")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
    rerender(<QueryState isEmpty emptyText="No deals yet."><p>rows</p></QueryState>);
    expect(screen.getByText("No deals yet.")).toBeTruthy();
    rerender(<QueryState><p>rows</p></QueryState>);
    expect(screen.getByText("rows")).toBeTruthy();
  });
});
