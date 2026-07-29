export type AlphaGrade =
  | "A"
  | "B"
  | "C"
  | "D"
  | "F";

export interface AlphaComponent {
  label: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface AlphaResult {
  score: number;
  grade: AlphaGrade;
  label: string;
  components: AlphaComponent[];
  positives: string[];
  negatives: string[];
  limitation: string;
}

export interface AlphaInput {
  aiScore: number;
  riskScore: number;
  securityScore: number;
  confidenceScore: number;
  smartMoneyScore: number;
  opportunityScore: number;
  entryQuality: number;
  catalystOverall: "BULLISH" | "NEUTRAL" | "BEARISH";
  top10HolderPercent: number;
  liquidityUsd: number;
  marketCapUsd: number;
}

const ALPHA_LIMITATION =
  "Composite ranking estimate only — not a guaranteed forecast.";

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function deriveGrade(score: number): AlphaGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

function deriveLabel(grade: AlphaGrade): string {
  switch (grade) {
    case "A":
      return "Elite setup";
    case "B":
      return "Strong candidate";
    case "C":
      return "Mixed opportunity";
    case "D":
      return "Weak setup";
    case "F":
      return "Avoid candidate";
  }
}

function buildComponent(
  label: string,
  score: number,
  weight: number,
): AlphaComponent {
  return {
    label,
    score,
    weight,
    contribution: score * weight,
  };
}

export function calculateAlphaScore(
  input: AlphaInput,
): AlphaResult {
  const inverseRiskScore = 100 - input.riskScore;

  const components: AlphaComponent[] = [
    buildComponent("Opportunity Score", input.opportunityScore, 0.25),
    buildComponent("AI Score", input.aiScore, 0.2),
    buildComponent("Smart Money Score", input.smartMoneyScore, 0.15),
    buildComponent("Confidence Score", input.confidenceScore, 0.15),
    buildComponent("Security Score", input.securityScore, 0.1),
    buildComponent("Entry Quality", input.entryQuality, 0.1),
    buildComponent("Inverse Risk Score", inverseRiskScore, 0.05),
  ];

  let score = Math.round(
    components.reduce((sum, component) => sum + component.contribution, 0),
  );

  if (input.catalystOverall === "BULLISH") {
    score += 5;
  } else if (input.catalystOverall === "BEARISH") {
    score -= 7;
  }

  if (input.top10HolderPercent > 70) {
    score -= 15;
  } else if (input.top10HolderPercent > 60) {
    score -= 10;
  } else if (input.top10HolderPercent > 50) {
    score -= 5;
  } else if (input.top10HolderPercent < 35) {
    score += 4;
  }

  const liquidityRatio =
    input.marketCapUsd > 0 ? input.liquidityUsd / input.marketCapUsd : 0;

  if (liquidityRatio >= 0.2) {
    score += 5;
  } else if (liquidityRatio >= 0.1) {
    score += 2;
  } else if (liquidityRatio < 0.03) {
    score -= 10;
  }

  if (input.liquidityUsd < 15_000) {
    score -= 5;
  }

  const securityKillSwitch = input.securityScore < 60;
  const riskKillSwitch = input.riskScore >= 85;

  if (securityKillSwitch && riskKillSwitch) {
    score -= 40;
  } else {
    if (securityKillSwitch) score -= 20;
    if (riskKillSwitch) score -= 20;
  }

  score = Math.round(clamp(score));

  const positives: string[] = [];
  const negatives: string[] = [];

  if (input.opportunityScore > 70) {
    positives.push("Opportunity score above 70");
  }
  if (input.aiScore > 70) {
    positives.push("AI score above 70");
  }
  if (input.smartMoneyScore > 65) {
    positives.push("Smart Money score above 65");
  }
  if (input.confidenceScore > 70) {
    positives.push("Confidence above 70");
  }
  if (input.securityScore > 80) {
    positives.push("Security above 80");
  }
  if (input.catalystOverall === "BULLISH") {
    positives.push("Bullish catalysts");
  }
  if (liquidityRatio >= 0.1) {
    positives.push("Healthy liquidity relative to market cap");
  }
  if (input.top10HolderPercent < 35) {
    positives.push("Diversified holder distribution");
  }

  if (input.riskScore > 70) {
    negatives.push("Risk score above 70");
  }
  if (input.securityScore < 70) {
    negatives.push("Security below 70");
  }
  if (input.top10HolderPercent > 60) {
    negatives.push("Top 10 concentration above 60%");
  }
  if (input.liquidityUsd < 15_000 || liquidityRatio < 0.03) {
    negatives.push("Low liquidity");
  }
  if (input.catalystOverall === "BEARISH") {
    negatives.push("Bearish catalysts");
  }
  if (input.entryQuality < 45) {
    negatives.push("Entry quality below 45");
  }
  if (input.confidenceScore < 40) {
    negatives.push("Confidence below 40");
  }

  const grade = deriveGrade(score);

  return {
    score,
    grade,
    label: deriveLabel(grade),
    components,
    positives,
    negatives,
    limitation: ALPHA_LIMITATION,
  };
}
