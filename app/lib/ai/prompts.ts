import type { AiAnalystContext } from "../types/ai";

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export const ANALYST_SYSTEM_PROMPT = `
You are Fomo Copilot.

You are an elite Solana memecoin analyst working for a professional trading desk.

Your only objective is to determine whether this token offers a favorable risk/reward opportunity based ONLY on the supplied data.

Rules:

- Never invent facts.
- Never hallucinate missing metrics.
- Never use outside knowledge.
- Never mention data that was not provided.
- If information is missing, explicitly state that it is unavailable.
- Keep responses concise, institutional and data-driven.
- Never give guarantees.
- Never use emojis or hype language.

Your analysis priority:

1. Contract security
2. Liquidity quality
3. Holder distribution
4. Buy vs Sell pressure
5. Trading volume quality
6. Momentum
7. Market Cap
8. Trade setup

Always explain BOTH:

- Why the token looks attractive.
- Why the token is risky.

Mandatory warnings:

- If Security Score < 70, clearly warn about contract risk.
- If Top10 holders > 50%, clearly warn about concentration risk.
- If liquidity is unlocked, clearly warn about rug risk.
- If Buy/Sell Ratio > 3, mention strong buying pressure.
- If Buy/Sell Ratio < 0.5, mention strong selling pressure.

Your goal is not to convince the user to buy.

Your goal is to objectively evaluate whether the opportunity is worth the risk using only the supplied metrics.
`;

export const ANALYST_JSON_SCHEMA = `
{
  "executiveSummary": "string",
  "bullCase": "string",
  "bearCase": "string",
  "confidence": 0,
  "biggestOpportunity": "string",
  "biggestThreat": "string",
  "tradingPlan": "string",
  "reasoning": "string"
}
`;

/**
 * Builds the analyst user prompt from scoring engine output.
 */
export function buildAnalystPrompt(context: AiAnalystContext): string {
  const { metrics, factorScores, security } = context;

  const factorLines = factorScores
    .map(
      (f) =>
        `- ${f.label}: score ${f.score}/100, raw ${f.rawValue}, weight ${(f.weight * 100).toFixed(0)}%, signal ${f.signal}`,
    )
    .join("\n");

  const securityLines = security.checks
    .map(
      (c) =>
        `- ${c.label}: ${c.status.toUpperCase()} — ${c.value} — ${c.explanation}`,
    )
    .join("\n");

  const strengthLines =
    context.strengths.length > 0
      ? context.strengths.map((s) => `- ${s}`).join("\n")
      : "- None flagged";

  const weaknessLines =
    context.weaknesses.length > 0
      ? context.weaknesses.map((w) => `- ${w}`).join("\n")
      : "- None flagged";

  const rugCheckNote = security.sources.rugcheck
    ? `RugCheck normalised risk score: ${security.rugCheckNormalisedScore ?? "N/A"}`
    : "RugCheck: data unavailable";

  const goPlusNote = security.sources.goplus
    ? "GoPlus: data available"
    : "GoPlus: data unavailable";

  return `Analyze this Solana token using ONLY the data below.

TOKEN: ${context.symbol}
CONTRACT: ${context.contractAddress}

SCORES:
- AI Score: ${context.aiScore}/100
- Risk Score: ${context.riskScore}/100
- Security Score: ${context.securityScore}/100
- Recommendation: ${context.recommendation}

DEXSCREENER METRICS:
- Price USD: ${metrics.priceUsd}
- Market Cap: ${formatUsd(metrics.marketCapUsd)}
- Liquidity: ${formatUsd(metrics.liquidityUsd)}
- 24h Volume: ${formatUsd(metrics.volume24hUsd)}
- Buy/Sell Ratio: ${metrics.buySellRatio.toFixed(2)}x
- Holders: ${metrics.holderCount.toLocaleString()}
- Top 10 Holder %: ${metrics.top10HolderPercent.toFixed(1)}%
- 24h Momentum: ${
    metrics.momentumPercent >= 0 ? "+" : ""
  }${metrics.momentumPercent.toFixed(1)}%
- Risk Level: ${metrics.riskLevel.toUpperCase()}

FACTOR BREAKDOWN:
${factorLines}

SECURITY:
${rugCheckNote}
${goPlusNote}
${securityLines}

STRENGTHS:
${strengthLines}

WEAKNESSES:
${weaknessLines}

TRADE SETUP:
- Market Bias: ${context.tradeSetup.marketBias}
- Entry Zone: ${context.tradeSetup.suggestedEntryZone}
- Stop Loss: ${context.tradeSetup.suggestedStopLoss}
- Take Profit 1: ${context.tradeSetup.takeProfit1}
- Take Profit 2: ${context.tradeSetup.takeProfit2}
- Runner: ${context.tradeSetup.runner}

Return ONLY valid JSON matching this schema:

${ANALYST_JSON_SCHEMA}
`;
}