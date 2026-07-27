import { fetchGoPlusSecurity, isActive, type GoPlusTokenSecurity } from "../services/goplus";
import {
  fetchRugCheckData,
  type RugCheckReport,
  type RugCheckSummary,
} from "../services/rugcheck";
import type {
  SecurityAnalysis,
  SecurityCheck,
  SecurityCheckStatus,
} from "../types/security";

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function checkScore(status: SecurityCheckStatus): number {
  if (status === "pass") return 100;
  if (status === "warn") return 55;
  if (status === "fail") return 15;
  return 50;
}

function buildLiquidityLockedCheck(
  summary: RugCheckSummary | null,
  report: RugCheckReport | null,
): SecurityCheck {
  if (!summary && !report) {
    return {
      key: "liquidityLocked",
      label: "Liquidity Locked",
      status: "unknown",
      value: "Unverified",
      explanation: "RugCheck data unavailable — liquidity lock status could not be verified.",
    };
  }

  const pct = report?.lpLockedPct ?? summary?.lpLockedPct ?? 0;
  let status: SecurityCheckStatus;
  let explanation: string;

  if (pct >= 80) {
    status = "pass";
    explanation = `Liquidity is ${pct.toFixed(1)}% locked — strong protection against rug-pull via LP removal.`;
  } else if (pct >= 40) {
    status = "warn";
    explanation = `Only ${pct.toFixed(1)}% of liquidity is locked. Partial lock reduces but does not eliminate LP drain risk.`;
  } else if (pct > 0) {
    status = "fail";
    explanation = `Critical: just ${pct.toFixed(1)}% liquidity locked. Deployer can remove most LP and crash the price.`;
  } else {
    status = "fail";
    explanation =
      "No liquidity lock detected. LP can be withdrawn at any time — high rug-pull probability.";
  }

  return {
    key: "liquidityLocked",
    label: "Liquidity Locked",
    status,
    value: pct > 0 ? `${pct.toFixed(1)}% locked` : "Unlocked",
    explanation,
  };
}

function buildMintAuthorityCheck(
  report: RugCheckReport | null,
  goplus: GoPlusTokenSecurity | null,
): SecurityCheck {
  const mintAuthority = report?.mintAuthority;
  const mintable = goplus ? isActive(goplus.mintable.status) : null;

  if (mintAuthority === null && mintable === false) {
    return {
      key: "mintAuthority",
      label: "Mint Authority",
      status: "pass",
      value: "Renounced",
      explanation:
        "Mint authority is renounced. Supply is fixed and cannot be inflated by the deployer.",
    };
  }

  if (mintAuthority === null && mintable === null) {
    return {
      key: "mintAuthority",
      label: "Mint Authority",
      status: "pass",
      value: "Renounced",
      explanation:
        "RugCheck confirms mint authority is renounced — no new tokens can be minted.",
    };
  }

  if (mintable === true || mintAuthority) {
    const addr = mintAuthority ?? goplus?.mintable.authority?.[0]?.address ?? "active";
    return {
      key: "mintAuthority",
      label: "Mint Authority",
      status: "fail",
      value: "Active",
      explanation: `Mint authority is active (${addr.slice(0, 8)}…). Deployer can mint unlimited tokens and dilute holders.`,
    };
  }

  return {
    key: "mintAuthority",
    label: "Mint Authority",
    status: "unknown",
    value: "Unknown",
    explanation: "Mint authority status could not be verified from available sources.",
  };
}

function buildFreezeAuthorityCheck(
  report: RugCheckReport | null,
  goplus: GoPlusTokenSecurity | null,
): SecurityCheck {
  const freezeAuthority = report?.freezeAuthority;
  const freezable = goplus ? isActive(goplus.freezable.status) : null;

  if (freezeAuthority === null && freezable === false) {
    return {
      key: "freezeAuthority",
      label: "Freeze Authority",
      status: "pass",
      value: "Renounced",
      explanation:
        "Freeze authority is disabled. Wallets cannot be frozen and trading cannot be halted.",
    };
  }

  if (freezeAuthority === null && freezable === null) {
    return {
      key: "freezeAuthority",
      label: "Freeze Authority",
      status: "pass",
      value: "Renounced",
      explanation: "RugCheck confirms freeze authority is renounced — accounts cannot be frozen.",
    };
  }

  if (freezable === true || freezeAuthority) {
    return {
      key: "freezeAuthority",
      label: "Freeze Authority",
      status: "fail",
      value: "Active",
      explanation:
        "Freeze authority is active. Owner can freeze any wallet and block sells — classic honeypot vector.",
    };
  }

  return {
    key: "freezeAuthority",
    label: "Freeze Authority",
    status: "unknown",
    value: "Unknown",
    explanation: "Freeze authority could not be confirmed.",
  };
}

