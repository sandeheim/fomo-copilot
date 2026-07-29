import type {
  AiAnalystContext,
  AiAnalystProvider,
  AiAnalystResult,
} from "../types/ai";
import { callOpenAIChat, OPENAI_MODEL } from "./openai";
import { ANALYST_SYSTEM_PROMPT, buildAnalystPrompt } from "./prompts";

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing or invalid field: ${field}`);
  }
  return value.trim();
}

export function parseAnalystResponse(raw: string): AiAnalystResult {
  const parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;

  const confidenceRaw = parsed.confidence;
  const confidence =
    typeof confidenceRaw === "number"
      ? clamp(confidenceRaw)
      : typeof confidenceRaw === "string"
        ? clamp(parseInt(confidenceRaw, 10) || 0)
        : 0;

  return {
    executiveSummary: requireString(parsed.executiveSummary, "executiveSummary"),
    bullCase: requireString(parsed.bullCase, "bullCase"),
    bearCase: requireString(parsed.bearCase, "bearCase"),
    confidence,
    biggestOpportunity: requireString(parsed.biggestOpportunity, "biggestOpportunity"),
    biggestThreat: requireString(parsed.biggestThreat, "biggestThreat"),
    tradingPlan: requireString(parsed.tradingPlan, "tradingPlan"),
    reasoning: requireString(parsed.reasoning, "reasoning"),
    provider: "openai",
  };
}

/** GPT-powered analyst — uses OpenAI with structured JSON output. */
export class OpenAIAnalystProvider implements AiAnalystProvider {
  async analyze(context: AiAnalystContext, prompt: string): Promise<AiAnalystResult> {
    const userPrompt = prompt || buildAnalystPrompt(context);
    const raw = await callOpenAIChat({
      system: ANALYST_SYSTEM_PROMPT,
      user: userPrompt,
      model: OPENAI_MODEL,
    });
    return parseAnalystResponse(raw);
  }
}
