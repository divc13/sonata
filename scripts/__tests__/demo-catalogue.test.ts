import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

import {
  DEMO_ARTISTS,
  DEMO_LISTINGS,
  DEMO_SONGS,
} from "../../packages/db/src/sonata-seed";

type CatalogueSong = {
  tokenId: string;
  title: string;
  artistAccountId: string;
  artistName: string;
  artistHandle: string;
  media: string;
  description: string;
};

type Catalogue = {
  songs: CatalogueSong[];
  listings: { tokenId: string; price: string }[];
};

const catalogue = JSON.parse(
  readFileSync(new URL("../demo-catalogue.json", import.meta.url), "utf8"),
) as Catalogue;

describe("scripts/demo-catalogue.json", () => {
  it("matches the song metadata in the demo seed", () => {
    expect(catalogue.songs).toHaveLength(DEMO_SONGS.length);

    DEMO_SONGS.forEach((song, index) => {
      const entry = catalogue.songs[index];
      const artist = DEMO_ARTISTS[song.artist];

      expect(entry.tokenId).toBe(song.tokenId);
      expect(entry.title).toBe(song.title);
      expect(entry.description).toBe(song.description);
      expect(entry.artistAccountId).toBe(artist.accountId);
      expect(entry.artistName).toBe(artist.name);
      expect(entry.artistHandle).toBe(artist.handle);
      expect(entry.media).toBe(`/demo/audio/${song.tokenId}.m4a`);
    });
  });

  it("matches the resale listings in the demo seed", () => {
    expect(catalogue.listings).toEqual(
      DEMO_LISTINGS.map(({ tokenId, priceUsdc }) => ({
        tokenId,
        price: priceUsdc,
      })),
    );
  });
});
