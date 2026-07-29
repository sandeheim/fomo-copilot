export type OpportunityStage =
  | "EARLY"
  | "MOMENTUM"
  | "MATURE"
  | "EXHAUSTED"
  | "HIGH RISK";

export interface OpportunityResult {
  score: number;
  upsideProbability: number;
  downsideProbability: number;
  expectedRiskReward: number;
  entryQuality: number;
  stage: OpportunityStage;
  summary: string;
  positives: string[];
  negatives: string[];
  limitation: string;
}

export interface OpportunityInput {
  aiScore: number;
  riskScore: number;
  securityScore: number;
  confidenceScore: number;
  smartMoneyScore: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  buySellRatio: number;
  holderCount: number;
  top10HolderPercent: number;
  momentumPercent: number;
  riskLevel: "low" | "medium" | "high" | "extreme";
}

const OPPORTUNITY_LIMITATION =
  "Model estimate only — not a guaranteed forecast.";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function buildSummary(stage: OpportunityStage): string {
  switch (stage) {
    case "EARLY":
      return "Early-stage setup with upside potential, but limited liquidity and holder depth increase execution risk.";
    case "MOMENTUM":
      return "Momentum is active and market participation is strong, but entry quality depends on risk and concentration.";
    case "MATURE":
      return "The setup is more established, with moderate upside and more limited asymmetry.";
    case "EXHAUSTED":
      return "Price action may be extended after a sharp move. Pullback risk is elevated.";
    case "HIGH RISK":
      return "Structural risk outweighs the current opportunity profile.";
  }
}

function deriveStage(input: OpportunityInput): OpportunityStage {
  if (input.riskScore >= 80 || input.securityScore < 60) {
    return "HIGH RISK";
  }
  if (input.momentumPercent > 150) {
    return "EXHAUSTED";
  }
  if (input.marketCapUsd < 250_000 && input.holderCount < 1000) {
    return "EARLY";
  }
  if (input.momentumPercent >= 20 && input.volume24hUsd > input.liquidityUsd) {
    return "MOMENTUM";
  }
  return "MATURE";
}

function deriveExpectedRiskReward(score: number): number {
  if (score >= 80) return 4.0;
  if (score >= 70) return 3.0;
  if (score >= 60) return 2.2;
  if (score >= 50) return 1.5;
  return 0.8;
}

export function calculateOpportunity(
  input: OpportunityInput,
): OpportunityResult {
  let score = 50;
  const positives: string[] = [];
  const negatives: string[] = [];

  if (input.aiScore >= 70) {
    score += 12;
    positives.push("Strong AI score supports opportunity");
  } else if (input.aiScore >= 55) {
    score += 6;
    positives.push("Moderate AI score");
  } else if (input.aiScore < 40) {
    score -= 12;
    negatives.push("Weak AI score below 40");
  }

  if (input.smartMoneyScore >= 70) {
    score += 12;
    positives.push("Smart money proxy score is strong");
  } else if (input.smartMoneyScore >= 50) {
    score += 5;
    positives.push("Smart money proxy score is supportive");
  } else if (input.smartMoneyScore < 35) {
    score -= 10;
    negatives.push("Smart money proxy score is weak");
  }

  if (input.confidenceScore >= 70) {
    score += 8;
    positives.push("High confidence in underlying data");
  } else if (input.confidenceScore < 40) {
    score -= 8;
    negatives.push("Low confidence in underlying data");
  }

  if (input.securityScore >= 80) {
    score += 8;
    positives.push("Strong contract security score");
  } else if (input.securityScore < 70) {
    score -= 12;
    negatives.push("Contract security score below 70");
  }

  if (input.riskScore >= 75) {
    score -= 15;
    negatives.push("Elevated risk score");
  } else if (input.riskScore <= 40) {
    score += 7;
    positives.push("Risk score is contained");
  }

  if (input.buySellRatio >= 1.5) {
    score += 8;
    positives.push("Strong buy-side pressure");
  } else if (input.buySellRatio < 0.8) {
    score -= 10;
    negatives.push("Sell pressure exceeds buys");
  }

  if (input.momentumPercent >= 10 && input.momentumPercent <= 80) {
    score += 8;
    positives.push("Momentum in a constructive range");
  } else if (input.momentumPercent > 150) {
    score -= 5;
    negatives.push("Move may be extended after sharp price action");
  } else if (input.momentumPercent < -20) {
    score -= 10;
    negatives.push("Negative momentum below -20%");
  }

  if (input.marketCapUsd > 0) {
    const liquidityRatio = input.liquidityUsd / input.marketCapUsd;
    if (liquidityRatio >= 0.15) {
      score += 6;
      positives.push("Healthy liquidity relative to market cap");
    } else if (liquidityRatio < 0.05) {
      score -= 10;
      negatives.push("Thin liquidity relative to market cap");
    }
  }

  if (input.top10HolderPercent > 60) {
    score -= 15;
    negatives.push("High top-10 holder concentration");
  } else if (input.top10HolderPercent < 35) {
    score += 7;
    positives.push("Acceptable holder distribution");
  }

  if (input.holderCount > 1000) {
    score += 5;
    positives.push("Broad holder base above 1,000");
  } else if (input.holderCount < 300) {
    score -= 8;
    negatives.push("Low holder count below 300");
  }

  score = Math.round(clamp(score));

  const upsideProbability = Math.round(
    clamp(score * 0.85 + input.confidenceScore * 0.15),
  );
  const downsideProbability = 100 - upsideProbability;

  const entryQuality = Math.round(
    clamp(
      input.aiScore * 0.35 +
        input.smartMoneyScore * 0.25 +
        input.confidenceScore * 0.2 +
        input.securityScore * 0.2 -
        input.riskScore * 0.2,
    ),
  );

  const expectedRiskReward = deriveExpectedRiskReward(score);
  const stage = deriveStage(input);

  return {
    score,
    upsideProbability,
    downsideProbability,
    expectedRiskReward,
    entryQuality,
    stage,
    summary: buildSummary(stage),
    positives,
    negatives,
    limitation: OPPORTUNITY_LIMITATION,
  };
}
