const RUGCHECK_BASE_URL = "https://api.rugcheck.xyz/v1/tokens";

export interface RugCheckRisk {
  name: string;
  value?: string;
  description: string;
  score: number;
  level: string;
}

export interface RugCheckSummary {
  score: number;
  scoreNormalised: number;
  lpLockedPct: number;
  risks: RugCheckRisk[];
  tokenProgram: string;
}

export interface RugCheckReport {
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadataMutable: boolean;
  updateAuthority: string | null;
  lpLockedPct: number;
  risks: RugCheckRisk[];
  scoreNormalised: number;
}

interface RugCheckSummaryResponse {
  score?: number;
  score_normalised?: number;
  lpLockedPct?: number;
  risks?: RugCheckRisk[];
  tokenProgram?: string;
}

interface RugCheckReportResponse {
  token?: {
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
  };
  tokenMeta?: {
    mutable?: boolean;
    updateAuthority?: string;
  };
  risks?: RugCheckRisk[];
  score_normalised?: number;
  lpLockedPct?: number;
}

export async function fetchRugCheckSummary(
  mintAddress: string,
): Promise<RugCheckSummary | null> {
  try {
    const response = await fetch(
      `${RUGCHECK_BASE_URL}/${encodeURIComponent(mintAddress)}/report/summary`,
      { headers: { Accept: "application/json" }, next: { revalidate: 60 } },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as RugCheckSummaryResponse;
    return {
      score: data.score ?? 0,
      scoreNormalised: data.score_normalised ?? 0,
      lpLockedPct: data.lpLockedPct ?? 0,
      risks: data.risks ?? [],
      tokenProgram: data.tokenProgram ?? "",
    };
  } catch {
    return null;
  }
}

export async function fetchRugCheckReport(
  mintAddress: string,
): Promise<RugCheckReport | null> {
  try {
    const response = await fetch(
      `${RUGCHECK_BASE_URL}/${encodeURIComponent(mintAddress)}/report`,
      { headers: { Accept: "application/json" }, next: { revalidate: 60 } },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as RugCheckReportResponse;
    return {
      mintAuthority: data.token?.mintAuthority ?? null,
      freezeAuthority: data.token?.freezeAuthority ?? null,
      metadataMutable: data.tokenMeta?.mutable ?? false,
      updateAuthority: data.tokenMeta?.updateAuthority ?? null,
      lpLockedPct: data.lpLockedPct ?? 0,
      risks: data.risks ?? [],
      scoreNormalised: data.score_normalised ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchRugCheckData(mintAddress: string): Promise<{
  summary: RugCheckSummary | null;
  report: RugCheckReport | null;
} | null> {
  const [summary, report] = await Promise.all([
    fetchRugCheckSummary(mintAddress),
    fetchRugCheckReport(mintAddress),
  ]);

  if (!summary && !report) return null;

  return { summary, report };
}
