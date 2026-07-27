import type {
  AiDecisionItem,
  BiggestRisk,
  FactorScore,
  MarketBias,
  Recommendation,
  TokenMetrics,
  TradeSetup,
} from "../types/tokenMetrics";

interface IntelligenceInput {
  symbol: string;
  metrics: TokenMetrics;
  aiScore: number;
  riskScore: number;
  factorScores: FactorScore[];
  recommendation: Recommendation;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.round(Math.max(min, Math.min(max, value)));
}

function formatPrice(price: number): string {
  if (price <= 0) return "N/A";
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.01) return `$${price.toFixed(6)}`;
  if (price >= 0.0001) return `$${price.toFixed(8)}`;
  return `$${price.toPrecision(4)}`;
}

function formatPriceRange(low: number, high: number): string {
  return `${formatPrice(low)} – ${formatPrice(high)}`;
}

function deriveMarketBias(
  metrics: TokenMetrics,
  aiScore: number,
): MarketBias {
  const bullishSignals =
    (metrics.momentumPercent > 5 ? 1 : 0) +
    (metrics.buySellRatio >= 1.1 ? 1 : 0) +
    (aiScore >= 60 ? 1 : 0);
  const bearishSignals =
    (metrics.momentumPercent < -8 ? 1 : 0) +
    (metrics.buySellRatio < 0.85 ? 1 : 0) +
    (aiScore < 42 ? 1 : 0);

  if (bullishSignals >= 2 && bearishSignals === 0) return "Bullish";
  if (bearishSignals >= 2 && bullishSignals === 0) return "Bearish";
  if (bullishSignals > bearishSignals) return "Bullish";
  if (bearishSignals > bullishSignals) return "Bearish";
  return "Neutral";
}

function deriveConfidence(
  aiScore: number,
  riskScore: number,
  factorScores: FactorScore[],
): number {
  const agreement =
    factorScores.filter((f) =>
      f.score >= 65 ? f.signal === "bullish" : f.score < 45 ? f.signal === "bearish" : true,
    ).length / factorScores.length;

  return clamp(aiScore * 0.55 + (100 - riskScore) * 0.35 + agreement * 10);
}

export function generateAiSummary(input: IntelligenceInput): string {
  const { symbol, metrics, aiScore, riskScore, recommendation } = input;
  const bias = deriveMarketBias(metrics, aiScore);
  const volRatio =
    metrics.marketCapUsd > 0
      ? ((metrics.volume24hUsd / metrics.marketCapUsd) * 100).toFixed(1)
      : "0";

  const scoreTone =
    aiScore >= 70
      ? "strong opportunity profile"
      : aiScore >= 50
        ? "mixed but tradable setup"
        : "weak opportunity profile";

  const riskTone =
    riskScore >= 65
      ? "elevated downside risk warrants tight risk management"
      : riskScore >= 40
        ? "moderate risk that should be sized accordingly"
        : "relatively contained risk for this market cap tier";

  const momentumPhrase =
    metrics.momentumPercent >= 10
      ? `Price is accelerating with +${metrics.momentumPercent.toFixed(1)}% 24h momentum.`
      : metrics.momentumPercent <= -10
        ? `Price is under pressure at ${metrics.momentumPercent.toFixed(1)}% over 24h.`
        : `Momentum is flat to modest at ${metrics.momentumPercent >= 0 ? "+" : ""}${metrics.momentumPercent.toFixed(1)}% (24h).`;

  const flowPhrase =
    metrics.buySellRatio >= 1.2
      ? `Swap flow is net bullish (${metrics.buySellRatio.toFixed(2)}x buy/sell).`
      : metrics.buySellRatio <= 0.85
        ? `Sell-side flow dominates (${metrics.buySellRatio.toFixed(2)}x buy/sell).`
        : `Order flow is balanced near ${metrics.buySellRatio.toFixed(2)}x buy/sell.`;

  return (
    `${symbol} presents a ${scoreTone} with an AI Score of ${aiScore}/100 and ${riskTone} ` +
    `(Risk ${riskScore}/100). ${momentumPhrase} ${flowPhrase} ` +
    `24h volume represents ${volRatio}% of market cap. Copilot recommendation: ${recommendation} ` +
    `with a ${bias.toLowerCase()} market bias based on current on-chain and market structure.`
  );
}

