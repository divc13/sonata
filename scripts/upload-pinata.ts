/**
 * Upload the Sonata demo masters and covers to Pinata and pin one NFT
 * metadata JSON per song.
 *
 * Default is a dry run: it validates `apps/web/public/demo/manifest.json`,
 * hashes every cover/audio file, compares against an existing
 * `manifest.ipfs.json`, prints the work, and touches no network and no
 * credentials.
 *
 *   bun scripts/upload-pinata.ts                 # dry run
 *   bun scripts/upload-pinata.ts --dry-run       # same
 *   PINATA_JWT=... bun scripts/upload-pinata.ts --upload
 *
 * `--upload` uses Pinata's legacy pinning API (`pinFileToIPFS`,
 * `pinJSONToIPFS`). The output file records the CIDs, the sha256 of each
 * local file, and the exact metadata JSON, so re-runs skip unchanged pins.
 * The committed manifest is never modified, and the local demo keeps working
 * from the files under `apps/web/public/demo`.
 *
 * See `ops/pinata.md`. The JWT is server-side only, never logged and never
 * committed.
 */
import { createHash } from "node:crypto";
import { readFile, rename, stat, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";

export const MANIFEST_PATH = "apps/web/public/demo/manifest.json";
export const IPFS_MANIFEST_PATH = "apps/web/public/demo/manifest.ipfs.json";
export const PUBLIC_DIR = "apps/web/public";
export const IPFS_SCHEMA = "sonata-demo-ipfs@1";
export const DEFAULT_GATEWAY = "https://gateway.pinata.cloud/ipfs";
export const PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
export const PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

const ROOT = dirname(import.meta.dir);
const PIN_FILE_TIMEOUT_MS = 120_000;
const PIN_JSON_TIMEOUT_MS = 60_000;
const RESERVED_SLUGS = new Set([
  "platform",
  "market",
  "usdc",
  "oracle",
  "masters",
  "admin",
]);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HANDLE_RE = /^@[a-z0-9][a-z0-9._-]{1,31}$/i;
const COVER_EXTENSIONS = new Set([".webp", ".png", ".jpg", ".jpeg"]);
const AUDIO_EXTENSIONS = new Set([".m4a", ".mp3", ".wav"]);
const COVER_MIME_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};
const AUDIO_MIME_TYPES: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

export type ManifestSong = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  artistAccountId: string;
  genre: string;
  releaseYear: number;
  durationSec: number;
  coverUrl: string;
  audioUrl: string;
  description: string;
};

export type LocalFile = {
  /** Site-relative URL from the manifest, e.g. `/demo/covers/slow-arc.webp`. */
  path: string;
  /** Absolute path on disk; only used by the uploader. */
  abs: string;
  size: number;
  /** Lowercase hex, recorded in `manifest.ipfs.json`. */
  sha256: string;
  /** Base64 sha256 of the same bytes, matching the contract's `media_hash`. */
  sha256Base64: string;
};

export type SongFiles = {
  cover: LocalFile;
  audio: LocalFile;
};

export type NftMetadata = {
  name: string;
  description: string;
  image: string;
  animation_url: string;
  properties: {
    token_id: string;
    artist: string;
    artist_handle: string;
    artist_account: string;
    genre: string;
    release_year: number;
    duration_sec: number;
    cover: string;
    audio: string;
    standard: "sonata";
    version: "1.0.0";
  };
};

export type IpfsFileEntry = {
  path: string;
  sha256: string;
};

/**
 * One song in `manifest.ipfs.json`. During a partial upload some CID fields
 * are still absent; a complete entry has all of them.
 */
export type IpfsSongEntry = {
  tokenId: string;
  title: string;
  coverCid?: string;
  audioCid?: string;
  metadataCid?: string;
  metadataUri?: string;
  gatewayUrl?: string;
  coverGatewayUrl?: string;
  audioGatewayUrl?: string;
  metadataSha256?: string;
  metadata?: NftMetadata;
  files: {
    cover: IpfsFileEntry;
    audio: IpfsFileEntry;
  };
  onChain?: {
    media: string;
    reference: string;
    mediaHash: string;
    referenceHash: string;
  };
};

export type IpfsManifest = {
  schema: typeof IPFS_SCHEMA;
  gateway: string;
  songs: IpfsSongEntry[];
};

