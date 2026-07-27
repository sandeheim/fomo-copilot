import { DexScreenerApiError, TokenNotFoundError } from "../errors";

const DEXSCREENER_BASE_URL = "https://api.dexscreener.com/latest/dex/tokens";

export interface DexScreenerTokenData {
  name: string;
  symbol: string;
  priceUsd: number;
  marketCap: number;
  liquidityUsd: number;
  volume24h: number;
  priceChange5m: number;
  priceChange1h: number;
  priceChange24h: number;
  buys24h: number;
  sells24h: number;
  dexName: string;
  pairCreatedAt: number;
  contractAddress: string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { m5?: number; h1?: number; h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  pairCreatedAt?: number;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken: { address: string; name?: string; symbol?: string };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeAddress(address: string): string {
  return address.trim();
}

function isSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

function selectBestSolanaPair(
  pairs: DexScreenerPair[],
  contractAddress: string,
): DexScreenerPair | null {
  const target = contractAddress.toLowerCase();

  const solanaPairs = pairs.filter((p) => p.chainId === "solana");
  if (solanaPairs.length === 0) return null;

  const asBase = solanaPairs.filter(
    (p) => p.baseToken.address.toLowerCase() === target,
  );

  const candidates = asBase.length > 0 ? asBase : solanaPairs;
  return candidates.sort(
    (a, b) =>
      parseNumber(b.liquidity?.usd) - parseNumber(a.liquidity?.usd),
  )[0];
}

function mapPairToTokenData(
  pair: DexScreenerPair,
  contractAddress: string,
): DexScreenerTokenData {
  const target = contractAddress.toLowerCase();
  const isBase = pair.baseToken.address.toLowerCase() === target;
  const token = isBase ? pair.baseToken : pair.quoteToken;

  return {
    name: token.name ?? "Unknown",
    symbol: token.symbol ?? "???",
    priceUsd: parseNumber(pair.priceUsd),
    marketCap: parseNumber(pair.marketCap ?? pair.fdv),
    liquidityUsd: parseNumber(pair.liquidity?.usd),
    volume24h: parseNumber(pair.volume?.h24),
    priceChange5m: parseNumber(pair.priceChange?.m5),
    priceChange1h: parseNumber(pair.priceChange?.h1),
    priceChange24h: parseNumber(pair.priceChange?.h24),
    buys24h: parseNumber(pair.txns?.h24?.buys),
    sells24h: parseNumber(pair.txns?.h24?.sells),
    dexName: pair.dexId,
    pairCreatedAt: parseNumber(pair.pairCreatedAt),
    contractAddress,
  };
}

/**
 * Fetch live token data from DexScreener for a Solana contract address.
 */
export async function fetchDexScreenerToken(
  contractAddress: string,
): Promise<DexScreenerTokenData> {
  const address = normalizeAddress(contractAddress);

  if (!isSolanaAddress(address)) {
    throw new DexScreenerApiError(
      "Invalid Solana contract address format.",
    );
  }

  const url = `${DEXSCREENER_BASE_URL}/${encodeURIComponent(address)}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
  } catch {
    throw new DexScreenerApiError(
      "Unable to reach DexScreener. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new DexScreenerApiError(
      `DexScreener request failed (${response.status}). Try again shortly.`,
    );
  }

  const body = (await response.json()) as DexScreenerResponse;
  const pairs = body.pairs ?? [];

  if (pairs.length === 0) {
    throw new TokenNotFoundError(address);
  }

  const bestPair = selectBestSolanaPair(pairs, address);
  if (!bestPair) {
    throw new TokenNotFoundError(address);
  }

  return mapPairToTokenData(bestPair, address);
}
