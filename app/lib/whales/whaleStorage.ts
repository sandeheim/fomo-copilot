import type { WhaleSnapshot } from "./types";

const WHALE_STORAGE_KEY = "fomo-copilot-whale-snapshots-v1";
const MAX_SNAPSHOTS_PER_TOKEN = 10;
const MAX_SNAPSHOTS_GLOBAL = 300;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function sortNewestFirst(snapshots: WhaleSnapshot[]): WhaleSnapshot[] {
  return [...snapshots].sort(
    (a, b) =>
      new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
  );
}

function parseSnapshot(item: unknown): WhaleSnapshot | null {
  if (typeof item !== "object" || item === null) return null;

  const record = item as Record<string, unknown>;
  if (
    typeof record.contractAddress !== "string" ||
    typeof record.symbol !== "string" ||
    typeof record.capturedAt !== "string" ||
    !Array.isArray(record.wallets)
  ) {
    return null;
  }

  const wallets = record.wallets
    .map((wallet): WhaleSnapshot["wallets"][number] | null => {
      if (typeof wallet !== "object" || wallet === null) return null;
      const walletRecord = wallet as Record<string, unknown>;
      if (
        typeof walletRecord.ownerAddress !== "string" ||
        typeof walletRecord.tokenAmount !== "number" ||
        typeof walletRecord.capturedAt !== "string"
      ) {
        return null;
      }

      return {
        ownerAddress: walletRecord.ownerAddress,
        tokenAmount: walletRecord.tokenAmount,
        supplyPercent:
          typeof walletRecord.supplyPercent === "number"
            ? walletRecord.supplyPercent
            : null,
        capturedAt: walletRecord.capturedAt,
      };
    })
    .filter((wallet): wallet is WhaleSnapshot["wallets"][number] => wallet !== null);

  return {
    contractAddress: record.contractAddress,
    symbol: record.symbol,
    capturedAt: record.capturedAt,
    wallets,
  };
}

function dedupeSnapshots(snapshots: WhaleSnapshot[]): WhaleSnapshot[] {
  const seen = new Set<string>();
  const deduped: WhaleSnapshot[] = [];

  for (const snapshot of sortNewestFirst(snapshots)) {
    const key = `${snapshot.contractAddress}:${snapshot.capturedAt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(snapshot);
  }

  return deduped;
}

function trimSnapshots(snapshots: WhaleSnapshot[]): WhaleSnapshot[] {
  const deduped = dedupeSnapshots(snapshots);
  const byToken = new Map<string, WhaleSnapshot[]>();

  for (const snapshot of deduped) {
    const existing = byToken.get(snapshot.contractAddress) ?? [];
    existing.push(snapshot);
    byToken.set(snapshot.contractAddress, existing);
  }

  const trimmed: WhaleSnapshot[] = [];

  for (const tokenSnapshots of byToken.values()) {
    trimmed.push(
      ...sortNewestFirst(tokenSnapshots).slice(0, MAX_SNAPSHOTS_PER_TOKEN),
    );
  }

  return sortNewestFirst(trimmed).slice(0, MAX_SNAPSHOTS_GLOBAL);
}

function persistSnapshots(snapshots: WhaleSnapshot[]): WhaleSnapshot[] {
  const trimmed = trimSnapshots(snapshots);

  if (isBrowser()) {
    localStorage.setItem(WHALE_STORAGE_KEY, JSON.stringify(trimmed));
  }

  return trimmed;
}

export function loadWhaleSnapshots(): WhaleSnapshot[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(WHALE_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return trimSnapshots(
      parsed
        .map(parseSnapshot)
        .filter((snapshot): snapshot is WhaleSnapshot => snapshot !== null),
    );
  } catch {
    return [];
  }
}

export function getWhaleSnapshots(contractAddress: string): WhaleSnapshot[] {
  return loadWhaleSnapshots().filter(
    (snapshot) => snapshot.contractAddress === contractAddress,
  );
}

export function saveWhaleSnapshot(snapshot: WhaleSnapshot): WhaleSnapshot[] {
  const existing = loadWhaleSnapshots();
  return persistSnapshots([snapshot, ...existing]);
}

export function getLatestWhaleSnapshot(
  contractAddress: string,
): WhaleSnapshot | null {
  const snapshots = getWhaleSnapshots(contractAddress);
  return snapshots[0] ?? null;
}

export function clearWhaleSnapshots(contractAddress: string): WhaleSnapshot[] {
  const remaining = loadWhaleSnapshots().filter(
    (snapshot) => snapshot.contractAddress !== contractAddress,
  );
  return persistSnapshots(remaining);
}
