import type { WalletIntelligenceResult } from "../wallet/types";
import type {
  WhaleChange,
  WhaleChangeType,
  WhaleSnapshot,
  WhaleTrackerResult,
  WhaleTrackerSignal,
} from "./types";

const LIMITATION =
  "Whale Tracker compares saved large-holder snapshots. Balance changes may be transfers and do not necessarily represent market buys or sells.";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isWithinNoiseTolerance(
  previousAmount: number,
  currentAmount: number,
): boolean {
  if (previousAmount <= 0) return currentAmount <= 0;
  const absoluteChange = Math.abs(currentAmount - previousAmount);
  return absoluteChange < previousAmount * 0.001;
}

function qualifiesAsNewWhale(
  supplyPercent: number | null,
  inLargestHolderSample: boolean,
): boolean {
  return (
    (supplyPercent !== null && supplyPercent >= 1) || inLargestHolderSample
  );
}

function calculateSignificance(options: {
  previousAmount: number;
  currentAmount: number;
  previousSupplyPercent: number | null;
  currentSupplyPercent: number | null;
  type: WhaleChangeType;
}): "LOW" | "MEDIUM" | "HIGH" {
  if (options.type === "UNCHANGED") return "LOW";

  const balanceChangePercent =
    options.previousAmount > 0
      ? (Math.abs(options.currentAmount - options.previousAmount) /
          options.previousAmount) *
        100
      : options.currentAmount > 0
        ? 100
        : 0;

  const supplyPercentChange =
    options.previousSupplyPercent !== null &&
    options.currentSupplyPercent !== null
      ? Math.abs(
          options.currentSupplyPercent - options.previousSupplyPercent,
        )
      : options.currentSupplyPercent !== null
        ? Math.abs(options.currentSupplyPercent)
        : options.previousSupplyPercent !== null
          ? Math.abs(options.previousSupplyPercent)
          : 0;

  if (supplyPercentChange >= 1 || balanceChangePercent >= 25) {
    return "HIGH";
  }

  if (supplyPercentChange >= 0.25 || balanceChangePercent >= 10) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildSummary(signal: WhaleTrackerSignal): string {
  switch (signal) {
    case "ACCUMULATION":
      return "Tracked large-holder balances increased since the previous snapshot, indicating net whale accumulation.";
    case "DISTRIBUTION":
      return "Tracked large-holder balances decreased since the previous snapshot, indicating elevated distribution risk.";
    case "MIXED":
      return "Large-holder balance changes are mixed, with no clear accumulation or distribution consensus.";
    case "NO_CHANGE":
      return "No meaningful large-holder balance changes were detected since the previous snapshot.";
    case "INSUFFICIENT_DATA":
      return "A first whale snapshot has been saved. Another analysis is required to measure changes.";
  }
}

function significanceRank(significance: WhaleChange["significance"]): number {
  switch (significance) {
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
  }
}

function sortChanges(changes: WhaleChange[]): WhaleChange[] {
  return [...changes].sort((a, b) => {
    const significanceDiff =
      significanceRank(b.significance) - significanceRank(a.significance);
    if (significanceDiff !== 0) return significanceDiff;
    return Math.abs(b.amountChange) - Math.abs(a.amountChange);
  });
}

function calculateOverallSignal(options: {
  changes: WhaleChange[];
}): WhaleTrackerSignal {
  let increaseWeight = 0;
  let decreaseWeight = 0;

  for (const change of options.changes) {
    const weight =
      change.significance === "HIGH"
        ? 3
        : change.significance === "MEDIUM"
          ? 2
          : 1;

    if (change.type === "NEW_WHALE" || change.type === "INCREASED") {
      increaseWeight += weight;
    }

    if (change.type === "DECREASED" || change.type === "EXITED") {
      decreaseWeight += weight;
    }
  }

  if (increaseWeight === 0 && decreaseWeight === 0) {
    return "NO_CHANGE";
  }

  if (increaseWeight >= decreaseWeight + 3) {
    return "ACCUMULATION";
  }

  if (decreaseWeight >= increaseWeight + 3) {
    return "DISTRIBUTION";
  }

  return "MIXED";
}

function calculateScore(options: {
  changes: WhaleChange[];
  totalNetSupplyPercentChange: number | null;
  increasedWallets: number;
  decreasedWallets: number;
}): number {
  let score = 50;

  for (const change of options.changes) {
    if (change.type === "INCREASED") {
      if (change.significance === "HIGH") score += 8;
      else if (change.significance === "MEDIUM") score += 4;
    }

    if (change.type === "NEW_WHALE" && change.significance === "HIGH") {
      score += 6;
    }

    if (change.type === "DECREASED") {
      if (change.significance === "HIGH") score -= 10;
      else if (change.significance === "MEDIUM") score -= 5;
    }

    if (change.type === "EXITED") {
      score -= 8;
    }
  }

  if (
    options.totalNetSupplyPercentChange !== null &&
    options.totalNetSupplyPercentChange > 0
  ) {
    score += 8;
  }

  if (
    options.totalNetSupplyPercentChange !== null &&
    options.totalNetSupplyPercentChange < 0
  ) {
    score -= 10;
  }

  if (options.increasedWallets > options.decreasedWallets) {
    score += 5;
  }

  if (options.decreasedWallets > options.increasedWallets) {
    score -= 6;
  }

  return clampScore(score);
}

export function createWhaleSnapshot(options: {
  contractAddress: string;
  symbol: string;
  analyzedAt: string;
  walletIntelligence: WalletIntelligenceResult;
}): WhaleSnapshot | null {
  const seenOwners = new Set<string>();
  const wallets: WhaleSnapshot["wallets"] = [];

  for (const holder of options.walletIntelligence.holders) {
    if (!holder.ownerAddress) continue;

    const ownerAddress = holder.ownerAddress.trim();
    if (!ownerAddress || seenOwners.has(ownerAddress)) continue;

    seenOwners.add(ownerAddress);
    wallets.push({
      ownerAddress,
      tokenAmount: holder.tokenAmount,
      supplyPercent: holder.supplyPercent,
      capturedAt: options.analyzedAt,
    });
  }

  if (wallets.length === 0) return null;

  return {
    contractAddress: options.contractAddress,
    symbol: options.symbol,
    capturedAt: options.analyzedAt,
    wallets,
  };
}

export function compareWhaleSnapshots(options: {
  previous: WhaleSnapshot | null;
  current: WhaleSnapshot;
}): WhaleTrackerResult {
  const warnings: string[] = [];
  const previousMap = new Map(
    (options.previous?.wallets ?? []).map((wallet) => [
      wallet.ownerAddress,
      wallet,
    ]),
  );
  const currentMap = new Map(
    options.current.wallets.map((wallet) => [wallet.ownerAddress, wallet]),
  );
  const allOwners = new Set([
    ...previousMap.keys(),
    ...currentMap.keys(),
  ]);

  const changes: WhaleChange[] = [];

  for (const ownerAddress of allOwners) {
    const previousWallet = previousMap.get(ownerAddress);
    const currentWallet = currentMap.get(ownerAddress);
    const previousAmount = previousWallet?.tokenAmount ?? 0;
    const currentAmount = currentWallet?.tokenAmount ?? 0;
    const previousSupplyPercent = previousWallet?.supplyPercent ?? null;
    const currentSupplyPercent = currentWallet?.supplyPercent ?? null;
    const amountChange = currentAmount - previousAmount;
    const percentChange =
      previousAmount > 0
        ? ((currentAmount - previousAmount) / previousAmount) * 100
        : null;
    const supplyPercentChange =
      previousSupplyPercent !== null && currentSupplyPercent !== null
        ? currentSupplyPercent - previousSupplyPercent
        : null;

    let type: WhaleChangeType;

    if (!previousWallet && currentWallet) {
      type = qualifiesAsNewWhale(
        currentSupplyPercent,
        true,
      )
        ? "NEW_WHALE"
        : "UNCHANGED";
    } else if (previousWallet && !currentWallet) {
      type = "EXITED";
    } else if (isWithinNoiseTolerance(previousAmount, currentAmount)) {
      type = "UNCHANGED";
    } else if (currentAmount > previousAmount) {
      type = "INCREASED";
    } else if (currentAmount < previousAmount) {
      type = "DECREASED";
    } else {
      type = "UNCHANGED";
    }

    changes.push({
      ownerAddress,
      previousAmount,
      currentAmount,
      amountChange,
      percentChange,
      previousSupplyPercent,
      currentSupplyPercent,
      supplyPercentChange,
      type,
      significance: calculateSignificance({
        previousAmount,
        currentAmount,
        previousSupplyPercent,
        currentSupplyPercent,
        type,
      }),
    });
  }

  const sortedChanges = sortChanges(changes);
  const newWhales = sortedChanges.filter(
    (change) => change.type === "NEW_WHALE",
  ).length;
  const increasedWallets = sortedChanges.filter(
    (change) => change.type === "INCREASED",
  ).length;
  const decreasedWallets = sortedChanges.filter(
    (change) => change.type === "DECREASED",
  ).length;
  const exitedWhales = sortedChanges.filter(
    (change) => change.type === "EXITED",
  ).length;
  const unchangedWallets = sortedChanges.filter(
    (change) => change.type === "UNCHANGED",
  ).length;
  const totalNetTokenChange = sortedChanges.reduce(
    (sum, change) => sum + change.amountChange,
    0,
  );

  const supplyChanges = sortedChanges
    .map((change) => change.supplyPercentChange)
    .filter((value): value is number => value !== null);
  const totalNetSupplyPercentChange =
    supplyChanges.length > 0
      ? supplyChanges.reduce((sum, value) => sum + value, 0)
      : null;

  if (!options.previous) {
    return {
      available: true,
      signal: "INSUFFICIENT_DATA",
      previousSnapshotAt: null,
      currentSnapshotAt: options.current.capturedAt,
      trackedWallets: options.current.wallets.length,
      newWhales,
      increasedWallets,
      decreasedWallets,
      exitedWhales,
      unchangedWallets,
      totalNetTokenChange,
      totalNetSupplyPercentChange,
      score: null,
      summary: buildSummary("INSUFFICIENT_DATA"),
      changes: sortedChanges,
      warnings,
      limitation: LIMITATION,
    };
  }

  const signal = calculateOverallSignal({ changes: sortedChanges });
  const score = calculateScore({
    changes: sortedChanges,
    totalNetSupplyPercentChange,
    increasedWallets,
    decreasedWallets,
  });

  return {
    available: true,
    signal,
    previousSnapshotAt: options.previous.capturedAt,
    currentSnapshotAt: options.current.capturedAt,
    trackedWallets: options.current.wallets.length,
    newWhales,
    increasedWallets,
    decreasedWallets,
    exitedWhales,
    unchangedWallets,
    totalNetTokenChange,
    totalNetSupplyPercentChange,
    score,
    summary: buildSummary(signal),
    changes: sortedChanges,
    warnings,
    limitation: LIMITATION,
  };
}