export type SongPlan = {
  song: ManifestSong;
  files: SongFiles;
  coverCid?: string;
  audioCid?: string;
  coverAction: "skip" | "upload";
  audioAction: "skip" | "upload";
  metadata?: NftMetadata;
  metadataSha256?: string;
  metadataCid?: string;
  metadataAction: "skip" | "pin";
};

export class PinataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PinataError";
  }
}

// --- Manifest validation --------------------------------------------------

function fail(message: string): never {
  throw new PinataError(message);
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label}: "${key}" must be a non-empty string`);
  }
  return value.trim();
}

function requireInteger(
  record: Record<string, unknown>,
  key: string,
  label: string,
  min: number,
  max: number,
): number {
  const value = record[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    fail(`${label}: "${key}" must be an integer between ${min} and ${max}`);
  }
  return value;
}

function checkMediaUrl(
  url: string,
  label: string,
  extensions: Set<string>,
): void {
  if (!url.startsWith("/")) {
    fail(
      `${label} must be a site-relative URL starting with "/" (got "${url}")`,
    );
  }
  if (url.split("/").includes("..")) {
    fail(`${label} must not contain ".." (got "${url}")`);
  }
  const ext = extname(url).toLowerCase();
  if (!extensions.has(ext)) {
    fail(
      `${label} has unsupported extension "${ext || "(none)"}" ` +
        `(expected one of ${[...extensions].join(", ")})`,
    );
  }
}

/**
 * Validate the structure of the committed demo manifest. Does not touch the
 * filesystem or the network.
 */
export function validateManifest(value: unknown): ManifestSong[] {
  if (!Array.isArray(value)) {
    fail(
      `Manifest must be a JSON array (got ${value === null ? "null" : typeof value})`,
    );
  }
  if (value.length === 0) {
    fail("Manifest is empty");
  }

  const seen = new Set<string>();
  return value.map((item, index) => {
    const label = `Song at index ${index}`;
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      fail(`${label} must be a JSON object`);
    }
    const record = item as Record<string, unknown>;

    const tokenId = requireString(record, "tokenId", label);
    if (tokenId.length < 3 || tokenId.length > 40 || !SLUG_RE.test(tokenId)) {
      fail(
        `${label}: "tokenId" must be a lowercase slug (a-z, 0-9, "-"), ` +
          `3-40 chars, no leading/trailing hyphen (got "${tokenId}")`,
      );
    }
    if (RESERVED_SLUGS.has(tokenId)) {
      fail(`${label}: "tokenId" "${tokenId}" is reserved by the contract`);
    }
    if (seen.has(tokenId)) {
      fail(`Duplicate tokenId "${tokenId}"`);
    }
    seen.add(tokenId);

    const title = requireString(record, "title", label);
    const artistName = requireString(record, "artistName", label);
    const artistHandle = requireString(record, "artistHandle", label);
    if (!HANDLE_RE.test(artistHandle)) {
      fail(
        `${label}: "artistHandle" must look like "@name" (got "${artistHandle}")`,
      );
    }
    const artistAccountId = requireString(record, "artistAccountId", label);
    if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(artistAccountId)) {
      fail(`${label}: "artistAccountId" is not a valid NEAR account id`);
    }
    const genre = requireString(record, "genre", label);
    const releaseYear = requireInteger(
      record,
      "releaseYear",
      label,
      1900,
      2200,
    );
    const durationSec = requireInteger(record, "durationSec", label, 1, 3_600);
    const coverUrl = requireString(record, "coverUrl", label);
    const audioUrl = requireString(record, "audioUrl", label);
    const description = requireString(record, "description", label);

    checkMediaUrl(coverUrl, `${label} "coverUrl"`, COVER_EXTENSIONS);
    checkMediaUrl(audioUrl, `${label} "audioUrl"`, AUDIO_EXTENSIONS);

    return {
      tokenId,
      title,
      artistName,
      artistHandle,
      artistAccountId,
      genre,
      releaseYear,
      durationSec,
      coverUrl,
      audioUrl,
      description,
    };
  });
}

// --- Hashing and files ----------------------------------------------------

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Base64(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("base64");
}

/**
 * Resolve a manifest URL under `publicDir` and refuse anything that escapes
 * it. The manifest is committed data, but the guard keeps a hand-edited path
 * from reading an arbitrary local file.
 */
export function resolvePublicFile(publicDir: string, url: string): string {
  if (!url.startsWith("/")) {
    fail(`Media URL must start with "/" (got "${url}")`);
  }
  if (url.split("/").includes("..")) {
    fail(`Media URL must not contain ".." (got "${url}")`);
  }
  const abs = resolve(publicDir, `.${url}`);
  const rel = relative(publicDir, abs);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    fail(`Media URL escapes the public directory: "${url}"`);
  }
  return abs;
}

async function prepareLocalFile(
  publicDir: string,
  url: string,
  label: string,
): Promise<LocalFile> {
  const abs = resolvePublicFile(publicDir, url);
  const info = await stat(abs).catch(() =>
    fail(`${label} is missing on disk: ${url}`),
  );
  if (!info.isFile()) {
    fail(`${label} is not a file: ${url}`);
  }
  if (info.size === 0) {
    fail(`${label} is empty: ${url}`);
  }
  const bytes = await readFile(abs);
  return {
    path: url,
    abs,
    size: info.size,
    sha256: sha256Hex(bytes),
    sha256Base64: sha256Base64(bytes),
  };
}

/** Validate the manifest and every referenced local file, in manifest order. */
export async function loadDemoSongs(
  root = ROOT,
): Promise<Array<{ song: ManifestSong; files: SongFiles }>> {
  const manifestPath = join(root, MANIFEST_PATH);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    fail(
      `Cannot read ${MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const songs = validateManifest(parsed);
  const publicDir = join(root, PUBLIC_DIR);

  return Promise.all(
    songs.map(async (song) => ({
      song,
      files: {
        cover: await prepareLocalFile(
          publicDir,
          song.coverUrl,
          `${song.tokenId} cover`,
        ),
        audio: await prepareLocalFile(
          publicDir,
          song.audioUrl,
          `${song.tokenId} audio`,
        ),
      },
    })),
  );
}

