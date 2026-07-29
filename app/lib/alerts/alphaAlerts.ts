import type { AnalysisResult } from "../types/tokenMetrics";

export type AlphaAlertSeverity =
  | "INFO"
  | "WATCH"
  | "HIGH";

export type AlphaAlertReason =
  | "NEW_STRONG_ALPHA"
  | "ALPHA_IMPROVED"
  | "RISK_IMPROVED"
  | "OPPORTUNITY_IMPROVED"
  | "SMART_MONEY_IMPROVED"
  | "NEW_RADAR_LEADER";

export interface AlphaAlert {
  id: string;
  contractAddress: string;
  symbol: string;
  createdAt: string;
  severity: AlphaAlertSeverity;
  reasons: AlphaAlertReason[];
  title: string;
  message: string;
  currentAlpha: number;
  previousAlpha: number | null;
  alphaChange: number | null;
  riskScore: number;
  opportunityScore: number;
  smartMoneyScore: number;
  securityScore: number;
  verdict: string;
  stage: string;
  isRead: boolean;
}

export interface AlphaAlertSettings {
  enabled: boolean;
  intervalMinutes: 2 | 5 | 10;
  minimumAlpha: number;
  minimumAlphaImprovement: number;
  maximumRisk: number;
  minimumSecurity: number;
  alertOnNewLeader: boolean;
  browserNotificationsEnabled: boolean;
}

export interface AlertCandidateSnapshot {
  contractAddress: string;
  symbol: string;
  scannedAt: string;
  alphaScore: number;
  riskScore: number;
  opportunityScore: number;
  smartMoneyScore: number;
  securityScore: number;
  verdict: string;
  stage: string;
}

const ALERTS_STORAGE_KEY = "fomo-copilot-alpha-alerts-v1";
const ALERT_SETTINGS_STORAGE_KEY = "fomo-copilot-alpha-alert-settings-v1";
const ALERT_SNAPSHOTS_STORAGE_KEY = "fomo-copilot-alpha-alert-snapshots-v1";
const ALERT_RADAR_LEADER_KEY = "fomo-copilot-alpha-alert-previous-leader-v1";
const MAX_ALERTS = 100;
const COOLDOWN_MS = 30 * 60 * 1000;
const COOLDOWN_ALPHA_EXCEPTION = 10;

export const DEFAULT_ALPHA_ALERT_SETTINGS: AlphaAlertSettings = {
  enabled: false,
  intervalMinutes: 5,
  minimumAlpha: 75,
  minimumAlphaImprovement: 10,
  maximumRisk: 60,
  minimumSecurity: 70,
  alertOnNewLeader: true,
  browserNotificationsEnabled: false,
};

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function clampSetting(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parseSettings(raw: unknown): AlphaAlertSettings {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_ALPHA_ALERT_SETTINGS;
  }

  const record = raw as Record<string, unknown>;
  const intervalRaw = record.intervalMinutes;

  return {
    enabled: record.enabled === true,
    intervalMinutes:
      intervalRaw === 2 || intervalRaw === 5 || intervalRaw === 10
        ? intervalRaw
        : DEFAULT_ALPHA_ALERT_SETTINGS.intervalMinutes,
    minimumAlpha: clampSetting(
      Number(record.minimumAlpha),
      50,
      100,
      DEFAULT_ALPHA_ALERT_SETTINGS.minimumAlpha,
    ),
    minimumAlphaImprovement: clampSetting(
      Number(record.minimumAlphaImprovement),
      5,
      30,
      DEFAULT_ALPHA_ALERT_SETTINGS.minimumAlphaImprovement,
    ),
    maximumRisk: clampSetting(
      Number(record.maximumRisk),
      0,
      100,
      DEFAULT_ALPHA_ALERT_SETTINGS.maximumRisk,
    ),
    minimumSecurity: clampSetting(
      Number(record.minimumSecurity),
      0,
      100,
      DEFAULT_ALPHA_ALERT_SETTINGS.minimumSecurity,
    ),
    alertOnNewLeader: record.alertOnNewLeader !== false,
    browserNotificationsEnabled: record.browserNotificationsEnabled === true,
  };
}

