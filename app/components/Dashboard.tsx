"use client";

import { useCallback, useEffect, useState } from "react";
import { analyzeTokenAction } from "../actions/analyzeTokenAction";
import { scanRadarAction } from "../actions/scanRadarAction";
import { buildRecommendationText } from "../lib/analysis/analyzeToken";
import type {
  AiDecisionItem,
  AnalysisResult,
  BiggestRisk,
  FactorScore,
  Recommendation,
  TradeSetup,
} from "../lib/types/tokenMetrics";
import type { SecurityAnalysis, SecurityCheck, SecurityCheckStatus } from "../lib/types/security";
import type { AiAnalystResult } from "../lib/types/ai";
import {
  calculateHistoryTrend,
  clearTokenHistory,
  createHistorySnapshot,
  getTokenHistory,
  saveHistorySnapshot,
  type HistorySnapshot,
  type HistoryTrend,
} from "../lib/history/history";
import {
  createWatchlistItem,
  loadWatchlist,
  removeWatchlistItem,
  saveWatchlistItem,
  updateWatchlistItem,
  type WatchlistItem,
} from "../lib/watchlist/watchlist";
import type { RadarCandidate, RadarScanResult } from "../lib/radar/types";
import type { RadarSource } from "../lib/radar/types";

const APP_VERSION = "v0.15";
const APP_FEATURE = "Alpha Radar";
const APP_VERSION_LABEL = `FOMO COPILOT ${APP_VERSION} · ${APP_FEATURE}`;

function scoreColor(score: number, invert = false): string {
  const effective = invert ? 100 - score : score;
  if (effective >= 70) return "#00e676";
  if (effective >= 45) return "#ffb020";
  return "#ff3344";
}

function ScoreGauge({
  score,
  label,
  sublabel,
  invert = false,
}: {
  score: number;
  label: string;
  sublabel?: string;
  invert?: boolean;
}) {
  const color = scoreColor(score, invert);
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="120" height="120" className="-rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          <circle
            cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeLinecap="square" strokeDasharray={circumference} strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-bold tabular-nums" style={{ color }}>{score}</span>
        </div>
      </div>
      <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-terminal">{label}</p>
      {sublabel && <p className="text-[10px] text-muted">{sublabel}</p>}
    </div>
  );
}

function SignalDot({ signal }: { signal: FactorScore["signal"] }) {
  const colors = { bullish: "bg-accent", neutral: "bg-warning", bearish: "bg-danger" };
  return <span className={`inline-block h-1.5 w-1.5 ${colors[signal]}`} />;
}

function FactorRow({ factor }: { factor: FactorScore }) {
  const barColor = scoreColor(factor.score);
  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02]">
      <td className="py-2.5 pr-3 font-mono text-[11px] uppercase tracking-wider text-terminal">{factor.label}</td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{factor.rawValue}</td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-24 bg-white/[0.06]">
            <div className="h-full transition-all duration-500" style={{ width: `${factor.score}%`, backgroundColor: barColor }} />
          </div>
          <span className="w-8 font-mono text-xs tabular-nums" style={{ color: barColor }}>{factor.score}</span>
        </div>
      </td>
      <td className="py-2.5 text-right"><SignalDot signal={factor.signal} /></td>
      <td className="py-2.5 pl-2 font-mono text-[10px] tabular-nums text-muted">{(factor.weight * 100).toFixed(0)}%</td>
    </tr>
  );
}

function SecurityStatusBadge({ status }: { status: SecurityCheckStatus }) {
  const styles: Record<SecurityCheckStatus, string> = {
    pass: "bg-accent/15 text-accent border-accent/30",
    warn: "bg-warning/15 text-warning border-warning/30",
    fail: "bg-danger/15 text-danger border-danger/30",
    unknown: "bg-white/5 text-muted border-white/10",
  };
  const labels: Record<SecurityCheckStatus, string> = {
    pass: "PASS",
    warn: "WARN",
    fail: "FAIL",
    unknown: "N/A",
  };
  return (
    <span className={`inline-block border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function SecurityCheckRow({ check }: { check: SecurityCheck }) {
  return (
    <div className="border-b border-white/[0.04] py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-terminal">{check.label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted">{check.value}</span>
          <SecurityStatusBadge status={check.status} />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{check.explanation}</p>
    </div>
  );
}

function SecurityPanel({ security }: { security: SecurityAnalysis }) {
  return (
    <div className="panel-border border-l-2 border-l-terminal bg-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Security Intelligence
          </h3>
          <div className="mt-1 flex gap-2 font-mono text-[9px] text-muted">
            {security.sources.rugcheck && <span className="text-terminal/80">RUGCHECK</span>}
            {security.sources.goplus && <span className="text-terminal/80">GOPLUS</span>}
            {!security.sources.rugcheck && !security.sources.goplus && (
              <span>Limited source data</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Security Score</p>
          <p
            className="font-mono text-2xl font-bold tabular-nums"
            style={{ color: scoreColor(security.securityScore) }}
          >
            {security.securityScore}
          </p>
        </div>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {security.checks.map((check) => (
          <SecurityCheckRow key={check.key} check={check} />
        ))}
      </div>
    </div>
  );
}

function VerdictCard({
  verdict,
}: {
  verdict: AnalysisResult["verdict"];
}) {
  const verdictStyles: Record<
    AnalysisResult["verdict"]["verdict"],
    { bg: string; border: string; text: string }
  > = {
    "STRONG BUY": { bg: "bg-accent/10", border: "border-l-accent", text: "text-accent" },
    BUY: { bg: "bg-accent/10", border: "border-l-accent", text: "text-accent" },
    HOLD: { bg: "bg-warning/10", border: "border-l-warning", text: "text-warning" },
    "HIGH RISK": { bg: "bg-orange-500/10", border: "border-l-orange-400", text: "text-orange-400" },
    AVOID: { bg: "bg-danger/10", border: "border-l-danger", text: "text-danger" },
  };

  const qualityColors: Record<AnalysisResult["verdict"]["tradeQuality"], string> = {
    A: "text-accent",
    B: "text-accent",
    C: "text-warning",
    D: "text-orange-400",
    F: "text-danger",
  };

  const s = verdictStyles[verdict.verdict];

  return (
    <div className={`panel-border-accent border border-l-2 bg-panel ${s.border} ${s.bg}`}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
              AI Verdict
            </p>
            <p className={`mt-1 font-mono text-2xl font-bold uppercase tracking-wide ${s.text}`}>
              {verdict.verdict}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Trade Quality</p>
            <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${qualityColors[verdict.tradeQuality]}`}>
              {verdict.tradeQuality}
            </p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Suggested Position</p>
            <p className="mt-1 font-mono text-lg font-bold tabular-nums text-foreground">
              {verdict.positionSize}
            </p>
          </div>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-muted sm:text-right">
          {verdict.summary}
        </p>
      </div>
    </div>
  );
}

function alphaGradeColor(grade: AnalysisResult["alpha"]["grade"]): string {
  if (grade === "A" || grade === "B") return "text-accent";
  if (grade === "C") return "text-warning";
  return "text-danger";
}

