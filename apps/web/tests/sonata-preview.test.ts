import { describe, expect, it } from "bun:test";

import {
  clampPreviewSeek,
  isPassActive,
  PREVIEW_SECONDS,
  sonataTokenIdFromUrl,
} from "../lib/sonata-preview";

describe("sonataTokenIdFromUrl", () => {
  it("reads the token from a Sonata master entry", () => {
    expect(sonataTokenIdFromUrl("/master/midnight-drive")).toBe(
      "midnight-drive",
    );
    expect(sonataTokenIdFromUrl("/master/midnight-drive/")).toBe(
      "midnight-drive",
    );
  });

  it("does not classify normal Infinitunes entries as Sonata tracks", () => {
    expect(
      sonataTokenIdFromUrl("https://www.jiosaavn.com/song/song-name/AbC123"),
    ).toBeNull();
    expect(sonataTokenIdFromUrl("/mastery/not-a-master")).toBeNull();
    expect(sonataTokenIdFromUrl("/master/")).toBeNull();
    expect(sonataTokenIdFromUrl("")).toBeNull();
    expect(sonataTokenIdFromUrl(undefined)).toBeNull();
  });
});

describe("clampPreviewSeek", () => {
  it("caps a preview seek at the free-tier limit", () => {
    expect(clampPreviewSeek(12)).toBe(12);
    expect(clampPreviewSeek(PREVIEW_SECONDS)).toBe(PREVIEW_SECONDS);
    expect(clampPreviewSeek(PREVIEW_SECONDS + 90)).toBe(PREVIEW_SECONDS);
  });

  it("never seeks before the start", () => {
    expect(clampPreviewSeek(-4)).toBe(0);
    expect(clampPreviewSeek(Number.NaN)).toBe(0);
    expect(clampPreviewSeek(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("isPassActive", () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);

  it("counts a pass only while it expires in the future", () => {
    expect(isPassActive(new Date(now + 60_000), now)).toBe(true);
    expect(isPassActive(new Date(now - 1), now)).toBe(false);
    expect(isPassActive(new Date(now), now)).toBe(false);
  });

  it("accepts the serialized forms a cached row can take", () => {
    expect(isPassActive(new Date(now + 60_000).toISOString(), now)).toBe(true);
    expect(isPassActive(now + 60_000, now)).toBe(true);
  });

  it("treats a missing or unparseable expiry as no pass", () => {
    expect(isPassActive(null, now)).toBe(false);
    expect(isPassActive(undefined, now)).toBe(false);
    expect(isPassActive("not-a-date", now)).toBe(false);
  });
});
