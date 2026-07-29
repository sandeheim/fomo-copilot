import { DexScreenerProvider } from "../data/dexscreenerProvider";
import type { TokenDataProvider } from "../data/tokenDataProvider";
import { runAiAnalyst } from "../ai/aiAnalyst";
import { generateIntelligence } from "../intelligence/aiIntelligence";
import { analyzeSecurity } from "../security/securityEngine";
import type { AnalysisResult } from "../types/tokenMetrics";
import { calculateVerdict } from "./verdict";
import { buildConfidence } from "./confidence";
import { calculateSmartMoneyProxy } from "./smartMoney";
import { calculateOpportunity } from "./opportunity";
import { calculateCatalysts } from "./catalysts";
import {
  buildRecommendationText,
  computeAiScore,
  computeFactorScores,
  computeRiskScore,
  deriveRecommendation,
  generateStrengths,
  generateWeaknesses,
} from "../scoring/scoringEngine";

const defaultProvider: TokenDataProvider = new DexScreenerProvider();

export async function analyzeToken(
  contractAddress: string,
  provider: TokenDataProvider = defaultProvider,
): Promise<AnalysisResult> {
  const [metrics, security] = await Promise.all([
    provider.fetchMetrics(contractAddress),
    analyzeSecurity(contractAddress),
  ]);

  const factorScores = computeFactorScores(metrics);
  const aiScore = computeAiScore(factorScores);
  const riskScore = computeRiskScore(metrics);
  const recommendation = deriveRecommendation(aiScore, riskScore);

  const verdict = calculateVerdict(
    aiScore,
    riskScore,
    security.securityScore,
  );

  const intelligence = generateIntelligence({
    symbol: metrics.symbol,
    metrics,
    aiScore,
    riskScore,
    factorScores,
    recommendation,
  });

  const strengths = generateStrengths(metrics, factorScores);
  const weaknesses = generateWeaknesses(metrics, factorScores);
  const confidence = buildConfidence({
    metrics,
    security,
  });
  const smartMoney = calculateSmartMoneyProxy({
    buySellRatio: metrics.buySellRatio,
    volume24hUsd: metrics.volume24hUsd,
    liquidityUsd: metrics.liquidityUsd,
    marketCapUsd: metrics.marketCapUsd,
    holderCount: metrics.holderCount,
    top10HolderPercent: metrics.top10HolderPercent,
    momentumPercent: metrics.momentumPercent,
    riskScore,
    securityScore: security.securityScore,
  });
  const opportunity = calculateOpportunity({
    aiScore,
    riskScore,
    securityScore: security.securityScore,
    confidenceScore: confidence.score,
    smartMoneyScore: smartMoney.score,
    marketCapUsd: metrics.marketCapUsd,
    liquidityUsd: metrics.liquidityUsd,
    volume24hUsd: metrics.volume24hUsd,
    buySellRatio: metrics.buySellRatio,
    holderCount: metrics.holderCount,
    top10HolderPercent: metrics.top10HolderPercent,
    momentumPercent: metrics.momentumPercent,
    riskLevel: metrics.riskLevel,
  });
  const catalysts = calculateCatalysts({
    buySellRatio: metrics.buySellRatio,
    volume24hUsd: metrics.volume24hUsd,
    liquidityUsd: metrics.liquidityUsd,
    marketCapUsd: metrics.marketCapUsd,
    holderCount: metrics.holderCount,
    top10HolderPercent: metrics.top10HolderPercent,
    momentumPercent: metrics.momentumPercent,
    riskScore,
    securityScore: security.securityScore,
  });
  const aiAnalyst = await runAiAnalyst({
    symbol: metrics.symbol,
    contractAddress: metrics.contractAddress,
    aiScore,
    riskScore,
    securityScore: security.securityScore,
    recommendation,
    metrics,
    factorScores,
    security,
    strengths,
    weaknesses,
    tradeSetup: intelligence.tradeSetup,
  });

  return {
    contractAddress: metrics.contractAddress,
    symbol: metrics.symbol,
    metrics,
    aiScore,
    riskScore,
    factorScores,
    strengths,
    weaknesses,
    recommendation,
    verdict,
    analyzedAt: new Date().toISOString(),
    ...intelligence,
    security,
    aiAnalyst,
    confidence,
    smartMoney,
    opportunity,
    catalysts,
  };
}

export { buildRecommendationText };