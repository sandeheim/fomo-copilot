import type { TokenMetrics, ScoreFactorKey } from "../types/tokenMetrics";

/** Clamp and round to 0–100. */
export function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Score market cap — sweet spot for speculative tokens. */
export function scoreMarketCap(usd: number): number {
  if (usd < 100_000) return clampScore((usd / 100_000) * 25);
  if (usd < 1_000_000) return clampScore(25 + ((usd - 100_000) / 900_000) * 35);
  if (usd < 50_000_000) return clampScore(60 + ((usd - 1_000_000) / 49_000_000) * 30);
  if (usd < 500_000_000) return clampScore(90 - ((usd - 50_000_000) / 450_000_000) * 20);
  return clampScore(70);
}

/** Higher liquidity = better score. */
export function scoreLiquidity(usd: number, marketCapUsd: number): number {
  const ratio = marketCapUsd > 0 ? usd / marketCapUsd : 0;
  const absolute = clampScore(Math.log10(Math.max(usd, 1)) * 14 - 20);
  const relative = clampScore(ratio * 400);
  return clampScore(absolute * 0.6 + relative * 0.4);
}

/** Volume relative to market cap. */
export function scoreVolume24h(volumeUsd: number, marketCapUsd: number): number {
  const ratio = marketCapUsd > 0 ? volumeUsd / marketCapUsd : 0;
  if (ratio < 0.02) return clampScore(ratio * 1000);
  if (ratio < 0.15) return clampScore(20 + ((ratio - 0.02) / 0.13) * 50);
  if (ratio < 0.5) return clampScore(70 + ((ratio - 0.15) / 0.35) * 20);
  return clampScore(90 + Math.min(10, (ratio - 0.5) * 20));
}

/** Buy/sell ratio — 1.0 is neutral, above is bullish. */
export function scoreBuySellRatio(ratio: number): number {
  if (ratio <= 0.5) return clampScore(ratio * 60);
  if (ratio <= 1.0) return clampScore(30 + (ratio - 0.5) * 80);
  if (ratio <= 2.0) return clampScore(70 + ((ratio - 1.0) / 1.0) * 25);
  return clampScore(Math.min(98, 95 + (ratio - 2.0) * 2));
}

/** More holders = better distribution. */
export function scoreHolderCount(count: number): number {
  if (count < 500) return clampScore((count / 500) * 30);
  if (count < 5_000) return clampScore(30 + ((count - 500) / 4_500) * 40);
  if (count < 25_000) return clampScore(70 + ((count - 5_000) / 20_000) * 20);
  return clampScore(Math.min(98, 90 + ((count - 25_000) / 75_000) * 8));
}

/** Lower top-10 concentration = higher score. */
export function scoreTop10HolderPercent(percent: number): number {
  if (percent <= 25) return clampScore(90 + ((25 - percent) / 25) * 10);
  if (percent <= 45) return clampScore(60 + ((45 - percent) / 20) * 30);
  if (percent <= 65) return clampScore(30 + ((65 - percent) / 20) * 30);
  return clampScore(Math.max(5, 30 - ((percent - 65) / 35) * 25));
}

/** Price momentum over 24h. */
export function scoreMomentum(percent: number): number {
  if (percent <= -30) return clampScore(10 + ((percent + 30) / -30) * 10);
  if (percent <= 0) return clampScore(20 + ((percent + 30) / 30) * 25);
  if (percent <= 20) return clampScore(45 + (percent / 20) * 30);
  if (percent <= 60) return clampScore(75 + ((percent - 20) / 40) * 20);
  return clampScore(Math.min(95, 95 - (percent - 60) * 0.15));
}

/** Explicit risk level from data source. */
export function scoreRiskLevel(level: TokenMetrics["riskLevel"]): number {
  const map: Record<TokenMetrics["riskLevel"], number> = {
    low: 90,
    medium: 65,
    high: 35,
    extreme: 10,
  };
  return map[level];
}

/** Inverse risk score contribution — higher raw risk = higher risk score number. */
export function riskFromLevel(level: TokenMetrics["riskLevel"]): number {
  const map: Record<TokenMetrics["riskLevel"], number> = {
    low: 15,
    medium: 40,
    high: 70,
    extreme: 92,
  };
  return map[level];
}

export function formatFactorRaw(
  key: ScoreFactorKey,
  metrics: TokenMetrics,
): string {
  switch (key) {
    case "marketCap":
      return formatUsd(metrics.marketCapUsd);
    case "liquidity":
      return formatUsd(metrics.liquidityUsd);
    case "volume24h":
      return formatUsd(metrics.volume24hUsd);
    case "buySellRatio":
      return `${metrics.buySellRatio.toFixed(2)}x`;
    case "holderCount":
      return metrics.holderCount.toLocaleString();
    case "top10HolderPercent":
      return `${metrics.top10HolderPercent.toFixed(1)}%`;
    case "momentum":
      return `${metrics.momentumPercent >= 0 ? "+" : ""}${metrics.momentumPercent.toFixed(1)}%`;
    case "riskLevel":
      return metrics.riskLevel.toUpperCase();
  }
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function signalFromScore(score: number): "bullish" | "neutral" | "bearish" {
  if (score >= 65) return "bullish";
  if (score >= 40) return "neutral";
  return "bearish";
}