// --- Metadata and planning ------------------------------------------------

export function buildMetadata(
  song: ManifestSong,
  coverCid: string,
  audioCid: string,
): NftMetadata {
  return {
    name: song.title,
    description: song.description,
    image: `ipfs://${coverCid}`,
    animation_url: `ipfs://${audioCid}`,
    properties: {
      token_id: song.tokenId,
      artist: song.artistName,
      artist_handle: song.artistHandle,
      artist_account: song.artistAccountId,
      genre: song.genre,
      release_year: song.releaseYear,
      duration_sec: song.durationSec,
      cover: `ipfs://${coverCid}`,
      audio: `ipfs://${audioCid}`,
      standard: "sonata",
      version: "1.0.0",
    },
  };
}

export function metadataHash(metadata: NftMetadata): string {
  return sha256Hex(JSON.stringify(metadata));
}

function reuseCid(
  existing: IpfsSongEntry | undefined,
  kind: "cover" | "audio",
  sha256: string,
): string | undefined {
  if (!existing) return undefined;
  if (existing.files?.[kind]?.sha256 !== sha256) return undefined;
  const cid = kind === "cover" ? existing.coverCid : existing.audioCid;
  return typeof cid === "string" && cid.length > 0 ? cid : undefined;
}

/**
 * Decide what must be uploaded for one song. A CID is reused only when the
 * local file hash is unchanged and the prior CID exists. Metadata is reused
 * only when both media CIDs are known and the canonical metadata hash matches
 * the one recorded in `manifest.ipfs.json`.
 */
export function planSong(
  song: ManifestSong,
  files: SongFiles,
  existing?: IpfsSongEntry,
): SongPlan {
  const coverCid = reuseCid(existing, "cover", files.cover.sha256);
  const audioCid = reuseCid(existing, "audio", files.audio.sha256);

  let metadata: NftMetadata | undefined;
  let metadataSha256: string | undefined;
  let metadataCid: string | undefined;

  if (coverCid && audioCid) {
    metadata = buildMetadata(song, coverCid, audioCid);
    metadataSha256 = metadataHash(metadata);
    if (existing?.metadataCid && existing.metadataSha256 === metadataSha256) {
      metadataCid = existing.metadataCid;
    }
  }

  return {
    song,
    files,
    coverCid,
    audioCid,
    coverAction: coverCid ? "skip" : "upload",
    audioAction: audioCid ? "skip" : "upload",
    metadata,
    metadataSha256,
    metadataCid,
    metadataAction: metadataCid ? "skip" : "pin",
  };
}

// --- Existing output ------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Read `manifest.ipfs.json` when present. Missing file is not an error; a
 * malformed file is, so a broken state file is never silently re-pinned.
 */
