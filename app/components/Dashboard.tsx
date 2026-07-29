"use client";

import { useCallback, useState } from "react";
import { analyzeTokenAction } from "../actions/analyzeTokenAction";
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

function ResultsPanel({ data }: { data: AnalysisResult }) {
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
        <span className="font-mono text-[10px] text-muted">
          ANALYZED {new Date(data.analyzedAt).toLocaleTimeString()}
        </span>
      </div>

      <VerdictCard verdict={data.verdict} />

      <ConfidencePanel confidence={data.confidence} />

      <SmartMoneyPanel smartMoney={data.smartMoney} />

      <OpportunityPanel opportunity={data.opportunity} />

      <CatalystPanel catalysts={data.catalysts} />

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

function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function Dashboard() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAnalyze = useCallback(async () => {
    const trimmed = address.trim();
    if (!trimmed) { setError("Enter a contract address."); return; }
    if (trimmed.length < 20) { setError("Address too short."); return; }

    setError("");
    setLoading(true);
    setResult(null);

    try {
      const response = await analyzeTokenAction(trimmed);
      if (!response.ok) {
        setError(response.error);
        return;
      }
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
            <span className="hidden font-mono text-[10px] text-muted sm:inline">v0.6 · AI ANALYST</span>
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
        </div>

        {loading && <LoadingState />}
        {!loading && result && <ResultsPanel data={result} />}
        {!loading && !result && <EmptyState />}

        <footer className="mt-8 border-t border-white/[0.04] pt-4 text-center font-mono text-[10px] text-muted">
          FOMO COPILOT v0.6 · AI Analyst · RugCheck + GoPlus + DexScreener
        </footer>
      </div>
    </div>
  );
}