function parseAlert(item: unknown): AlphaAlert | null {
  if (typeof item !== "object" || item === null) return null;

  const record = item as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.contractAddress !== "string" ||
    typeof record.symbol !== "string" ||
    typeof record.createdAt !== "string" ||
    typeof record.title !== "string" ||
    typeof record.message !== "string" ||
    typeof record.verdict !== "string" ||
    typeof record.stage !== "string" ||
    typeof record.currentAlpha !== "number" ||
    typeof record.riskScore !== "number" ||
    typeof record.opportunityScore !== "number" ||
    typeof record.smartMoneyScore !== "number" ||
    typeof record.securityScore !== "number" ||
    typeof record.isRead !== "boolean" ||
    !Array.isArray(record.reasons)
  ) {
    return null;
  }

  const severity = record.severity;
  if (severity !== "INFO" && severity !== "WATCH" && severity !== "HIGH") {
    return null;
  }

  return {
    id: record.id,
    contractAddress: record.contractAddress,
    symbol: record.symbol,
    createdAt: record.createdAt,
    severity,
    reasons: record.reasons.filter(
      (reason): reason is AlphaAlertReason =>
        reason === "NEW_STRONG_ALPHA" ||
        reason === "ALPHA_IMPROVED" ||
        reason === "RISK_IMPROVED" ||
        reason === "OPPORTUNITY_IMPROVED" ||
        reason === "SMART_MONEY_IMPROVED" ||
        reason === "NEW_RADAR_LEADER",
    ),
    title: record.title,
    message: record.message,
    currentAlpha: record.currentAlpha,
    previousAlpha:
      typeof record.previousAlpha === "number" ? record.previousAlpha : null,
    alphaChange:
      typeof record.alphaChange === "number" ? record.alphaChange : null,
    riskScore: record.riskScore,
    opportunityScore: record.opportunityScore,
    smartMoneyScore: record.smartMoneyScore,
    securityScore: record.securityScore,
    verdict: record.verdict,
    stage: record.stage,
    isRead: record.isRead,
  };
}

function parseSnapshot(item: unknown): AlertCandidateSnapshot | null {
  if (typeof item !== "object" || item === null) return null;

  const record = item as Record<string, unknown>;
  if (
    typeof record.contractAddress !== "string" ||
    typeof record.symbol !== "string" ||
    typeof record.scannedAt !== "string" ||
    typeof record.alphaScore !== "number" ||
    typeof record.riskScore !== "number" ||
    typeof record.opportunityScore !== "number" ||
    typeof record.smartMoneyScore !== "number" ||
    typeof record.securityScore !== "number" ||
    typeof record.verdict !== "string" ||
    typeof record.stage !== "string"
  ) {
    return null;
  }

  return {
    contractAddress: record.contractAddress,
    symbol: record.symbol,
    scannedAt: record.scannedAt,
    alphaScore: record.alphaScore,
    riskScore: record.riskScore,
    opportunityScore: record.opportunityScore,
    smartMoneyScore: record.smartMoneyScore,
    securityScore: record.securityScore,
    verdict: record.verdict,
    stage: record.stage,
  };
}

