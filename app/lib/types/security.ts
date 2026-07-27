export type SecurityCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type SecurityCheckKey =
  | "liquidityLocked"
  | "mintAuthority"
  | "freezeAuthority"
  | "honeypotRisk"
  | "blacklistFunctions"
  | "proxyContract"
  | "ownerPrivileges";

export interface SecurityCheck {
  key: SecurityCheckKey;
  label: string;
  status: SecurityCheckStatus;
  value: string;
  explanation: string;
}

export interface SecurityAnalysis {
  securityScore: number;
  checks: SecurityCheck[];
  rugCheckNormalisedScore: number | null;
  sources: {
    rugcheck: boolean;
    goplus: boolean;
  };
}
