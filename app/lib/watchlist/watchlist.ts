import type { AnalysisResult } from "../types/tokenMetrics";

export interface WatchlistItem {
  contractAddress: string;
  symbol: string;
  addedAt: string;
  lastAnalyzedAt: string;
  priceUsd: number;
  alphaScore: number;
  alphaGrade: string;
  aiScore: number;
  riskScore: number;
  confidenceScore: number;
  smartMoneyScore: number;
  opportunityScore: number;
  securityScore: number;
  verdict: string;
  stage: string;
}

const WATCHLIST_STORAGE_KEY = "fomo-copilot-watchlist-v1";
const MAX_WATCHLIST_ITEMS = 100;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function sortNewestAddedFirst(items: WatchlistItem[]): WatchlistItem[] {
  return [...items].sort(
    (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
  );
}

function persistWatchlist(items: WatchlistItem[]): WatchlistItem[] {
  const sorted = sortNewestAddedFirst(items).slice(0, MAX_WATCHLIST_ITEMS);

  if (isBrowser()) {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(sorted));
  }

  return sorted;
}

function parseStoredWatchlist(raw: string): WatchlistItem[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (item): item is WatchlistItem =>
      typeof item === "object" &&
      item !== null &&
      typeof item.contractAddress === "string" &&
      typeof item.symbol === "string" &&
      typeof item.addedAt === "string" &&
      typeof item.lastAnalyzedAt === "string" &&
      typeof item.priceUsd === "number" &&
      typeof item.alphaScore === "number" &&
      typeof item.alphaGrade === "string" &&
      typeof item.aiScore === "number" &&
      typeof item.riskScore === "number" &&
      typeof item.confidenceScore === "number" &&
      typeof item.smartMoneyScore === "number" &&
      typeof item.opportunityScore === "number" &&
      typeof item.securityScore === "number" &&
      typeof item.verdict === "string" &&
      typeof item.stage === "string",
  );
}

export function createWatchlistItem(
  analysis: AnalysisResult,
): WatchlistItem {
  return {
    contractAddress: analysis.contractAddress,
    symbol: analysis.symbol,
    addedAt: new Date().toISOString(),
    lastAnalyzedAt: analysis.analyzedAt,
    priceUsd: analysis.metrics.priceUsd,
    alphaScore: analysis.alpha.score,
    alphaGrade: analysis.alpha.grade,
    aiScore: analysis.aiScore,
    riskScore: analysis.riskScore,
    confidenceScore: analysis.confidence.score,
    smartMoneyScore: analysis.smartMoney.score,
    opportunityScore: analysis.opportunity.score,
    securityScore: analysis.security.securityScore,
    verdict: analysis.verdict.verdict,
    stage: analysis.opportunity.stage,
  };
}

export function loadWatchlist(): WatchlistItem[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    return sortNewestAddedFirst(parseStoredWatchlist(raw));
  } catch {
    return [];
  }
}

export function saveWatchlistItem(
  item: WatchlistItem,
): WatchlistItem[] {
  const existing = loadWatchlist();
  const index = existing.findIndex(
    (entry) => entry.contractAddress === item.contractAddress,
  );

  let updated: WatchlistItem[];

  if (index >= 0) {
    updated = [...existing];
    updated[index] = {
      ...item,
      addedAt: existing[index].addedAt,
    };
  } else {
    updated = [item, ...existing];
  }

  return persistWatchlist(updated);
}

export function removeWatchlistItem(
  contractAddress: string,
): WatchlistItem[] {
  const updated = loadWatchlist().filter(
    (item) => item.contractAddress !== contractAddress,
  );
  return persistWatchlist(updated);
}

export function isTokenWatchlisted(
  contractAddress: string,
): boolean {
  return loadWatchlist().some(
    (item) => item.contractAddress === contractAddress,
  );
}

export function updateWatchlistItem(
  analysis: AnalysisResult,
): WatchlistItem[] {
  const existing = loadWatchlist();
  const current = existing.find(
    (item) => item.contractAddress === analysis.contractAddress,
  );

  const item = createWatchlistItem(analysis);

  if (current) {
    item.addedAt = current.addedAt;
  }

  return saveWatchlistItem(item);
}