function sortAlertsNewestFirst(alerts: AlphaAlert[]): AlphaAlert[] {
  return [...alerts].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function mergeSnapshots(
  previous: AlertCandidateSnapshot[],
  incoming: AlertCandidateSnapshot[],
): AlertCandidateSnapshot[] {
  const map = new Map<string, AlertCandidateSnapshot>();

  for (const snapshot of previous) {
    map.set(snapshot.contractAddress, snapshot);
  }

  for (const snapshot of incoming) {
    const existing = map.get(snapshot.contractAddress);
    if (
      !existing ||
      new Date(snapshot.scannedAt).getTime() >=
        new Date(existing.scannedAt).getTime()
    ) {
      map.set(snapshot.contractAddress, snapshot);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );
}

export function loadAlphaAlerts(): AlphaAlert[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return sortAlertsNewestFirst(
      parsed
        .map(parseAlert)
        .filter((alert): alert is AlphaAlert => alert !== null),
    );
  } catch {
    return [];
  }
}

export function saveAlphaAlerts(alerts: AlphaAlert[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(
    ALERTS_STORAGE_KEY,
    JSON.stringify(sortAlertsNewestFirst(alerts).slice(0, MAX_ALERTS)),
  );
}

export function loadAlphaAlertSettings(): AlphaAlertSettings {
  if (!isBrowser()) return DEFAULT_ALPHA_ALERT_SETTINGS;

  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_ALPHA_ALERT_SETTINGS;
    return parseSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_ALPHA_ALERT_SETTINGS;
  }
}

export function saveAlphaAlertSettings(
  settings: AlphaAlertSettings,
): void {
  if (!isBrowser()) return;
  localStorage.setItem(ALERT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadAlertSnapshots(): AlertCandidateSnapshot[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(ALERT_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseSnapshot)
      .filter((snapshot): snapshot is AlertCandidateSnapshot => snapshot !== null);
  } catch {
    return [];
  }
}

export function saveAlertSnapshots(
  snapshots: AlertCandidateSnapshot[],
): void {
  if (!isBrowser()) return;
  localStorage.setItem(
    ALERT_SNAPSHOTS_STORAGE_KEY,
    JSON.stringify(mergeSnapshots([], snapshots)),
  );
}

export function loadPreviousRadarLeader(): string | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(ALERT_RADAR_LEADER_KEY);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function savePreviousRadarLeader(
  contractAddress: string | null,
): void {
  if (!isBrowser()) return;

  if (!contractAddress) {
    localStorage.removeItem(ALERT_RADAR_LEADER_KEY);
    return;
  }

  localStorage.setItem(ALERT_RADAR_LEADER_KEY, contractAddress);
}

function buildSnapshot(
  analysis: AnalysisResult,
  scannedAt: string,
): AlertCandidateSnapshot {
  return {
    contractAddress: analysis.contractAddress,
    symbol: analysis.symbol,
    scannedAt,
    alphaScore: analysis.alpha.score,
    riskScore: analysis.riskScore,
    opportunityScore: analysis.opportunity.score,
    smartMoneyScore: analysis.smartMoney.score,
    securityScore: analysis.security.securityScore,
    verdict: analysis.verdict.verdict,
    stage: analysis.opportunity.stage,
  };
}

function severityRank(severity: AlphaAlertSeverity): number {
  switch (severity) {
    case "HIGH":
      return 3;
    case "WATCH":
      return 2;
    case "INFO":
      return 1;
  }
}

function maxSeverity(
  severities: AlphaAlertSeverity[],
): AlphaAlertSeverity {
  return severities.reduce((best, current) =>
    severityRank(current) > severityRank(best) ? current : best,
  );
}

function buildTitle(reasons: AlphaAlertReason[]): string {
  if (reasons.includes("NEW_RADAR_LEADER")) return "New Radar Leader";
  if (reasons.includes("NEW_STRONG_ALPHA")) return "New strong Alpha candidate";
  if (reasons.includes("ALPHA_IMPROVED")) return "Alpha improved";
  if (reasons.includes("OPPORTUNITY_IMPROVED")) return "Opportunity improved";
  if (reasons.includes("SMART_MONEY_IMPROVED")) return "Smart Money improved";
  if (reasons.includes("RISK_IMPROVED")) return "Risk improved";
  return "Alpha alert";
}

function buildMessage(
  analysis: AnalysisResult,
  reasons: AlphaAlertReason[],
  previous: AlertCandidateSnapshot | null,
): string {
  const symbol = analysis.symbol;
  const alpha = analysis.alpha.score;

  if (reasons.includes("NEW_RADAR_LEADER")) {
    return `${symbol} is now the highest-ranked candidate in the latest radar scan.`;
  }

  if (reasons.includes("NEW_STRONG_ALPHA")) {
    return `${symbol} reached Alpha ${alpha} with Risk ${analysis.riskScore} and Security ${analysis.security.securityScore}.`;
  }

  if (reasons.includes("ALPHA_IMPROVED") && previous) {
    return `Alpha increased from ${previous.alphaScore} to ${alpha} while Opportunity reached ${analysis.opportunity.score}.`;
  }

  if (reasons.includes("OPPORTUNITY_IMPROVED") && previous) {
    return `${symbol} opportunity increased from ${previous.opportunityScore} to ${analysis.opportunity.score}.`;
  }

  if (reasons.includes("SMART_MONEY_IMPROVED") && previous) {
    return `${symbol} smart money proxy increased from ${previous.smartMoneyScore} to ${analysis.smartMoney.score}.`;
  }

  if (reasons.includes("RISK_IMPROVED") && previous) {
    return `${symbol} risk decreased from ${previous.riskScore} to ${analysis.riskScore}.`;
  }

  return `${symbol} triggered an Alpha alert at score ${alpha}.`;
}

function evaluateTokenAlert(
  analysis: AnalysisResult,
  previous: AlertCandidateSnapshot | null,
  settings: AlphaAlertSettings,
): AlphaAlert | null {
  const reasons: AlphaAlertReason[] = [];
  const severities: AlphaAlertSeverity[] = [];

  const alpha = analysis.alpha.score;
  const risk = analysis.riskScore;
  const security = analysis.security.securityScore;
  const opportunity = analysis.opportunity.score;
  const smartMoney = analysis.smartMoney.score;

  if (
    !previous &&
    alpha >= settings.minimumAlpha &&
    risk <= settings.maximumRisk &&
    security >= settings.minimumSecurity
  ) {
    reasons.push("NEW_STRONG_ALPHA");
    severities.push(alpha >= 85 ? "HIGH" : "WATCH");
  }

  if (previous) {
    const alphaChange = alpha - previous.alphaScore;

    if (alphaChange >= settings.minimumAlphaImprovement && alpha >= 65) {
      reasons.push("ALPHA_IMPROVED");
      severities.push(alpha >= 80 ? "HIGH" : "WATCH");
    }

    if (previous.riskScore - risk >= 12 && alpha >= 60) {
      reasons.push("RISK_IMPROVED");
      severities.push("INFO");
    }

    if (opportunity - previous.opportunityScore >= 12 && opportunity >= 65) {
      reasons.push("OPPORTUNITY_IMPROVED");
      severities.push("WATCH");
    }

    if (smartMoney - previous.smartMoneyScore >= 15 && smartMoney >= 60) {
      reasons.push("SMART_MONEY_IMPROVED");
      severities.push("WATCH");
    }
  }

  if (reasons.length === 0) return null;

  const createdAt = new Date().toISOString();

  return {
    id: `${analysis.contractAddress}-${createdAt}`,
    contractAddress: analysis.contractAddress,
    symbol: analysis.symbol,
    createdAt,
    severity: maxSeverity(severities),
    reasons,
    title: buildTitle(reasons),
    message: buildMessage(analysis, reasons, previous),
    currentAlpha: alpha,
    previousAlpha: previous?.alphaScore ?? null,
    alphaChange: previous ? alpha - previous.alphaScore : null,
    riskScore: risk,
    opportunityScore: opportunity,
    smartMoneyScore: smartMoney,
    securityScore: security,
    verdict: analysis.verdict.verdict,
    stage: analysis.opportunity.stage,
    isRead: false,
  };
}

function passesReasonCooldown(
  existingAlerts: AlphaAlert[],
  contractAddress: string,
  reason: AlphaAlertReason,
  currentAlpha: number,
): boolean {
  const recent = existingAlerts.find(
    (alert) =>
      alert.contractAddress === contractAddress &&
      alert.reasons.includes(reason) &&
      Date.now() - new Date(alert.createdAt).getTime() < COOLDOWN_MS,
  );

  if (!recent) return true;

  return Math.abs(currentAlpha - recent.currentAlpha) >= COOLDOWN_ALPHA_EXCEPTION;
}

export function applyAlertCooldown(
  existingAlerts: AlphaAlert[],
  incomingAlert: AlphaAlert,
): AlphaAlert | null {
  const filteredReasons = incomingAlert.reasons.filter((reason) =>
    passesReasonCooldown(
      existingAlerts,
      incomingAlert.contractAddress,
      reason,
      incomingAlert.currentAlpha,
    ),
  );

  if (filteredReasons.length === 0) return null;

  const severity =
    filteredReasons.includes("NEW_STRONG_ALPHA") ||
    filteredReasons.includes("ALPHA_IMPROVED") ||
    filteredReasons.includes("NEW_RADAR_LEADER")
      ? incomingAlert.severity
      : maxSeverity(
          filteredReasons.map((reason) => {
            switch (reason) {
              case "RISK_IMPROVED":
                return "INFO";
              case "NEW_RADAR_LEADER":
              case "NEW_STRONG_ALPHA":
                return incomingAlert.severity;
              default:
                return "WATCH";
            }
          }),
        );

  return {
    ...incomingAlert,
    reasons: filteredReasons,
    severity,
    title: buildTitle(filteredReasons),
  };
}

export function evaluateAlphaAlerts(options: {
  analyses: AnalysisResult[];
  previousSnapshots: AlertCandidateSnapshot[];
  settings: AlphaAlertSettings;
}): {
  alerts: AlphaAlert[];
  snapshots: AlertCandidateSnapshot[];
} {
  const scannedAt = new Date().toISOString();
  const snapshotMap = new Map(
    options.previousSnapshots.map((snapshot) => [
      snapshot.contractAddress,
      snapshot,
    ]),
  );

  const alerts: AlphaAlert[] = [];
  const nextSnapshots: AlertCandidateSnapshot[] = [];

  for (const analysis of options.analyses) {
    const previous = snapshotMap.get(analysis.contractAddress) ?? null;
    const alert = evaluateTokenAlert(analysis, previous, options.settings);

    if (alert) {
      alerts.push(alert);
    }

    nextSnapshots.push(buildSnapshot(analysis, scannedAt));
  }

  return {
    alerts,
    snapshots: mergeSnapshots(options.previousSnapshots, nextSnapshots),
  };
}

export function createRadarLeaderAlert(
  analysis: AnalysisResult,
): AlphaAlert {
  const createdAt = new Date().toISOString();

  return {
    id: `${analysis.contractAddress}-leader-${createdAt}`,
    contractAddress: analysis.contractAddress,
    symbol: analysis.symbol,
    createdAt,
    severity: "HIGH",
    reasons: ["NEW_RADAR_LEADER"],
    title: "New Radar Leader",
    message: `${analysis.symbol} is now the highest-ranked candidate in the latest radar scan.`,
    currentAlpha: analysis.alpha.score,
    previousAlpha: null,
    alphaChange: null,
    riskScore: analysis.riskScore,
    opportunityScore: analysis.opportunity.score,
    smartMoneyScore: analysis.smartMoney.score,
    securityScore: analysis.security.securityScore,
    verdict: analysis.verdict.verdict,
    stage: analysis.opportunity.stage,
    isRead: false,
  };
}

export function mergeIncomingAlerts(
  existingAlerts: AlphaAlert[],
  incomingAlerts: AlphaAlert[],
): AlphaAlert[] {
  const merged = [...existingAlerts];

  for (const incoming of incomingAlerts) {
    const cooled = applyAlertCooldown(merged, incoming);
    if (cooled) {
      merged.unshift(cooled);
    }
  }

  return sortAlertsNewestFirst(merged).slice(0, MAX_ALERTS);
}

export function markAlertRead(alertId: string): AlphaAlert[] {
  const updated = loadAlphaAlerts().map((alert) =>
    alert.id === alertId ? { ...alert, isRead: true } : alert,
  );
  saveAlphaAlerts(updated);
  return updated;
}

export function markAllAlertsRead(): AlphaAlert[] {
  const updated = loadAlphaAlerts().map((alert) => ({ ...alert, isRead: true }));
  saveAlphaAlerts(updated);
  return updated;
}

export function clearAlphaAlerts(): AlphaAlert[] {
  saveAlphaAlerts([]);
  return [];
}

export function dismissAlert(alertId: string): AlphaAlert[] {
  const updated = loadAlphaAlerts().filter((alert) => alert.id !== alertId);
  saveAlphaAlerts(updated);
  return updated;
}

export function getUnreadAlertCount(alerts: AlphaAlert[]): number {
  return alerts.filter((alert) => !alert.isRead).length;
}

export function showBrowserNotificationIfAllowed(
  alert: AlphaAlert,
  settings: AlphaAlertSettings,
): void {
  if (
    !settings.browserNotificationsEnabled ||
    alert.severity !== "HIGH" ||
    typeof window === "undefined" ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  new Notification(`Alpha Alert: ${alert.symbol}`, {
    body: `${alert.title} — Alpha ${alert.currentAlpha}`,
  });
}

export function requestBrowserNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return Promise.resolve("unsupported");
  }

  return Notification.requestPermission();
}
