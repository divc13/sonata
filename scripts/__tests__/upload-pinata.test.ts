import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildMetadata,
  loadDemoSongs,
  loadExistingManifest,
  MANIFEST_PATH,
  metadataHash,
  planSong,
  resolvePublicFile,
  sha256Base64,
  sha256Hex,
  uploadAll,
  validateManifest,
  type LocalFile,
  type ManifestSong,
} from "../upload-pinata";

const ROOT = join(import.meta.dir, "..", "..");

const song: ManifestSong = {
  tokenId: "midnight-drive",
  title: "Midnight Drive",
  artistName: "Nadia Vale",
  artistHandle: "@nadia",
  artistAccountId: "nadia-sonata.testnet",
  genre: "Synthwave",
  releaseYear: 2026,
  durationSec: 90,
  coverUrl: "/demo/covers/midnight-drive.webp",
  audioUrl: "/demo/audio/midnight-drive.m4a",
  description: "A wide-open synthwave cruise.",
};

const cover: LocalFile = {
  path: song.coverUrl,
  abs: "/tmp/midnight-drive.webp",
  size: 10,
  sha256: "a".repeat(64),
  sha256Base64: "cover-hash-base64",
};

const audio: LocalFile = {
  path: song.audioUrl,
  abs: "/tmp/midnight-drive.m4a",
  size: 20,
  sha256: "b".repeat(64),
  sha256Base64: "audio-hash-base64",
};

function completeEntry(metadataCid = "bafymetadata") {
  const metadata = buildMetadata(song, "bafycover", "bafyaudio");
  return {
    entry: {
      tokenId: song.tokenId,
      title: song.title,
      coverCid: "bafycover",
      audioCid: "bafyaudio",
      metadataCid,
      metadataSha256: metadataHash(metadata),
      files: {
        cover: { path: cover.path, sha256: cover.sha256 },
        audio: { path: audio.path, sha256: audio.sha256 },
      },
    },
    metadata,
  };
}

describe("validateManifest", () => {
  it("accepts the committed demo manifest", () => {
    const raw = JSON.parse(
      readFileSync(join(ROOT, MANIFEST_PATH), "utf8"),
    ) as unknown;
    const songs = validateManifest(raw);
    expect(songs).toHaveLength(12);
    expect(new Set(songs.map((item) => item.tokenId)).size).toBe(12);
    expect(songs[0]?.tokenId).toBe("midnight-drive");
  });

  it("rejects a non-array manifest", () => {
    expect(() => validateManifest({ songs: [] })).toThrow("JSON array");
  });

  it("rejects an empty manifest", () => {
    expect(() => validateManifest([])).toThrow("empty");
  });

  it("rejects invalid and duplicate token ids", () => {
    expect(() =>
      validateManifest([{ ...song, tokenId: "Midnight_Drive" }]),
    ).toThrow("lowercase slug");
    expect(() => validateManifest([{ ...song, tokenId: "platform" }])).toThrow(
      "reserved",
    );
    expect(() => validateManifest([song, { ...song }])).toThrow(
      "Duplicate tokenId",
    );
  });

  it("rejects missing text fields", () => {
    expect(() => validateManifest([{ ...song, description: "  " }])).toThrow(
      '"description" must be a non-empty string',
    );
  });

  it("rejects unsupported media extensions", () => {
    expect(() =>
      validateManifest([{ ...song, coverUrl: "/demo/covers/a.gif" }]),
    ).toThrow("unsupported extension");
  });

  it("rejects media paths that escape the public directory", () => {
    expect(() =>
      validateManifest([{ ...song, audioUrl: "/demo/../secret.m4a" }]),
    ).toThrow('must not contain ".."');
    expect(() => resolvePublicFile("/tmp/public", "/../secret.webp")).toThrow(
      'must not contain ".."',
    );
    expect(() => resolvePublicFile("/tmp/public", "relative.webp")).toThrow(
      'must start with "/"',
    );
  });
});

describe("hashing", () => {
  it("matches the known sha256 vector for abc", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Base64("abc")).toBe(
      "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
    );
  });

  it("hashes every committed demo file without the network", async () => {
    const prepared = await loadDemoSongs(ROOT);
    expect(prepared).toHaveLength(12);
    for (const { song: item, files } of prepared) {
      expect(item.tokenId.length).toBeGreaterThan(0);
      expect(files.cover.size).toBeGreaterThan(0);
      expect(files.audio.size).toBeGreaterThan(0);
      expect(files.cover.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(files.audio.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(files.audio.sha256Base64.length).toBeGreaterThan(0);
    }
  });
});

describe("buildMetadata", () => {
  it("points image and animation_url at ipfs:// CIDs", () => {
    const metadata = buildMetadata(song, "bafycover", "bafyaudio");
    expect(metadata.name).toBe("Midnight Drive");
    expect(metadata.description).toBe(song.description);
    expect(metadata.image).toBe("ipfs://bafycover");
    expect(metadata.animation_url).toBe("ipfs://bafyaudio");
    expect(metadata.properties).toMatchObject({
      token_id: "midnight-drive",
      artist: "Nadia Vale",
      artist_handle: "@nadia",
      artist_account: "nadia-sonata.testnet",
      genre: "Synthwave",
      release_year: 2026,
      duration_sec: 90,
      cover: "ipfs://bafycover",
      audio: "ipfs://bafyaudio",
      standard: "sonata",
      version: "1.0.0",
    });
  });
});

