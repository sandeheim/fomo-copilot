import type { AnalysisResult } from "../types/tokenMetrics";

export type RadarSource =
  | "LATEST_PROFILE"
  | "TOP_BOOST";

export interface RadarCandidate {
  contractAddress: string;
  symbol: string;
  name: string;
  source: RadarSource[];
  priceUsd: number;
  marketCapUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  momentum24hPercent: number;
  buySellRatio: number;
  pairCreatedAt: number | null;
  boostAmount: number;
  prefilterScore: number;
  prefilterReasons: string[];
}

export interface RadarScanResult {
  scannedAt: string;
  discoveredCount: number;
  prefilteredCount: number;
  shortlistedCandidates: RadarCandidate[];
  analyzed: AnalysisResult[];
  failed: {
    contractAddress: string;
    error: string;
  }[];
}
