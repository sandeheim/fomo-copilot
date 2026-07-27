import type {
  FactorScore,
  Recommendation,
  ScoreFactorKey,
  TokenMetrics,
} from "../types/tokenMetrics";
import {
  clampScore,
  formatFactorRaw,
  riskFromLevel,
  scoreBuySellRatio,
  scoreHolderCount,
  scoreLiquidity,
  scoreMarketCap,
  scoreMomentum,
  scoreRiskLevel,
  scoreTop10HolderPercent,
  scoreVolume24h,
  signalFromScore,
} from "./factors";

const AI_WEIGHTS: Record<ScoreFactorKey, number> = {
  marketCap: 0.1,
  liquidity: 0.15,
  volume24h: 0.15,
  buySellRatio: 0.15,
  holderCount: 0.1,
  top10HolderPercent: 0.15,
  momentum: 0.15,
  riskLevel: 0.05,
};

const FACTOR_LABELS: Record<ScoreFactorKey, string> = {
  marketCap: "Market Cap",
  liquidity: "Liquidity",
  volume24h: "24h Volume",
  buySellRatio: "Buy/Sell Ratio",
  holderCount: "Holder Count",
  top10HolderPercent: "Top 10 Holder %",
  momentum: "Momentum",
  riskLevel: "Risk Level",
};

function computeRawFactorScores(metrics: TokenMetrics): Record<ScoreFactorKey, number> {
  return {
    marketCap: scoreMarketCap(metrics.marketCapUsd),
    liquidity: scoreLiquidity(metrics.liquidityUsd, metrics.marketCapUsd),
    volume24h: scoreVolume24h(metrics.volume24hUsd, metrics.marketCapUsd),
    buySellRatio: scoreBuySellRatio(metrics.buySellRatio),
    holderCount: scoreHolderCount(metrics.holderCount),
    top10HolderPercent: scoreTop10HolderPercent(metrics.top10HolderPercent),
    momentum: scoreMomentum(metrics.momentumPercent),
    riskLevel: scoreRiskLevel(metrics.riskLevel),
  };
}

export function computeFactorScores(metrics: TokenMetrics): FactorScore[] {
  const raw = computeRawFactorScores(metrics);

  return (Object.keys(AI_WEIGHTS) as ScoreFactorKey[]).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    score: raw[key],
    weight: AI_WEIGHTS[key],
    rawValue: formatFactorRaw(key, metrics),
    signal: signalFromScore(raw[key]),
  }));
}

export function computeAiScore(factorScores: FactorScore[]): number {
  const total = factorScores.reduce((sum, f) => sum + f.score * f.weight, 0);
  return clampScore(total);
}

/** Higher risk score = more dangerous (0 safe → 100 extreme). */
export function computeRiskScore(metrics: TokenMetrics): number {
  const concentrationRisk = clampScore(metrics.top10HolderPercent * 1.1);
  const liquidityRisk = clampScore(100 - scoreLiquidity(metrics.liquidityUsd, metrics.marketCapUsd));
  const capRisk =
    metrics.marketCapUsd < 500_000
      ? clampScore(80 - (metrics.marketCapUsd / 500_000) * 30)
      : clampScore(Math.max(10, 50 - Math.log10(metrics.marketCapUsd) * 5));
  const levelRisk = riskFromLevel(metrics.riskLevel);
  const momentumRisk =
    metrics.momentumPercent < -20
      ? clampScore(50 + Math.abs(metrics.momentumPercent))
      : clampScore(Math.max(10, 30 - metrics.momentumPercent * 0.3));

  return clampScore(
    concentrationRisk * 0.3 +
      liquidityRisk * 0.25 +
      capRisk * 0.15 +
      levelRisk * 0.2 +
      momentumRisk * 0.1,
  );
}

export function deriveRecommendation(
  aiScore: number,
  riskScore: number,
): Recommendation {
  if (aiScore >= 75 && riskScore <= 35) return "Strong Buy";
  if (aiScore >= 60 && riskScore <= 50) return "Buy";
  if (aiScore >= 45 && riskScore <= 65) return "Hold";
  if (aiScore >= 30 || riskScore <= 75) return "Reduce";
  return "Avoid";
}