describe("planSong", () => {
  it("uploads everything when there is no previous manifest", () => {
    const plan = planSong(song, { cover, audio });
    expect(plan.coverAction).toBe("upload");
    expect(plan.audioAction).toBe("upload");
    expect(plan.metadataAction).toBe("pin");
    expect(plan.metadata).toBeUndefined();
  });

  it("skips unchanged files and metadata", () => {
    const { entry } = completeEntry();
    const plan = planSong(song, { cover, audio }, entry);
    expect(plan.coverAction).toBe("skip");
    expect(plan.audioAction).toBe("skip");
    expect(plan.metadataAction).toBe("skip");
    expect(plan.coverCid).toBe(entry.coverCid);
    expect(plan.metadataCid).toBe(entry.metadataCid);
  });

  it("re-uploads only the file whose hash changed", () => {
    const { entry } = completeEntry();
    const changedAudio = { ...audio, sha256: "c".repeat(64) };
    const plan = planSong(song, { cover, audio: changedAudio }, entry);
    expect(plan.coverAction).toBe("skip");
    expect(plan.audioAction).toBe("upload");
    expect(plan.audioCid).toBeUndefined();
    expect(plan.metadataAction).toBe("pin");
  });

  it("re-pins metadata when the recorded metadata hash is stale", () => {
    const { entry } = completeEntry();
    const plan = planSong(
      song,
      { cover, audio },
      { ...entry, metadataSha256: "0".repeat(64) },
    );
    expect(plan.coverAction).toBe("skip");
    expect(plan.audioAction).toBe("skip");
    expect(plan.metadataAction).toBe("pin");
    expect(plan.metadataCid).toBeUndefined();
  });
});

describe("uploadAll", () => {
  it("writes the IPFS manifest and skips everything on a re-run", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sonata-pinata-"));
    const coverBytes = Buffer.from("cover-bytes");
    const audioBytes = Buffer.from("audio-bytes");
    const coverPath = join(dir, "midnight-drive.webp");
    const audioPath = join(dir, "midnight-drive.m4a");
    const outputPath = join(dir, "manifest.ipfs.json");
    writeFileSync(coverPath, coverBytes);
    writeFileSync(audioPath, audioBytes);

    const coverFile: LocalFile = {
      path: song.coverUrl,
      abs: coverPath,
      size: coverBytes.length,
      sha256: sha256Hex(coverBytes),
      sha256Base64: sha256Base64(coverBytes),
    };
    const audioFile: LocalFile = {
      path: song.audioUrl,
      abs: audioPath,
      size: audioBytes.length,
      sha256: sha256Hex(audioBytes),
      sha256Base64: sha256Base64(audioBytes),
    };

    const realFetch = globalThis.fetch;
    const realLog = console.log;
    let calls = 0;
    // No network: both Pinata endpoints answer with sequential fake CIDs.
    globalThis.fetch = (async (input: unknown) => {
      calls++;
      const url = String(input);
      const hash = url.endsWith("pinFileToIPFS")
        ? `bafyfile${calls}`
        : `bafymeta${calls}`;
      return new Response(JSON.stringify({ IpfsHash: hash }), { status: 200 });
    }) as unknown as typeof fetch;
    console.log = () => {};

    try {
      const firstPlan = planSong(song, { cover: coverFile, audio: audioFile });
      await uploadAll(
        [firstPlan],
        new Map(),
        "https://gateway.example/ipfs",
        "fake.jwt",
        outputPath,
      );
      expect(calls).toBe(3);

      const output = JSON.parse(readFileSync(outputPath, "utf8"));
      expect(output.schema).toBe("sonata-demo-ipfs@1");
      expect(output.songs).toHaveLength(1);
      const entry = output.songs[0];
      expect(entry.coverCid).toBe("bafyfile1");
      expect(entry.audioCid).toBe("bafyfile2");
      expect(entry.metadataCid).toBe("bafymeta3");
      expect(entry.metadataUri).toBe("ipfs://bafymeta3");
      expect(entry.gatewayUrl).toBe("https://gateway.example/ipfs/bafymeta3");
      expect(entry.files.audio.sha256).toBe(audioFile.sha256);
      expect(entry.onChain.mediaHash).toBe(audioFile.sha256Base64);
      expect(entry.onChain.referenceHash).toBe(
        sha256Base64(JSON.stringify(entry.metadata)),
      );

      const existing = await loadExistingManifest(outputPath);
      const rerunPlan = planSong(
        song,
        { cover: coverFile, audio: audioFile },
        existing.get(song.tokenId),
      );
      expect(rerunPlan.coverAction).toBe("skip");
      expect(rerunPlan.audioAction).toBe("skip");
      expect(rerunPlan.metadataAction).toBe("skip");

      await uploadAll(
        [rerunPlan],
        existing,
        "https://gateway.example/ipfs",
        "fake.jwt",
        outputPath,
      );
      expect(calls).toBe(3);
    } finally {
      globalThis.fetch = realFetch;
      console.log = realLog;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
