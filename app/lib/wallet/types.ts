export type WalletActivitySignal =
  | "ACCUMULATING"
  | "DISTRIBUTING"
  | "MIXED"
  | "INACTIVE"
  | "UNKNOWN";

export type WalletRiskFlag =
  | "VERY_HIGH_CONCENTRATION"
  | "RECENT_LARGE_INFLOW"
  | "RECENT_LARGE_OUTFLOW"
  | "LOW_ACTIVITY"
  | "DATA_INCOMPLETE";

export interface HolderWalletProfile {
  tokenAccount: string;
  ownerAddress: string | null;
  rank: number;
  tokenAmount: number;
  supplyPercent: number | null;
  recentTokenInflows: number;
  recentTokenOutflows: number;
  netTokenFlow: number;
  recentTransactionCount: number;
  lastActivityAt: string | null;
  signal: WalletActivitySignal;
  riskFlags: WalletRiskFlag[];
  dataAvailable: boolean;
}

export interface WalletIntelligenceResult {
  available: boolean;
  score: number | null;
  signal: WalletActivitySignal;
  analyzedWallets: number;
  requestedWallets: number;
  totalTrackedSupplyPercent: number | null;
  accumulatingWallets: number;
  distributingWallets: number;
  inactiveWallets: number;
  netTrackedTokenFlow: number;
  summary: string;
  holders: HolderWalletProfile[];
  warnings: string[];
  limitation: string;
}
