import { describe, expect, it, vi, afterEach } from "vitest";
import { countdown, fmtNumber, fmtPct, fmtUSD, initials } from "@/lib/utils";
import { inr, rateTitle } from "@/lib/fx";

describe("money formatting", () => {
  it("formats USD with two decimals and a dash for nothing", () => {
    expect(fmtUSD(910)).toBe("$910.00");
    expect(fmtUSD(1234567.891)).toBe("$1,234,567.89");
    expect(fmtUSD(-15.5)).toBe("-$15.50");
    expect(fmtUSD(null)).toBe("—");
    expect(fmtUSD(undefined)).toBe("—");
    expect(fmtUSD(0)).toBe("$0.00");
  });
  it("formats percent and plain numbers", () => {
    expect(fmtPct(12.345)).toBe("12.3%");
    expect(fmtPct(null)).toBe("—");
    expect(fmtNumber(25000)).toBe("25,000");
  });
});

describe("INR beside USD", () => {
  it("shows the supplier's INR figure in Indian grouping", () => {
    expect(inr(910, 96)).toBe("≈ ₹87,360");
    expect(inr(12500, 95.5)).toBe("≈ ₹11,93,750");
  });
  it("shows nothing without a usable number or rate", () => {
    expect(inr(null, 96)).toBeNull();
    expect(inr(910, 0)).toBeNull();
    expect(inr(Number.NaN, 96)).toBeNull();
  });
  it("names where the rate comes from", () => {
    expect(rateTitle(96, "live")).toContain("live rate");
    expect(rateTitle(95.4, "reference")).toContain("reference rate");
    expect(rateTitle(96, "fallback")).toContain("fallback rate");
    expect(rateTitle(null)).toBeUndefined();
  });
});

describe("countdown and initials", () => {
  afterEach(() => vi.useRealTimers());
  it("counts down to a deadline and says expired after it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-19T10:00:00Z"));
    expect(countdown("2026-11-20T13:30:00Z")).toBe("1d 3h");
    expect(countdown("2026-11-19T12:15:00Z")).toBe("2h 15m");
    expect(countdown("2026-11-19T10:20:00Z")).toBe("20m");
    expect(countdown("2026-11-19T09:00:00Z")).toBe("Expired");
    expect(countdown(null)).toBe("—");
  });
  it("takes two initials", () => {
    expect(initials("gulf foods trading")).toBe("GF");
  });
});
