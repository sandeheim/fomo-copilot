import "server-only";

const RPC_TIMEOUT_MS = 15_000;
const REST_TIMEOUT_MS = 15_000;
const MAX_LARGEST_ACCOUNTS = 20;
const MAX_WALLET_TRANSACTIONS = 50;

export class HeliusClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeliusClientError";
  }
}

export class HeliusUnavailableError extends HeliusClientError {
  constructor(message: string) {
    super(message);
    this.name = "HeliusUnavailableError";
  }
}

export interface ParsedWalletTokenActivity {
  timestamp: number | null;
  signature: string;
  tokenDelta: number;
}

function getHeliusApiKey(): string {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new HeliusUnavailableError(
      "Wallet Intelligence is unavailable because HELIUS_API_KEY is not configured.",
    );
  }
  return apiKey;
}

function getRpcEndpoint(): string {
  return `https://mainnet.helius-rpc.com/?api-key=${getHeliusApiKey()}`;
}

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function heliusRpcRequest<T>(
  method: string,
  params: unknown[],
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);

  try {
    const response = await fetch(getRpcEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new HeliusClientError(
        `Helius RPC request failed (${response.status}).`,
      );
    }

    const body: unknown = await response.json();
    if (!isRecord(body)) {
      throw new HeliusClientError("Helius RPC returned an invalid response.");
    }

    if (body.error) {
      const errorMessage =
        isRecord(body.error) && typeof body.error.message === "string"
          ? body.error.message
          : "Helius RPC request failed.";
      throw new HeliusClientError(errorMessage);
    }

    return body.result as T;
  } catch (error) {
    if (error instanceof HeliusClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HeliusClientError("Helius RPC request timed out.");
    }
    throw new HeliusClientError("Unable to reach Helius RPC.");
  } finally {
    clearTimeout(timeout);
  }
}

async function heliusRestRequest(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new HeliusClientError(
        `Helius wallet request failed (${response.status}).`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof HeliusClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HeliusClientError("Helius wallet request timed out.");
    }
    throw new HeliusClientError("Unable to reach Helius wallet API.");
  } finally {
    clearTimeout(timeout);
  }
}

export function isHeliusConfigured(): boolean {
  return Boolean(process.env.HELIUS_API_KEY?.trim());
}

