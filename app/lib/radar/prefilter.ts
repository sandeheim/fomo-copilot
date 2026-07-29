import type { RadarCandidate, RadarSource } from "./types";

export interface RadarPrefilterThresholds {
  minimumLiquidityUsd: number;
  minimumMarketCapUsd: number;
  minimumHolderCount: number;
  minimumVolume24hUsd: number;
}

export const DEFAULT_RADAR_PREFILTER_THRESHOLDS: RadarPrefilterThresholds = {
  minimumLiquidityUsd: 5_000,
  minimumMarketCapUsd: 1,
  minimumHolderCount: 100,
  minimumVolume24hUsd: 5_000,
};

type PrefilterInput = Omit<RadarCandidate, "prefilterScore" | "prefilterReasons">;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasSource(sources: RadarSource[], source: RadarSource): boolean {
  return sources.includes(source);
}

export function calculateRadarPrefilter(
  candidate: PrefilterInput,
): {
  score: number;
  reasons: string[];
} {
  let score = 50;
  const reasons: string[] = [];

  if (candidate.liquidityUsd >= 100_000) {
    score += 15;
    reasons.push("Strong liquidity above $100K");
  } else if (candidate.liquidityUsd >= 30_000) {
    score += 8;
    reasons.push("Moderate liquidity above $30K");
  } else if (candidate.liquidityUsd < 10_000) {
    score -= 20;
    reasons.push("Low liquidity below $10K");
  }

  if (candidate.volume24hUsd >= 250_000) {
    score += 12;
    reasons.push("High 24h volume above $250K");
  } else if (candidate.volume24hUsd >= 75_000) {
    score += 6;
    reasons.push("Healthy 24h volume above $75K");
  } else if (candidate.volume24hUsd < 10_000) {
    score -= 10;
    reasons.push("Weak 24h volume below $10K");
  }

  if (candidate.buySellRatio >= 1.5) {
    score += 10;
    reasons.push("Strong buy-side pressure");
  } else if (candidate.buySellRatio >= 1.1) {
    score += 4;
    reasons.push("Moderate buy-side pressure");
  } else if (candidate.buySellRatio < 0.75) {
    score -= 12;
    reasons.push("Sell pressure exceeds buys");
  }

  if (candidate.momentum24hPercent >= 10 && candidate.momentum24hPercent <= 100) {
    score += 8;
    reasons.push("Constructive 24h momentum");
  } else if (candidate.momentum24hPercent > 200) {
    score -= 5;
    reasons.push("Extended 24h momentum above 200%");
  } else if (candidate.momentum24hPercent < -25) {
    score -= 10;
    reasons.push("Negative 24h momentum below -25%");
  }

  if (candidate.marketCapUsd >= 100_000 && candidate.marketCapUsd <= 5_000_000) {
    score += 8;
    reasons.push("Market cap in a favorable discovery range");
  } else if (candidate.marketCapUsd < 30_000) {
    score -= 15;
    reasons.push("Market cap below $30K");
  } else if (candidate.marketCapUsd > 25_000_000) {
    score -= 5;
    reasons.push("Large market cap may offer lower asymmetry");
  }

  if (candidate.marketCapUsd > 0) {
    const liquidityRatio = candidate.liquidityUsd / candidate.marketCapUsd;
    if (liquidityRatio >= 0.15) {
      score += 8;
      reasons.push("Healthy liquidity relative to market cap");
    } else if (liquidityRatio < 0.03) {
      score -= 10;
      reasons.push("Thin liquidity relative to market cap");
    }
  }

  const hasLatest = hasSource(candidate.source, "LATEST");
  const hasBoost = hasSource(candidate.source, "BOOSTED");
  const hasTrending = hasSource(candidate.source, "TRENDING");
  const hasViewed = hasSource(candidate.source, "VIEWED");
  const hasVolume = hasSource(candidate.source, "VOLUME");

  if (hasLatest && hasBoost) {
    score += 5;
    reasons.push("Appears in latest profiles and boosted lists");
  } else if (hasBoost) {
    score += 2;
    reasons.push("Boosted discovery input");
  }

  if (hasTrending) {
    score += 3;
    reasons.push("Trending discovery input");
  }

  if (hasViewed) {
    score += 2;
    reasons.push("High-visibility ad discovery input");
  }

  if (hasVolume) {
    score += 3;
    reasons.push("High-volume discovery input");
  }

  if (candidate.pairCreatedAt !== null) {
    const ageMs = Date.now() - candidate.pairCreatedAt;
    const fiveMinutesMs = 5 * 60 * 1000;
    const fifteenMinutesMs = 15 * 60 * 1000;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    if (ageMs < fiveMinutesMs) {
      score -= 10;
      reasons.push("Pair younger than 5 minutes");
    } else if (ageMs >= fifteenMinutesMs && ageMs <= twentyFourHoursMs) {
      score += 5;
      reasons.push("Pair age between 15 minutes and 24 hours");
    }
  }

  return {
    score: clamp(score),
    reasons,
  };
}

export function passesRadarHardMinimums(
  candidate: Omit<RadarCandidate, "prefilterScore" | "prefilterReasons">,
  thresholds: RadarPrefilterThresholds = DEFAULT_RADAR_PREFILTER_THRESHOLDS,
): boolean {
  return (
    candidate.liquidityUsd >= thresholds.minimumLiquidityUsd &&
    candidate.marketCapUsd >= thresholds.minimumMarketCapUsd &&
    candidate.estimatedHolderCount >= thresholds.minimumHolderCount &&
    candidate.volume24hUsd >= thresholds.minimumVolume24hUsd
  );
}
