import type { RadarCandidate, RadarSource } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_DISCOVERY_ADDRESSES = 60;
const MARKET_DATA_BATCH_SIZE = 30;
const SEARCH_QUERY_LIMIT = 4;
const HIGH_VOLUME_SEED_LIMIT = 12;
const HIGH_MOMENTUM_SEED_LIMIT = 12;

const SEARCH_QUERIES = ["pump", "meme", "ai", "pepe"];
const EXCLUDED_SYMBOLS = new Set(["SOL", "WSOL", "USDC", "USDT", "WETH", "BTC", "ETH"]);

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
  buys24h: number;
  sells24h: number;
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

function parseAddressEntries(
  body: unknown,
  source: RadarSource,
  boostAmount = 0,
): DiscoverySeed[] {
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
      sources: [source],
      boostAmount,
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
      sources: ["BOOSTED"],
      boostAmount: parseNumber(record.amount ?? record.totalAmount),
    });
  }

  return seeds;
}

function parseViewedEntries(body: unknown): DiscoverySeed[] {
  if (!Array.isArray(body)) return [];

  const solanaAds = body
    .filter((item): item is Record<string, unknown> => {
      if (typeof item !== "object" || item === null) return false;
      return parseString(item.chainId) === "solana";
    })
    .sort(
      (a, b) =>
        parseNumber(b.impressions) - parseNumber(a.impressions),
    );

  return solanaAds.map((record) => ({
    contractAddress: parseString(record.tokenAddress).trim(),
    sources: ["VIEWED"] as RadarSource[],
    boostAmount: 0,
  }));
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
  const symbol = parseString(baseToken.symbol, "???").toUpperCase();
  if (!address || EXCLUDED_SYMBOLS.has(symbol)) return null;

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

function pairsFromSearchBody(body: unknown): DexPair[] {
  if (typeof body !== "object" || body === null) return [];

  const pairsRaw = (body as Record<string, unknown>).pairs;
  if (!Array.isArray(pairsRaw)) return [];

  const bestByToken = new Map<string, DexPair>();

  for (const item of pairsRaw) {
    const parsed = parsePair(item);
    if (!parsed) continue;

    const existing = bestByToken.get(parsed.baseToken.address);
    if (!existing || parsed.liquidityUsd > existing.liquidityUsd) {
      bestByToken.set(parsed.baseToken.address, parsed);
    }
  }

  return Array.from(bestByToken.values());
}

function pairToSeed(pair: DexPair, source: RadarSource): DiscoverySeed {
  return {
    contractAddress: pair.baseToken.address,
    sources: [source],
    boostAmount: 0,
  };
}

export async function fetchLatestTokenProfiles(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/token-profiles/latest/v1",
  );
  return parseAddressEntries(body, "LATEST");
}

export async function fetchTopBoostedTokens(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/token-boosts/top/v1",
  );
  return parseBoostEntries(body);
}

export async function fetchLatestBoostedTokens(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/token-boosts/latest/v1",
  );
  return parseBoostEntries(body);
}

export async function fetchTrendingTokens(): Promise<DiscoverySeed[]> {
  const body = await fetchJson(
    "https://api.dexscreener.com/community-takeovers/latest/v1",
  );
  return parseAddressEntries(body, "TRENDING");
}

export async function fetchMostViewedTokens(): Promise<DiscoverySeed[]> {
  const body = await fetchJson("https://api.dexscreener.com/ads/latest/v1");
  return parseViewedEntries(body);
}

async function fetchSearchPairs(): Promise<DexPair[]> {
  const queries = SEARCH_QUERIES.slice(0, SEARCH_QUERY_LIMIT);
  const responses = await Promise.all(
    queries.map((query) =>
      fetchJson(
        `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      ),
    ),
  );

  const merged = new Map<string, DexPair>();

  for (const body of responses) {
    for (const pair of pairsFromSearchBody(body)) {
      const existing = merged.get(pair.baseToken.address);
      if (!existing || pair.liquidityUsd > existing.liquidityUsd) {
        merged.set(pair.baseToken.address, pair);
      }
    }
  }

  return Array.from(merged.values());
}

function buildHighVolumeSeeds(pairs: DexPair[]): DiscoverySeed[] {
  return pairs
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
    .slice(0, HIGH_VOLUME_SEED_LIMIT)
    .map((pair) => pairToSeed(pair, "VOLUME"));
}

function buildHighMomentumSeeds(pairs: DexPair[]): DiscoverySeed[] {
  return pairs
    .filter((pair) => pair.momentum24hPercent >= 5)
    .sort((a, b) => b.momentum24hPercent - a.momentum24hPercent)
    .slice(0, HIGH_MOMENTUM_SEED_LIMIT)
    .map((pair) => pairToSeed(pair, "MOMENTUM"));
}

export async function fetchHighVolumeTokens(): Promise<DiscoverySeed[]> {
  const pairs = await fetchSearchPairs();
  return buildHighVolumeSeeds(pairs);
}

export async function fetchHighMomentumTokens(): Promise<DiscoverySeed[]> {
  const pairs = await fetchSearchPairs();
  return buildHighMomentumSeeds(pairs);
}

export async function fetchAllDiscoverySeeds(): Promise<DiscoverySeed[]> {
  const [
    profiles,
    topBoosts,
    latestBoosts,
    trending,
    viewed,
    searchPairs,
  ] = await Promise.all([
    fetchLatestTokenProfiles(),
    fetchTopBoostedTokens(),
    fetchLatestBoostedTokens(),
    fetchTrendingTokens(),
    fetchMostViewedTokens(),
    fetchSearchPairs(),
  ]);

  const highVolume = buildHighVolumeSeeds(searchPairs);
  const highMomentum = buildHighMomentumSeeds(searchPairs);

  return mergeDiscoverySeeds([
    profiles,
    topBoosts,
    latestBoosts,
    trending,
    viewed,
    highVolume,
    highMomentum,
  ]);
}

export function mergeDiscoverySeeds(seedGroups: DiscoverySeed[][]): DiscoverySeed[] {
  const merged = new Map<string, DiscoverySeed>();

  for (const group of seedGroups) {
    for (const seed of group) {
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
  }

  return Array.from(merged.values()).slice(0, MAX_DISCOVERY_ADDRESSES);
}

export async function fetchSolanaTokenMarketData(
  addresses: string[],
): Promise<Map<string, RadarMarketSnapshot>> {
  if (addresses.length === 0) return new Map();

  const unique = Array.from(new Set(addresses)).slice(0, MAX_DISCOVERY_ADDRESSES);
  const snapshots = new Map<string, RadarMarketSnapshot>();

  for (let index = 0; index < unique.length; index += MARKET_DATA_BATCH_SIZE) {
    const batch = unique.slice(index, index + MARKET_DATA_BATCH_SIZE);
    const url = `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`;
    const body = await fetchJson(url);
    const bestPairs = selectBestPairs(body);

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
        buys24h: pair.buys24h,
        sells24h: pair.sells24h,
        pairCreatedAt: pair.pairCreatedAt,
      });
    }
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

      const estimatedHolderCount = Math.max(
        100,
        Math.floor(
          Math.sqrt(Math.max(market.marketCapUsd, 1) / 1000) +
            (market.buys24h + market.sells24h) * 0.12,
        ),
      );

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
        estimatedHolderCount,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}
