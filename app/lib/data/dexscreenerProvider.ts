import type { RiskLevel, TokenMetrics } from "../types/tokenMetrics";
import type { TokenDataProvider } from "./tokenDataProvider";
import { fetchDexScreenerToken } from "../services/dexscreener";
import type { DexScreenerTokenData } from "../services/dexscreener";

function deriveBuySellRatio(buys: number, sells: number): number {
  if (sells <= 0) return buys > 0 ? 2 : 1;
  return buys / sells;
}

/** Estimate holder count from on-chain activity (DexScreener has no holder data). */
function estimateHolderCount(data: DexScreenerTokenData): number {
  const txnActivity = data.buys24h + data.sells24h;
  const capFactor = Math.sqrt(Math.max(data.marketCap, 1) / 1000);
  return Math.max(100, Math.floor(capFactor + txnActivity * 0.12));
}

/** Estimate top-10 concentration from market cap and pair age. */
function estimateTop10HolderPercent(data: DexScreenerTokenData): number {
  const ageDays =
    data.pairCreatedAt > 0
      ? (Date.now() - data.pairCreatedAt) / 86_400_000
      : 0;

  let score = 48;
  if (data.marketCap > 10_000_000) score -= 14;
  else if (data.marketCap > 1_000_000) score -= 7;
  else if (data.marketCap < 250_000) score += 12;

  if (ageDays > 30) score -= 10;
  else if (ageDays > 7) score -= 4;
  else if (ageDays < 1) score += 14;

  return Math.max(15, Math.min(75, score));
}

function deriveRiskLevel(data: DexScreenerTokenData): RiskLevel {
  const liqRatio =
    data.marketCap > 0 ? data.liquidityUsd / data.marketCap : 0;
  const ageHours =
    data.pairCreatedAt > 0
      ? (Date.now() - data.pairCreatedAt) / 3_600_000
      : 0;

  if (ageHours < 24 || data.liquidityUsd < 10_000) return "extreme";
  if (ageHours < 72 || liqRatio < 0.02 || data.marketCap < 100_000) return "high";
  if (liqRatio < 0.05 || data.marketCap < 500_000) return "medium";
  return "low";
}

function mapToTokenMetrics(data: DexScreenerTokenData): TokenMetrics {
  return {
    contractAddress: data.contractAddress,
    symbol: data.symbol,
    marketCapUsd: data.marketCap,
    liquidityUsd: data.liquidityUsd,
    volume24hUsd: data.volume24h,
    buySellRatio: deriveBuySellRatio(data.buys24h, data.sells24h),
    holderCount: estimateHolderCount(data),
    top10HolderPercent: estimateTop10HolderPercent(data),
    momentumPercent: data.priceChange24h,
    riskLevel: deriveRiskLevel(data),
  };
}

export class DexScreenerProvider implements TokenDataProvider {
  async fetchMetrics(contractAddress: string): Promise<TokenMetrics> {
    const dexData = await fetchDexScreenerToken(contractAddress);
    return mapToTokenMetrics(dexData);
  }
}
