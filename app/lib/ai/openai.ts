export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

export const OPENAI_MODEL = "gpt-4.1-mini";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  error?: { message?: string };
}

export function getOpenAIApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY;
}

export async function callOpenAIChat(options: {
  system: string;
  user: string;
  model?: string;
}): Promise<string> {
  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    throw new OpenAIError("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? OPENAI_MODEL,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = (await response.json()) as ChatCompletionResponse;
      detail = errBody.error?.message ?? detail;
    } catch {
      // use statusText
    }
    throw new OpenAIError(`OpenAI API error: ${detail}`, response.status);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new OpenAIError("OpenAI returned an empty response.");
  }

  return content;
}