export async function loadExistingManifest(
  path = join(ROOT, IPFS_MANIFEST_PATH),
): Promise<Map<string, IpfsSongEntry>> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(
      `Cannot parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !isRecord(parsed) ||
    parsed.schema !== IPFS_SCHEMA ||
    !Array.isArray(parsed.songs)
  ) {
    fail(
      `${path} is not a ${IPFS_SCHEMA} manifest. ` +
        "Delete it and re-run --upload, or restore a valid copy.",
    );
  }

  const entries = new Map<string, IpfsSongEntry>();
  for (const raw of parsed.songs) {
    if (!isRecord(raw)) continue;
    const tokenId = readOptionalString(raw, "tokenId");
    if (!tokenId) continue;
    const files = isRecord(raw.files) ? raw.files : {};
    const cover = isRecord(files.cover) ? files.cover : {};
    const audio = isRecord(files.audio) ? files.audio : {};
    const entry: IpfsSongEntry = {
      tokenId,
      title: readOptionalString(raw, "title") ?? tokenId,
      coverCid: readOptionalString(raw, "coverCid"),
      audioCid: readOptionalString(raw, "audioCid"),
      metadataCid: readOptionalString(raw, "metadataCid"),
      metadataUri: readOptionalString(raw, "metadataUri"),
      gatewayUrl: readOptionalString(raw, "gatewayUrl"),
      coverGatewayUrl: readOptionalString(raw, "coverGatewayUrl"),
      audioGatewayUrl: readOptionalString(raw, "audioGatewayUrl"),
      metadataSha256: readOptionalString(raw, "metadataSha256"),
      files: {
        cover: {
          path: readOptionalString(cover, "path") ?? "",
          sha256: readOptionalString(cover, "sha256") ?? "",
        },
        audio: {
          path: readOptionalString(audio, "path") ?? "",
          sha256: readOptionalString(audio, "sha256") ?? "",
        },
      },
    };
    if (isRecord(raw.metadata)) {
      entry.metadata = raw.metadata as NftMetadata;
    }
    if (isRecord(raw.onChain)) {
      const media = readOptionalString(raw.onChain, "media");
      const reference = readOptionalString(raw.onChain, "reference");
      const mediaHash = readOptionalString(raw.onChain, "mediaHash");
      const referenceHash = readOptionalString(raw.onChain, "referenceHash");
      if (media && reference && mediaHash && referenceHash) {
        entry.onChain = { media, reference, mediaHash, referenceHash };
      }
    }
    entries.set(tokenId, entry);
  }
  return entries;
}

// --- Output ---------------------------------------------------------------

function gatewayFor(base: string, cid: string): string {
  return `${base}/${cid}`;
}

function finalizeEntry(
  song: ManifestSong,
  files: SongFiles,
  coverCid: string,
  audioCid: string,
  gateway: string,
  metadata?: NftMetadata,
  metadataCid?: string,
  metadataSha256?: string,
): IpfsSongEntry {
  const entry: IpfsSongEntry = {
    tokenId: song.tokenId,
    title: song.title,
    coverCid,
    audioCid,
    files: {
      cover: { path: files.cover.path, sha256: files.cover.sha256 },
      audio: { path: files.audio.path, sha256: files.audio.sha256 },
    },
    coverGatewayUrl: gatewayFor(gateway, coverCid),
    audioGatewayUrl: gatewayFor(gateway, audioCid),
  };
  if (metadata && metadataCid && metadataSha256) {
    entry.metadataCid = metadataCid;
    entry.metadataUri = `ipfs://${metadataCid}`;
    entry.gatewayUrl = gatewayFor(gateway, metadataCid);
    entry.metadataSha256 = metadataSha256;
    entry.metadata = metadata;
    entry.onChain = {
      media: `ipfs://${audioCid}`,
      reference: `ipfs://${metadataCid}`,
      // Base64 hashes match TokenMetadata.media_hash / reference_hash.
      mediaHash: files.audio.sha256Base64,
      referenceHash: sha256Base64(JSON.stringify(metadata)),
    };
  }
  return entry;
}

function outputFromState(
  songs: ManifestSong[],
  state: Map<string, IpfsSongEntry>,
  gateway: string,
): IpfsManifest {
  return {
    schema: IPFS_SCHEMA,
    gateway,
    songs: songs.flatMap((song) => {
      const entry = state.get(song.tokenId);
      return entry ? [entry] : [];
    }),
  };
}

