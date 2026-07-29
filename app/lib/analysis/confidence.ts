import type { TokenMetrics } from "../types/tokenMetrics";
import type { SecurityAnalysis } from "../types/security";

export interface ConfidenceInput {
  metrics: TokenMetrics;
  security: SecurityAnalysis;
}

export interface ConfidenceResult {
  score: number;
  reasons: string[];
}

export function buildConfidence({
  metrics,
  security,
}: ConfidenceInput): ConfidenceResult {
  let score = 50;
  const reasons: string[] = [];

  // Volume
  if (metrics.volume24hUsd > metrics.marketCapUsd) {
    score += 10;
    reasons.push("✔ Strong trading volume");
  } else {
    reasons.push("• Average trading volume");
  }

  // Liquidity
  if (metrics.liquidityUsd > 50000) {
    score += 10;
    reasons.push("✔ Healthy liquidity");
  } else {
    score -= 10;
    reasons.push("✖ Low liquidity");
  }

  // Buy pressure
  if (metrics.buySellRatio > 1.2) {
    score += 10;
    reasons.push("✔ Buy pressure confirmed");
  } else if (metrics.buySellRatio < 0.8) {
    score -= 10;
    reasons.push("✖ Selling pressure");
  }

  // Momentum
  if (metrics.momentumPercent > 20) {
    score += 5;
    reasons.push("✔ Positive momentum");
  } else if (metrics.momentumPercent < -20) {
    score -= 5;
    reasons.push("✖ Negative momentum");
  }

  // Holder concentration
  if (metrics.top10HolderPercent > 60) {
    score -= 15;
    reasons.push("✖ High whale concentration");
  }

  // Holder count
  if (metrics.holderCount > 1000) {
    score += 5;
    reasons.push("✔ Good holder distribution");
  }

  // Security
  if (security.securityScore > 80) {
    score += 10;
    reasons.push("✔ Strong contract security");
  } else if (security.securityScore < 70) {
    score -= 15;
    reasons.push("✖ Weak contract security");
  }

  // Liquidity lock
  const liquidityCheck = security.checks.find(
    (c) => c.label === "Liquidity Locked",
  );

  if (liquidityCheck?.status !== "pass") {
    score -= 20;
    reasons.push("✖ Liquidity unlocked");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    reasons,
  };
}
