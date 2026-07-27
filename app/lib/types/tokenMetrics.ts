export type RiskLevel = "low" | "medium" | "high" | "extreme";

export type Recommendation =
  | "Strong Buy"
  | "Buy"
  | "Hold"
  | "Reduce"
  | "Avoid";

/** Raw on-chain / market metrics — swap the provider, keep this shape. */
export interface TokenMetrics {
  contractAddress: string;
  symbol: string;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  buySellRatio: number;
  holderCount: number;
  top10HolderPercent: number;
  momentumPercent: number;
  riskLevel: RiskLevel;
}

export type ScoreFactorKey =
  | "marketCap"
  | "liquidity"
  | "volume24h"
  | "buySellRatio"
  | "holderCount"
  | "top10HolderPercent"
  | "momentum"
  | "riskLevel";

export interface FactorScore {
  key: ScoreFactorKey;
  label: string;
  score: number;
  weight: number;
  rawValue: string;
  signal: "bullish" | "neutral" | "bearish";
}

export interface AnalysisResult {
  contractAddress: string;
  symbol: string;
  metrics: TokenMetrics;
  aiScore: number;
  riskScore: number;
  factorScores: FactorScore[];
  strengths: string[];
  weaknesses: string[];
  recommendation: Recommendation;
  analyzedAt: string;
}