async function writeOutput(
  path: string,
  songs: ManifestSong[],
  state: Map<string, IpfsSongEntry>,
  gateway: string,
): Promise<void> {
  const tmp = `${path}.tmp`;
  const json = `${JSON.stringify(outputFromState(songs, state, gateway), null, 2)}\n`;
  await writeFile(tmp, json, "utf8");
  await rename(tmp, path);
}

// --- Pinata API -----------------------------------------------------------

function requireJwt(env: NodeJS.ProcessEnv): string {
  const jwt = env.PINATA_JWT?.trim();
  if (!jwt) {
    fail(
      "PINATA_JWT is not set. Create a JWT at https://app.pinata.cloud/developers/api-keys, " +
        "put it in .env.local (server-side only), then run --upload. " +
        "--dry-run needs no credentials.",
    );
  }
  if (/^bearer\s+/i.test(jwt)) {
    fail('PINATA_JWT must be the raw JWT, without the "Bearer " prefix');
  }
  const parts = jwt.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    fail(
      "PINATA_JWT does not look like a JWT (expected three dot-separated segments). " +
        "Copy the JWT from the Pinata API Keys page.",
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    fail("PINATA_JWT has an unreadable payload; copy it again from Pinata");
  }
  if (isRecord(payload) && typeof payload.exp === "number") {
    if (Date.now() / 1000 >= payload.exp) {
      fail(
        `PINATA_JWT expired at ${new Date(payload.exp * 1000).toISOString()}; ` +
          "create a new key in Pinata",
      );
    }
  }
  return jwt;
}

function normalizeGateway(value: string | undefined): string {
  const gateway = (value?.trim() || DEFAULT_GATEWAY).replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(gateway)) {
    fail(`PINATA_GATEWAY must be an http(s) URL (got "${gateway}")`);
  }
  return gateway;
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    return "";
  }
}

async function pinResponse(response: Response, label: string): Promise<string> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      fail(
        `Pinata rejected PINATA_JWT while pinning ${label} ` +
          `(HTTP ${response.status}). Check that the key has pinFileToIPFS and ` +
          "pinJSONToIPFS scopes and has not expired.",
      );
    }
    const body = await readErrorBody(response);
    fail(
      `Pinata request failed for ${label}: HTTP ${response.status} ` +
        `${response.statusText}${body ? ` - ${body}` : ""}`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    fail(`Pinata returned a non-JSON response for ${label}`);
  }
  if (
    !isRecord(body) ||
    typeof body.IpfsHash !== "string" ||
    body.IpfsHash.length === 0
  ) {
    fail(`Pinata response for ${label} did not include IpfsHash`);
  }
  return body.IpfsHash;
}

async function fetchPinata(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const detail =
      error instanceof DOMException && error.name === "TimeoutError"
        ? `timed out after ${Math.round(timeoutMs / 1000)}s`
        : error instanceof Error
          ? error.message
          : String(error);
    fail(`Network error while pinning ${label}: ${detail}`);
  }
}

/** Upload one file with `pinFileToIPFS`, returning its IPFS CID. */
export async function pinFile(
  jwt: string,
  filePath: string,
  pinName: string,
  tokenId: string,
  kind: "cover" | "audio",
): Promise<string> {
  const ext = extname(filePath).toLowerCase();
  const mime = kind === "cover" ? COVER_MIME_TYPES[ext] : AUDIO_MIME_TYPES[ext];
  if (!mime) {
    fail(`Unsupported ${kind} extension for ${filePath}`);
  }
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mime }),
    basename(filePath),
  );
  form.append(
    "pinataMetadata",
    JSON.stringify({
      name: pinName,
      keyvalues: { sonata: "demo", token_id: tokenId, kind },
    }),
  );
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const response = await fetchPinata(
    PIN_FILE_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    },
    `${kind} for ${tokenId}`,
    PIN_FILE_TIMEOUT_MS,
  );
  return pinResponse(response, `${kind} for ${tokenId}`);
}

/** Pin one metadata JSON with `pinJSONToIPFS`, returning its IPFS CID. */
export async function pinJson(
  jwt: string,
  metadata: NftMetadata,
  tokenId: string,
): Promise<string> {
  const response = await fetchPinata(
    PIN_JSON_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `${tokenId}.json`,
          keyvalues: { sonata: "demo", token_id: tokenId, kind: "metadata" },
        },
        pinataOptions: { cidVersion: 1 },
      }),
    },
    `metadata for ${tokenId}`,
    PIN_JSON_TIMEOUT_MS,
  );
  return pinResponse(response, `metadata for ${tokenId}`);
}

