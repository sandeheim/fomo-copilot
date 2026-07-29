export type SmartMoneySignal =
  | "ACCUMULATION"
  | "NEUTRAL"
  | "DISTRIBUTION"
  | "HIGH MANIPULATION RISK";

export type SmartMoneyReasonTone =
  | "positive"
  | "negative"
  | "neutral";

export interface SmartMoneyReason {
  label: string;
  impact: number;
  tone: SmartMoneyReasonTone;
}

export interface SmartMoneyResult {
  score: number;
  signal: SmartMoneySignal;
  summary: string;
  reasons: SmartMoneyReason[];
  limitations: string[];
}

export interface SmartMoneyInput {
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

const PROXY_LIMITATION =
  "Proxy estimate only — wallet-level transaction history is not yet available.";

function buildSummary(signal: SmartMoneySignal): string {
  switch (signal) {
    case "ACCUMULATION":
      return "Buy pressure and momentum support accumulation, with acceptable holder distribution.";
    case "NEUTRAL":
      return "Signals are mixed. Market activity is positive, but structural risks limit conviction.";
    case "DISTRIBUTION":
      return "Selling pressure and weak market structure suggest distribution.";
    case "HIGH MANIPULATION RISK":
      return "Positive activity is outweighed by concentration, security, or manipulation risk.";
  }
}

export function calculateSmartMoneyProxy(
  input: SmartMoneyInput,
): SmartMoneyResult {
  let score = 50;
  const reasons: SmartMoneyReason[] = [];

  if (input.buySellRatio >= 1.5) {
    score += 15;
    reasons.push({
      label: "Strong buy-side pressure",
      impact: 15,
      tone: "positive",
    });
  } else if (input.buySellRatio >= 1.15) {
    score += 7;
    reasons.push({
      label: "Moderate buy-side pressure",
      impact: 7,
      tone: "positive",
    });
  } else if (input.buySellRatio < 0.8) {
    score -= 15;
    reasons.push({
      label: "Distribution warning: sell pressure exceeds buys",
      impact: -15,
      tone: "negative",
    });
  }

  if (input.volume24hUsd > input.marketCapUsd) {
    score += 8;
    reasons.push({
      label:
        "24h volume exceeds market cap — may reflect accumulation or speculation",
      impact: 8,
      tone: "neutral",
    });
  }

  if (input.liquidityUsd > 0) {
    const volumeLiquidityRatio = input.volume24hUsd / input.liquidityUsd;
    if (volumeLiquidityRatio > 8) {
      score -= 8;
      reasons.push({
        label: "High volume-to-liquidity turnover may be unstable",
        impact: -8,
        tone: "negative",
      });
    }
  }

  if (input.momentumPercent > 20) {
    score += 7;
    reasons.push({
      label: "Positive price momentum above 20%",
      impact: 7,
      tone: "positive",
    });
  } else if (input.momentumPercent < -20) {
    score -= 10;
    reasons.push({
      label: "Negative price momentum below -20%",
      impact: -10,
      tone: "negative",
    });
  }

  if (input.top10HolderPercent > 60) {
    score -= 20;
    reasons.push({
      label: "Top 10 holders control more than 60% of supply",
      impact: -20,
      tone: "negative",
    });
  } else if (
    input.top10HolderPercent >= 40 &&
    input.top10HolderPercent <= 60
  ) {
    score -= 10;
    reasons.push({
      label: "Top 10 holder concentration between 40% and 60%",
      impact: -10,
      tone: "negative",
    });
  }

  if (input.holderCount < 300) {
    score -= 10;
    reasons.push({
      label: "Low holder count below 300",
      impact: -10,
      tone: "negative",
    });
  } else if (input.holderCount > 1000) {
    score += 5;
    reasons.push({
      label: "Holder base above 1,000 addresses",
      impact: 5,
      tone: "positive",
    });
  }

  if (input.securityScore < 70) {
    score -= 12;
    reasons.push({
      label: "Contract security score below 70",
      impact: -12,
      tone: "negative",
    });
  }

  if (input.riskScore > 75) {
    score -= 12;
    reasons.push({
      label: "Risk score above 75",
      impact: -12,
      tone: "negative",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let signal: SmartMoneySignal;

  if (input.top10HolderPercent > 65 || input.riskScore >= 85) {
    signal = "HIGH MANIPULATION RISK";
  } else if (score >= 70 && input.top10HolderPercent <= 50) {
    signal = "ACCUMULATION";
  } else if (score >= 45) {
    signal = "NEUTRAL";
  } else if (score < 45 && input.buySellRatio < 0.9) {
    signal = "DISTRIBUTION";
  } else {
    signal = "NEUTRAL";
  }

  return {
    score,
    signal,
    summary: buildSummary(signal),
    reasons,
    limitations: [PROXY_LIMITATION],
  };
}
