export type WhaleChangeType =
  | "NEW_WHALE"
  | "INCREASED"
  | "DECREASED"
  | "EXITED"
  | "UNCHANGED";

export type WhaleTrackerSignal =
  | "ACCUMULATION"
  | "DISTRIBUTION"
  | "MIXED"
  | "NO_CHANGE"
  | "INSUFFICIENT_DATA";

export interface WhaleSnapshotItem {
  ownerAddress: string;
  tokenAmount: number;
  supplyPercent: number | null;
  capturedAt: string;
}

export interface WhaleSnapshot {
  contractAddress: string;
  symbol: string;
  capturedAt: string;
  wallets: WhaleSnapshotItem[];
}

export interface WhaleChange {
  ownerAddress: string;
  previousAmount: number;
  currentAmount: number;
  amountChange: number;
  percentChange: number | null;
  previousSupplyPercent: number | null;
  currentSupplyPercent: number | null;
  supplyPercentChange: number | null;
  type: WhaleChangeType;
  significance: "LOW" | "MEDIUM" | "HIGH";
}

export interface WhaleTrackerResult {
  available: boolean;
  signal: WhaleTrackerSignal;
  previousSnapshotAt: string | null;
  currentSnapshotAt: string;
  trackedWallets: number;
  newWhales: number;
  increasedWallets: number;
  decreasedWallets: number;
  exitedWhales: number;
  unchangedWallets: number;
  totalNetTokenChange: number;
  totalNetSupplyPercentChange: number | null;
  score: number | null;
  summary: string;
  changes: WhaleChange[];
  warnings: string[];
  limitation: string;
}
