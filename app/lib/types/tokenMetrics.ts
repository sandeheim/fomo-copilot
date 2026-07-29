export type RiskLevel = "low" | "medium" | "high" | "extreme";

import type { CatalystResult } from "../analysis/catalysts";
import type { ConfidenceResult } from "../analysis/confidence";
import type { OpportunityResult } from "../analysis/opportunity";
import type { SmartMoneyResult } from "../analysis/smartMoney";
import type { SecurityAnalysis } from "./security";
import type { AiAnalystResult } from "./ai";
import type { VerdictResult } from "../analysis/verdict";

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
  priceUsd: number;
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

export type MarketBias = "Bullish" | "Neutral" | "Bearish";

export interface TradeSetup {
  marketBias: MarketBias;
  confidence: number;
  suggestedEntryZone: string;
  suggestedStopLoss: string;
  takeProfit1: string;
  takeProfit2: string;
  runner: string;
}

export interface AiDecisionItem {
  label: string;
  impact: "positive" | "negative" | "neutral";
  explanation: string;
}

export interface BiggestRisk {
  factor: string;
  severity: "high" | "critical";
  description: string;
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
  verdict: VerdictResult;
  analyzedAt: string;
  aiSummary: string;
  tradeSetup: TradeSetup;
  aiDecision: AiDecisionItem[];
  biggestRisk: BiggestRisk;
  security: SecurityAnalysis;
  aiAnalyst: AiAnalystResult;
  confidence: ConfidenceResult;
  smartMoney: SmartMoneyResult;
  opportunity: OpportunityResult;
  catalysts: CatalystResult;
}