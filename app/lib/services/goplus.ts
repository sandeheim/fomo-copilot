const GOPLUS_BASE_URL = "https://api.gopluslabs.io/api/v1/solana/token_security";

interface GoPlusAuthorityEntry {
  address?: string;
  malicious_address?: number;
}

interface GoPlusAuthorityField {
  authority?: GoPlusAuthorityEntry[];
  status?: string;
}

export interface GoPlusTokenSecurity {
  mintable: GoPlusAuthorityField;
  freezable: GoPlusAuthorityField;
  closable: GoPlusAuthorityField;
  balanceMutableAuthority: GoPlusAuthorityField;
  metadataMutable: GoPlusAuthorityField;
  transferHookUpgradable: GoPlusAuthorityField;
  transferFeeUpgradable: GoPlusAuthorityField;
  defaultAccountState: string;
  nonTransferable: string;
  transferHook: unknown[];
  trustedToken: number;
  holderCount: string;
}

interface GoPlusResponse {
  code: number;
  message: string;
  result?: Record<string, Record<string, unknown>>;
}

export function isActive(status: string | undefined): boolean {
  return status === "1";
}

function mapGoPlusResult(raw: Record<string, unknown>): GoPlusTokenSecurity {
  return {
    mintable: (raw.mintable as GoPlusAuthorityField) ?? {},
    freezable: (raw.freezable as GoPlusAuthorityField) ?? {},
    closable: (raw.closable as GoPlusAuthorityField) ?? {},
    balanceMutableAuthority:
      (raw.balance_mutable_authority as GoPlusAuthorityField) ?? {},
    metadataMutable: (raw.metadata_mutable as GoPlusAuthorityField) ?? {},
    transferHookUpgradable:
      (raw.transfer_hook_upgradable as GoPlusAuthorityField) ?? {},
    transferFeeUpgradable:
      (raw.transfer_fee_upgradable as GoPlusAuthorityField) ?? {},
    defaultAccountState: String(raw.default_account_state ?? "1"),
    nonTransferable: String(raw.non_transferable ?? "0"),
    transferHook: Array.isArray(raw.transfer_hook) ? raw.transfer_hook : [],
    trustedToken: Number(raw.trusted_token ?? 0),
    holderCount: String(raw.holder_count ?? "0"),
  };
}

export async function fetchGoPlusSecurity(
  contractAddress: string,
): Promise<GoPlusTokenSecurity | null> {
  try {
    const url = `${GOPLUS_BASE_URL}?contract_addresses=${encodeURIComponent(contractAddress)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as GoPlusResponse;
    if (data.code !== 1 || !data.result) return null;

    const tokenData = data.result[contractAddress];
    if (!tokenData) {
      const firstKey = Object.keys(data.result)[0];
      if (!firstKey) return null;
      return mapGoPlusResult(data.result[firstKey] as Record<string, unknown>);
    }

    return mapGoPlusResult(tokenData);
  } catch {
    return null;
  }
}
