export type AnalysisResult = {
  aiScore: number;
  buyRating: "Strong Buy" | "Buy" | "Hold" | "Avoid";
  riskRating: "Low" | "Medium" | "High" | "Extreme";
  marketCap: string;
  liquidity: string;
  holders: string;
  volume24h: string;
  smartMoney: "Bullish" | "Neutral" | "Bearish";
  holderConcentration: "Low" | "Medium" | "High";
  momentum: "Strong Up" | "Up" | "Flat" | "Down";
  reasonsToBuy: string[];
  reasonsToAvoid: string[];
  suggestedEntry: string;
  suggestedStopLoss: string;
  suggestedTakeProfit: string;
};

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length];
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

const buyReasons = [
  "Strong on-chain accumulation by top wallets",
  "Liquidity locked for 12+ months",
  "Smart money inflow up 34% this week",
  "Contract verified and renounced",
  "Growing holder count (+18% in 7 days)",
  "Volume/MCap ratio indicates healthy interest",
  "No suspicious mint or freeze authority",
  "Dev wallet inactive for 90+ days",
];

const avoidReasons = [
  "Top 10 wallets hold 62% of supply",
  "Recent large sell-offs from insider wallets",
  "Liquidity below recommended threshold",
  "Token age under 48 hours — high rug risk",
  "Unverified contract with proxy pattern",
  "Wash trading detected in recent volume",
  "Social sentiment declining rapidly",
  "No audit or KYC on team",
];

export function analyzeContract(address: string): AnalysisResult {
  const seed = hashString(address.toLowerCase().trim());
  const aiScore = 25 + (seed % 71);

  const smartMoneyOptions: AnalysisResult["smartMoney"][] = [
    "Bullish",
    "Neutral",
    "Bearish",
  ];
  const concentrationOptions: AnalysisResult["holderConcentration"][] = [
    "Low",
    "Medium",
    "High",
  ];
  const momentumOptions: AnalysisResult["momentum"][] = [
    "Strong Up",
    "Up",
    "Flat",
    "Down",
  ];

  const buyRating =
    aiScore >= 75
      ? "Strong Buy"
      : aiScore >= 55
        ? "Buy"
        : aiScore >= 40
          ? "Hold"
          : "Avoid";

  const riskRating =
    aiScore >= 70
      ? "Low"
      : aiScore >= 50
        ? "Medium"
        : aiScore >= 30
          ? "High"
          : "Extreme";

  const basePrice = 0.00001 + (seed % 10000) / 1_000_000_000;
  const entry = basePrice;
  const stopLoss = entry * (0.85 + (seed % 10) / 100);
  const takeProfit = entry * (1.4 + (seed % 60) / 100);

  const reasonCount = 3 + (seed % 3);

  return {
    aiScore,
    buyRating,
    riskRating,
    marketCap: formatCurrency(500_000 + (seed % 950_000_000)),
    liquidity: formatCurrency(50_000 + (seed % 5_000_000)),
    holders: `${(1_000 + (seed % 49_000)).toLocaleString()}`,
    volume24h: formatCurrency(10_000 + (seed % 20_000_000)),
    smartMoney: pick(smartMoneyOptions, seed, 1),
    holderConcentration: pick(concentrationOptions, seed, 2),
    momentum: pick(momentumOptions, seed, 3),
    reasonsToBuy: Array.from({ length: reasonCount }, (_, i) =>
      pick(buyReasons, seed, i * 7),
    ),
    reasonsToAvoid: Array.from({ length: reasonCount }, (_, i) =>
      pick(avoidReasons, seed, i * 11),
    ),
    suggestedEntry: `$${entry.toFixed(8)}`,
    suggestedStopLoss: `$${stopLoss.toFixed(8)}`,
    suggestedTakeProfit: `$${takeProfit.toFixed(8)}`,
  };
}