export function generateStrengths(
  metrics: TokenMetrics,
  factorScores: FactorScore[],
): string[] {
  const strengths: string[] = [];

  const topFactors = [...factorScores]
    .filter((f) => f.score >= 65)
    .sort((a, b) => b.score - a.score);

  for (const factor of topFactors.slice(0, 4)) {
    strengths.push(strengthMessage(factor.key, metrics, factor.score));
  }

  if (metrics.buySellRatio >= 1.3) {
    strengths.push(
      `Buy pressure dominates with ${metrics.buySellRatio.toFixed(2)}x buy/sell ratio`,
    );
  }
  if (metrics.momentumPercent >= 15) {
    strengths.push(
      `Strong 24h momentum at +${metrics.momentumPercent.toFixed(1)}%`,
    );
  }
  if (metrics.top10HolderPercent <= 35) {
    strengths.push(
      `Healthy distribution — top 10 wallets hold only ${metrics.top10HolderPercent.toFixed(1)}%`,
    );
  }

  return [...new Set(strengths)].slice(0, 5);
}

export function generateWeaknesses(
  metrics: TokenMetrics,
  factorScores: FactorScore[],
): string[] {
  const weaknesses: string[] = [];

  const weakFactors = [...factorScores]
    .filter((f) => f.score < 45)
    .sort((a, b) => a.score - b.score);

  for (const factor of weakFactors.slice(0, 4)) {
    weaknesses.push(weaknessMessage(factor.key, metrics, factor.score));
  }

  if (metrics.top10HolderPercent >= 55) {
    weaknesses.push(
      `High whale concentration — top 10 hold ${metrics.top10HolderPercent.toFixed(1)}% of supply`,
    );
  }
  if (metrics.liquidityUsd / metrics.marketCapUsd < 0.03) {
    weaknesses.push("Thin liquidity relative to market cap — slippage risk elevated");
  }
  if (metrics.riskLevel === "extreme" || metrics.riskLevel === "high") {
    weaknesses.push(`On-chain risk flags: ${metrics.riskLevel.toUpperCase()} severity`);
  }

  return [...new Set(weaknesses)].slice(0, 5);
}

function strengthMessage(
  key: ScoreFactorKey,
  metrics: TokenMetrics,
  score: number,
): string {
  switch (key) {
    case "liquidity":
      return `Deep liquidity pool supports ${score}/100 exit capacity`;
    case "volume24h":
      return `Active 24h volume indicates strong market participation`;
    case "holderCount":
      return `Growing holder base at ${metrics.holderCount.toLocaleString()} wallets`;
    case "momentum":
      return `Positive price momentum building across short-term timeframe`;
    case "buySellRatio":
      return `Net buying pressure from on-chain swap flow`;
    case "marketCap":
      return `Market cap in favorable growth zone for upside potential`;
    case "top10HolderPercent":
      return `Low holder concentration reduces single-wallet dump risk`;
    case "riskLevel":
      return `Low structural risk profile on contract and liquidity checks`;
  }
}

function weaknessMessage(
  key: ScoreFactorKey,
  metrics: TokenMetrics,
  score: number,
): string {
  switch (key) {
    case "liquidity":
      return `Liquidity depth scored ${score}/100 — exit slippage may be significant`;
    case "volume24h":
      return `Muted 24h volume suggests fading trader interest`;
    case "holderCount":
      return `Limited holder base (${metrics.holderCount.toLocaleString()}) — low decentralization`;
    case "momentum":
      return `Negative momentum at ${metrics.momentumPercent.toFixed(1)}% over 24h`;
    case "buySellRatio":
      return `Sell-side pressure with ${metrics.buySellRatio.toFixed(2)}x buy/sell ratio`;
    case "marketCap":
      return `Market cap profile limits risk-adjusted upside (${score}/100)`;
    case "top10HolderPercent":
      return `Top 10 wallets control ${metrics.top10HolderPercent.toFixed(1)}% — concentration risk`;
    case "riskLevel":
      return `Elevated on-chain risk level: ${metrics.riskLevel.toUpperCase()}`;
  }
}

export function buildRecommendationText(
  recommendation: Recommendation,
  aiScore: number,
  riskScore: number,
): string {
  const base: Record<Recommendation, string> = {
    "Strong Buy":
      "Multiple factors align bullishly with manageable risk. Consider scaling in on dips.",
    Buy: "Favorable risk/reward with solid on-chain metrics. Size positions conservatively.",
    Hold: "Mixed signals — wait for clearer momentum or improved liquidity before adding.",
    Reduce: "Risk outweighs opportunity. Trim exposure or tighten stops if already in.",
    Avoid: "Critical weaknesses detected. Capital preservation recommended — stay sidelined.",
  };
  return `${base[recommendation]} AI ${aiScore}/100 · Risk ${riskScore}/100.`;
}
