import type { RadarCandidate, RadarSource } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DISCOVERY_ADDRESSES = 30;

export interface DiscoverySeed {
  contractAddress: string;
  sources: RadarSource[];
  boostAmount: number;
}

export interface RadarMarketSnapshot {
  contractAddress: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  momentum24hPercent: number;
  buySellRatio: number;
  pairCreatedAt: number | null;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`DexScreener request failed (${response.status})`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseProfileEntries(body: unknown): DiscoverySeed[] {
  if (!Array.isArray(body)) return [];

  const seeds: DiscoverySeed[] = [];

  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    if (parseString(record.chainId) !== "solana") continue;

    const contractAddress = parseString(record.tokenAddress).trim();
    if (!contractAddress) continue;

    seeds.push({
      contractAddress,
      sources: ["LATEST_PROFILE"],
      boostAmount: 0,
    });
  }

  return seeds;
}

function parseBoostEntries(body: unknown): DiscoverySeed[] {
  if (!Array.isArray(body)) return [];

  const seeds: DiscoverySeed[] = [];

  for (const item of body) {
    if (typeof item !== "object" || item === null) continue;

    const record = item as Record<string, unknown>;
    if (parseString(record.chainId) !== "solana") continue;

    const contractAddress = parseString(record.tokenAddress).trim();
    if (!contractAddress) continue;

    seeds.push({
      contractAddress,
      sources: ["TOP_BOOST"],
      boostAmount: parseNumber(record.amount ?? record.totalAmount),
    });
  }

  return seeds;
}

interface DexPair {
  chainId: string;
  liquidityUsd: number;
  marketCapUsd: number;
  volume24hUsd: number;
  momentum24hPercent: number;
  buys24h: number;
  sells24h: number;
  pairCreatedAt: number | null;
  priceUsd: number;
  baseToken: {
    address: string;
    symbol: string;
    name: string;
  };
}

function parsePair(item: unknown): DexPair | null {
  if (typeof item !== "object" || item === null) return null;

  const record = item as Record<string, unknown>;
  if (parseString(record.chainId) !== "solana") return null;

  const baseTokenRaw = record.baseToken;
  if (typeof baseTokenRaw !== "object" || baseTokenRaw === null) return null;

  const baseToken = baseTokenRaw as Record<string, unknown>;
  const address = parseString(baseToken.address).trim();
  if (!address) return null;

  const liquidityRaw = record.liquidity;
  const volumeRaw = record.volume;
  const priceChangeRaw = record.priceChange;
  const txnsRaw = record.txns;

  const liquidityUsd =
    typeof liquidityRaw === "object" && liquidityRaw !== null
      ? parseNumber((liquidityRaw as Record<string, unknown>).usd)
      : 0;

  const volume24hUsd =
    typeof volumeRaw === "object" && volumeRaw !== null
      ? parseNumber((volumeRaw as Record<string, unknown>).h24)
      : 0;

  const momentum24hPercent =
    typeof priceChangeRaw === "object" && priceChangeRaw !== null
      ? parseNumber((priceChangeRaw as Record<string, unknown>).h24)
      : 0;

  const txnsH24 =
    typeof txnsRaw === "object" && txnsRaw !== null
      ? (txnsRaw as Record<string, unknown>).h24
      : null;

  const buys24h =
    typeof txnsH24 === "object" && txnsH24 !== null
      ? parseNumber((txnsH24 as Record<string, unknown>).buys)
      : 0;

  const sells24h =
    typeof txnsH24 === "object" && txnsH24 !== null
      ? parseNumber((txnsH24 as Record<string, unknown>).sells)
      : 0;

  const pairCreatedAtRaw = record.pairCreatedAt;
  const pairCreatedAt =
    typeof pairCreatedAtRaw === "number" && Number.isFinite(pairCreatedAtRaw)
      ? pairCreatedAtRaw
      : null;

  return {
    chainId: "solana",
    liquidityUsd,
    marketCapUsd: parseNumber(record.marketCap ?? record.fdv),
    volume24hUsd,
    momentum24hPercent,
    buys24h,
    sells24h,
    pairCreatedAt,
    priceUsd: parseNumber(record.priceUsd),
    baseToken: {
      address,
      symbol: parseString(baseToken.symbol, "???"),
      name: parseString(baseToken.name, "Unknown"),
    },
  };
}

