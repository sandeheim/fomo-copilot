import type { AiAnalystContext, AiAnalystProvider, AiAnalystResult } from "../types/ai";
import type { FactorScore } from "../types/tokenMetrics";

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function topFactor(factors: FactorScore[], best = true): FactorScore | undefined {
  return [...factors].sort((a, b) => (best ? b.score - a.score : a.score - b.score))[0];
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function deriveConfidence(ctx: AiAnalystContext): number {
  const factorAgreement =
    ctx.factorScores.filter((f) =>
      f.score >= 65 ? f.signal === "bullish" : f.score < 45 ? f.signal === "bearish" : true,
    ).length / ctx.factorScores.length;

  const securityWeight = ctx.securityScore * 0.2;
  const aiWeight = ctx.aiScore * 0.35;
  const riskWeight = (100 - ctx.riskScore) * 0.3;
  const agreementWeight = factorAgreement * 15;

  return clamp(aiWeight + riskWeight + securityWeight + agreementWeight);
}

/**
 * Mock AI analyst — rule-based synthesis of scoring engine output.
 * Replace with OpenAiAnalystProvider using the same prompt contract.
 */
export class MockAnalystProvider implements AiAnalystProvider {
  async analyze(context: AiAnalystContext, _prompt: string): Promise<AiAnalystResult> {
    await new Promise((r) => setTimeout(r, 400));

    const { symbol, metrics, aiScore, riskScore, security, tradeSetup, recommendation } =
      context;
    const confidence = deriveConfidence(context);
    const bestFactor = topFactor(context.factorScores, true);
    const worstFactor = topFactor(context.factorScores, false);
    const failedSecurity = security.checks.filter((c) => c.status === "fail");
    const passedSecurity = security.checks.filter((c) => c.status === "pass");

    const composite =
      aiScore * 0.4 + (100 - riskScore) * 0.3 + security.securityScore * 0.3;
    const tone =
      composite >= 65 ? "constructive" : composite >= 45 ? "cautiously neutral" : "defensive";

    const executiveSummary =
      `${symbol} receives a ${tone} analyst rating with AI Score ${aiScore}/100, Risk ${riskScore}/100, ` +
      `and Security ${security.securityScore}/100. The engine recommends ${recommendation} ` +
      `with ${confidence}% confidence. ${metrics.momentumPercent >= 0 ? "Momentum is positive" : "Momentum is negative"} ` +
      `at ${metrics.momentumPercent >= 0 ? "+" : ""}${metrics.momentumPercent.toFixed(1)}% (24h) on ${formatUsd(metrics.volume24hUsd)} volume.`;

    const bullCase =
      bestFactor
        ? `${bestFactor.label} leads the bull case at ${bestFactor.score}/100 (${bestFactor.rawValue}). ` +
          (metrics.buySellRatio >= 1.1
            ? `Buy-side flow at ${metrics.buySellRatio.toFixed(2)}x supports accumulation. `
            : "") +
          (passedSecurity.length >= 5
            ? `${passedSecurity.length}/7 security checks passed including contract safety verification. `
            : "") +
          (context.strengths[0] ?? "Factor alignment suggests upside if momentum sustains.")
        : "Limited bullish signals — monitor for improving factor scores.";

    const bearCase =
      worstFactor
        ? `${worstFactor.label} is the primary headwind at ${worstFactor.score}/100 (${worstFactor.rawValue}). ` +
          (metrics.top10HolderPercent > 45
            ? `Top 10 wallets control ${metrics.top10HolderPercent.toFixed(1)}% — dump risk elevated. `
            : "") +
          (failedSecurity.length > 0
            ? `Security failures: ${failedSecurity.map((c) => c.label).join(", ")}. `
            : "") +
          (context.weaknesses[0] ?? "Risk score remains elevated relative to opportunity.")
        : "Bear case limited by insufficient negative factor data.";

    const biggestOpportunity =
      bestFactor && bestFactor.score >= 60
        ? `${bestFactor.label} (${bestFactor.score}/100) — ${bestFactor.signal === "bullish" ? "strong bullish signal" : "neutral-to-positive"} with ${bestFactor.rawValue} suggests this is the highest-conviction upside driver.`
        : metrics.momentumPercent > 10
          ? `Momentum breakout at +${metrics.momentumPercent.toFixed(1)}% (24h) with ${formatUsd(metrics.volume24hUsd)} volume could attract continuation buyers.`
          : `Market cap at ${formatUsd(metrics.marketCapUsd)} in the ${metrics.riskLevel} risk tier leaves room for re-rating if volume expands.`;

    const biggestThreat =
      failedSecurity.length > 0
        ? `Contract security: ${failedSecurity[0].label} flagged FAIL — ${failedSecurity[0].explanation}`
        : riskScore >= 60
          ? `Elevated Risk Score (${riskScore}/100) driven by concentration and liquidity profile — ${context.weaknesses[0] ?? "structural risk"}.`
          : worstFactor
            ? `${worstFactor.label} at ${worstFactor.score}/100 — ${worstFactor.rawValue} creates downside vulnerability.`
            : `Macro sentiment shift could compress ${formatUsd(metrics.marketCapUsd)} market cap rapidly.`;

    const tradingPlan =
      `1. Bias: ${tradeSetup.marketBias} — wait for entry in ${tradeSetup.suggestedEntryZone}. ` +
      `2. Size: ${confidence >= 70 ? "Standard" : confidence >= 50 ? "Half" : "Scout"} position given ${confidence}% confidence. ` +
      `3. Stop: ${tradeSetup.suggestedStopLoss} (hard exit). ` +
      `4. Targets: TP1 ${tradeSetup.takeProfit1}, TP2 ${tradeSetup.takeProfit2}, runner ${tradeSetup.runner}. ` +
      `5. Invalidation: Close below stop or Security Score drops below ${Math.max(security.securityScore - 15, 30)}.`;

    const reasoning =
      `Synthesis weighted AI Score (${aiScore}) at 40%, inverse Risk (${100 - riskScore}) at 30%, ` +
      `Security (${security.securityScore}) at 30% → composite ${clamp(composite)}/100. ` +
      `Top factor: ${bestFactor?.label ?? "N/A"} (${bestFactor?.score ?? 0}/100). ` +
      `Weakest factor: ${worstFactor?.label ?? "N/A"} (${worstFactor?.score ?? 0}/100). ` +
      `Security: ${passedSecurity.length} pass, ${failedSecurity.length} fail, ${security.checks.filter((c) => c.status === "warn").length} warn. ` +
      `Data sources: DexScreener market data, RugCheck${security.sources.rugcheck ? " ✓" : " ✗"}, GoPlus${security.sources.goplus ? " ✓" : " ✗"}. ` +
      `Recommendation ${recommendation} derived from score matrix, adjusted by security posture.`;

    return {
      executiveSummary,
      bullCase,
      bearCase,
      confidence,
      biggestOpportunity,
      biggestThreat,
      tradingPlan,
      reasoning,
      provider: "mock",
    };
  }
}
