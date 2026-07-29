export type CatalystDirection =
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH";

export interface CatalystItem {
  title: string;
  direction: CatalystDirection;
  explanation: string;
}

export interface CatalystResult {
  overall: CatalystDirection;
  summary: string;
  bullish: CatalystItem[];
  bearish: CatalystItem[];
}

export interface CatalystInput {
  buySellRatio: number;
  volume24hUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  holderCount: number;
  top10HolderPercent: number;
  momentumPercent: number;
  riskScore: number;
  securityScore: number;
}

function buildSummary(overall: CatalystDirection): string {
  switch (overall) {
    case "BULLISH":
      return "Market participation is strengthening and multiple drivers support continuation.";
    case "NEUTRAL":
      return "Positive and negative catalysts are balanced.";
    case "BEARISH":
      return "Structural risks currently outweigh positive market activity.";
  }
}

function deriveOverall(
  bullish: CatalystItem[],
  bearish: CatalystItem[],
): CatalystDirection {
  const diff = bullish.length - bearish.length;
  if (diff >= 2) return "BULLISH";
  if (diff <= -2) return "BEARISH";
  return "NEUTRAL";
}

export function calculateCatalysts(input: CatalystInput): CatalystResult {
  const bullish: CatalystItem[] = [];
  const bearish: CatalystItem[] = [];

  if (input.buySellRatio >= 1.2) {
    bullish.push({
      title: "Buy Pressure",
      direction: "BULLISH",
      explanation: `Buy/sell ratio at ${input.buySellRatio.toFixed(2)}x indicates sustained buy-side demand.`,
    });
  } else if (input.buySellRatio < 0.8) {
    bearish.push({
      title: "Buy Pressure",
      direction: "BEARISH",
      explanation: `Buy/sell ratio at ${input.buySellRatio.toFixed(2)}x shows sell-side dominance.`,
    });
  }

  if (input.volume24hUsd > input.liquidityUsd) {
    bullish.push({
      title: "Volume",
      direction: "BULLISH",
      explanation: "24h volume exceeds liquidity, signaling active market participation.",
    });
  }

  if (input.momentumPercent > 20) {
    bullish.push({
      title: "Momentum",
      direction: "BULLISH",
      explanation: `Price momentum at +${input.momentumPercent.toFixed(1)}% supports upward continuation.`,
    });
  } else if (input.momentumPercent < -20) {
    bearish.push({
      title: "Momentum",
      direction: "BEARISH",
      explanation: `Price momentum at ${input.momentumPercent.toFixed(1)}% reflects sustained selling pressure.`,
    });
  }

  if (input.liquidityUsd < 15_000) {
    bearish.push({
      title: "Liquidity",
      direction: "BEARISH",
      explanation: "Liquidity below $15K increases slippage and exit risk.",
    });
  }

  if (input.top10HolderPercent > 60) {
    bearish.push({
      title: "Holder Distribution",
      direction: "BEARISH",
      explanation: `Top 10 holders control ${input.top10HolderPercent.toFixed(1)}% of supply, raising concentration risk.`,
    });
  }

  if (input.securityScore > 80) {
    bullish.push({
      title: "Security",
      direction: "BULLISH",
      explanation: `Contract security score of ${input.securityScore} supports safer market structure.`,
    });
  } else if (input.securityScore < 70) {
    bearish.push({
      title: "Security",
      direction: "BEARISH",
      explanation: `Contract security score of ${input.securityScore} flags elevated contract risk.`,
    });
  }

  const overall = deriveOverall(bullish, bearish);

  return {
    overall,
    summary: buildSummary(overall),
    bullish,
    bearish,
  };
}
