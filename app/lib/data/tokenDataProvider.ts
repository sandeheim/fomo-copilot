import type { TokenMetrics } from "../types/tokenMetrics";

/** Contract for any data source — replace mock with DexScreener, Birdeye, etc. */
export interface TokenDataProvider {
  fetchMetrics(contractAddress: string): Promise<TokenMetrics>;
}
