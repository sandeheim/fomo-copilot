import "server-only";

import {
  getLargestTokenAccounts,
  getRecentWalletTokenActivity,
  getTokenAccountOwners,
  getTokenSupply,
  HeliusUnavailableError,
  isHeliusConfigured,
} from "./heliusClient";
import type {
  HolderWalletProfile,
  WalletActivitySignal,
  WalletIntelligenceResult,
  WalletRiskFlag,
} from "./types";

const DEFAULT_MAX_WALLETS = 8;
const HARD_MAX_WALLETS = 10;
const TOTAL_TIMEOUT_MS = 45_000;

const LIMITATION =
  "Wallet Intelligence evaluates a limited sample of large holders and recent on-chain activity. Transfers do not necessarily represent market buys or sells.";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function createUnavailableResult(
  warnings: string[],
  requestedWallets = 0,
): WalletIntelligenceResult {
  return {
    available: false,
    score: null,
    signal: "UNKNOWN",
    analyzedWallets: 0,
    requestedWallets,
    totalTrackedSupplyPercent: null,
    accumulatingWallets: 0,
    distributingWallets: 0,
    inactiveWallets: 0,
    netTrackedTokenFlow: 0,
    summary:
      "Wallet activity could not be assessed with sufficient coverage.",
    holders: [],
    warnings,
    limitation: LIMITATION,
  };
}

function classifyWalletSignal(
  inflows: number,
  outflows: number,
  netFlow: number,
  activityCount: number,
  dataAvailable: boolean,
): WalletActivitySignal {
  if (!dataAvailable) return "UNKNOWN";
  if (activityCount === 0 && inflows === 0 && outflows === 0) {
    return "INACTIVE";
  }

  if (netFlow > 0 && inflows >= outflows * 1.25) {
    return "ACCUMULATING";
  }

  if (netFlow < 0 && outflows >= inflows * 1.25) {
    return "DISTRIBUTING";
  }

  if (inflows > 0 && outflows > 0) {
    return "MIXED";
  }

  if (activityCount === 0) {
    return "INACTIVE";
  }

  return "MIXED";
}

function buildWalletRiskFlags(options: {
  supplyPercent: number | null;
  tokenAmount: number;
  inflows: number;
  outflows: number;
  activityCount: number;
  dataAvailable: boolean;
}): WalletRiskFlag[] {
  const flags: WalletRiskFlag[] = [];

  if (!options.dataAvailable) {
    flags.push("DATA_INCOMPLETE");
    return flags;
  }

  if (
    options.supplyPercent !== null &&
    options.supplyPercent >= 10
  ) {
    flags.push("VERY_HIGH_CONCENTRATION");
  }

  if (
    options.tokenAmount > 0 &&
    options.inflows > 0 &&
    options.inflows >= options.tokenAmount * 0.2
  ) {
    flags.push("RECENT_LARGE_INFLOW");
  }

  if (
    options.tokenAmount > 0 &&
    options.outflows > 0 &&
    options.outflows >= options.tokenAmount * 0.2
  ) {
    flags.push("RECENT_LARGE_OUTFLOW");
  }

  if (options.activityCount === 0) {
    flags.push("LOW_ACTIVITY");
  }

  return flags;
}

function buildSummary(
  signal: WalletActivitySignal,
  score: number | null,
): string {
  if (score === null || signal === "UNKNOWN") {
    return "Wallet activity could not be assessed with sufficient coverage.";
  }

  switch (signal) {
    case "ACCUMULATING":
      return "Tracked large holders show net token inflows, but concentration and data coverage must still be considered.";
    case "DISTRIBUTING":
      return "Tracked large holders show net token outflows, indicating elevated distribution risk.";
    case "MIXED":
      return "Large-holder activity is mixed, with no clear accumulation or distribution consensus.";
    case "INACTIVE":
      return "Tracked large holders show limited recent token activity in the observed sample.";
    default:
      return "Wallet activity could not be assessed with sufficient coverage.";
  }
}

