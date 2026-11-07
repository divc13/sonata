import { asRoute } from "~/lib/utils";

/**
 * Static demo catalogue for the Sonata shells. The indexer and contract
 * integration replace these reads later; the shapes deliberately mirror the
 * `sonata` router DTOs (USD as numbers here, only for display).
 */
export type DemoMaster = {
  tokenId: string;
  title: string;
  artistName: string;
  artistHandle: string;
  genre: string;
  releaseYear: number;
  durationSec: number;
  coverUrl: string;
  audioUrl: string;
  description: string;
  /** Verified listening hours in the trailing 30 days. */
  hours30d: number;
  /** Song account balance, in USD. */
  balanceUsd: number;
  owner: string;
  ownerHandle: string;
  /** Listed price in USD, when the master is for sale. */
  priceUsd?: number;
};

export const RATE_PER_HOUR = 0.03;

export const demoMasters: DemoMaster[] = [
  {
    tokenId: "midnight-drive",
    title: "Midnight Drive",
    artistName: "Nadia Vale",
    artistHandle: "@nadia",
    genre: "Synthwave",
    releaseYear: 2026,
    durationSec: 90,
    coverUrl: "/demo/covers/midnight-drive.webp",
    audioUrl: "/demo/audio/midnight-drive.m4a",
    description:
      "A wide-open synthwave cruise with an amber horizon and nowhere in particular to be.",
    hours30d: 4280,
    balanceUsd: 18.4,
    owner: "nadia-sonata.testnet",
    ownerHandle: "@nadia",
    priceUsd: 50,
  },
  {
    tokenId: "paper-moons",
    title: "Paper Moons",
    artistName: "Kofi Mensah",
    artistHandle: "@kofi",
    genre: "Ambient",
    releaseYear: 2025,
    durationSec: 81,
    coverUrl: "/demo/covers/paper-moons.webp",
    audioUrl: "/demo/audio/paper-moons.m4a",
    description:
      "Two quiet moons over warm paper, made for slow mornings and half-finished thoughts.",
    hours30d: 3610,
    balanceUsd: 12.7,
    owner: "kofi-sonata.testnet",
    ownerHandle: "@kofi",
  },
  {
    tokenId: "velvet-static",
    title: "Velvet Static",
    artistName: "Lena Ortiz",
    artistHandle: "@lena",
    genre: "Dream pop",
    releaseYear: 2025,
    durationSec: 90,
    coverUrl: "/demo/covers/velvet-static.webp",
    audioUrl: "/demo/audio/velvet-static.m4a",
    description:
      "A dream-pop haze that hums like a radio left on in another room.",
    hours30d: 4880,
    balanceUsd: 24.1,
    owner: "mira-sonata.testnet",
    ownerHandle: "@mira",
    priceUsd: 75,
  },
  {
    tokenId: "slow-arc",
    title: "Slow Arc",
    artistName: "Nadia Vale",
    artistHandle: "@nadia",
    genre: "Electronic",
    releaseYear: 2026,
    durationSec: 84,
    coverUrl: "/demo/covers/slow-arc.webp",
    audioUrl: "/demo/audio/slow-arc.m4a",
    description: "One patient arc of tone, bending slowly toward the light.",
    hours30d: 3120,
    balanceUsd: 9.6,
    owner: "nadia-sonata.testnet",
    ownerHandle: "@nadia",
  },
  {
    tokenId: "harbor-lights",
    title: "Harbor Lights",
    artistName: "Kofi Mensah",
    artistHandle: "@kofi",
    genre: "Jazz",
    releaseYear: 2024,
    durationSec: 80,
    coverUrl: "/demo/covers/harbor-lights.webp",
    audioUrl: "/demo/audio/harbor-lights.m4a",
    description:
      "Late-night jazz for a harbor town, all brushed drums and small golden lights.",
    hours30d: 5290,
    balanceUsd: 9.8,
    owner: "ada-sonata.testnet",
    ownerHandle: "@ada",
    priceUsd: 40,
  },
  {
    tokenId: "glass-hours",
    title: "Glass Hours",
    artistName: "Lena Ortiz",
    artistHandle: "@lena",
    genre: "Neo-soul",
    releaseYear: 2025,
    durationSec: 78,
    coverUrl: "/demo/covers/glass-hours.webp",
    audioUrl: "/demo/audio/glass-hours.m4a",
    description:
      "Honeyed neo-soul that moves like late sun through a tall window.",
    hours30d: 3940,
    balanceUsd: 15.2,
    owner: "lena-sonata.testnet",
    ownerHandle: "@lena",
  },
  {
    tokenId: "northbound",
    title: "Northbound",
    artistName: "Nadia Vale",
    artistHandle: "@nadia",
    genre: "Indie",
    releaseYear: 2026,
    durationSec: 87,
    coverUrl: "/demo/covers/northbound.webp",
    audioUrl: "/demo/audio/northbound.m4a",
    description: "Indie guitar and a pale road north, with the windows down.",
    hours30d: 2575,
    balanceUsd: 6.4,
    owner: "nadia-sonata.testnet",
    ownerHandle: "@nadia",
  },
  {
    tokenId: "after-rain",
    title: "After Rain",
    artistName: "Kofi Mensah",
    artistHandle: "@kofi",
    genre: "Lo-fi",
    releaseYear: 2025,
    durationSec: 82,
    coverUrl: "/demo/covers/after-rain.webp",
    audioUrl: "/demo/audio/after-rain.m4a",
    description:
      "Field rain recordings looped under dusty drums, for the hour after a storm.",
    hours30d: 4205,
    balanceUsd: 11.9,
    owner: "kofi-sonata.testnet",
    ownerHandle: "@kofi",
  },
  {
    tokenId: "copper-sky",
    title: "Copper Sky",
    artistName: "Lena Ortiz",
    artistHandle: "@lena",
    genre: "Folk",
    releaseYear: 2024,
    durationSec: 102,
    coverUrl: "/demo/covers/copper-sky.webp",
    audioUrl: "/demo/audio/copper-sky.m4a",
    description: "One guitar, one voice, one take.",
    hours30d: 2260,
    balanceUsd: 4.8,
    owner: "lena-sonata.testnet",
    ownerHandle: "@lena",
  },
  {
    tokenId: "low-tide",
    title: "Low Tide",
    artistName: "Nadia Vale",
    artistHandle: "@nadia",
    genre: "Ambient",
    releaseYear: 2026,
    durationSec: 84,
    coverUrl: "/demo/covers/low-tide.webp",
    audioUrl: "/demo/audio/low-tide.m4a",
    description: "Sub-bass swell recorded at a tidal pool.",
    hours30d: 1980,
    balanceUsd: 3.9,
    owner: "nadia-sonata.testnet",
    ownerHandle: "@nadia",
  },
  {
    tokenId: "signal-fire",
    title: "Signal Fire",
    artistName: "Kofi Mensah",
    artistHandle: "@kofi",
    genre: "Electronic",
    releaseYear: 2025,
    durationSec: 89,
    coverUrl: "/demo/covers/signal-fire.webp",
    audioUrl: "/demo/audio/signal-fire.m4a",
    description: "Modular bleeps answering a distant shortwave radio.",
    hours30d: 1840,
    balanceUsd: 2.6,
    owner: "kofi-sonata.testnet",
    ownerHandle: "@kofi",
  },
  {
    tokenId: "quiet-machines",
    title: "Quiet Machines",
    artistName: "Lena Ortiz",
    artistHandle: "@lena",
    genre: "Industrial",
    releaseYear: 2026,
    durationSec: 90,
    coverUrl: "/demo/covers/quiet-machines.webp",
    audioUrl: "/demo/audio/quiet-machines.m4a",
    description: "Soft machinery, kept at a hum.",
    hours30d: 1525,
    balanceUsd: 2.1,
    owner: "lena-sonata.testnet",
    ownerHandle: "@lena",
  },
];

