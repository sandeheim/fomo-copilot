"use server";

import { analyzeToken } from "../lib/analysis/analyzeToken";
import { DexScreenerApiError, TokenNotFoundError } from "../lib/errors";
import type { AnalysisResult } from "../lib/types/tokenMetrics";

export type AnalyzeTokenActionResult =
  | { ok: true; data: AnalysisResult }
  | { ok: false; error: string };

export async function analyzeTokenAction(
  contractAddress: string,
): Promise<AnalyzeTokenActionResult> {
  try {
    const data = await analyzeToken(contractAddress);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof TokenNotFoundError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof DexScreenerApiError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: "Analysis failed. Please try again.",
    };
  }
}