function calculateOverallScore(options: {
  holders: HolderWalletProfile[];
  analyzedWallets: number;
  netTrackedTokenFlow: number;
  totalTrackedSupplyPercent: number | null;
}): number | null {
  if (options.analyzedWallets < 3) return null;

  let score = 50;
  const accumulating = options.holders.filter(
    (holder) => holder.signal === "ACCUMULATING" && holder.dataAvailable,
  ).length;
  const distributing = options.holders.filter(
    (holder) => holder.signal === "DISTRIBUTING" && holder.dataAvailable,
  ).length;

  score += Math.min(accumulating * 7, 21);
  score -= Math.min(distributing * 9, 27);

  if (options.netTrackedTokenFlow > 0) score += 8;
  if (options.netTrackedTokenFlow < 0) score -= 10;

  if (
    options.totalTrackedSupplyPercent !== null &&
    options.totalTrackedSupplyPercent > 60
  ) {
    score -= 15;
  }

  if (
    options.holders.some(
      (holder) =>
        holder.supplyPercent !== null && holder.supplyPercent >= 15,
    )
  ) {
    score -= 15;
  }

  if (options.analyzedWallets >= 6) score += 5;

  const inactiveOrUnknown = options.holders.filter(
    (holder) =>
      holder.signal === "INACTIVE" || holder.signal === "UNKNOWN",
  ).length;

  if (
    options.analyzedWallets > 0 &&
    inactiveOrUnknown > options.analyzedWallets / 2
  ) {
    score -= 8;
  }

  return clampScore(score);
}

function calculateOverallSignal(
  score: number | null,
  accumulatingWallets: number,
  distributingWallets: number,
): WalletActivitySignal {
  if (score === null) return "UNKNOWN";

  if (score >= 68 && accumulatingWallets > distributingWallets) {
    return "ACCUMULATING";
  }

  if (score <= 38 && distributingWallets > accumulatingWallets) {
    return "DISTRIBUTING";
  }

  return "MIXED";
}

async function analyzeSingleHolder(options: {
  tokenAccount: string;
  ownerAddress: string | null;
  rank: number;
  tokenAmount: number;
  supplyPercent: number | null;
  mintAddress: string;
}): Promise<HolderWalletProfile> {
  const baseProfile: HolderWalletProfile = {
    tokenAccount: options.tokenAccount,
    ownerAddress: options.ownerAddress,
    rank: options.rank,
    tokenAmount: options.tokenAmount,
    supplyPercent: options.supplyPercent,
    recentTokenInflows: 0,
    recentTokenOutflows: 0,
    netTokenFlow: 0,
    recentTransactionCount: 0,
    lastActivityAt: null,
    signal: "UNKNOWN",
    riskFlags: [],
    dataAvailable: false,
  };

  if (!options.ownerAddress) {
    baseProfile.riskFlags = ["DATA_INCOMPLETE"];
    baseProfile.signal = "UNKNOWN";
    return baseProfile;
  }

  try {
    const activities = await getRecentWalletTokenActivity(
      options.ownerAddress,
      options.mintAddress,
    );

    let inflows = 0;
    let outflows = 0;

    for (const activity of activities) {
      if (activity.tokenDelta > 0) {
        inflows += activity.tokenDelta;
      } else if (activity.tokenDelta < 0) {
        outflows += Math.abs(activity.tokenDelta);
      }
    }

    const netTokenFlow = inflows - outflows;
    const recentTransactionCount = activities.length;
    const lastActivityAt =
      activities.find((activity) => activity.timestamp !== null)?.timestamp ??
      null;

    const signal = classifyWalletSignal(
      inflows,
      outflows,
      netTokenFlow,
      recentTransactionCount,
      true,
    );

    const riskFlags = buildWalletRiskFlags({
      supplyPercent: options.supplyPercent,
      tokenAmount: options.tokenAmount,
      inflows,
      outflows,
      activityCount: recentTransactionCount,
      dataAvailable: true,
    });

    return {
      ...baseProfile,
      recentTokenInflows: inflows,
      recentTokenOutflows: outflows,
      netTokenFlow,
      recentTransactionCount,
      lastActivityAt:
        lastActivityAt !== null
          ? new Date(lastActivityAt * 1000).toISOString()
          : null,
      signal,
      riskFlags,
      dataAvailable: true,
    };
  } catch {
    return {
      ...baseProfile,
      signal: "UNKNOWN",
      riskFlags: ["DATA_INCOMPLETE"],
      dataAvailable: false,
    };
  }
}

