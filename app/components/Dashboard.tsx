"use client";

import { useState } from "react";
import { analyzeContract, type AnalysisResult } from "../lib/mockAnalysis";

function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "#00e676" : score >= 45 ? "#ffb020" : "#ff4757";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="10"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="text-4xl font-bold tabular-nums tracking-tight"
          style={{ color }}
        >
          {score}
        </span>
        <span className="text-xs text-muted uppercase tracking-widest mt-0.5">
          AI Score
        </span>
      </div>
    </div>
  );
}

function RatingBadge({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "buy" | "risk";
}) {
  const buyColors: Record<string, string> = {
    "Strong Buy": "bg-accent/15 text-accent border-accent/30",
    Buy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Hold: "bg-warning/15 text-warning border-warning/30",
    Avoid: "bg-danger/15 text-danger border-danger/30",
  };

  const riskColors: Record<string, string> = {
    Low: "bg-accent/15 text-accent border-accent/30",
    Medium: "bg-warning/15 text-warning border-warning/30",
    High: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    Extreme: "bg-danger/15 text-danger border-danger/30",
  };

  const colors = variant === "buy" ? buyColors : riskColors;
  const colorClass = colors[value] ?? "bg-white/5 text-muted border-white/10";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted uppercase tracking-wider">
        {label}
      </span>
      <span
        className={`inline-flex w-fit items-center rounded-lg border px-3 py-1.5 text-sm font-semibold ${colorClass}`}
      >
        {value}
      </span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: "up" | "down" | "neutral";
}) {
  const trendIcon =
    trend === "up" ? "↑" : trend === "down" ? "↓" : null;
  const trendColor =
    trend === "up"
      ? "text-accent"
      : trend === "down"
        ? "text-danger"
        : "text-muted";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card/80 p-4 backdrop-blur-sm transition-colors hover:border-white/10">
      <p className="text-xs font-medium text-muted uppercase tracking-wider">
        {label}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <p className="text-xl font-semibold tabular-nums tracking-tight">
          {value}
        </p>
        {trendIcon && (
          <span className={`text-sm font-bold ${trendColor}`}>{trendIcon}</span>
        )}
      </div>
    </div>
  );
}

