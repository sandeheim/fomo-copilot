import { DexScreenerProvider } from "../data/dexscreenerProvider";
import type { TokenDataProvider } from "../data/tokenDataProvider";
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
  const metrics = await provider.fetchMetrics(contractAddress);
  const factorScores = computeFactorScores(metrics);
  const aiScore = computeAiScore(factorScores);
  const riskScore = computeRiskScore(metrics);
  const recommendation = deriveRecommendation(aiScore, riskScore);

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
  };
}

export { buildRecommendationText };