function selectBestPairs(body: unknown): Map<string, DexPair> {
  const pairs = Array.isArray(body) ? body : [];
  const bestByToken = new Map<string, DexPair>();

  for (const item of pairs) {
    const parsed = parsePair(item);
    if (!parsed) continue;

    const existing = bestByToken.get(parsed.baseToken.address);
    if (!existing || parsed.liquidityUsd > existing.liquidityUsd) {
      bestByToken.set(parsed.baseToken.address, parsed);
    }
  }

  return bestByToken;
}

export async function fetchLatestTokenProfiles(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/token-profiles/latest/v1",
  );
  return parseProfileEntries(body);
}

export async function fetchTopBoostedTokens(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/token-boosts/top/v1",
  );
  return parseBoostEntries(body);
}

export function mergeDiscoverySeeds(
  profiles: DiscoverySeed[],
  boosts: DiscoverySeed[],
): DiscoverySeed[] {
  const merged = new Map<string, DiscoverySeed>();

  for (const seed of [...profiles, ...boosts]) {
    const existing = merged.get(seed.contractAddress);

    if (!existing) {
      merged.set(seed.contractAddress, {
        contractAddress: seed.contractAddress,
        sources: [...seed.sources],
        boostAmount: seed.boostAmount,
      });
      continue;
    }

    const sources = new Set<RadarSource>([
      ...existing.sources,
      ...seed.sources,
    ]);

    merged.set(seed.contractAddress, {
      contractAddress: seed.contractAddress,
      sources: Array.from(sources),
      boostAmount: Math.max(existing.boostAmount, seed.boostAmount),
    });
  }

  return Array.from(merged.values()).slice(0, MAX_DISCOVERY_ADDRESSES);
}

export async function fetchSolanaTokenMarketData(
  addresses: string[],
): Promise<Map<string, RadarMarketSnapshot>> {
  if (addresses.length === 0) return new Map();

  const unique = Array.from(new Set(addresses)).slice(0, MAX_DISCOVERY_ADDRESSES);
  const url = `https://api.dexscreener.com/tokens/v1/solana/${unique.join(",")}`;
  const body = await fetchJson(url);
  const bestPairs = selectBestPairs(body);
  const snapshots = new Map<string, RadarMarketSnapshot>();

  for (const [address, pair] of bestPairs.entries()) {
    snapshots.set(address, {
      contractAddress: address,
      symbol: pair.baseToken.symbol,
      name: pair.baseToken.name,
      priceUsd: pair.priceUsd,
      marketCapUsd: pair.marketCapUsd,
      liquidityUsd: pair.liquidityUsd,
      volume24hUsd: pair.volume24hUsd,
      momentum24hPercent: pair.momentum24hPercent,
      buySellRatio: pair.buys24h / Math.max(pair.sells24h, 1),
      pairCreatedAt: pair.pairCreatedAt,
    });
  }

  return snapshots;
}

export function buildRadarCandidates(
  seeds: DiscoverySeed[],
  marketData: Map<string, RadarMarketSnapshot>,
): Array<Omit<RadarCandidate, "prefilterScore" | "prefilterReasons">> {
  return seeds
    .map((seed) => {
      const market = marketData.get(seed.contractAddress);
      if (!market) return null;

      return {
        contractAddress: seed.contractAddress,
        symbol: market.symbol,
        name: market.name,
        source: seed.sources,
        priceUsd: market.priceUsd,
        marketCapUsd: market.marketCapUsd,
        liquidityUsd: market.liquidityUsd,
        volume24hUsd: market.volume24hUsd,
        momentum24hPercent: market.momentum24hPercent,
        buySellRatio: market.buySellRatio,
        pairCreatedAt: market.pairCreatedAt,
        boostAmount: seed.boostAmount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