// --- CLI ------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCid(cid: string | undefined): string {
  return cid ? `ipfs://${cid}` : "(pending)";
}

function printPlan(plans: SongPlan[], gateway: string): void {
  console.log("Sonata demo -> Pinata (dry run)\n");
  console.log(`Manifest: ${MANIFEST_PATH} (${plans.length} songs)`);
  console.log(`Gateway:  ${gateway}\n`);

  let uploadFiles = 0;
  let skipFiles = 0;
  let pinMetadata = 0;
  let skipMetadata = 0;

  for (const plan of plans) {
    console.log(`  ${plan.song.tokenId}`);
    const coverLabel =
      plan.coverAction === "skip"
        ? `skip    ${formatCid(plan.coverCid)}`
        : `upload  ${plan.files.cover.path}  ${formatBytes(plan.files.cover.size)}  sha256:${plan.files.cover.sha256.slice(0, 12)}...`;
    const audioLabel =
      plan.audioAction === "skip"
        ? `skip    ${formatCid(plan.audioCid)}`
        : `upload  ${plan.files.audio.path}  ${formatBytes(plan.files.audio.size)}  sha256:${plan.files.audio.sha256.slice(0, 12)}...`;
    const metaLabel =
      plan.metadataAction === "skip"
        ? `skip    ${formatCid(plan.metadataCid)}`
        : "pin     metadata JSON (built after the media pins)";
    console.log(`    cover  ${coverLabel}`);
    console.log(`    audio  ${audioLabel}`);
    console.log(`    meta   ${metaLabel}`);

    uploadFiles += plan.coverAction === "upload" ? 1 : 0;
    uploadFiles += plan.audioAction === "upload" ? 1 : 0;
    skipFiles += plan.coverAction === "skip" ? 1 : 0;
    skipFiles += plan.audioAction === "skip" ? 1 : 0;
    pinMetadata += plan.metadataAction === "pin" ? 1 : 0;
    skipMetadata += plan.metadataAction === "skip" ? 1 : 0;
  }

  console.log("\nDry run summary:");
  console.log(`  media files:   ${uploadFiles} upload, ${skipFiles} skip`);
  console.log(`  metadata JSON: ${pinMetadata} pin, ${skipMetadata} skip`);
  console.log(
    "\nNo network calls and no credentials required. Run with --upload to pin.",
  );
}

function clearMetadata(draft: IpfsSongEntry): void {
  delete draft.metadataCid;
  delete draft.metadataUri;
  delete draft.gatewayUrl;
  delete draft.metadataSha256;
  delete draft.metadata;
  delete draft.onChain;
}

export async function uploadAll(
  plans: SongPlan[],
  state: Map<string, IpfsSongEntry>,
  gateway: string,
  jwt: string,
  outputPath: string,
): Promise<void> {
  let completed = 0;
  const songs = plans.map((plan) => plan.song);

  for (const plan of plans) {
    const { song, files } = plan;
    let coverCid = plan.coverCid;
    let audioCid = plan.audioCid;

    const previous = state.get(song.tokenId);
    const draft: IpfsSongEntry = previous ?? {
      tokenId: song.tokenId,
      title: song.title,
      files: {
        cover: { path: files.cover.path, sha256: files.cover.sha256 },
        audio: { path: files.audio.path, sha256: files.audio.sha256 },
      },
    };
    draft.title = song.title;
    draft.files = {
      cover: { path: files.cover.path, sha256: files.cover.sha256 },
      audio: { path: files.audio.path, sha256: files.audio.sha256 },
    };
    state.set(song.tokenId, draft);

    if (!coverCid) {
      coverCid = await pinFile(
        jwt,
        files.cover.abs,
        `${song.tokenId}-cover`,
        song.tokenId,
        "cover",
      );
      draft.coverCid = coverCid;
      draft.coverGatewayUrl = gatewayFor(gateway, coverCid);
      clearMetadata(draft);
      await writeOutput(outputPath, songs, state, gateway);
      console.log(`  uploaded cover  ${song.tokenId}  ipfs://${coverCid}`);
    }
    if (!audioCid) {
      audioCid = await pinFile(
        jwt,
        files.audio.abs,
        `${song.tokenId}-audio`,
        song.tokenId,
        "audio",
      );
      draft.audioCid = audioCid;
      draft.audioGatewayUrl = gatewayFor(gateway, audioCid);
      clearMetadata(draft);
      await writeOutput(outputPath, songs, state, gateway);
      console.log(`  uploaded audio  ${song.tokenId}  ipfs://${audioCid}`);
    }

    const metadata = buildMetadata(song, coverCid, audioCid);
    const metadataSha256 = metadataHash(metadata);
    let metadataCid =
      plan.metadataAction === "skip" ? plan.metadataCid : undefined;
    if (!metadataCid) {
      metadataCid = await pinJson(jwt, metadata, song.tokenId);
      console.log(`  pinned metadata ${song.tokenId}  ipfs://${metadataCid}`);
    }

    const entry = finalizeEntry(
      song,
      files,
      coverCid,
      audioCid,
      gateway,
      metadata,
      metadataCid,
      metadataSha256,
    );
    state.set(song.tokenId, entry);
    await writeOutput(outputPath, songs, state, gateway);
    completed++;
  }

  console.log(
    `\nDone: ${completed}/${plans.length} songs written to ${IPFS_MANIFEST_PATH}.`,
  );
}