export async function analyzeWalletIntelligence(options: {
  mintAddress: string;
  maxWallets?: number;
}): Promise<WalletIntelligenceResult> {
  const warnings: string[] = [];
  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  const requestedWallets = Math.min(
    Math.max(options.maxWallets ?? DEFAULT_MAX_WALLETS, 1),
    HARD_MAX_WALLETS,
  );

  if (!isHeliusConfigured()) {
    const missingKeyWarnings = [
      "Wallet Intelligence is unavailable because HELIUS_API_KEY is not configured.",
    ];

    if (process.env.NODE_ENV === "development") {
      missingKeyWarnings.push(
        "Wallet Intelligence requires HELIUS_API_KEY in .env.local.",
      );
    }

    return createUnavailableResult(missingKeyWarnings, requestedWallets);
  }

  try {
    const [largestAccounts, totalSupply] = await Promise.all([
      getLargestTokenAccounts(options.mintAddress),
      getTokenSupply(options.mintAddress),
    ]);

    if (largestAccounts.length === 0) {
      warnings.push("No large token accounts were returned for this mint.");
      return createUnavailableResult(warnings, requestedWallets);
    }

    const tokenAccountAddresses = largestAccounts.map(
      (account) => account.address,
    );
    const owners = await getTokenAccountOwners(tokenAccountAddresses);

    const uniqueOwners = new Map<
      string,
      {
        tokenAccount: string;
        tokenAmount: number;
        rank: number;
      }
    >();

    for (const [index, account] of largestAccounts.entries()) {
      const owner = owners.get(account.address) ?? null;
      if (!owner) continue;
      if (uniqueOwners.has(owner)) continue;

      uniqueOwners.set(owner, {
        tokenAccount: account.address,
        tokenAmount: account.amount,
        rank: index + 1,
      });

      if (uniqueOwners.size >= requestedWallets) break;
    }

    if (uniqueOwners.size === 0) {
      warnings.push(
        "Large token accounts were found, but owner wallets could not be resolved.",
      );
      return createUnavailableResult(warnings, requestedWallets);
    }

    const holders: HolderWalletProfile[] = [];
    let timedOut = false;

    for (const [ownerAddress, holderSeed] of uniqueOwners.entries()) {
      if (Date.now() >= deadline) {
        timedOut = true;
        break;
      }

      const supplyPercent =
        totalSupply !== null && totalSupply > 0
          ? (holderSeed.tokenAmount / totalSupply) * 100
          : null;

      const profile = await analyzeSingleHolder({
        tokenAccount: holderSeed.tokenAccount,
        ownerAddress,
        rank: holderSeed.rank,
        tokenAmount: holderSeed.tokenAmount,
        supplyPercent,
        mintAddress: options.mintAddress,
      });

      holders.push(profile);
    }

    if (timedOut) {
      warnings.push("Wallet analysis timed out and may be incomplete.");
    }

    const analyzedWallets = holders.filter((holder) => holder.dataAvailable)
      .length;
    const accumulatingWallets = holders.filter(
      (holder) => holder.signal === "ACCUMULATING",
    ).length;
    const distributingWallets = holders.filter(
      (holder) => holder.signal === "DISTRIBUTING",
    ).length;
    const inactiveWallets = holders.filter(
      (holder) => holder.signal === "INACTIVE",
    ).length;
    const netTrackedTokenFlow = holders.reduce(
      (sum, holder) => sum + holder.netTokenFlow,
      0,
    );
    const totalTrackedSupplyPercent = holders.reduce(
      (sum, holder) => sum + (holder.supplyPercent ?? 0),
      0,
    );

    const score = calculateOverallScore({
      holders,
      analyzedWallets,
      netTrackedTokenFlow,
      totalTrackedSupplyPercent:
        totalSupply !== null ? totalTrackedSupplyPercent : null,
    });

    const signal = calculateOverallSignal(
      score,
      accumulatingWallets,
      distributingWallets,
    );

    if (totalSupply === null) {
      warnings.push("Token supply was unavailable, so supply percentages are incomplete.");
    }

    if (analyzedWallets < 3) {
      warnings.push(
        "Insufficient wallet coverage for a reliable Wallet Intelligence score.",
      );
    }

    return {
      available: analyzedWallets > 0,
      score,
      signal,
      analyzedWallets,
      requestedWallets,
      totalTrackedSupplyPercent:
        totalSupply !== null ? totalTrackedSupplyPercent : null,
      accumulatingWallets,
      distributingWallets,
      inactiveWallets,
      netTrackedTokenFlow,
      summary: buildSummary(signal, score),
      holders,
      warnings,
      limitation: LIMITATION,
    };
  } catch (error) {
    if (error instanceof HeliusUnavailableError) {
      return createUnavailableResult([error.message], requestedWallets);
    }

    warnings.push(
      error instanceof Error
        ? error.message
        : "Wallet Intelligence encountered an unexpected error.",
    );
    return createUnavailableResult(warnings, requestedWallets);
  }
}