export const masterHref = (tokenId: string) => asRoute(`/master/${tokenId}`);

export const masterByToken = (tokenId: string) =>
  demoMasters.find((master) => master.tokenId === tokenId);

export const earnings30d = (master: DemoMaster) =>
  Math.round(master.hours30d * RATE_PER_HOUR * 100) / 100;

export const topEarners = [...demoMasters]
  .sort((a, b) => earnings30d(b) - earnings30d(a))
  .slice(0, 6);

export const newReleases = [...demoMasters]
  .sort((a, b) => b.releaseYear - a.releaseYear)
  .slice(0, 8);

export const demoListings = ["midnight-drive", "velvet-static", "harbor-lights"]
  .map((tokenId) => masterByToken(tokenId))
  .filter((master): master is DemoMaster => Boolean(master?.priceUsd));

export const nadiaMasters = demoMasters.filter(
  (master) => master.artistHandle === "@nadia",
);

/** Daily earnings, in USD, for the 30 day chart. */
export const earningsSeries = [
  7.2, 7.8, 7.4, 8.1, 8.6, 8.2, 9.4, 8.9, 8.4, 9.1, 9.8, 9.5, 10.2, 9.9, 9.4,
  10.1, 10.8, 10.4, 11.2, 10.9, 11.5, 11.1, 10.6, 11.8, 12.2, 11.9, 12.4, 12.1,
  12.8, 12.4,
];

