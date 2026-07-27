import { DexScreenerProvider } from "../data/dexscreenerProvider";
import type { TokenDataProvider } from "../data/tokenDataProvider";
import { generateIntelligence } from "../intelligence/aiIntelligence";
import { analyzeSecurity } from "../security/securityEngine";
import type { AnalysisResult } from "../types/tokenMetrics";
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

  const intelligence = generateIntelligence({
    symbol: metrics.symbol,
    metrics,
    aiScore,
    riskScore,
    factorScores,
    recommendation,
  });

  return {
    contractAddress: metrics.contractAddress,
    symbol: metrics.symbol,
    metrics,
    aiScore,
    riskScore,
    factorScores,
    strengths: generateStrengths(metrics, factorScores),
    weaknesses: generateWeaknesses(metrics, factorScores),
    recommendation,
    analyzedAt: new Date().toISOString(),
    ...intelligence,
    security,
  };
}

export { buildRecommendationText };
