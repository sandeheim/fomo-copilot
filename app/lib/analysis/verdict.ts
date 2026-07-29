export type Verdict =
  | "STRONG BUY"
  | "BUY"
  | "HOLD"
  | "HIGH RISK"
  | "AVOID";

export type TradeQuality = "A" | "B" | "C" | "D" | "F";

export interface VerdictResult {
  verdict: Verdict;
  tradeQuality: TradeQuality;
  positionSize: string;
  summary: string;
}

export function calculateVerdict(
  aiScore: number,
  riskScore: number,
  securityScore: number,
): VerdictResult {
  if (securityScore < 60 || riskScore >= 90) {
    return {
      verdict: "AVOID",
      tradeQuality: "F",
      positionSize: "0%",
      summary: "Security or risk conditions are too weak for a new position.",
    };
  }

  if (
    aiScore >= 85 &&
    riskScore <= 30 &&
    securityScore >= 80
  ) {
    return {
      verdict: "STRONG BUY",
      tradeQuality: "A",
      positionSize: "3–5%",
      summary: "Strong opportunity score with contained risk and solid security.",
    };
  }

  if (
    aiScore >= 70 &&
    riskScore <= 50 &&
    securityScore >= 70
  ) {
    return {
      verdict: "BUY",
      tradeQuality: "B",
      positionSize: "1–2%",
      summary: "Favorable setup, but position sizing should remain controlled.",
    };
  }

  if (
    aiScore >= 50 &&
    riskScore < 75
  ) {
    return {
      verdict: "HOLD",
      tradeQuality: "C",
      positionSize: "0.5–1%",
      summary: "Mixed signals. Wait for stronger confirmation before adding size.",
    };
  }

  return {
    verdict: "HIGH RISK",
    tradeQuality: "D",
    positionSize: "0–0.5%",
    summary: "The setup is speculative and carries elevated downside risk.",
  };
}