function buildHoneypotCheck(goplus: GoPlusTokenSecurity | null): SecurityCheck {
  if (!goplus) {
    return {
      key: "honeypotRisk",
      label: "Honeypot Risk",
      status: "unknown",
      value: "Unverified",
      explanation: "GoPlus data unavailable — honeypot detection could not run.",
    };
  }

  const nonTransferable = goplus.nonTransferable === "1";
  const hasTransferHook = goplus.transferHook.length > 0;
  const transferFeeActive = isActive(goplus.transferFeeUpgradable.status);

  if (nonTransferable) {
    return {
      key: "honeypotRisk",
      label: "Honeypot Risk",
      status: "fail",
      value: "Non-transferable",
      explanation:
        "Token is non-transferable. Buys may succeed but sells are blocked — confirmed honeypot pattern.",
    };
  }

  if (hasTransferHook) {
    return {
      key: "honeypotRisk",
      label: "Honeypot Risk",
      status: "warn",
      value: "Transfer hook",
      explanation:
        "Transfer hook detected. Custom logic runs on every transfer — verify it does not block sells.",
    };
  }

  if (transferFeeActive) {
    return {
      key: "honeypotRisk",
      label: "Honeypot Risk",
      status: "warn",
      value: "Transfer fee",
      explanation:
        "Upgradable transfer fees detected. Fees can be raised to effectively block selling.",
    };
  }

  return {
    key: "honeypotRisk",
    label: "Honeypot Risk",
    status: "pass",
    value: "Clear",
    explanation:
      "No honeypot indicators. Token is transferable with no blocking hooks detected by GoPlus.",
  };
}

function buildBlacklistCheck(
  goplus: GoPlusTokenSecurity | null,
  report: RugCheckReport | null,
): SecurityCheck {
  const frozenDefault = goplus?.defaultAccountState === "2";
  const freezable = goplus ? isActive(goplus.freezable.status) : false;

  const blacklistRisk = report?.risks.find(
    (r) =>
      r.name.toLowerCase().includes("blacklist") ||
      r.name.toLowerCase().includes("freeze"),
  );

  if (frozenDefault || freezable) {
    return {
      key: "blacklistFunctions",
      label: "Blacklist Functions",
      status: "fail",
      value: "Detected",
      explanation:
        "Blacklist/freeze capability active. Owner can block specific wallets from trading.",
    };
  }

  if (blacklistRisk) {
    return {
      key: "blacklistFunctions",
      label: "Blacklist Functions",
      status: "warn",
      value: "Flagged",
      explanation: `RugCheck flagged: ${blacklistRisk.description}`,
    };
  }

  if (goplus) {
    return {
      key: "blacklistFunctions",
      label: "Blacklist Functions",
      status: "pass",
      value: "None",
      explanation:
        "No blacklist or wallet-freeze functions detected. All wallets can trade freely.",
    };
  }

  return {
    key: "blacklistFunctions",
    label: "Blacklist Functions",
    status: "unknown",
    value: "Unverified",
    explanation: "Blacklist function scan incomplete — GoPlus data unavailable.",
  };
}