export const chartLabels = ["Oct 5", "Oct 12", "Oct 19", "Oct 26", "Nov 3"];

export type DemoEpoch = {
  id: number;
  starts: string;
  ends: string;
  hours: number;
  total: number;
  mode: "constant" | "pro-rata";
  status: "open" | "settled";
  root: string;
  tx: string;
};

export const demoEpochs: DemoEpoch[] = [
  {
    id: 8,
    starts: "Nov 3",
    ends: "Nov 9",
    hours: 14820,
    total: 444.6,
    mode: "constant",
    status: "open",
    root: "0x8a19...f2c0",
    tx: "Pending",
  },
  {
    id: 7,
    starts: "Oct 27",
    ends: "Nov 2",
    hours: 13260,
    total: 397.8,
    mode: "constant",
    status: "settled",
    root: "0x73d0...91ab",
    tx: "0x2f8c...40de",
  },
  {
    id: 6,
    starts: "Oct 20",
    ends: "Oct 26",
    hours: 11840,
    total: 355.2,
    mode: "constant",
    status: "settled",
    root: "0x51ba...7c13",
    tx: "0x9a1e...b227",
  },
  {
    id: 5,
    starts: "Oct 13",
    ends: "Oct 19",
    hours: 10420,
    total: 328.4,
    mode: "pro-rata",
    status: "settled",
    root: "0x2e7f...a450",
    tx: "0x6d33...c1f8",
  },
  {
    id: 4,
    starts: "Oct 6",
    ends: "Oct 12",
    hours: 9640,
    total: 301.6,
    mode: "pro-rata",
    status: "settled",
    root: "0x9c42...08de",
    tx: "0x4b70...e2a9",
  },
  {
    id: 3,
    starts: "Sep 29",
    ends: "Oct 5",
    hours: 8120,
    total: 254.2,
    mode: "constant",
    status: "settled",
    root: "0x6a01...bf34",
    tx: "0x18c5...73d0",
  },
];

export type DemoPayout = {
  epoch: number;
  date: string;
  hours: number;
  total: number;
  status: "paid" | "accruing";
};

export const nadiaPayouts: DemoPayout[] = [
  { epoch: 7, date: "Nov 2", hours: 2964, total: 88.92, status: "paid" },
  { epoch: 6, date: "Oct 26", hours: 2718, total: 81.54, status: "paid" },
  { epoch: 5, date: "Oct 19", hours: 2490, total: 74.7, status: "paid" },
  {
    epoch: 8,
    date: "in progress",
    hours: 3096,
    total: 92.88,
    status: "accruing",
  },
];

export const formatUsd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export const formatHours = (value: number) =>
  `${value.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;

export const formatPrice = (value: number) => formatUsd(value);

export const truncateAccount = (account: string) =>
  account.length <= 18
    ? account
    : `${account.slice(0, 8)}...${account.slice(-6)}`;
