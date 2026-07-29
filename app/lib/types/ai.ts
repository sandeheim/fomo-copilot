import type {
  FactorScore,
  Recommendation,
  TokenMetrics,
  TradeSetup,
} from "./tokenMetrics";
import type { SecurityAnalysis } from "./security";

/** Full scoring + market context fed to any AI analyst provider. */
export interface AiAnalystContext {
  symbol: string;
  contractAddress: string;
  aiScore: number;
  riskScore: number;
  securityScore: number;
  recommendation: Recommendation;
  metrics: TokenMetrics;
  factorScores: FactorScore[];
  security: SecurityAnalysis;
  strengths: string[];
  weaknesses: string[];
  tradeSetup: TradeSetup;
}

/** Structured output from the AI analyst layer. */
export interface AiAnalystResult {
  executiveSummary: string;
  bullCase: string;
  bearCase: string;
  confidence: number;
  biggestOpportunity: string;
  biggestThreat: string;
  tradingPlan: string;
  reasoning: string;
  provider: string;
}

/** Swap MockAnalystProvider for a GPT provider without UI changes. */
export interface AiAnalystProvider {
  analyze(context: AiAnalystContext, prompt: string): Promise<AiAnalystResult>;
}
