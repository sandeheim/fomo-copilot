"use server";

import { analyzeToken } from "../lib/analysis/analyzeToken";
import {
  buildRadarCandidates,
  fetchAllDiscoverySeeds,
  fetchSolanaTokenMarketData,
} from "../lib/radar/dexscreenerDiscovery";
import {
  calculateRadarPrefilter,
  DEFAULT_RADAR_PREFILTER_THRESHOLDS,
  passesRadarHardMinimums,
} from "../lib/radar/prefilter";
import type { RadarCandidate, RadarScanResult } from "../lib/radar/types";
import type { AnalysisResult } from "../lib/types/tokenMetrics";

const MAX_FULL_ANALYSES = 20;
const TOP_SHORTLIST_SIZE = 20;
const SCAN_TIMEOUT_MS = 240_000;

export type ScanRadarActionResult =
  | { ok: true; data: RadarScanResult }
  | { ok: false; error: string };

async function runRadarScan(): Promise<RadarScanResult> {
  const seeds = await fetchAllDiscoverySeeds();
  const discoveredCount = seeds.length;

  const marketData = await fetchSolanaTokenMarketData(
    seeds.map((seed) => seed.contractAddress),
  );

  const rawCandidates = buildRadarCandidates(seeds, marketData);

  const scoredCandidates: RadarCandidate[] = rawCandidates
    .map((candidate) => {
      const prefilter = calculateRadarPrefilter(candidate);
      return {
        ...candidate,
        prefilterScore: prefilter.score,
        prefilterReasons: prefilter.reasons,
      };
    })
    .filter((candidate) =>
      passesRadarHardMinimums(candidate, DEFAULT_RADAR_PREFILTER_THRESHOLDS),
    )
    .sort((a, b) => b.prefilterScore - a.prefilterScore);

  const prefilteredCount = scoredCandidates.length;
  const top20Count = Math.min(prefilteredCount, TOP_SHORTLIST_SIZE);
  const shortlistedCandidates = scoredCandidates.slice(0, MAX_FULL_ANALYSES);

  const analyzed: AnalysisResult[] = [];
  const failed: { contractAddress: string; error: string }[] = [];

  for (const candidate of shortlistedCandidates) {
    try {
      const result = await analyzeToken(candidate.contractAddress);
      analyzed.push(result);
    } catch (error) {
      failed.push({
        contractAddress: candidate.contractAddress,
        error:
          error instanceof Error
            ? error.message
            : "Analysis failed for radar candidate.",
      });
    }
  }

  analyzed.sort((a, b) => b.alpha.score - a.alpha.score);

  return {
    scannedAt: new Date().toISOString(),
    discoveredCount,
    prefilteredCount,
    fullAnalyzedCount: analyzed.length,
    top20Count,
    shortlistedCandidates,
    analyzed,
    failed,
  };
}

export async function scanRadarAction(): Promise<ScanRadarActionResult> {
  try {
    const data = await Promise.race([
      runRadarScan(),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Radar scan timed out. Try again with fewer tokens."));
        }, SCAN_TIMEOUT_MS);
      }),
    ]);

    return { ok: true, data };
  } catch (error) {
    console.error("RADAR SCAN ERROR:", error);

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Radar scan failed. Please try again.",
    };
  }
}
