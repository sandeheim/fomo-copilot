export class TokenNotFoundError extends Error {
  constructor(contractAddress: string) {
    super(
      `No Solana token found on DexScreener for this address. Verify the contract and try again.`,
    );
    this.name = "TokenNotFoundError";
    this.contractAddress = contractAddress;
  }

  readonly contractAddress: string;
}

export class DexScreenerApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DexScreenerApiError";
  }
}