export async function getLargestTokenAccounts(
  mintAddress: string,
): Promise<{
  address: string;
  amount: number;
  decimals: number;
}[]> {
  const result = await heliusRpcRequest<{
    value?: Array<{
      address?: string;
      amount?: string;
      decimals?: number;
      uiAmount?: number | null;
      uiAmountString?: string;
    }>;
  }>("getTokenLargestAccounts", [mintAddress]);

  const accounts = Array.isArray(result?.value) ? result.value : [];

  return accounts
    .map((account) => {
      const address = parseString(account.address).trim();
      if (!address) return null;

      const uiAmount = account.uiAmount;
      const amount =
        typeof uiAmount === "number" && Number.isFinite(uiAmount)
          ? uiAmount
          : parseNumber(account.uiAmountString ?? account.amount);

      return {
        address,
        amount,
        decimals: parseNumber(account.decimals, 0),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, MAX_LARGEST_ACCOUNTS);
}

export async function getTokenAccountOwners(
  tokenAccountAddresses: string[],
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  if (tokenAccountAddresses.length === 0) return owners;

  const result = await heliusRpcRequest<{
    value?: Array<{
      data?: unknown;
    } | null>;
  }>("getMultipleAccounts", [
    tokenAccountAddresses,
    { encoding: "jsonParsed" },
  ]);

  const values = Array.isArray(result?.value) ? result.value : [];

  for (let index = 0; index < tokenAccountAddresses.length; index += 1) {
    const tokenAccount = tokenAccountAddresses[index];
    const entry = values[index];
    if (!entry || !isRecord(entry.data)) continue;

    const parsed = entry.data.parsed;
    if (!isRecord(parsed)) continue;

    const info = parsed.info;
    if (!isRecord(info)) continue;

    const owner = parseString(info.owner).trim();
    if (owner) {
      owners.set(tokenAccount, owner);
    }
  }

  return owners;
}

export async function getTokenSupply(
  mintAddress: string,
): Promise<number | null> {
  const result = await heliusRpcRequest<{
    value?: {
      uiAmount?: number | null;
      uiAmountString?: string;
      amount?: string;
      decimals?: number;
    };
  }>("getTokenSupply", [mintAddress]);

  const value = result?.value;
  if (!value) return null;

  if (typeof value.uiAmount === "number" && Number.isFinite(value.uiAmount)) {
    return value.uiAmount;
  }

  const uiAmountString = parseNumber(value.uiAmountString);
  if (uiAmountString > 0) return uiAmountString;

  const rawAmount = parseNumber(value.amount);
  const decimals = parseNumber(value.decimals, 0);
  if (rawAmount > 0 && decimals >= 0) {
    return rawAmount / 10 ** decimals;
  }

  return null;
}

function parseTokenAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (isRecord(value)) {
    const uiAmount = value.uiAmount;
    if (typeof uiAmount === "number" && Number.isFinite(uiAmount)) {
      return uiAmount;
    }
    const uiAmountString = parseNumber(value.uiAmountString);
    if (uiAmountString > 0) return uiAmountString;
    const tokenAmount = parseNumber(value.tokenAmount ?? value.amount);
    if (tokenAmount > 0) return tokenAmount;
  }
  if (typeof value === "string") {
    const parsed = parseNumber(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

function extractMint(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (isRecord(value)) {
    return parseString(value.mint ?? value.mintAddress).trim();
  }
  return "";
}

function pushActivity(
  activities: ParsedWalletTokenActivity[],
  seenSignatures: Set<string>,
  signature: string,
  timestamp: number | null,
  tokenDelta: number,
): void {
  if (!signature || tokenDelta === 0 || !Number.isFinite(tokenDelta)) return;
  if (seenSignatures.has(signature)) return;

  seenSignatures.add(signature);
  activities.push({ signature, timestamp, tokenDelta });
}

function parseWalletHistoryV1(
  body: unknown,
  walletAddress: string,
  mintAddress: string,
): ParsedWalletTokenActivity[] {
  const activities: ParsedWalletTokenActivity[] = [];
  const seenSignatures = new Set<string>();

  const items = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.items)
      ? body.items
      : isRecord(body) && Array.isArray(body.transactions)
        ? body.transactions
        : [];

  for (const item of items) {
    if (!isRecord(item)) continue;

    const signature = parseString(item.signature ?? item.txHash).trim();
    const timestampRaw = item.timestamp ?? item.blockTime;
    const timestamp =
      typeof timestampRaw === "number" && Number.isFinite(timestampRaw)
        ? timestampRaw
        : null;

    let delta = 0;

    const balanceChanges = item.tokenBalanceChanges ?? item.balanceChanges;
    if (Array.isArray(balanceChanges)) {
      for (const change of balanceChanges) {
        if (!isRecord(change)) continue;
        const mint = extractMint(change.mint ?? change.tokenMint);
        if (mint !== mintAddress) continue;

        const owner = parseString(
          change.owner ?? change.userAccount ?? change.wallet,
        ).trim();
        if (owner && owner !== walletAddress) continue;

        const rawDelta = parseNumber(change.delta ?? change.change);
        if (rawDelta !== 0) {
          delta += rawDelta;
          continue;
        }

        const pre = parseTokenAmount(change.preAmount ?? change.preBalance);
        const post = parseTokenAmount(change.postAmount ?? change.postBalance);
        if (pre !== null && post !== null) {
          delta += post - pre;
        }
      }
    }

    const transfers = item.tokenTransfers ?? item.transfers;
    if (Array.isArray(transfers)) {
      for (const transfer of transfers) {
        if (!isRecord(transfer)) continue;
        const mint = extractMint(transfer.mint ?? transfer.tokenMint);
        if (mint !== mintAddress) continue;

        const amount = parseTokenAmount(
          transfer.tokenAmount ?? transfer.amount,
        );
        if (amount === null || amount <= 0) continue;

        const from = parseString(
          transfer.fromUserAccount ?? transfer.fromOwner ?? transfer.from,
        ).trim();
        const to = parseString(
          transfer.toUserAccount ?? transfer.toOwner ?? transfer.to,
        ).trim();

        if (to === walletAddress) delta += amount;
        else if (from === walletAddress) delta -= amount;
      }
    }

    pushActivity(activities, seenSignatures, signature, timestamp, delta);
  }

  return activities.slice(0, MAX_WALLET_TRANSACTIONS);
}

function parseEnhancedTransactionsV0(
  body: unknown,
  walletAddress: string,
  mintAddress: string,
): ParsedWalletTokenActivity[] {
  const activities: ParsedWalletTokenActivity[] = [];
  const seenSignatures = new Set<string>();

  const transactions = Array.isArray(body) ? body : [];

  for (const tx of transactions) {
    if (!isRecord(tx)) continue;

    const signature = parseString(tx.signature).trim();
    const timestampRaw = tx.timestamp ?? tx.blockTime;
    const timestamp =
      typeof timestampRaw === "number" && Number.isFinite(timestampRaw)
        ? timestampRaw
        : null;

    let delta = 0;

    const tokenTransfers = tx.tokenTransfers;
    if (Array.isArray(tokenTransfers)) {
      for (const transfer of tokenTransfers) {
        if (!isRecord(transfer)) continue;
        const mint = extractMint(transfer.mint);
        if (mint !== mintAddress) continue;

        const amount = parseTokenAmount(transfer.tokenAmount);
        if (amount === null || amount <= 0) continue;

        const from = parseString(transfer.fromUserAccount).trim();
        const to = parseString(transfer.toUserAccount).trim();

        if (to === walletAddress) delta += amount;
        else if (from === walletAddress) delta -= amount;
      }
    }

    const accountData = tx.accountData;
    if (Array.isArray(accountData)) {
      for (const account of accountData) {
        if (!isRecord(account)) continue;
        const owner = parseString(account.account).trim();
        if (owner !== walletAddress) continue;

        const tokenBalanceChanges = account.tokenBalanceChanges;
        if (!Array.isArray(tokenBalanceChanges)) continue;

        for (const change of tokenBalanceChanges) {
          if (!isRecord(change)) continue;
          const mint = extractMint(change.mint);
          if (mint !== mintAddress) continue;

          const rawTokenAmount = change.rawTokenAmount;
          const rawAmount =
            isRecord(rawTokenAmount)
              ? parseNumber(rawTokenAmount.tokenAmount)
              : 0;
          const decimals =
            isRecord(rawTokenAmount)
              ? parseNumber(rawTokenAmount.decimals, 0)
              : 0;
          const uiAmount =
            rawAmount > 0 && decimals >= 0
              ? rawAmount / 10 ** decimals
              : parseNumber(change.tokenAmount);

          const changeValue = parseNumber(change.change ?? uiAmount);
          if (changeValue !== 0) {
            delta += changeValue;
          } else {
            const pre = parseTokenAmount(change.preAmount);
            const post = parseTokenAmount(change.postAmount);
            if (pre !== null && post !== null) {
              delta += post - pre;
            }
          }
        }
      }
    }

    pushActivity(activities, seenSignatures, signature, timestamp, delta);
  }

  return activities.slice(0, MAX_WALLET_TRANSACTIONS);
}

async function fetchWalletHistoryV1(
  walletAddress: string,
): Promise<unknown | null> {
  const apiKey = getHeliusApiKey();
  const url = new URL(
    `https://api-mainnet.helius-rpc.com/v1/wallet/${encodeURIComponent(walletAddress)}/history`,
  );
  url.searchParams.set("limit", String(MAX_WALLET_TRANSACTIONS));
  url.searchParams.set("tokenAccounts", "balanceChanged");
  url.searchParams.set("api-key", apiKey);

  try {
    return await heliusRestRequest(url.toString());
  } catch {
    return null;
  }
}

// Fallback-only: Enhanced Transactions v0 is deprecated by Helius.
async function fetchEnhancedTransactionsV0(
  walletAddress: string,
): Promise<unknown> {
  const apiKey = getHeliusApiKey();
  const url = new URL(
    `https://api-mainnet.helius-rpc.com/v0/addresses/${encodeURIComponent(walletAddress)}/transactions`,
  );
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", String(MAX_WALLET_TRANSACTIONS));
  url.searchParams.set("token-accounts", "balanceChanged");
  url.searchParams.set("sort-order", "desc");

  return heliusRestRequest(url.toString());
}

export async function getRecentWalletTokenActivity(
  walletAddress: string,
  mintAddress: string,
): Promise<ParsedWalletTokenActivity[]> {
  const v1Body = await fetchWalletHistoryV1(walletAddress);
  if (v1Body !== null) {
    const parsed = parseWalletHistoryV1(v1Body, walletAddress, mintAddress);
    if (parsed.length > 0) {
      return sortActivitiesNewestFirst(parsed);
    }
  }

  const v0Body = await fetchEnhancedTransactionsV0(walletAddress);
  const fallbackParsed = parseEnhancedTransactionsV0(
    v0Body,
    walletAddress,
    mintAddress,
  );
  return sortActivitiesNewestFirst(fallbackParsed);
}

function sortActivitiesNewestFirst(
  activities: ParsedWalletTokenActivity[],
): ParsedWalletTokenActivity[] {
  return [...activities].sort((a, b) => {
    const aTime = a.timestamp ?? 0;
    const bTime = b.timestamp ?? 0;
    return bTime - aTime;
  });
}