async function main(argv: string[]): Promise<void> {
  const flags = new Set(argv);
  for (const flag of flags) {
    if (
      flag !== "--upload" &&
      flag !== "--dry-run" &&
      flag !== "--help" &&
      flag !== "-h"
    ) {
      fail(`Unknown argument "${flag}". Use --dry-run (default) or --upload.`);
    }
  }
  if (flags.has("--help") || flags.has("-h")) {
    console.log(
      [
        "Usage: bun scripts/upload-pinata.ts [--dry-run | --upload]",
        "",
        "  --dry-run  Validate the manifest and list pending pins (default).",
        "  --upload   Pin covers, audio and metadata to Pinata (needs PINATA_JWT).",
        "",
        "Optional: PINATA_GATEWAY overrides the default https://gateway.pinata.cloud/ipfs.",
        "See ops/pinata.md.",
      ].join("\n"),
    );
    return;
  }
  if (flags.has("--upload") && flags.has("--dry-run")) {
    fail("Choose either --dry-run or --upload, not both");
  }

  const upload = flags.has("--upload");
  const gateway = normalizeGateway(process.env.PINATA_GATEWAY);
  const prepared = await loadDemoSongs();
  const existing = await loadExistingManifest();

  const plans = prepared.map(({ song, files }) =>
    planSong(song, files, existing.get(song.tokenId)),
  );

  if (!upload) {
    printPlan(plans, gateway);
    return;
  }

  const jwt = requireJwt(process.env);
  const outputPath = join(ROOT, IPFS_MANIFEST_PATH);
  const state = new Map(existing);
  const pending = plans.some(
    (plan) =>
      plan.coverAction === "upload" ||
      plan.audioAction === "upload" ||
      plan.metadataAction === "pin",
  );

  if (!pending) {
    console.log(
      `Nothing to upload: ${IPFS_MANIFEST_PATH} already matches the manifest.`,
    );
    return;
  }

  console.log(`Uploading to Pinata (gateway ${gateway})\n`);
  try {
    await uploadAll(plans, state, gateway, jwt, outputPath);
  } catch (error) {
    const entries = [...state.values()];
    const completed = entries.filter((entry) => entry.metadataCid).length;
    const savedAny = entries.some(
      (entry) => entry.coverCid || entry.audioCid || entry.metadataCid,
    );
    const message = error instanceof Error ? error.message : String(error);
    throw new PinataError(
      [
        message,
        completed > 0
          ? `Partial upload: ${completed}/${plans.length} songs are complete. ` +
            `Pinned CIDs are saved in ${IPFS_MANIFEST_PATH}; re-run --upload to resume.`
          : savedAny
            ? `Some files were pinned and their CIDs are saved in ${IPFS_MANIFEST_PATH}; ` +
              "re-run --upload to resume."
            : "No files were pinned. Fix the error and re-run --upload.",
      ].join("\n"),
    );
  }
}

function redactSecret(message: string): string {
  const secret = process.env.PINATA_JWT?.trim();
  return secret ? message.split(secret).join("[redacted]") : message;
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nError: ${redactSecret(message)}`);
    process.exit(1);
  });
}
