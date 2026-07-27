import type { TokenMetrics, RiskLevel } from "../types/tokenMetrics";
import type { TokenDataProvider } from "./tokenDataProvider";

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededFloat(seed: number, offset: number, min: number, max: number): number {
  const raw = ((seed + offset * 7919) % 10000) / 10000;
  return min + raw * (max - min);
}

const SYMBOLS = ["PEPE", "WIF", "BONK", "MOG", "DEGEN", "FOMO", "PUMP", "BASED"];

/**
 * Mock provider — deterministic per address.
 * Replace `tokenDataProvider` export in analyzeToken.ts with a real implementation.
 */
export class MockTokenProvider implements TokenDataProvider {
  async fetchMetrics(contractAddress: string): Promise<TokenMetrics> {
    // Simulate network latency for realistic UX
    await new Promise((r) => setTimeout(r, 800));

    const seed = hashString(contractAddress.toLowerCase().trim());
    const riskLevels: RiskLevel[] = ["low", "medium", "high", "extreme"];

    return {
      contractAddress,
      symbol: SYMBOLS[seed % SYMBOLS.length],
      priceUsd: seededFloat(seed, 8, 0.00001, 12),
      marketCapUsd: seededFloat(seed, 1, 250_000, 850_000_000),
      liquidityUsd: seededFloat(seed, 2, 15_000, 12_000_000),
      volume24hUsd: seededFloat(seed, 3, 8_000, 45_000_000),
      buySellRatio: seededFloat(seed, 4, 0.35, 2.8),
      holderCount: Math.floor(seededFloat(seed, 5, 420, 48_000)),
      top10HolderPercent: seededFloat(seed, 6, 18, 78),
      momentumPercent: seededFloat(seed, 7, -42, 95),
      riskLevel: riskLevels[seed % riskLevels.length],
    };
  }
}