function AlphaPanel({
  alpha,
}: {
  alpha: AnalysisResult["alpha"];
}) {
  const gradeColor = alphaGradeColor(alpha.grade);
  const barColor = scoreColor(alpha.score);
  const panelBorder =
    alpha.grade === "A" || alpha.grade === "B"
      ? "border-l-accent bg-accent/[0.04]"
      : alpha.grade === "C"
        ? "border-l-warning bg-warning/[0.04]"
        : "border-l-danger bg-danger/[0.04]";

  return (
    <div className={`panel-border border-l-2 bg-panel p-4 ${panelBorder}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Alpha Ranking
          </h3>
          <p className="mt-1 font-mono text-[9px] text-muted">
            Composite ranking estimate — not a guaranteed forecast
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Alpha Score</p>
          <p
            className="font-mono text-4xl font-bold tabular-nums"
            style={{ color: barColor }}
          >
            {alpha.score}
            <span className="text-lg text-muted">/100</span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Score</p>
          <span className="font-mono text-[10px] tabular-nums text-muted">{alpha.score}/100</span>
        </div>
        <div className="h-2 w-full bg-white/[0.06]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${alpha.score}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Grade</p>
          <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${gradeColor}`}>
            {alpha.grade}
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Label</p>
          <p className={`mt-1 font-mono text-sm font-bold uppercase tracking-wide ${gradeColor}`}>
            {alpha.label}
          </p>
        </div>
      </div>

      <div className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-terminal/20 text-left">
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Component</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Raw</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Weight</th>
              <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Contribution</th>
            </tr>
          </thead>
          <tbody>
            {alpha.components.map((component) => (
              <tr key={component.label} className="border-b border-white/[0.04]">
                <td className="py-2 pr-3 font-mono text-[11px] text-terminal">{component.label}</td>
                <td className="py-2 pr-3 font-mono text-xs tabular-nums text-muted">{component.score}</td>
                <td className="py-2 pr-3 font-mono text-xs tabular-nums text-muted">
                  {(component.weight * 100).toFixed(0)}%
                </td>
                <td className="py-2 font-mono text-xs tabular-nums text-foreground">
                  {component.contribution.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="panel-border border-l-2 border-l-accent bg-accent/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent">Positives</p>
          <ul className="mt-2 space-y-1.5">
            {alpha.positives.length > 0 ? (
              alpha.positives.map((item, i) => (
                <li key={i} className="font-mono text-xs leading-relaxed text-accent/90">
                  {item}
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No positive signals detected</li>
            )}
          </ul>
        </div>
        <div className="panel-border border-l-2 border-l-danger bg-danger/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-danger">Negatives</p>
          <ul className="mt-2 space-y-1.5">
            {alpha.negatives.length > 0 ? (
              alpha.negatives.map((item, i) => (
                <li key={i} className="font-mono text-xs leading-relaxed text-danger/90">
                  {item}
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No negative signals detected</li>
            )}
          </ul>
        </div>
      </div>

      <p className="border-t border-white/[0.06] pt-3 font-mono text-[10px] leading-relaxed text-warning/80">
        {alpha.limitation}
      </p>
    </div>
  );
}

function ConfidencePanel({
  confidence,
}: {
  confidence: AnalysisResult["confidence"];
}) {
  function reasonColor(reason: string): string {
    if (reason.startsWith("✔")) return "text-accent";
    if (reason.startsWith("✖")) return "text-danger";
    return "text-warning";
  }

  return (
    <div className="panel-border border-l-2 border-l-terminal bg-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
          Confidence Engine
        </h3>
        <p
          className="font-mono text-4xl font-bold tabular-nums"
          style={{ color: scoreColor(confidence.score) }}
        >
          {confidence.score}%
        </p>
      </div>
      <ul className="space-y-2">
        {confidence.reasons.map((reason, i) => (
          <li
            key={i}
            className={`border-b border-white/[0.04] pb-2 font-mono text-xs leading-relaxed last:border-0 last:pb-0 ${reasonColor(reason)}`}
          >
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SmartMoneyPanel({
  smartMoney,
}: {
  smartMoney: AnalysisResult["smartMoney"];
}) {
  const signalStyles: Record<
    AnalysisResult["smartMoney"]["signal"],
    { text: string; border: string; bg: string }
  > = {
    ACCUMULATION: {
      text: "text-accent",
      border: "border-l-accent",
      bg: "bg-accent/[0.04]",
    },
    NEUTRAL: {
      text: "text-warning",
      border: "border-l-warning",
      bg: "bg-warning/[0.04]",
    },
    DISTRIBUTION: {
      text: "text-danger",
      border: "border-l-danger",
      bg: "bg-danger/[0.04]",
    },
    "HIGH MANIPULATION RISK": {
      text: "text-danger",
      border: "border-l-danger",
      bg: "bg-danger/[0.06]",
    },
  };

  const toneColors: Record<
    AnalysisResult["smartMoney"]["reasons"][number]["tone"],
    string
  > = {
    positive: "text-accent",
    negative: "text-danger",
    neutral: "text-warning",
  };

  const s = signalStyles[smartMoney.signal];
  const barColor = scoreColor(smartMoney.score);

  return (
    <div className={`panel-border border-l-2 bg-panel p-4 ${s.border} ${s.bg}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Smart Money Proxy
          </h3>
          <p className="mt-1 font-mono text-[9px] text-muted">
            Market-derived estimate — not wallet-level tracking
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Proxy Score</p>
          <p
            className="font-mono text-4xl font-bold tabular-nums"
            style={{ color: barColor }}
          >
            {smartMoney.score}
            <span className="text-lg text-muted">/100</span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Score</p>
          <span className="font-mono text-[10px] tabular-nums text-muted">{smartMoney.score}/100</span>
        </div>
        <div className="h-2 w-full bg-white/[0.06]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${smartMoney.score}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      <div className="mb-4">
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Signal</p>
        <p className={`mt-1 font-mono text-sm font-bold uppercase tracking-wide ${s.text}`}>
          {smartMoney.signal}
        </p>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-foreground/90">
        {smartMoney.summary}
      </p>

      <ul className="mb-4 space-y-2">
        {smartMoney.reasons.map((reason, i) => (
          <li
            key={i}
            className="flex items-start justify-between gap-3 border-b border-white/[0.04] pb-2 last:border-0 last:pb-0"
          >
            <span className={`font-mono text-xs leading-relaxed ${toneColors[reason.tone]}`}>
              {reason.label}
            </span>
            <span
              className={`shrink-0 font-mono text-xs font-bold tabular-nums ${toneColors[reason.tone]}`}
            >
              {reason.impact > 0 ? `+${reason.impact}` : reason.impact}
            </span>
          </li>
        ))}
      </ul>

      <p className="border-t border-white/[0.06] pt-3 font-mono text-[10px] leading-relaxed text-warning/80">
        {smartMoney.limitations[0]}
      </p>
    </div>
  );
}

function OpportunityPanel({
  opportunity,
}: {
  opportunity: AnalysisResult["opportunity"];
}) {
  const stageStyles: Record<
    AnalysisResult["opportunity"]["stage"],
    { text: string; border: string; bg: string }
  > = {
    EARLY: {
      text: "text-accent",
      border: "border-l-accent",
      bg: "bg-accent/[0.04]",
    },
    MOMENTUM: {
      text: "text-accent",
      border: "border-l-accent",
      bg: "bg-accent/[0.04]",
    },
    MATURE: {
      text: "text-warning",
      border: "border-l-warning",
      bg: "bg-warning/[0.04]",
    },
    EXHAUSTED: {
      text: "text-warning",
      border: "border-l-warning",
      bg: "bg-warning/[0.04]",
    },
    "HIGH RISK": {
      text: "text-danger",
      border: "border-l-danger",
      bg: "bg-danger/[0.06]",
    },
  };

  const s = stageStyles[opportunity.stage];
  const barColor = scoreColor(opportunity.score);

  return (
    <div className={`panel-border border-l-2 bg-panel p-4 ${s.border} ${s.bg}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Opportunity Engine
          </h3>
          <p className="mt-1 font-mono text-[9px] text-muted">
            Model estimates — not guaranteed forecasts
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Opportunity Score</p>
          <p
            className="font-mono text-4xl font-bold tabular-nums"
            style={{ color: barColor }}
          >
            {opportunity.score}
            <span className="text-lg text-muted">/100</span>
          </p>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Score</p>
          <span className="font-mono text-[10px] tabular-nums text-muted">{opportunity.score}/100</span>
        </div>
        <div className="h-2 w-full bg-white/[0.06]">
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${opportunity.score}%`, backgroundColor: barColor }}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Stage</p>
          <p className={`mt-1 font-mono text-sm font-bold uppercase tracking-wide ${s.text}`}>
            {opportunity.stage}
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Upside Estimate</p>
          <p
            className="mt-1 font-mono text-lg font-bold tabular-nums"
            style={{ color: scoreColor(opportunity.upsideProbability) }}
          >
            {opportunity.upsideProbability}%
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Downside Estimate</p>
          <p
            className="mt-1 font-mono text-lg font-bold tabular-nums"
            style={{ color: scoreColor(opportunity.downsideProbability, true) }}
          >
            {opportunity.downsideProbability}%
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Entry Quality</p>
          <p
            className="mt-1 font-mono text-lg font-bold tabular-nums"
            style={{ color: scoreColor(opportunity.entryQuality) }}
          >
            {opportunity.entryQuality}/100
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Expected R:R</p>
          <p
            className="mt-1 font-mono text-lg font-bold tabular-nums"
            style={{ color: scoreColor(opportunity.score) }}
          >
            {opportunity.expectedRiskReward.toFixed(1)}x
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-foreground/90">
        {opportunity.summary}
      </p>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="panel-border border-l-2 border-l-accent bg-accent/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
            Positives
          </p>
          <ul className="mt-2 space-y-1.5">
            {opportunity.positives.length > 0 ? (
              opportunity.positives.map((item, i) => (
                <li key={i} className="font-mono text-xs leading-relaxed text-accent/90">
                  {item}
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No positive signals detected</li>
            )}
          </ul>
        </div>
        <div className="panel-border border-l-2 border-l-danger bg-danger/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-danger">
            Negatives
          </p>
          <ul className="mt-2 space-y-1.5">
            {opportunity.negatives.length > 0 ? (
              opportunity.negatives.map((item, i) => (
                <li key={i} className="font-mono text-xs leading-relaxed text-danger/90">
                  {item}
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No negative signals detected</li>
            )}
          </ul>
        </div>
      </div>

      <p className="border-t border-white/[0.06] pt-3 font-mono text-[10px] leading-relaxed text-warning/80">
        {opportunity.limitation}
      </p>
    </div>
  );
}

function CatalystPanel({
  catalysts,
}: {
  catalysts: AnalysisResult["catalysts"];
}) {
  const overallStyles: Record<
    AnalysisResult["catalysts"]["overall"],
    { text: string; border: string; bg: string }
  > = {
    BULLISH: {
      text: "text-accent",
      border: "border-l-accent",
      bg: "bg-accent/[0.04]",
    },
    NEUTRAL: {
      text: "text-warning",
      border: "border-l-warning",
      bg: "bg-warning/[0.04]",
    },
    BEARISH: {
      text: "text-danger",
      border: "border-l-danger",
      bg: "bg-danger/[0.04]",
    },
  };

  const s = overallStyles[catalysts.overall];

  return (
    <div className={`panel-border border-l-2 bg-panel p-4 ${s.border} ${s.bg}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Catalyst Engine
          </h3>
          <p className="mt-1 font-mono text-[9px] text-muted">
            Deterministic drivers from current market metrics
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Overall Signal</p>
          <p className={`mt-1 font-mono text-sm font-bold uppercase tracking-wide ${s.text}`}>
            {catalysts.overall}
          </p>
        </div>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-foreground/90">
        {catalysts.summary}
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel-border border-l-2 border-l-accent bg-accent/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
            Bullish Catalysts
          </p>
          <ul className="mt-2 space-y-2.5">
            {catalysts.bullish.length > 0 ? (
              catalysts.bullish.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 font-mono text-xs font-bold text-accent">+</span>
                  <div>
                    <p className="font-mono text-xs font-semibold text-accent">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.explanation}</p>
                  </div>
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No bullish catalysts detected</li>
            )}
          </ul>
        </div>
        <div className="panel-border border-l-2 border-l-danger bg-danger/[0.03] p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-danger">
            Bearish Catalysts
          </p>
          <ul className="mt-2 space-y-2.5">
            {catalysts.bearish.length > 0 ? (
              catalysts.bearish.map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 font-mono text-xs font-bold text-danger">-</span>
                  <div>
                    <p className="font-mono text-xs font-semibold text-danger">{item.title}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.explanation}</p>
                  </div>
                </li>
              ))
            ) : (
              <li className="font-mono text-xs italic text-muted/60">No bearish catalysts detected</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function changeColor(value: number | null, invert = false): string {
  if (value === null || value === 0) return "text-warning";
  const effective = invert ? -value : value;
  if (effective > 0) return "text-accent";
  if (effective < 0) return "text-danger";
  return "text-warning";
}

function formatScoreChange(value: number | null): string {
  if (value === null) return "N/A";
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatPriceChange(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function HistoryPanel({
  history,
  trend,
  onClear,
}: {
  history: HistorySnapshot[];
  trend: HistoryTrend | null;
  onClear: () => void;
}) {
  const recent = history.slice(0, 5);

  return (
    <div className="panel-border border-l-2 border-l-terminal bg-panel p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            History Engine
          </h3>
          <p className="mt-1 font-mono text-[9px] text-muted">
            {history.length} saved {history.length === 1 ? "analysis" : "analyses"} for this token
          </p>
        </div>
        {history.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="border border-white/10 bg-background/40 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-muted transition-colors hover:border-danger/40 hover:text-danger"
          >
            Clear token history
          </button>
        )}
      </div>

      {!trend?.previous ? (
        <p className="mb-4 font-mono text-xs text-muted">
          First saved analysis for this token.
        </p>
      ) : (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Price", value: formatPriceChange(trend.changes.pricePercent), change: trend.changes.pricePercent, invert: false },
            { label: "AI Score", value: formatScoreChange(trend.changes.aiScore), change: trend.changes.aiScore, invert: false },
            { label: "Risk Score", value: formatScoreChange(trend.changes.riskScore), change: trend.changes.riskScore, invert: true },
            { label: "Confidence", value: formatScoreChange(trend.changes.confidenceScore), change: trend.changes.confidenceScore, invert: false },
            { label: "Smart Money", value: formatScoreChange(trend.changes.smartMoneyScore), change: trend.changes.smartMoneyScore, invert: false },
            { label: "Opportunity", value: formatScoreChange(trend.changes.opportunityScore), change: trend.changes.opportunityScore, invert: false },
          ].map((item) => (
            <div key={item.label} className="panel-border bg-background/40 px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted">{item.label}</p>
              <p className={`mt-1 font-mono text-sm font-bold tabular-nums ${changeColor(item.change, item.invert)}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-terminal/20 text-left">
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Time</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Price</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">AI</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Risk</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Smart Money</th>
              <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Opportunity</th>
              <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {recent.length > 0 ? (
              recent.map((snapshot) => (
                <tr key={snapshot.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 font-mono text-[11px] tabular-nums text-muted">
                    {new Date(snapshot.analyzedAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-foreground">
                    ${snapshot.priceUsd.toFixed(6)}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(snapshot.aiScore) }}>
                    {snapshot.aiScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(snapshot.riskScore, true) }}>
                    {snapshot.riskScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(snapshot.confidenceScore) }}>
                    {snapshot.confidenceScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(snapshot.smartMoneyScore) }}>
                    {snapshot.smartMoneyScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(snapshot.opportunityScore) }}>
                    {snapshot.opportunityScore}
                  </td>
                  <td className="py-2.5 font-mono text-[11px] uppercase tracking-wide text-terminal">
                    {snapshot.verdict}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-4 font-mono text-xs italic text-muted/60">
                  No saved history for this token
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiAnalystPanel({ analyst }: { analyst: AiAnalystResult }) {
  return (
    <div className="panel-border-accent border bg-panel">
      <div className="border-b border-terminal/20 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
              AI Analyst
            </h3>
            <p className="mt-0.5 font-mono text-[9px] text-muted">
              Provider: {analyst.provider.toUpperCase()} · Multi-source synthesis
            </p>
          </div>
          <div className="text-right">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</p>
            <p
              className="font-mono text-2xl font-bold tabular-nums"
              style={{ color: scoreColor(analyst.confidence) }}
            >
              {analyst.confidence}%
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-terminal">
            Executive Summary
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
            {analyst.executiveSummary}
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="border border-accent/20 border-l-2 border-l-accent bg-accent/[0.04] p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-accent">
              Bull Case
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{analyst.bullCase}</p>
          </div>
          <div className="border border-danger/20 border-l-2 border-l-danger bg-danger/[0.04] p-3">
            <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-danger">
              Bear Case
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">{analyst.bearCase}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel-border bg-background/40 p-3">
            <p className="font-mono text-[9px] uppercase tracking-wider text-accent">
              Biggest Opportunity
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {analyst.biggestOpportunity}
            </p>
          </div>
          <div className="panel-border bg-background/40 p-3">
            <p className="font-mono text-[9px] uppercase tracking-wider text-danger">
              Biggest Threat
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              {analyst.biggestThreat}
            </p>
          </div>
        </div>

        <div className="panel-border bg-background/40 p-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-terminal">
            Trading Plan
          </p>
          <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted">
            {analyst.tradingPlan}
          </p>
        </div>

        <div className="border-t border-white/[0.06] pt-3">
          <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted">
            Analyst Reasoning
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted/90">
            {analyst.reasoning}
          </p>
        </div>
      </div>
    </div>
  );
}

function AiSummaryPanel({ summary }: { summary: string }) {
  return (
    <div className="panel-border-accent border bg-panel p-4">
      <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
        AI Summary
      </h3>
      <p className="text-sm leading-relaxed text-foreground/90">{summary}</p>
    </div>
  );
}

function BiggestRiskCard({ risk }: { risk: BiggestRisk }) {
  const isCritical = risk.severity === "critical";
  return (
    <div
      className={`panel-border border-l-2 bg-panel p-4 ${
        isCritical ? "border-l-danger bg-danger/[0.04]" : "border-l-warning bg-warning/[0.04]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`font-mono text-lg ${isCritical ? "text-danger" : "text-warning"}`}>⚠</span>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Biggest Risk · {risk.factor}
          </p>
          <p className={`mt-1 font-mono text-[10px] uppercase tracking-wider ${isCritical ? "text-danger" : "text-warning"}`}>
            {isCritical ? "Critical" : "High"} Severity
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">{risk.description}</p>
        </div>
      </div>
    </div>
  );
}

function TradeSetupCard({ setup }: { setup: TradeSetup }) {
  const biasColors: Record<TradeSetup["marketBias"], string> = {
    Bullish: "text-accent",
    Neutral: "text-warning",
    Bearish: "text-danger",
  };

  const levels = [
    { label: "Entry Zone", value: setup.suggestedEntryZone, tone: "text-foreground" },
    { label: "Stop Loss", value: setup.suggestedStopLoss, tone: "text-danger" },
    { label: "Take Profit 1", value: setup.takeProfit1, tone: "text-accent" },
    { label: "Take Profit 2", value: setup.takeProfit2, tone: "text-accent" },
    { label: "Runner", value: setup.runner, tone: "text-terminal" },
  ];

  return (
    <div className="panel-border bg-panel p-4">
      <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
        Trade Setup
      </h3>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Market Bias</p>
          <p className={`mt-0.5 font-mono text-sm font-bold uppercase ${biasColors[setup.marketBias]}`}>
            {setup.marketBias}
          </p>
        </div>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-foreground">
            {setup.confidence}%
          </p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => (
          <div key={level.label} className="border border-white/[0.06] bg-background/40 px-3 py-2">
            <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">{level.label}</p>
            <p className={`mt-1 font-mono text-xs font-semibold tabular-nums ${level.tone}`}>
              {level.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AiDecisionChecklist({ items }: { items: AiDecisionItem[] }) {
  const impactIcon = {
    positive: { mark: "✓", color: "text-accent" },
    negative: { mark: "✗", color: "text-danger" },
    neutral: { mark: "–", color: "text-warning" },
  };

  return (
    <div className="panel-border bg-panel p-4">
      <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
        AI Decision
      </h3>
      <ul className="space-y-2.5">
        {items.map((item, i) => {
          const icon = impactIcon[item.impact];
          return (
            <li key={i} className="flex gap-2.5 border-b border-white/[0.04] pb-2.5 last:border-0 last:pb-0">
              <span className={`mt-0.5 font-mono text-xs font-bold ${icon.color}`}>{icon.mark}</span>
              <div>
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{item.explanation}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InsightPanel({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "strength" | "weakness";
}) {
  const isStrength = variant === "strength";
  return (
    <div className={`panel-border bg-panel p-4 ${isStrength ? "border-l-2 border-l-accent" : "border-l-2 border-l-danger"}`}>
      <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">{title}</h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
            <span className={`mt-1 font-mono text-[10px] ${isStrength ? "text-accent" : "text-danger"}`}>
              {isStrength ? "+" : "−"}
            </span>
            {item}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-xs italic text-muted/60">No significant signals detected</li>
        )}
      </ul>
    </div>
  );
}

function RecommendationBanner({
  recommendation,
  aiScore,
  riskScore,
}: {
  recommendation: Recommendation;
  aiScore: number;
  riskScore: number;
}) {
  const styles: Record<Recommendation, { bg: string; border: string; text: string }> = {
    "Strong Buy": { bg: "bg-accent/10", border: "border-accent/40", text: "text-accent" },
    Buy: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
    Hold: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning" },
    Reduce: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400" },
    Avoid: { bg: "bg-danger/10", border: "border-danger/40", text: "text-danger" },
  };
  const s = styles[recommendation];

  return (
    <div className={`panel-border-accent ${s.bg} border p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-terminal">Recommendation</p>
          <p className={`mt-1 font-mono text-2xl font-bold uppercase tracking-wide ${s.text}`}>{recommendation}</p>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-muted">
          {buildRecommendationText(recommendation, aiScore, riskScore)}
        </p>
      </div>
    </div>
  );
}

function MetricTile({ label, value, delta }: { label: string; value: string; delta?: string }) {
  const deltaColor = delta?.startsWith("+") ? "text-accent" : delta?.startsWith("-") ? "text-danger" : "text-muted";
  return (
    <div className="panel-border bg-panel px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
        {delta && <span className={`font-mono text-[10px] tabular-nums ${deltaColor}`}>{delta}</span>}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel-border flex flex-col items-center justify-center bg-panel/50 px-8 py-24 text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-terminal">Awaiting Input</p>
      <h3 className="mt-3 text-lg font-semibold">Enter a contract address to begin analysis</h3>
      <p className="mt-2 max-w-md text-xs text-muted">
        The scoring engine evaluates 8 weighted factors to produce AI Score, Risk Score, and a trade recommendation.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-14" />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <div className="skeleton h-64" />
        <div className="skeleton h-64" />
      </div>
      <div className="skeleton h-32" />
    </div>
  );
}

function ResultsPanel({
  data,
  history,
  historyTrend,
  onClearHistory,
  isWatchlisted,
  onAddToWatchlist,
  onRemoveFromWatchlist,
}: {
  data: AnalysisResult;
  history: HistorySnapshot[];
  historyTrend: HistoryTrend | null;
  onClearHistory: () => void;
  isWatchlisted: boolean;
  onAddToWatchlist: () => void;
  onRemoveFromWatchlist: () => void;
}) {
  const { metrics } = data;
  const momentumStr = `${metrics.momentumPercent >= 0 ? "+" : ""}${metrics.momentumPercent.toFixed(1)}%`;

  return (
    <div className="space-y-3">
      {/* Token header strip */}
      <div className="panel-border-accent flex flex-wrap items-center justify-between gap-3 border bg-panel px-4 py-2.5">
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg font-bold text-accent">{data.symbol}</span>
          <span className="hidden font-mono text-[10px] text-muted sm:inline">
            {data.contractAddress.slice(0, 8)}…{data.contractAddress.slice(-6)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] text-muted">
            ANALYZED {new Date(data.analyzedAt).toLocaleTimeString()}
          </span>
          <button
            type="button"
            onClick={isWatchlisted ? onRemoveFromWatchlist : onAddToWatchlist}
            className={`border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
              isWatchlisted
                ? "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20"
                : "border-terminal/40 bg-terminal/10 text-terminal hover:bg-terminal/20"
            }`}
          >
            {isWatchlisted ? "Remove from Watchlist" : "Add to Watchlist"}
          </button>
        </div>
      </div>

      <VerdictCard verdict={data.verdict} />

      <AlphaPanel alpha={data.alpha} />

      <ConfidencePanel confidence={data.confidence} />

      <SmartMoneyPanel smartMoney={data.smartMoney} />

      <OpportunityPanel opportunity={data.opportunity} />

      <CatalystPanel catalysts={data.catalysts} />

      <HistoryPanel history={history} trend={historyTrend} onClear={onClearHistory} />

      {/* AI Analyst — v0.6 synthesis layer */}
      <AiAnalystPanel analyst={data.aiAnalyst} />

      {/* AI Summary */}
      <AiSummaryPanel summary={data.aiSummary} />

      {/* Biggest Risk */}
      <BiggestRiskCard risk={data.biggestRisk} />

      {/* Quick metrics ticker */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <MetricTile label="Mkt Cap" value={formatUsd(metrics.marketCapUsd)} />
        <MetricTile label="Liquidity" value={formatUsd(metrics.liquidityUsd)} />
        <MetricTile label="Vol 24h" value={formatUsd(metrics.volume24hUsd)} />
        <MetricTile label="Buy/Sell" value={`${metrics.buySellRatio.toFixed(2)}x`} />
        <MetricTile label="Holders" value={metrics.holderCount.toLocaleString()} />
        <MetricTile label="Momentum" value={momentumStr} delta={momentumStr} />
      </div>

      {/* Scores + factor table */}
      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        <div className="panel-border bg-panel p-5">
          <div className="grid grid-cols-2 gap-4">
            <ScoreGauge score={data.aiScore} label="AI Score" sublabel="Opportunity" />
            <ScoreGauge score={data.riskScore} label="Risk Score" sublabel="Danger" invert />
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted">Top 10 Hold</p>
            <p className={`mt-1 font-mono text-lg tabular-nums ${metrics.top10HolderPercent > 50 ? "text-danger" : "text-accent"}`}>
              {metrics.top10HolderPercent.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="panel-border overflow-x-auto bg-panel p-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Scoring Engine — Factor Breakdown
          </h3>
          <table className="w-full min-w-[480px]">
            <thead>
              <tr className="border-b border-terminal/20 text-left">
                <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Factor</th>
                <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Raw</th>
                <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Score</th>
                <th className="pb-2 text-right font-mono text-[9px] uppercase tracking-wider text-muted">Sig</th>
                <th className="pb-2 pl-2 font-mono text-[9px] uppercase tracking-wider text-muted">Wt</th>
              </tr>
            </thead>
            <tbody>
              {data.factorScores.map((f) => (
                <FactorRow key={f.key} factor={f} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Intelligence — below AI Score */}
      <SecurityPanel security={data.security} />

      {/* Trade Setup + AI Decision */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TradeSetupCard setup={data.tradeSetup} />
        <AiDecisionChecklist items={data.aiDecision} />
      </div>

      {/* Recommendation */}
      <RecommendationBanner
        recommendation={data.recommendation}
        aiScore={data.aiScore}
        riskScore={data.riskScore}
      />

      {/* Strengths / Weaknesses */}
      <div className="grid gap-3 lg:grid-cols-2">
        <InsightPanel title="Strengths" items={data.strengths} variant="strength" />
        <InsightPanel title="Weaknesses" items={data.weaknesses} variant="weakness" />
      </div>
    </div>
  );
}

function shortenAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function parseContractAddresses(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\n,;\s]+/)
        .map((value) => value.trim())
        .filter((value) => value.length >= 20),
    ),
  );
}

function verdictTextColor(verdict: string): string {
  if (verdict === "STRONG BUY" || verdict === "BUY") return "text-accent";
  if (verdict === "HOLD") return "text-warning";
  return "text-danger";
}

type MultiSortKey =
  | "alpha"
  | "opportunity"
  | "aiScore"
  | "smartMoney"
  | "confidence"
  | "risk"
  | "newest";

function sortMultiResults(
  results: AnalysisResult[],
  sortKey: MultiSortKey,
): AnalysisResult[] {
  const sorted = [...results];
  switch (sortKey) {
    case "alpha":
      return sorted.sort((a, b) => b.alpha.score - a.alpha.score);
    case "opportunity":
      return sorted.sort((a, b) => b.opportunity.score - a.opportunity.score);
    case "aiScore":
      return sorted.sort((a, b) => b.aiScore - a.aiScore);
    case "smartMoney":
      return sorted.sort((a, b) => b.smartMoney.score - a.smartMoney.score);
    case "confidence":
      return sorted.sort((a, b) => b.confidence.score - a.confidence.score);
    case "risk":
      return sorted.sort((a, b) => a.riskScore - b.riskScore);
    case "newest":
      return sorted.sort(
        (a, b) =>
          new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
      );
  }
}

function MultiTokenResults({
  results,
  errors,
  onOpenAnalysis,
  watchlistAddresses,
  onAddToWatchlist,
}: {
  results: AnalysisResult[];
  errors: { contractAddress: string; error: string }[];
  onOpenAnalysis: (result: AnalysisResult) => void;
  watchlistAddresses: Set<string>;
  onAddToWatchlist: (result: AnalysisResult) => void;
}) {
  const [sortKey, setSortKey] = useState<MultiSortKey>("alpha");
  const sortedResults = sortMultiResults(results, sortKey);
  const topAlpha = sortMultiResults(results, "alpha")[0] ?? null;
  const totalScanned = results.length + errors.length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Tokens Scanned</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">{totalScanned}</p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Successful</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-accent">{results.length}</p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Failed</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-danger">{errors.length}</p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Top Alpha</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-accent">
            {topAlpha
              ? `${topAlpha.symbol} · ${topAlpha.alpha.score} · ${topAlpha.alpha.grade}`
              : "N/A"}
          </p>
        </div>
      </div>

      <div className="panel-border bg-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
            Batch Scan Results
          </h3>
          <div className="flex items-center gap-2">
            <label htmlFor="multi-sort" className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Sort
            </label>
            <select
              id="multi-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as MultiSortKey)}
              className="border border-white/[0.08] bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-terminal outline-none focus:border-terminal/50"
            >
              <option value="alpha">Alpha</option>
              <option value="opportunity">Opportunity</option>
              <option value="aiScore">AI Score</option>
              <option value="smartMoney">Smart Money</option>
              <option value="confidence">Confidence</option>
              <option value="risk">Lowest Risk</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px]">
            <thead>
              <tr className="border-b border-terminal/20 text-left">
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Rank</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Token</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Alpha</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Grade</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Verdict</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">AI Score</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Risk</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Smart Money</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Opportunity</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Stage</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Security</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Analyzed</th>
                <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((item, index) => (
                <tr
                  key={item.contractAddress}
                  className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${
                    index === 0 ? "border-l-2 border-l-accent bg-accent/[0.03]" : ""
                  }`}
                >
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">
                    {index + 1}
                    {index === 0 && (
                      <span className="mt-1 block font-mono text-[8px] font-bold uppercase tracking-wider text-accent">
                        Top Pick
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <p className="font-mono text-xs font-bold text-accent">{item.symbol}</p>
                    <p className="font-mono text-[10px] text-muted">{shortenAddress(item.contractAddress)}</p>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs font-bold tabular-nums" style={{ color: scoreColor(item.alpha.score) }}>
                    {item.alpha.score}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-xs font-bold tabular-nums ${alphaGradeColor(item.alpha.grade)}`}>
                    {item.alpha.grade}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-[11px] font-bold uppercase ${verdictTextColor(item.verdict.verdict)}`}>
                    {item.verdict.verdict}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.aiScore) }}>
                    {item.aiScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.riskScore, true) }}>
                    {item.riskScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.confidence.score) }}>
                    {item.confidence.score}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.smartMoney.score) }}>
                    {item.smartMoney.score}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.opportunity.score) }}>
                    {item.opportunity.score}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-terminal">
                    {item.opportunity.stage}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.security.securityScore) }}>
                    {item.security.securityScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] tabular-nums text-muted">
                    {new Date(item.analyzedAt).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onAddToWatchlist(item)}
                        disabled={watchlistAddresses.has(item.contractAddress)}
                        className="border border-white/10 bg-background/40 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-terminal/40 hover:text-terminal disabled:opacity-60"
                      >
                        {watchlistAddresses.has(item.contractAddress) ? "Saved" : "Add"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenAnalysis(item)}
                        className="border border-terminal/40 bg-terminal/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20"
                      >
                        Open Analysis
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="panel-border border-l-2 border-l-danger bg-danger/[0.04] p-4">
          <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-danger">
            Failed Tokens
          </h3>
          <ul className="space-y-2">
            {errors.map((item) => (
              <li key={item.contractAddress} className="border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                <p className="font-mono text-xs text-danger">{shortenAddress(item.contractAddress)}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted">{item.error}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type WatchlistSortKey =
  | "alpha"
  | "risk"
  | "confidence"
  | "smartMoney"
  | "opportunity"
  | "newest";

function sortWatchlistItems(
  items: WatchlistItem[],
  sortKey: WatchlistSortKey,
): WatchlistItem[] {
  const sorted = [...items];
  switch (sortKey) {
    case "alpha":
      return sorted.sort((a, b) => b.alphaScore - a.alphaScore);
    case "risk":
      return sorted.sort((a, b) => a.riskScore - b.riskScore);
    case "confidence":
      return sorted.sort((a, b) => b.confidenceScore - a.confidenceScore);
    case "smartMoney":
      return sorted.sort((a, b) => b.smartMoneyScore - a.smartMoneyScore);
    case "opportunity":
      return sorted.sort((a, b) => b.opportunityScore - a.opportunityScore);
    case "newest":
      return sorted.sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(),
      );
  }
}

function WatchlistPanel({
  items,
  loadingAddress,
  refreshingAll,
  refreshProgress,
  onOpen,
  onRefresh,
  onRemove,
  onRefreshAll,
}: {
  items: WatchlistItem[];
  loadingAddress: string | null;
  refreshingAll: boolean;
  refreshProgress: { completed: number; total: number };
  onOpen: (item: WatchlistItem) => void;
  onRefresh: (contractAddress: string) => void;
  onRemove: (contractAddress: string) => void;
  onRefreshAll: () => void;
}) {
  const [sortKey, setSortKey] = useState<WatchlistSortKey>("alpha");
  const sortedItems = sortWatchlistItems(items, sortKey);
  const topAlpha = sortWatchlistItems(items, "alpha")[0] ?? null;
  const lowestRisk = sortWatchlistItems(items, "risk")[0] ?? null;
  const newestAdded = sortWatchlistItems(items, "newest")[0] ?? null;

  if (items.length === 0) {
    return (
      <div className="panel-border flex flex-col items-center justify-center bg-panel/50 px-8 py-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-terminal">Watchlist Engine</p>
        <p className="mt-3 text-sm text-muted">
          No saved tokens yet. Add tokens from Single Token or Multi Token results.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Saved Tokens</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums">{items.length}</p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Top Alpha</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-accent">
            {topAlpha
              ? `${topAlpha.symbol} · ${topAlpha.alphaScore} · ${topAlpha.alphaGrade}`
              : "N/A"}
          </p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Lowest Risk</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-accent">
            {lowestRisk
              ? `${lowestRisk.symbol} · ${lowestRisk.riskScore}`
              : "N/A"}
          </p>
        </div>
        <div className="panel-border bg-panel px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Newest Added</p>
          <p className="mt-1 font-mono text-sm font-bold tabular-nums text-foreground">
            {newestAdded ? newestAdded.symbol : "N/A"}
          </p>
        </div>
      </div>

      <div className="panel-border bg-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
              Watchlist Engine
            </h3>
            <p className="mt-1 font-mono text-[9px] text-warning/80">
              Watchlist values update only when manually refreshed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="watchlist-sort" className="font-mono text-[9px] uppercase tracking-wider text-muted">
              Sort
            </label>
            <select
              id="watchlist-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as WatchlistSortKey)}
              className="border border-white/[0.08] bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-terminal outline-none focus:border-terminal/50"
            >
              <option value="alpha">Alpha</option>
              <option value="risk">Lowest Risk</option>
              <option value="confidence">Confidence</option>
              <option value="smartMoney">Smart Money</option>
              <option value="opportunity">Opportunity</option>
              <option value="newest">Newest</option>
            </select>
            <button
              type="button"
              onClick={onRefreshAll}
              disabled={refreshingAll || loadingAddress !== null}
              className="border border-terminal/40 bg-terminal/10 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20 disabled:opacity-50"
            >
              Refresh All
            </button>
          </div>
        </div>

        {refreshingAll && (
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">
                Refreshing {refreshProgress.completed} / {refreshProgress.total}
              </p>
            </div>
            <div className="h-2 w-full bg-white/[0.06]">
              <div
                className="h-full bg-terminal transition-all duration-300"
                style={{
                  width:
                    refreshProgress.total > 0
                      ? `${(refreshProgress.completed / refreshProgress.total) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-terminal/20 text-left">
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Token</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Alpha</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Grade</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Verdict</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">AI</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Risk</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Smart Money</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Opportunity</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Security</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Stage</th>
                <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Last Analyzed</th>
                <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => (
                <tr key={item.contractAddress} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3">
                    <p className="font-mono text-xs font-bold text-accent">{item.symbol}</p>
                    <p className="font-mono text-[10px] text-muted">{shortenAddress(item.contractAddress)}</p>
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs font-bold tabular-nums" style={{ color: scoreColor(item.alphaScore) }}>
                    {item.alphaScore}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-xs font-bold tabular-nums ${alphaGradeColor(item.alphaGrade as AnalysisResult["alpha"]["grade"])}`}>
                    {item.alphaGrade}
                  </td>
                  <td className={`py-2.5 pr-3 font-mono text-[11px] font-bold uppercase ${verdictTextColor(item.verdict)}`}>
                    {item.verdict}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.aiScore) }}>
                    {item.aiScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.riskScore, true) }}>
                    {item.riskScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.confidenceScore) }}>
                    {item.confidenceScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.smartMoneyScore) }}>
                    {item.smartMoneyScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.opportunityScore) }}>
                    {item.opportunityScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.securityScore) }}>
                    {item.securityScore}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-terminal">
                    {item.stage}
                  </td>
                  <td className="py-2.5 pr-3 font-mono text-[10px] tabular-nums text-muted">
                    {new Date(item.lastAnalyzedAt).toLocaleString()}
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpen(item)}
                        className="border border-terminal/40 bg-terminal/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => onRefresh(item.contractAddress)}
                        disabled={loadingAddress === item.contractAddress || refreshingAll}
                        className="border border-white/10 bg-background/40 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-terminal/40 hover:text-terminal disabled:opacity-50"
                      >
                        {loadingAddress === item.contractAddress ? "Refreshing..." : "Refresh"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(item.contractAddress)}
                        className="border border-danger/30 bg-danger/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-danger transition-colors hover:bg-danger/20"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function formatRadarSource(sources: RadarSource[]): string {
  const hasLatest = sources.includes("LATEST_PROFILE");
  const hasBoost = sources.includes("TOP_BOOST");
  if (hasLatest && hasBoost) return "LATEST + BOOST";
  if (hasBoost) return "BOOST";
  if (hasLatest) return "LATEST";
  return "N/A";
}

function RadarPanel({
  radarResult,
  radarLoading,
  radarError,
  onScan,
  watchlistAddresses,
  onOpenAnalysis,
  onAddToWatchlist,
}: {
  radarResult: RadarScanResult | null;
  radarLoading: boolean;
  radarError: string;
  onScan: () => void;
  watchlistAddresses: Set<string>;
  onOpenAnalysis: (result: AnalysisResult) => void;
  onAddToWatchlist: (result: AnalysisResult) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const candidateMap = new Map(
    radarResult?.shortlistedCandidates.map((candidate) => [
      candidate.contractAddress,
      candidate,
    ]) ?? [],
  );
  const topAlpha = radarResult?.analyzed[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="panel-border border-l-2 border-l-terminal bg-panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
              Alpha Radar
            </h3>
            <p className="mt-1 font-mono text-[9px] text-muted">
              Manual discovery scan using recent and boosted Solana token data.
            </p>
          </div>
          <button
            type="button"
            onClick={onScan}
            disabled={radarLoading}
            className="border border-terminal/60 bg-terminal/10 px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20 disabled:opacity-50"
          >
            {radarLoading ? "Scanning Radar..." : "Scan Radar"}
          </button>
        </div>

        <p className="font-mono text-[10px] leading-relaxed text-muted">
          This scan can take time because shortlisted tokens receive a full analysis.
        </p>

        {radarError && (
          <p className="mt-3 font-mono text-xs text-danger">{radarError}</p>
        )}

        <p className="mt-3 border-t border-white/[0.06] pt-3 font-mono text-[10px] leading-relaxed text-warning/80">
          Radar results are model-based screening indicators. Boosts and recent profiles are discovery inputs, not proof of token quality.
        </p>
      </div>

      {radarResult && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Discovered</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{radarResult.discoveredCount}</p>
            </div>
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Passed Prefilter</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums">{radarResult.prefilteredCount}</p>
            </div>
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Fully Analyzed</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-accent">{radarResult.analyzed.length}</p>
            </div>
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Failed</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-danger">{radarResult.failed.length}</p>
            </div>
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Top Alpha</p>
              <p className="mt-1 font-mono text-sm font-bold tabular-nums text-accent">
                {topAlpha
                  ? `${topAlpha.symbol} · ${topAlpha.alpha.score} · ${topAlpha.alpha.grade}`
                  : "N/A"}
              </p>
            </div>
            <div className="panel-border bg-panel px-3 py-2.5">
              <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">Last Scan</p>
              <p className="mt-1 font-mono text-[10px] tabular-nums text-muted">
                {new Date(radarResult.scannedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="panel-border bg-panel p-4">
            <h3 className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal">
              Radar Leaders
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-terminal/20 text-left">
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Rank</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Token</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Alpha</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Grade</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Verdict</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Prefilter</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">AI</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Risk</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Confidence</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Smart Money</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Opportunity</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Security</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Stage</th>
                    <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Source</th>
                    <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {radarResult.analyzed.map((item, index) => {
                    const candidate = candidateMap.get(item.contractAddress);
                    return (
                      <tr
                        key={item.contractAddress}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.02] ${
                          index === 0 ? "border-l-2 border-l-accent bg-accent/[0.03]" : ""
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">
                          {index + 1}
                          {index === 0 && (
                            <span className="mt-1 block font-mono text-[8px] font-bold uppercase tracking-wider text-accent">
                              Radar Leader
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <p className="font-mono text-xs font-bold text-accent">{item.symbol}</p>
                          <p className="font-mono text-[10px] text-muted">{shortenAddress(item.contractAddress)}</p>
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs font-bold tabular-nums" style={{ color: scoreColor(item.alpha.score) }}>
                          {item.alpha.score}
                        </td>
                        <td className={`py-2.5 pr-3 font-mono text-xs font-bold tabular-nums ${alphaGradeColor(item.alpha.grade)}`}>
                          {item.alpha.grade}
                        </td>
                        <td className={`py-2.5 pr-3 font-mono text-[11px] font-bold uppercase ${verdictTextColor(item.verdict.verdict)}`}>
                          {item.verdict.verdict}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(candidate?.prefilterScore ?? 0) }}>
                          {candidate?.prefilterScore ?? "N/A"}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.aiScore) }}>
                          {item.aiScore}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.riskScore, true) }}>
                          {item.riskScore}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.confidence.score) }}>
                          {item.confidence.score}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.smartMoney.score) }}>
                          {item.smartMoney.score}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.opportunity.score) }}>
                          {item.opportunity.score}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(item.security.securityScore) }}>
                          {item.security.securityScore}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-terminal">
                          {item.opportunity.stage}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-terminal">
                          {candidate ? formatRadarSource(candidate.source) : "N/A"}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenAnalysis(item)}
                              className="border border-terminal/40 bg-terminal/10 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20"
                            >
                              Open Analysis
                            </button>
                            <button
                              type="button"
                              onClick={() => onAddToWatchlist(item)}
                              disabled={watchlistAddresses.has(item.contractAddress)}
                              className="border border-white/10 bg-background/40 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-muted transition-colors hover:border-terminal/40 hover:text-terminal disabled:opacity-60"
                            >
                              {watchlistAddresses.has(item.contractAddress) ? "Saved" : "Add to Watchlist"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel-border bg-panel p-4">
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-terminal"
            >
              Discovery Filter Details {detailsOpen ? "[-]" : "[+]"}
            </button>

            {detailsOpen && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-terminal/20 text-left">
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Token</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Prefilter</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Liquidity</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Volume</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Market Cap</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Momentum</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Buy/Sell</th>
                      <th className="pb-2 pr-3 font-mono text-[9px] uppercase tracking-wider text-muted">Source</th>
                      <th className="pb-2 font-mono text-[9px] uppercase tracking-wider text-muted">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radarResult.shortlistedCandidates.map((candidate) => (
                      <RadarCandidateDetailsRow key={candidate.contractAddress} candidate={candidate} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {radarResult.failed.length > 0 && (
            <div className="panel-border border-l-2 border-l-danger bg-danger/[0.04] p-4">
              <h3 className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-danger">
                Failed Full Analyses
              </h3>
              <ul className="space-y-2">
                {radarResult.failed.map((item) => (
                  <li key={item.contractAddress} className="border-b border-white/[0.04] pb-2 last:border-0 last:pb-0">
                    <p className="font-mono text-xs text-danger">{shortenAddress(item.contractAddress)}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted">{item.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RadarCandidateDetailsRow({ candidate }: { candidate: RadarCandidate }) {
  return (
    <tr className="border-b border-white/[0.04] align-top hover:bg-white/[0.02]">
      <td className="py-2.5 pr-3">
        <p className="font-mono text-xs font-bold text-accent">{candidate.symbol}</p>
        <p className="font-mono text-[10px] text-muted">{shortenAddress(candidate.contractAddress)}</p>
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums" style={{ color: scoreColor(candidate.prefilterScore) }}>
        {candidate.prefilterScore}
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{formatUsd(candidate.liquidityUsd)}</td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{formatUsd(candidate.volume24hUsd)}</td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">{formatUsd(candidate.marketCapUsd)}</td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">
        {candidate.momentum24hPercent >= 0 ? "+" : ""}
        {candidate.momentum24hPercent.toFixed(1)}%
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted">
        {candidate.buySellRatio.toFixed(2)}x
      </td>
      <td className="py-2.5 pr-3 font-mono text-[10px] uppercase tracking-wide text-terminal">
        {formatRadarSource(candidate.source)}
      </td>
      <td className="py-2.5 font-mono text-[11px] leading-relaxed text-muted">
        {candidate.prefilterReasons.join(" · ")}
      </td>
    </tr>
  );
}

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Dashboard() {
  type ScannerMode = "single" | "multi" | "watchlist" | "radar";

  const [scannerMode, setScannerMode] = useState<ScannerMode>("single");
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [historyTrend, setHistoryTrend] = useState<HistoryTrend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [multiInput, setMultiInput] = useState("");
  const [multiResults, setMultiResults] = useState<AnalysisResult[]>([]);
  const [multiErrors, setMultiErrors] = useState<
    { contractAddress: string; error: string }[]
  >([]);
  const [multiLoading, setMultiLoading] = useState(false);
  const [multiProgress, setMultiProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [multiInputError, setMultiInputError] = useState("");
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [watchlistLoadingAddress, setWatchlistLoadingAddress] = useState<string | null>(null);
  const [watchlistRefreshingAll, setWatchlistRefreshingAll] = useState(false);
  const [watchlistProgress, setWatchlistProgress] = useState({
    completed: 0,
    total: 0,
  });
  const [radarResult, setRadarResult] = useState<RadarScanResult | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState("");

  useEffect(() => {
    setWatchlist(loadWatchlist());
  }, []);

  const watchlistAddresses = new Set(
    watchlist.map((item) => item.contractAddress),
  );

  const handleClearHistory = useCallback(() => {
    if (!result) return;
    clearTokenHistory(result.contractAddress);
    setHistory([]);
    setHistoryTrend(null);
  }, [result]);

  const handleOpenAnalysis = useCallback((data: AnalysisResult) => {
    setResult(data);
    setAddress(data.contractAddress);
    setScannerMode("single");
    const tokenHistory = getTokenHistory(data.contractAddress);
    setHistory(tokenHistory);
    setHistoryTrend(calculateHistoryTrend(tokenHistory));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleAddToWatchlist = useCallback((analysis: AnalysisResult) => {
    const item = createWatchlistItem(analysis);
    const updated = saveWatchlistItem(item);
    setWatchlist(updated);
  }, []);

  const handleRemoveFromWatchlist = useCallback((contractAddress: string) => {
    const updated = removeWatchlistItem(contractAddress);
    setWatchlist(updated);
  }, []);

  const handleOpenWatchlistItem = useCallback((item: WatchlistItem) => {
    setAddress(item.contractAddress);
    setScannerMode("single");
    setResult(null);
    setHistory([]);
    setHistoryTrend(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleRefreshWatchlistItem = useCallback(async (contractAddress: string) => {
    setWatchlistLoadingAddress(contractAddress);
    setError("");

    try {
      const response = await analyzeTokenAction(contractAddress);
      if (!response.ok) {
        setError(response.error);
        return;
      }

      const updated = updateWatchlistItem(response.data);
      setWatchlist(updated);
    } catch {
      setError("Analysis failed. Please try again.");
    } finally {
      setWatchlistLoadingAddress(null);
    }
  }, []);

  const handleRefreshAllWatchlist = useCallback(async () => {
    const targets = watchlist.slice(0, 20);
    if (targets.length === 0) return;

    setWatchlistRefreshingAll(true);
    setWatchlistProgress({ completed: 0, total: targets.length });
    setError("");

    try {
      for (let i = 0; i < targets.length; i++) {
        const contractAddress = targets[i].contractAddress;
        setWatchlistLoadingAddress(contractAddress);

        const response = await analyzeTokenAction(contractAddress);
        if (response.ok) {
          const updated = updateWatchlistItem(response.data);
          setWatchlist(updated);
        } else {
          setError(response.error);
        }

        setWatchlistProgress({ completed: i + 1, total: targets.length });
      }
    } finally {
      setWatchlistLoadingAddress(null);
      setWatchlistRefreshingAll(false);
    }
  }, [watchlist]);

  const handleRadarScan = useCallback(async () => {
    setRadarError("");
    setRadarLoading(true);

    try {
      const response = await scanRadarAction();
      if (!response.ok) {
        setRadarError(response.error);
        return;
      }

      setRadarResult(response.data);
    } catch {
      setRadarError("Radar scan failed. Please try again.");
    } finally {
      setRadarLoading(false);
    }
  }, []);

  const handleMultiAnalyze = useCallback(async () => {
    const addresses = parseContractAddresses(multiInput);

    if (addresses.length === 0) {
      setMultiInputError("Enter at least one valid contract address.");
      return;
    }

    if (addresses.length > 20) {
      setMultiInputError("Maximum 20 tokens per scan.");
      return;
    }

    setMultiInputError("");
    setMultiResults([]);
    setMultiErrors([]);
    setMultiLoading(true);
    setMultiProgress({ completed: 0, total: addresses.length });

    const results: AnalysisResult[] = [];
    const errors: { contractAddress: string; error: string }[] = [];

    try {
      for (let i = 0; i < addresses.length; i++) {
        const contractAddress = addresses[i];
        const response = await analyzeTokenAction(contractAddress);

        if (response.ok) {
          results.push(response.data);
        } else {
          errors.push({ contractAddress, error: response.error });
        }

        setMultiProgress({ completed: i + 1, total: addresses.length });
        setMultiResults([...results]);
        setMultiErrors([...errors]);
      }
    } finally {
      setMultiLoading(false);
    }
  }, [multiInput]);

  const handleAnalyze = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) { setError("Enter a contract address."); return; }
    if (trimmed.length < 20) { setError("Address too short."); return; }

    setError("");
    setLoading(true);
    setResult(null);
    setHistory([]);
    setHistoryTrend(null);

    try {
      const response = await analyzeTokenAction(trimmed);
      if (!response.ok) {
        setError(response.error);
        return;
      }

      const snapshot = createHistorySnapshot(response.data);
      saveHistorySnapshot(snapshot);
      const tokenHistory = getTokenHistory(response.data.contractAddress);
      setHistory(tokenHistory);
      setHistoryTrend(calculateHistoryTrend(tokenHistory));
      setResult(response.data);
    } catch {
      setError("Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [address]);

  return (
    <div className="relative min-h-screen terminal-grid">
      {/* Terminal top bar */}
      <div className="border-b border-terminal/30 bg-[#080a0e]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 bg-accent animate-pulse" />
              <span className="font-mono text-xs font-bold tracking-widest text-terminal">FOMO COPILOT</span>
            </div>
            <span className="hidden font-mono text-[10px] text-muted sm:inline">{APP_VERSION_LABEL}</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] text-muted">
            <span className="hidden sm:inline">8 FACTORS · 0–100 SCALE</span>
            <span className="text-accent">● LIVE</span>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Title block */}
        <header className="mb-6">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Token Intelligence Terminal
          </h1>
          <p className="mt-1 text-xs text-muted">
            Bloomberg-grade analytics · Fomo-speed execution · Not financial advice
          </p>
        </header>

        {/* Input panel */}
        <div className="panel-border-accent mb-6 border bg-panel p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScannerMode("single")}
              className={`border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                scannerMode === "single"
                  ? "border-terminal/60 bg-terminal/10 text-terminal"
                  : "border-white/10 bg-background/40 text-muted hover:text-foreground"
              }`}
            >
              Single Token
            </button>
            <button
              type="button"
              onClick={() => setScannerMode("multi")}
              className={`border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                scannerMode === "multi"
                  ? "border-terminal/60 bg-terminal/10 text-terminal"
                  : "border-white/10 bg-background/40 text-muted hover:text-foreground"
              }`}
            >
              Multi Token
            </button>
            <button
              type="button"
              onClick={() => setScannerMode("watchlist")}
              className={`border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                scannerMode === "watchlist"
                  ? "border-terminal/60 bg-terminal/10 text-terminal"
                  : "border-white/10 bg-background/40 text-muted hover:text-foreground"
              }`}
            >
              Watchlist ({watchlist.length})
            </button>
            <button
              type="button"
              onClick={() => setScannerMode("radar")}
              className={`border px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-wider transition-colors ${
                scannerMode === "radar"
                  ? "border-terminal/60 bg-terminal/10 text-terminal"
                  : "border-white/10 bg-background/40 text-muted hover:text-foreground"
              }`}
            >
              Alpha Radar
            </button>
          </div>

          {scannerMode === "single" ? (
            <>
              <label htmlFor="contract" className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-terminal">
                Contract Address
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  id="contract"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="0x… / Solana mint"
                  className="flex-1 border border-white/[0.08] bg-background px-3 py-2.5 font-mono text-sm outline-none placeholder:text-muted/40 focus:border-terminal/50 focus:ring-1 focus:ring-terminal/30"
                />
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="border border-terminal/60 bg-terminal/10 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20 disabled:opacity-50 sm:min-w-[140px]"
                >
                  {loading ? "Scanning…" : "Analyze"}
                </button>
              </div>
              {error && <p className="mt-2 font-mono text-xs text-danger">{error}</p>}
            </>
          ) : scannerMode === "multi" ? (
            <>
              <label htmlFor="multi-contracts" className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-terminal">
                Contract Addresses
              </label>
              <div className="mt-2 flex flex-col gap-2">
                <textarea
                  id="multi-contracts"
                  value={multiInput}
                  onChange={(e) => setMultiInput(e.target.value)}
                  placeholder="Paste one Solana contract address per line"
                  className="min-h-[160px] flex-1 resize-y border border-white/[0.08] bg-background px-3 py-2.5 font-mono text-sm outline-none placeholder:text-muted/40 focus:border-terminal/50 focus:ring-1 focus:ring-terminal/30"
                />
                <button
                  type="button"
                  onClick={handleMultiAnalyze}
                  disabled={multiLoading}
                  className="border border-terminal/60 bg-terminal/10 px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-terminal transition-colors hover:bg-terminal/20 disabled:opacity-50 sm:self-start sm:min-w-[140px]"
                >
                  {multiLoading ? "Scanning…" : "Scan Batch"}
                </button>
              </div>
              {multiInputError && (
                <p className="mt-2 font-mono text-xs text-danger">{multiInputError}</p>
              )}
              {multiLoading && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-terminal">
                      Scanning {multiProgress.completed} / {multiProgress.total}
                    </p>
                    <span className="font-mono text-[10px] tabular-nums text-muted">
                      {multiProgress.total > 0
                        ? Math.round((multiProgress.completed / multiProgress.total) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="h-2 w-full bg-white/[0.06]">
                    <div
                      className="h-full bg-terminal transition-all duration-300"
                      style={{
                        width:
                          multiProgress.total > 0
                            ? `${(multiProgress.completed / multiProgress.total) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : null}

          {error && scannerMode !== "single" && (
            <p className="mt-2 font-mono text-xs text-danger">{error}</p>
          )}
        </div>

        {scannerMode === "single" && loading && <LoadingState />}
        {scannerMode === "single" && !loading && result && (
          <ResultsPanel
            data={result}
            history={history}
            historyTrend={historyTrend}
            onClearHistory={handleClearHistory}
            isWatchlisted={watchlistAddresses.has(result.contractAddress)}
            onAddToWatchlist={() => handleAddToWatchlist(result)}
            onRemoveFromWatchlist={() => handleRemoveFromWatchlist(result.contractAddress)}
          />
        )}
        {scannerMode === "single" && !loading && !result && <EmptyState />}

        {scannerMode === "multi" && !multiLoading && (multiResults.length > 0 || multiErrors.length > 0) && (
          <MultiTokenResults
            results={multiResults}
            errors={multiErrors}
            onOpenAnalysis={handleOpenAnalysis}
            watchlistAddresses={watchlistAddresses}
            onAddToWatchlist={handleAddToWatchlist}
          />
        )}

        {scannerMode === "watchlist" && (
          <WatchlistPanel
            items={watchlist}
            loadingAddress={watchlistLoadingAddress}
            refreshingAll={watchlistRefreshingAll}
            refreshProgress={watchlistProgress}
            onOpen={handleOpenWatchlistItem}
            onRefresh={handleRefreshWatchlistItem}
            onRemove={handleRemoveFromWatchlist}
            onRefreshAll={handleRefreshAllWatchlist}
          />
        )}

        {scannerMode === "radar" && (
          <RadarPanel
            radarResult={radarResult}
            radarLoading={radarLoading}
            radarError={radarError}
            onScan={handleRadarScan}
            watchlistAddresses={watchlistAddresses}
            onOpenAnalysis={handleOpenAnalysis}
            onAddToWatchlist={handleAddToWatchlist}
          />
        )}

        <footer className="mt-8 border-t border-white/[0.04] pt-4 text-center font-mono text-[10px] text-muted">
          {APP_VERSION_LABEL}
        </footer>
      </div>
    </div>
  );
}
