import type { AiAnalystContext, AiAnalystProvider, AiAnalystResult } from "../types/ai";
import { OpenAIAnalystProvider } from "./gptAnalyst";
import { MockAnalystProvider } from "./mockAnalyst";
import { buildAnalystPrompt } from "./prompts";

const openaiProvider = new OpenAIAnalystProvider();
const fallbackProvider = new MockAnalystProvider();

export async function runAiAnalyst(
  context: AiAnalystContext,
  provider?: AiAnalystProvider,
): Promise<AiAnalystResult> {
  const prompt = buildAnalystPrompt(context);

  if (provider) {
    return provider.analyze(context, prompt);
  }

  try {
    return await openaiProvider.analyze(context, prompt);
  } catch (error) {
    console.error("OPENAI FAILED:", error);
  
    const fallback = await fallbackProvider.analyze(context, prompt);
  
    return {
      ...fallback,
      provider: "mock-fallback",
    };
   }
  }

export { buildAnalystPrompt };