function buildProxyCheck(
  report: RugCheckReport | null,
  goplus: GoPlusTokenSecurity | null,
): SecurityCheck {
  const metadataMutable = report?.metadataMutable ?? false;
  const hookUpgradable = goplus ? isActive(goplus.transferHookUpgradable.status) : false;
  const metadataUpgradable = goplus ? isActive(goplus.metadataMutable.status) : false;

  const proxyRisk = report?.risks.find(
    (r) =>
      r.name.toLowerCase().includes("proxy") ||
      r.name.toLowerCase().includes("upgrade") ||
      r.name.toLowerCase().includes("mutable"),
  );

  if (proxyRisk) {
    return {
      key: "proxyContract",
      label: "Proxy Contract",
      status: "fail",
      value: "Upgradeable",
      explanation: `RugCheck upgrade/proxy risk: ${proxyRisk.description}`,
    };
  }

  if (metadataMutable || metadataUpgradable || hookUpgradable) {
    return {
      key: "proxyContract",
      label: "Proxy Contract",
      status: "warn",
      value: "Mutable",
      explanation:
        "Contract metadata or hooks are upgradeable. Logic can change post-launch without user notice.",
    };
  }

  if (report || goplus) {
    return {
      key: "proxyContract",
      label: "Proxy Contract",
      status: "pass",
      value: "Immutable",
      explanation:
        "No proxy or upgrade pattern detected. Token program logic appears immutable.",
    };
  }

  return {
    key: "proxyContract",
    label: "Proxy Contract",
    status: "unknown",
    value: "Unverified",
    explanation: "Could not verify contract immutability.",
  };
}

function buildOwnerPrivilegesCheck(goplus: GoPlusTokenSecurity | null): SecurityCheck {
  if (!goplus) {
    return {
      key: "ownerPrivileges",
      label: "Owner Privileges",
      status: "unknown",
      value: "Unverified",
      explanation: "GoPlus owner privilege scan unavailable.",
    };
  }

  const privileges: string[] = [];
  if (isActive(goplus.mintable.status)) privileges.push("mint");
  if (isActive(goplus.balanceMutableAuthority.status)) privileges.push("balance edit");
  if (isActive(goplus.closable.status)) privileges.push("close program");
  if (isActive(goplus.transferFeeUpgradable.status)) privileges.push("fee upgrade");

  if (privileges.length >= 2) {
    return {
      key: "ownerPrivileges",
      label: "Owner Privileges",
      status: "fail",
      value: `${privileges.length} active`,
      explanation: `Owner retains dangerous privileges: ${privileges.join(", ")}. High centralization risk.`,
    };
  }

  if (privileges.length === 1) {
    return {
      key: "ownerPrivileges",
      label: "Owner Privileges",
      status: "warn",
      value: privileges[0],
      explanation: `Owner can still ${privileges[0]}. Limited but non-zero admin control remains.`,
    };
  }

  return {
    key: "ownerPrivileges",
    label: "Owner Privileges",
    status: "pass",
    value: "Minimal",
    explanation:
      "No elevated owner privileges detected. Admin controls appear renounced or disabled.",
  };
}

function computeSecurityScore(checks: SecurityCheck[]): number {
  const scores = checks.map((c) => checkScore(c.status));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return clampScore(avg);
}

export async function analyzeSecurity(
  contractAddress: string,
): Promise<SecurityAnalysis> {
  const [rugcheckResult, goplus] = await Promise.allSettled([
    fetchRugCheckData(contractAddress),
    fetchGoPlusSecurity(contractAddress),
  ]);

  const rugcheck =
    rugcheckResult.status === "fulfilled" ? rugcheckResult.value : null;
  const goplusData = goplus.status === "fulfilled" ? goplus.value : null;

  const summary = rugcheck?.summary ?? null;
  const report = rugcheck?.report ?? null;

  const checks: SecurityCheck[] = [
    buildLiquidityLockedCheck(summary, report),
    buildMintAuthorityCheck(report, goplusData),
    buildFreezeAuthorityCheck(report, goplusData),
    buildHoneypotCheck(goplusData),
    buildBlacklistCheck(goplusData, report),
    buildProxyCheck(report, goplusData),
    buildOwnerPrivilegesCheck(goplusData),
  ];

  const rugCheckNormalised =
    summary?.scoreNormalised ?? report?.scoreNormalised ?? null;

  let securityScore = computeSecurityScore(checks);

  if (rugCheckNormalised !== null) {
    const rugcheckSafety = clampScore(100 - rugCheckNormalised * 10);
    securityScore = clampScore(securityScore * 0.7 + rugcheckSafety * 0.3);
  }

  return {
    securityScore,
    checks,
    rugCheckNormalisedScore: rugCheckNormalised,
    sources: {
      rugcheck: rugcheck !== null,
      goplus: goplusData !== null,
    },
  };
}
