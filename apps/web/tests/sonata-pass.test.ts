import { describe, expect, it } from "bun:test";

import { PASS_DURATION_SEC, PASS_PRICE_USDC_MICRO } from "@infinitunes/near";

import {
  formatMicroUsd,
  formatPassDate,
  passDailyPriceCents,
  passDaysRemaining,
  passStatus,
  passStatusLabel,
} from "../lib/sonata-display";

const NOW = new Date("2026-11-07T12:00:00.000Z");
const DAY_MS = 86_400_000;
const PASS_DAYS = PASS_DURATION_SEC / 86_400;

const expiresIn = (ms: number) => new Date(NOW.getTime() + ms);

describe("pass status labelling", () => {
  it("labels a missing cache row as the free tier", () => {
    const status = passStatus(null, NOW);

    expect(status).toBe("none");
    expect(passStatusLabel(status)).toBe("Free tier");
  });

  it("labels a future expiry as active", () => {
    const status = passStatus({ expiresAt: expiresIn(1) }, NOW);

    expect(status).toBe("active");
    expect(passStatusLabel(status)).toBe("Pass active");
  });

  it("treats the expiry instant and anything after it as ended", () => {
    expect(passStatus({ expiresAt: NOW }, NOW)).toBe("expired");
    expect(passStatus({ expiresAt: expiresIn(-1) }, NOW)).toBe("expired");
    expect(passStatusLabel("expired")).toBe("Pass ended");
  });
});

describe("pass days remaining", () => {
  it("shows a fresh 30 day pass as 30 days", () => {
    expect(passDaysRemaining(expiresIn(PASS_DAYS * DAY_MS), NOW)).toBe(30);
  });

  it("counts a started day as a whole day left", () => {
    expect(passDaysRemaining(expiresIn(29 * DAY_MS + 3_600_000), NOW)).toBe(30);
    expect(passDaysRemaining(expiresIn(23 * DAY_MS), NOW)).toBe(23);
    expect(passDaysRemaining(expiresIn(1), NOW)).toBe(1);
  });

  it("never reports negative days after expiry", () => {
    expect(passDaysRemaining(NOW, NOW)).toBe(0);
    expect(passDaysRemaining(expiresIn(-DAY_MS), NOW)).toBe(0);
  });
});

describe("pass price display", () => {
  it("formats the locked micro-USDC price as dollars", () => {
    expect(formatMicroUsd(PASS_PRICE_USDC_MICRO)).toBe("$5.00");
    expect(formatMicroUsd("5000000")).toBe("$5.00");
  });

  it("makes the 30 day arithmetic visible in whole cents", () => {
    expect(passDailyPriceCents(PASS_PRICE_USDC_MICRO, PASS_DAYS)).toBe(17);
    expect(passDailyPriceCents("3000000", PASS_DAYS)).toBe(10);
    expect(passDailyPriceCents("1000000", 3)).toBe(33);
    expect(passDailyPriceCents(PASS_PRICE_USDC_MICRO, 0)).toBe(0);
  });

  it("formats the expiry as a stable UTC date", () => {
    expect(formatPassDate(new Date("2026-12-01T00:00:00.000Z"))).toBe(
      "December 1, 2026",
    );
  });
});