export function generateTradeSetup(input: IntelligenceInput): TradeSetup {
  const { metrics, aiScore, riskScore, factorScores } = input;
  const price = metrics.priceUsd;
  const bias = deriveMarketBias(metrics, aiScore);
  const confidence = deriveConfidence(aiScore, riskScore, factorScores);

  const entryLow =
    bias === "Bullish"
      ? price * 0.985
      : bias === "Bearish"
        ? price * 0.955
        : price * 0.97;
  const entryHigh =
    bias === "Bullish"
      ? price * 1.015
      : bias === "Bearish"
        ? price * 0.985
        : price * 1.01;

  const stopPct =
    riskScore >= 70 ? 0.12 : riskScore >= 45 ? 0.09 : 0.07;
  const stopLoss = price * (1 - stopPct);

  const tp1Mult = bias === "Bullish" ? 1.22 : bias === "Bearish" ? 1.1 : 1.15;
  const tp2Mult = bias === "Bullish" ? 1.55 : bias === "Bearish" ? 1.25 : 1.35;
  const runnerMult = bias === "Bullish" ? 2.2 : bias === "Bearish" ? 1.5 : 1.8;

  return {
    marketBias: bias,
    confidence,
    suggestedEntryZone: formatPriceRange(entryLow, entryHigh),
    suggestedStopLoss: formatPrice(stopLoss),
    takeProfit1: formatPrice(price * tp1Mult),
    takeProfit2: formatPrice(price * tp2Mult),
    runner: `${formatPrice(price * runnerMult)}+`,
  };
}

export function generateAiDecision(input: IntelligenceInput): AiDecisionItem[] {
  const { factorScores, aiScore } = input;
  const isHighScore = aiScore >= 55;

  const sorted = [...factorScores].sort((a, b) =>
    isHighScore ? b.score - a.score : a.score - b.score,
  );

  return sorted.slice(0, 6).map((factor) => {
    const impact: AiDecisionItem["impact"] =
      factor.score >= 65
        ? "positive"
        : factor.score < 45
          ? "negative"
          : "neutral";

    const direction =
      impact === "positive"
        ? "supports"
        : impact === "negative"
          ? "weighs against"
          : "is neutral toward";

    return {
      label: factor.label,
      impact,
      explanation: `${factor.label} ${direction} the AI Score at ${factor.score}/100 (${factor.rawValue}, weight ${(factor.weight * 100).toFixed(0)}%).`,
    };
  });
}

const RISK_FACTOR_KEYS = new Set([
  "top10HolderPercent",
  "liquidity",
  "riskLevel",
  "holderCount",
]);

export function identifyBiggestRisk(input: IntelligenceInput): BiggestRisk {
  const { metrics, factorScores, riskScore } = input;

  const riskCandidates = factorScores.filter((f) =>
    RISK_FACTOR_KEYS.has(f.key),
  );
  const worstFactor = [...riskCandidates].sort((a, b) => a.score - b.score)[0];

  if (metrics.riskLevel === "extreme" || riskScore >= 75) {
    return {
      factor: worstFactor?.label ?? "Structural Risk",
      severity: "critical",
      description:
        worstFactor?.score !== undefined
          ? `${worstFactor.label} is the primary threat at ${worstFactor.score}/100. ${metrics.riskLevel.toUpperCase()} risk classification with Risk Score ${riskScore}/100 — consider avoiding new exposure.`
          : `Risk Score ${riskScore}/100 with ${metrics.riskLevel.toUpperCase()} classification. Capital at significant risk.`,
    };
  }

  if (worstFactor) {
    const severity: BiggestRisk["severity"] =
      worstFactor.score < 35 || riskScore >= 55 ? "critical" : "high";

    const descriptions: Record<string, string> = {
      "Top 10 Holder %": `Whale concentration at ${metrics.top10HolderPercent.toFixed(1)}% creates dump risk if top wallets exit simultaneously.`,
      Liquidity: `Liquidity depth of $${formatCompactUsd(metrics.liquidityUsd)} may not absorb large sells — slippage and exit risk elevated.`,
      "Risk Level": `On-chain and market structure flagged as ${metrics.riskLevel.toUpperCase()} — verify contract safety before sizing up.`,
      "Holder Count": `Only ${metrics.holderCount.toLocaleString()} holders — thin distribution increases volatility and manipulation risk.`,
    };

    return {
      factor: worstFactor.label,
      severity,
      description:
        descriptions[worstFactor.label] ??
        `${worstFactor.label} scored ${worstFactor.score}/100 — monitor closely before increasing position size.`,
    };
  }

  return {
    factor: "Market Volatility",
    severity: "high",
    description: `Risk Score ${riskScore}/100 — multiple factors contribute to elevated uncertainty.`,
  };
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export function generateIntelligence(
  input: Omit<IntelligenceInput, "symbol"> & { symbol: string },
) {
  return {
    aiSummary: generateAiSummary(input),
    tradeSetup: generateTradeSetup(input),
    aiDecision: generateAiDecision(input),
    biggestRisk: identifyBiggestRisk(input),
  };
}