function SentimentBadge({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const isPositive =
    value === "Bullish" ||
    value === "Low" ||
    value === "Strong Up" ||
    value === "Up";
  const isNegative =
    value === "Bearish" ||
    value === "High" ||
    value === "Down" ||
    value === "Extreme";

  const colorClass = isPositive
    ? "text-accent"
    : isNegative
      ? "text-danger"
      : "text-warning";

  return (
    <div className="rounded-xl border border-white/[0.06] bg-card/80 p-4 backdrop-blur-sm">
      <p className="text-xs font-medium text-muted uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

function ReasonList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "buy" | "avoid";
}) {
  const isBuy = variant === "buy";

  return (
    <div
      className={`rounded-2xl border p-5 backdrop-blur-sm ${
        isBuy
          ? "border-accent/20 bg-accent/[0.04]"
          : "border-danger/20 bg-danger/[0.04]"
      }`}
    >
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold ${
            isBuy ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"
          }`}
        >
          {isBuy ? "✓" : "!"}
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-wider">
          {title}
        </h3>
      </div>
      <ul className="space-y-3">
        {items.map((reason, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-muted">
            <span
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                isBuy ? "bg-accent" : "bg-danger"
              }`}
            />
            {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TradeSuggestion({
  label,
  value,
  type,
}: {
  label: string;
  value: string;
  type: "entry" | "stop" | "profit";
}) {
  const styles = {
    entry: "border-white/10 bg-white/[0.03]",
    stop: "border-danger/25 bg-danger/[0.06]",
    profit: "border-accent/25 bg-accent/[0.06]",
  };
  const labelColors = {
    entry: "text-muted",
    stop: "text-danger",
    profit: "text-accent",
  };

  return (
    <div className={`rounded-xl border p-4 ${styles[type]}`}>
      <p
        className={`text-xs font-medium uppercase tracking-wider ${labelColors[type]}`}
      >
        {label}
      </p>
      <p className="mt-2 font-mono text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-card/40 px-8 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-2xl">
        ◈
      </div>
      <h3 className="text-lg font-semibold">Ready to analyze</h3>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Paste a token contract address above and hit Analyze to get AI-powered
        insights, risk ratings, and trade suggestions.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
      </div>
    </div>
  );
}

function ResultsPanel({ data }: { data: AnalysisResult }) {
  return (
    <div className="space-y-6 opacity-100 transition-opacity duration-500">
      {/* Score + Ratings */}
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-card/80 p-6 backdrop-blur-sm lg:items-start">
          <ScoreRing score={data.aiScore} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/[0.06] bg-card/80 p-5 backdrop-blur-sm">
            <RatingBadge label="Buy Rating" value={data.buyRating} variant="buy" />
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-card/80 p-5 backdrop-blur-sm">
            <RatingBadge
              label="Risk Rating"
              value={data.riskRating}
              variant="risk"
            />
          </div>
          <div className="sm:col-span-2 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-accent/[0.06] to-transparent p-4 backdrop-blur-sm">
            <p className="text-xs text-muted">
              Analysis powered by on-chain data, holder patterns, liquidity
              depth, and smart money flows.
            </p>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Market Cap" value={data.marketCap} trend="up" />
        <MetricCard label="Liquidity" value={data.liquidity} />
        <MetricCard label="Holders" value={data.holders} trend="up" />
        <MetricCard label="Volume (24h)" value={data.volume24h} trend="up" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SentimentBadge label="Smart Money" value={data.smartMoney} />
        <SentimentBadge
          label="Holder Concentration"
          value={data.holderConcentration}
        />
        <SentimentBadge label="Momentum" value={data.momentum} />
      </div>

      {/* Reasons */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ReasonList
          title="Reasons to Buy"
          items={data.reasonsToBuy}
          variant="buy"
        />
        <ReasonList
          title="Reasons to Avoid"
          items={data.reasonsToAvoid}
          variant="avoid"
        />
      </div>

      {/* Trade suggestions */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          Suggested Levels
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <TradeSuggestion
            label="Suggested Entry"
            value={data.suggestedEntry}
            type="entry"
          />
          <TradeSuggestion
            label="Suggested Stop Loss"
            value={data.suggestedStopLoss}
            type="stop"
          />
          <TradeSuggestion
            label="Suggested Take Profit"
            value={data.suggestedTakeProfit}
            type="profit"
          />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleAnalyze() {
    const trimmed = address.trim();
    if (!trimmed) {
      setError("Please enter a contract address.");
      return;
    }
    if (trimmed.length < 20) {
      setError("Contract address looks too short.");
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);

    setTimeout(() => {
      setResult(analyzeContract(trimmed));
      setLoading(false);
    }, 1200);
  }

  return (
    <div className="relative min-h-screen grid-bg">
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden
      >
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-emerald-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent shadow-[0_0_24px_rgba(0,230,118,0.15)]">
              <span className="text-lg font-bold">F</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Fomo Copilot
              </h1>
              <p className="text-sm text-muted">
                AI-powered token analysis · DYOR always
              </p>
            </div>
          </div>
        </header>

        {/* Search */}
        <div className="mb-8 rounded-2xl border border-white/[0.08] bg-card/60 p-4 backdrop-blur-md sm:p-5">
          <label
            htmlFor="contract-address"
            className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted"
          >
            Contract Address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="contract-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="0x... or Solana mint address"
              className="flex-1 rounded-xl border border-white/[0.08] bg-background/80 px-4 py-3 font-mono text-sm outline-none transition-colors placeholder:text-muted/50 focus:border-accent/40 focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-black transition-all hover:bg-emerald-400 hover:shadow-[0_0_24px_rgba(0,230,118,0.35)] disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[140px]"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                  Analyzing…
                </>
              ) : (
                <>
                  <span aria-hidden>⚡</span>
                  Analyze
                </>
              )}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Results */}
        {loading && <LoadingSkeleton />}
        {!loading && result && <ResultsPanel data={result} />}
        {!loading && !result && <EmptyState />}

        {/* Footer */}
        <footer className="mt-12 border-t border-white/[0.06] pt-6 text-center text-xs text-muted">
          Not financial advice. Always verify on-chain data before trading.
        </footer>
      </div>
    </div>
  );
}
