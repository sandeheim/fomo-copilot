import type { AnalysisResult } from "../types/tokenMetrics";

export interface HistorySnapshot {
  id: string;
  contractAddress: string;
  symbol: string;
  analyzedAt: string;
  priceUsd: number;
  aiScore: number;
  riskScore: number;
  securityScore: number;
  confidenceScore: number;
  smartMoneyScore: number;
  opportunityScore: number;
  verdict: string;
  recommendation: string;
}

export interface HistoryTrend {
  previous: HistorySnapshot | null;
  current: HistorySnapshot;
  changes: {
    pricePercent: number | null;
    aiScore: number | null;
    riskScore: number | null;
    securityScore: number | null;
    confidenceScore: number | null;
    smartMoneyScore: number | null;
    opportunityScore: number | null;
  };
}

const HISTORY_STORAGE_KEY = "fomo-copilot-history-v1";
const MAX_SNAPSHOTS = 100;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function sortNewestFirst(snapshots: HistorySnapshot[]): HistorySnapshot[] {
  return [...snapshots].sort(
    (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
  );
}

function persistHistory(snapshots: HistorySnapshot[]): HistorySnapshot[] {
  const sorted = sortNewestFirst(snapshots).slice(0, MAX_SNAPSHOTS);

  if (isBrowser()) {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sorted));
  }

  return sorted;
}

function parseStoredHistory(raw: string): HistorySnapshot[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (item): item is HistorySnapshot =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.contractAddress === "string" &&
      typeof item.symbol === "string" &&
      typeof item.analyzedAt === "string" &&
      typeof item.priceUsd === "number" &&
      typeof item.aiScore === "number" &&
      typeof item.riskScore === "number" &&
      typeof item.securityScore === "number" &&
      typeof item.confidenceScore === "number" &&
      typeof item.smartMoneyScore === "number" &&
      typeof item.opportunityScore === "number" &&
      typeof item.verdict === "string" &&
      typeof item.recommendation === "string",
  );
}

export function createHistorySnapshot(
  analysis: AnalysisResult,
): HistorySnapshot {
  return {
    id: `${analysis.contractAddress}-${analysis.analyzedAt}`,
    contractAddress: analysis.contractAddress,
    symbol: analysis.symbol,
    analyzedAt: analysis.analyzedAt,
    priceUsd: analysis.metrics.priceUsd,
    aiScore: analysis.aiScore,
    riskScore: analysis.riskScore,
    securityScore: analysis.security.securityScore,
    confidenceScore: analysis.confidence.score,
    smartMoneyScore: analysis.smartMoney.score,
    opportunityScore: analysis.opportunity.score,
    verdict: analysis.verdict.verdict,
    recommendation: analysis.recommendation,
  };
}

export function loadHistory(): HistorySnapshot[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return sortNewestFirst(parseStoredHistory(raw));
  } catch {
    return [];
  }
}

export function saveHistorySnapshot(
  snapshot: HistorySnapshot,
): HistorySnapshot[] {
  const existing = loadHistory();
  const isDuplicate = existing.some(
    (item) =>
      item.contractAddress === snapshot.contractAddress &&
      item.analyzedAt === snapshot.analyzedAt,
  );

  if (isDuplicate) {
    return getTokenHistory(snapshot.contractAddress);
  }

  const updated = persistHistory([snapshot, ...existing]);
  return updated.filter(
    (item) => item.contractAddress === snapshot.contractAddress,
  );
}

export function getTokenHistory(
  contractAddress: string,
): HistorySnapshot[] {
  return loadHistory().filter(
    (item) => item.contractAddress === contractAddress,
  );
}

export function clearTokenHistory(
  contractAddress: string,
): HistorySnapshot[] {
  const remaining = loadHistory().filter(
    (item) => item.contractAddress !== contractAddress,
  );
  persistHistory(remaining);
  return [];
}

function diffValue(current: number, previous: number): number {
  return current - previous;
}

function diffPricePercent(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function calculateHistoryTrend(
  history: HistorySnapshot[],
): HistoryTrend | null {
  if (history.length === 0) return null;

  const sorted = sortNewestFirst(history);
  const current = sorted[0];
  const previous = sorted[1] ?? null;

  if (!previous) {
    return {
      previous: null,
      current,
      changes: {
        pricePercent: null,
        aiScore: null,
        riskScore: null,
        securityScore: null,
        confidenceScore: null,
        smartMoneyScore: null,
        opportunityScore: null,
      },
    };
  }

  return {
    previous,
    current,
    changes: {
      pricePercent: diffPricePercent(current.priceUsd, previous.priceUsd),
      aiScore: diffValue(current.aiScore, previous.aiScore),
      riskScore: diffValue(current.riskScore, previous.riskScore),
      securityScore: diffValue(current.securityScore, previous.securityScore),
      confidenceScore: diffValue(current.confidenceScore, previous.confidenceScore),
      smartMoneyScore: diffValue(current.smartMoneyScore, previous.smartMoneyScore),
      opportunityScore: diffValue(current.opportunityScore, previous.opportunityScore),
    },
  };
}
