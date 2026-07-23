# Swing Analysis and Scoring Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic 5-20 trading-day analysis engine whose entry score rewards executable odds instead of recent heat, produces complete local strategy/report output, and allows a validated AI adjustment of at most `+/-0.5`.

**Architecture:** Introduce typed signal contracts and a single `EvidenceSnapshot`, then make scenario detection, scoring, local strategy, local reporting, AI review, API output, and UI consume that snapshot. Keep the current route handler as orchestration only; pure analysis logic moves into testable modules. Preserve `score.totalScore` as a temporary compatibility alias for the final score.

**Tech Stack:** TypeScript 5, Next.js 16.2.7 App Router Route Handlers, React 19, Vitest 4.

**Design source:** `docs/superpowers/specs/2026-07-23-swing-analysis-scoring-redesign.md`

---

## File Map

- Create `src/lib/analysis/evidence.ts`: shared evidence, data-quality, scenario, score, strategy, and AI-review contracts plus the exhaustive signal catalog.
- Create `src/lib/analysis/technicalSignals.ts`: EMA/BOLL/Ichimoku/MACD/KDJ/RSI state and event extraction.
- Create `src/lib/analysis/candlestickPatterns.ts`: ATR-normalized single-, two-, and three-candle pattern detection.
- Create `src/lib/analysis/evidenceBuilder.ts`: construct the single immutable evidence snapshot from calculated inputs.
- Create `src/lib/analysis/strategyAdvice.ts`: deterministic holder, left-entry, right-add, and exit/stop advice.
- Create `src/lib/analysis/aiScoreReview.ts`: parse and validate the bounded AI score adjustment.
- Create `src/lib/analysis/analysisEngine.ts`: pure orchestration for indicators, weekly context, evidence, score, strategy, and local report.
- Modify `src/lib/analysis/weeklyCandles.ts`: merge the realtime-derived current week into longer provider weekly history.
- Modify `src/lib/analysis/volumeForce.ts`: expose relative volume, direction, slopes, and symmetric bullish/bearish evidence.
- Modify `src/lib/analysis/patterns.ts`: typed pattern lifecycle, missing classic patterns, swing-anchored Fibonacci, and volume confirmation.
- Modify `src/lib/analysis/chanlun.ts`: expose structured top/bottom hints and central-zone position.
- Rewrite `src/lib/analysis/scoring.ts`: five-dimensional gated entry assessment and compatibility mapping.
- Rewrite `src/lib/analysis/fallbackReport.ts`: complete deterministic report from evidence instead of score inference.
- Modify `src/app/api/analyze/route.ts`: call the analysis engine, send structured evidence to AI, validate AI review, and return both rule/final scores.
- Modify `src/app/page.tsx`: show rule score, AI adjustment, final score, left/right status, data time, and provisional badges.

## Test Fixture Convention

Each new test file must define its fixture builders in that file or import them from a sibling `fixtures.ts` committed in the same task. Fixture builders named in the snippets are not production mocks: they return real `Candle[]`, indicator arrays, or `EvidenceSnapshot` values consumed by the real functions. Use deterministic ISO dates beginning at `2026-01-05`, constant baseline volume `1_000`, and explicit final-bar overrides. Do not mock `calculateEMA`, `calculateMACD`, pattern detectors, the score engine, or report formatters.

The shared primitive used by fixture builders is:

```ts
export function candle(
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 1_000
): Candle {
  return { date, open, high, low, close, volume };
}

export function candlesFromCloses(closes: number[], volumes = closes.map(() => 1_000)): Candle[] {
  return closes.map((close, index) => ({
    date: new Date(Date.UTC(2026, 0, 5 + index)).toISOString().slice(0, 10),
    open: index === 0 ? close : closes[index - 1],
    high: close + 1,
    low: close - 1,
    close,
    volume: volumes[index],
  }));
}
```

---

### Task 1: Define the Evidence Contract and Exhaustive Catalog

**Files:**
- Create: `src/lib/analysis/evidence.ts`
- Create: `src/lib/analysis/__tests__/evidence.test.ts`

- [ ] **Step 1: Write the failing catalog completeness tests**

```ts
import { describe, expect, it } from "vitest";
import { SIGNAL_CATALOG, SIGNAL_FAMILIES } from "../evidence";

describe("signal catalog", () => {
  it("covers every approved indicator family exactly once", () => {
    expect(SIGNAL_CATALOG.map((item) => item.family).sort()).toEqual(
      [...SIGNAL_FAMILIES].sort()
    );
  });

  it("declares consumers, report section, scoring role, and minimum samples", () => {
    for (const item of SIGNAL_CATALOG) {
      expect(item.consumers.length).toBeGreaterThan(0);
      expect(item.reportSection.length).toBeGreaterThan(0);
      expect(["score", "explainOnly"]).toContain(item.role);
      expect(item.minimumSamples.daily + item.minimumSamples.weekly).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/evidence.test.ts`

Expected: FAIL because `../evidence` does not exist.

- [ ] **Step 3: Add the evidence contracts and fixed catalog**

```ts
export const SIGNAL_FAMILIES = [
  "ema", "boll", "ichimoku", "macd", "kdj", "rsi", "atr",
  "volume", "cmf", "obv", "vpvr", "horizontal", "fibonacci",
  "classicalPattern", "candlestick", "tdSequential", "elliottWave", "chanlun",
] as const;

export type SignalFamily = typeof SIGNAL_FAMILIES[number];
export type Timeframe = "daily" | "weekly";
export type EvidenceDirection = "bullish" | "bearish" | "neutral";
export type EvidenceRole = "score" | "explainOnly";
export type ScenarioStatus = "not_formed" | "watch" | "triggered" | "too_late";

export interface SignalDefinition {
  family: SignalFamily;
  consumers: Array<"left" | "right" | "holder" | "exit" | "report">;
  reportSection: string;
  role: EvidenceRole;
  minimumSamples: Record<Timeframe, number>;
}

export interface EvidenceItem {
  id: string;
  family: SignalFamily;
  timeframe: Timeframe;
  direction: EvidenceDirection;
  state: string;
  label: string;
  description: string;
  barsSince?: number;
  provisional: boolean;
  reliability: number;
  invalidation?: string;
  values?: Record<string, number | string | boolean>;
}

export interface DataQuality {
  asOf: string;
  latestDailyDate?: string;
  latestWeeklyDate?: string;
  dailyBarComplete: boolean;
  weeklyBarComplete: boolean;
  dailySamples: number;
  weeklySamples: number;
  missingFamilies: SignalFamily[];
  scoreCap: number;
  warnings: string[];
}

export interface TradeLevel {
  price: number;
  kind: "support" | "resistance" | "stop" | "target";
  source: "horizontal" | "ema" | "boll" | "vpvr" | "fibonacci" | "pattern" | "atr";
  strength: number;
  hits?: number;
  lastSeenIndex?: number;
}

export interface EvidenceSnapshot {
  version: "2.0";
  symbol: string;
  price: number;
  dataQuality: DataQuality;
  items: EvidenceItem[];
  levels: TradeLevel[];
  weeklyRegime: "bullish" | "neutral" | "bearish";
  dailyPhase: "base" | "pullback" | "breakout" | "extended" | "breakdown" | "range";
}
```

Define `SIGNAL_CATALOG` with one literal `SignalDefinition` for every member of `SIGNAL_FAMILIES`. Use `score` for all families except `elliottWave`, which is `explainOnly`; give daily/weekly sample requirements matching the real calculations (`EMA60=60`, Ichimoku=52, MACD=35, RSI=15, KDJ=9`, with weekly zero where not used).

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/evidence.test.ts`

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/evidence.ts src/lib/analysis/__tests__/evidence.test.ts
git commit -m "refactor: define analysis evidence contract"
```

---

### Task 2: Synchronize Realtime Daily and Current Weekly Data

**Files:**
- Modify: `src/lib/analysis/weeklyCandles.ts`
- Modify: `src/lib/analysis/__tests__/symbolConversion.test.ts`
- Create: `src/lib/analysis/dataQuality.ts`
- Create: `src/lib/analysis/__tests__/dataQuality.test.ts`

- [ ] **Step 1: Write failing weekly-merge and completion tests**

```ts
it("replaces the provider current week with the week rebuilt from realtime daily bars", () => {
  const provider = [
    candle("2026-07-13", 100, 110, 95, 105, 5000),
    candle("2026-07-20", 105, 108, 101, 102, 2000),
  ];
  const daily = [
    candle("2026-07-20", 105, 109, 103, 108, 1000),
    candle("2026-07-21", 108, 112, 107, 111, 1500),
    candle("2026-07-22", 111, 115, 110, 114, 1800),
  ];

  expect(mergeCurrentWeekFromDaily(provider, daily).at(-1)).toMatchObject({
    date: "2026-07-20", open: 105, high: 115, low: 103, close: 114, volume: 4300,
  });
});

it("marks an A-share daily and weekly bar provisional during trading", () => {
  const quality = buildDataQuality({
    symbol: "300757.SZ",
    asOf: "2026-07-23T06:00:00.000Z",
    dailySamples: 250,
    weeklySamples: 150,
    latestDailyDate: "2026-07-23",
    latestWeeklyDate: "2026-07-20",
  });
  expect(quality.dailyBarComplete).toBe(false);
  expect(quality.weeklyBarComplete).toBe(false);
});
```

- [ ] **Step 2: Run both tests and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/symbolConversion.test.ts src/lib/analysis/__tests__/dataQuality.test.ts`

Expected: FAIL because `mergeCurrentWeekFromDaily` and `buildDataQuality` do not exist.

- [ ] **Step 3: Implement current-week replacement**

```ts
export function mergeCurrentWeekFromDaily(providerWeekly: Candle[], daily: Candle[]): Candle[] {
  const rebuilt = buildWeeklyCandles(daily);
  const current = rebuilt.at(-1);
  if (!current) return [...providerWeekly];

  const key = String(current.date);
  return [
    ...providerWeekly.filter((item) => String(item.date).slice(0, 10) !== key),
    current,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
```

Export `getWeekStart` for direct testing rather than duplicating the calendar rule.

- [ ] **Step 4: Implement explicit data-quality calculation**

`buildDataQuality` must use Beijing session boundaries already established in `analysisCache.ts` for A-shares. During 09:30-11:30 and 13:00-15:00 Beijing time, a same-day bar is provisional; its week is also provisional. After close, both are complete for the latest session. For other markets, mark a bar provisional only when its date equals the UTC date of `asOf`; add a warning that non-A-share session completion is provider-derived.

Set score caps as follows:

```ts
let scoreCap = 5;
if (dailySamples < 60) scoreCap = Math.min(scoreCap, 2.5);
if (weeklySamples < 35) scoreCap = Math.min(scoreCap, 3.2);
if (!dailyBarComplete) warnings.push("当前日K未完成，日线触发为暂定信号");
if (!weeklyBarComplete) warnings.push("当前周K未完成，周线信号为暂定信号");
```

- [ ] **Step 5: Run both tests and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/symbolConversion.test.ts src/lib/analysis/__tests__/dataQuality.test.ts`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/weeklyCandles.ts src/lib/analysis/dataQuality.ts src/lib/analysis/__tests__/symbolConversion.test.ts src/lib/analysis/__tests__/dataQuality.test.ts
git commit -m "fix: synchronize realtime daily and weekly analysis bars"
```

---

### Task 3: Extract Accurate Technical Events and States

**Files:**
- Create: `src/lib/analysis/technicalSignals.ts`
- Create: `src/lib/analysis/__tests__/technicalSignals.test.ts`

- [ ] **Step 1: Write failing MACD, KDJ, RSI, EMA, BOLL, and Ichimoku tests**

```ts
describe("technical signal extraction", () => {
  it("distinguishes a fresh MACD golden cross from an existing bullish state", () => {
    expect(analyzeMacd([-0.4, -0.1], [-0.3, -0.2], [-0.2, 0.2], 1, false)).toMatchObject({
      cross: "golden", barsSinceCross: 0, zone: "below_zero", histogramTrend: "expanding",
    });
    expect(analyzeMacd([-0.1, 0.1], [-0.2, 0.0], [0.2, 0.2], 1, false).cross).toBe("none");
  });

  it("detects a real KDJ death cross rather than any K below D state", () => {
    expect(analyzeKdj([85, 78], [82, 80], [91, 74], 1, false)).toMatchObject({
      cross: "death", barsSinceCross: 0, zone: "high",
    });
    expect(analyzeKdj([70, 68], [75, 73], [60, 58], 1, false).cross).toBe("none");
  });

  it("reports RSI threshold crossings without calling them golden crosses", () => {
    expect(analyzeRsi([27, 32], 1, false)).toMatchObject({
      value: 32, zone: "weak", thresholdCross: "up_30", barsSinceCross: 0,
    });
    expect(analyzeRsi([52, 48], 1, false).thresholdCross).toBe("down_50");
  });
});
```

Add assertions that EMA slopes use a 5-bar normalized change, BOLL reports `%B` and bandwidth direction, and Ichimoku reports price/cloud position plus Tenkan/Kijun cross. Repeat MACD/KDJ tests with `provisional=true`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/technicalSignals.test.ts`

Expected: FAIL because `technicalSignals.ts` does not exist.

- [ ] **Step 3: Implement reusable event search**

```ts
function findRecentCross(
  left: number[],
  right: number[],
  latestIndex: number,
  lookback = 3
): { type: "golden" | "death" | "none"; barsSince?: number } {
  for (let barsSince = 0; barsSince < lookback; barsSince++) {
    const index = latestIndex - barsSince;
    if (index < 1) break;
    const currentLeft = left[index];
    const currentRight = right[index];
    const previousLeft = left[index - 1];
    const previousRight = right[index - 1];
    if (![currentLeft, currentRight, previousLeft, previousRight].every(Number.isFinite)) continue;
    if (currentLeft > currentRight && previousLeft <= previousRight) return { type: "golden", barsSince };
    if (currentLeft < currentRight && previousLeft >= previousRight) return { type: "death", barsSince };
  }
  return { type: "none" };
}
```

Build `analyzeMacd`, `analyzeKdj`, `analyzeRsi`, `analyzeEma`, `analyzeBoll`, and `analyzeIchimoku` around strict index reads. Never fall back from a missing current value to an older value.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/technicalSignals.test.ts`

Expected: all event/state tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/technicalSignals.ts src/lib/analysis/__tests__/technicalSignals.test.ts
git commit -m "feat: model technical events and signal freshness"
```

---

### Task 4: Add ATR-Normalized Candlestick Patterns

**Files:**
- Create: `src/lib/analysis/candlestickPatterns.ts`
- Create: `src/lib/analysis/__tests__/candlestickPatterns.test.ts`

- [ ] **Step 1: Write failing table-driven coverage tests**

```ts
const EXPECTED_IDS = [
  "hammer", "invertedHammer", "bullishEngulfing", "piercingLine", "morningStar", "bullishHarami",
  "hangingMan", "shootingStar", "bearishEngulfing", "darkCloudCover", "eveningStar", "bearishHarami",
  "threeWhiteSoldiers", "threeBlackCrows", "bullishMarubozu", "bearishMarubozu",
  "gapUp", "gapDown", "insideBar", "outsideBar", "doji", "spinningTop", "longUpperShadow", "longLowerShadow",
] as const;

it("keeps the approved pattern catalog exhaustive", () => {
  expect(CANDLESTICK_PATTERN_IDS).toEqual(EXPECTED_IDS);
});

it("detects a hammer only after decline and near support", () => {
  const result = detectCandlestickPatterns(hammersAtSupport(), atrSeries(2), [support(92)]);
  expect(result[0]).toMatchObject({ id: "hammer", bias: "bullish", location: "support", barsSince: 0 });
  expect(detectCandlestickPatterns(sameHammerAfterRally(), atrSeries(2), []).some(p => p.id === "hammer")).toBe(false);
});

it("deduplicates doji, long-lower-shadow, and hammer matches on the same bar", () => {
  const result = detectCandlestickPatterns(overlappingSingleBar(), atrSeries(2), [support(92)]);
  expect(result.filter((item) => item.endIndex === result[0].endIndex)).toHaveLength(1);
});
```

Add focused fixtures for every two-candle and three-candle pattern. Assert three white soldiers become `extended` rather than bullish-trigger evidence when price is more than `2.5 ATR` above EMA20.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/candlestickPatterns.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement normalized candle geometry and context rules**

Use these exact normalized measurements:

```ts
const body = Math.abs(c.close - c.open);
const range = Math.max(c.high - c.low, Number.EPSILON);
const upperShadow = c.high - Math.max(c.open, c.close);
const lowerShadow = Math.min(c.open, c.close) - c.low;
const bodyToRange = body / range;
const bodyToAtr = body / Math.max(atr, Number.EPSILON);
```

Implement the approved IDs with these rules:

- Doji: `bodyToRange <= 0.1`; spinning top: `bodyToRange <= 0.3` and both shadows at least the body.
- Hammer/hanging man: lower shadow at least `2 * body`, upper shadow at most `0.35 * range`; distinguish by prior 5-bar direction and support/resistance location.
- Inverted hammer/shooting star: mirrored shadow rule and contextual direction.
- Engulfing: second real body fully covers the first real body and reverses color.
- Piercing/dark cloud: second body closes beyond the first body midpoint without fully engulfing.
- Morning/evening star: large first body, small middle body, third close beyond first midpoint.
- Harami: second body lies inside first body with reversed color.
- Three soldiers/crows: three same-color bodies, sequential closes, each open within prior body, no dominant opposing shadow.
- Marubozu: `bodyToRange >= 0.9` and `bodyToAtr >= 0.6`.
- Gap: current low above previous high or current high below previous low.
- Inside/outside bar: full high-low containment or expansion.
- Long upper/lower shadow: the named shadow is at least `2 * body` and at least `0.6 * range`; use context to upgrade it to shooting-star/hammer family, otherwise retain the neutral shadow ID.

Rank overlapping matches by `three-bar > two-bar > contextual reversal > neutral`, then keep one primary signal per ending index.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/candlestickPatterns.test.ts`

Expected: catalog and all detection fixtures pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/candlestickPatterns.ts src/lib/analysis/__tests__/candlestickPatterns.test.ts
git commit -m "feat: add contextual candlestick pattern evidence"
```

---

### Task 5: Refactor Fibonacci and Classic Patterns into Lifecycle Signals

**Files:**
- Modify: `src/lib/analysis/patterns.ts`
- Modify: `src/lib/analysis/supportResistance.ts`
- Modify: `src/lib/analysis/__tests__/patterns.test.ts`

- [ ] **Step 1: Write failing lifecycle, volume-confirmation, and Fibonacci-anchor tests**

```ts
it("keeps an unbroken double bottom in near-trigger state", () => {
  const result = analyzePatterns(doubleBottomBelowNeckline(), macd(), rsi(), kdj(), neutralVolume());
  expect(result.activePatterns.find(p => p.key === "doubleBottom")).toMatchObject({
    status: "near_trigger", volumeConfirmation: "unconfirmed",
  });
});

it("confirms a double bottom only with a valid close and volume confirmation", () => {
  const result = analyzePatterns(doubleBottomBreakout(1.7), macd(), rsi(), kdj(), bullishVolume());
  expect(result.activePatterns.find(p => p.key === "doubleBottom")).toMatchObject({
    status: "confirmed", volumeConfirmation: "confirmed",
  });
});

it("marks a confirmed pattern failed after its invalidation level breaks", () => {
  expect(findPattern(failedDoubleBottom()).status).toBe("failed");
});

it("anchors Fibonacci to the latest confirmed swing rather than the absolute 120-bar range", () => {
  const fib = calculateFibonacci(swingFixtureWithOldOutlier());
  expect(fib.anchorStartIndex).toBe(70);
  expect(fib.anchorEndIndex).toBe(102);
  expect(fib.direction).toBe("up");
});

it("keeps TD count and recent Setup 9 freshness after the setup bar", () => {
  const result = calculateTDSequential(tdBuyNineThenTwoBarsFixture());
  expect(result).toMatchObject({ latestCount: -11, latestSetup: "buy", barsSinceSetup9: 2 });
});

it("retains horizontal-level hits and last-seen metadata", () => {
  const result = calculateSupportResistance(repeatedSupportFixture(), 105, 102, 98, 112, 96);
  expect(result.typedLevels.find(level => level.source === "horizontal" && level.kind === "support"))
    .toMatchObject({ hits: 3, lastSeenIndex: expect.any(Number) });
});
```

Add one fixture for each previously missing classic form: inverse head-and-shoulders, rounding bottom, ascending triangle, and descending triangle. Assert all approved classic pattern IDs are exported.

Use this exact catalog assertion so the implementation cannot silently omit a design-approved form:

```ts
expect(CLASSIC_PATTERN_IDS).toEqual([
  "doubleBottom", "doubleTop", "tripleBottom", "tripleTop",
  "inverseHeadAndShoulders", "headAndShoulders",
  "roundingBottom", "roundingTop", "cupAndHandle",
  "bullFlag", "bearFlag", "rectangle",
  "symmetricTriangle", "ascendingTriangle", "descendingTriangle", "pennant",
  "risingWedge", "fallingWedge",
]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/patterns.test.ts`

Expected: FAIL because pattern lifecycle fields, volume input, and swing anchors are absent.

- [ ] **Step 3: Extend pattern contracts without removing legacy booleans**

```ts
export type PatternStatus = "forming" | "near_trigger" | "confirmed" | "failed";

export interface PatternSignal {
  key: string;
  name: string;
  bias: PatternBias;
  confidence: number;
  description: string;
  status: PatternStatus;
  startIndex: number;
  endIndex: number;
  triggerPrice?: number;
  targetPrice?: number;
  invalidationPrice?: number;
  volumeConfirmation: "confirmed" | "unconfirmed" | "contradictory";
  barsSinceStatus: number;
}

export interface FibonacciAnalysis {
  levels: Array<{ label: string; price: number }>;
  anchorStartIndex: number;
  anchorEndIndex: number;
  direction: "up" | "down";
}
```

Preserve `fibonacciLevels` as `fibonacci.levels` during migration.

Extend TD output with `latestCount`, `latestSetup: "buy" | "sell" | "none"`, and `barsSinceSetup9`. Continue counting beyond 9 for exhaustion context, but only a Setup 9 from the latest three completed bars can serve as fresh trigger evidence.

Extend `SupportResistanceResult` with `typedLevels: TradeLevel[]`. Preserve the existing numeric arrays for chart compatibility, but carry cluster hit count, latest contributing pivot index, source, kind, and normalized strength into the typed list. The score engine must consume `typedLevels`, not rebuild an untyped pool from numeric arrays.

- [ ] **Step 4: Implement typed lifecycle and volume confirmation**

For reversal patterns, use the neckline as trigger and the second extreme as invalidation. For confirmed patterns, target the measured structure height. A close within `2%` below/above the trigger is `near_trigger`; a close beyond the trigger is `confirmed` only when relative volume is at least `1.3`, CMF is not contradictory, or a later low-volume retest holds. Breaking invalidation produces `failed`.

Implement inverse head-and-shoulders as the mirror of the existing top detector, rounding bottom as the mirror of rounding top, and split the existing neutral triangle into symmetric/ascending/descending types by normalized high/low slopes.

- [ ] **Step 5: Replace Fibonacci anchoring**

Use confirmed 5-left/5-right pivots. Starting from the newest pivot, select the nearest prior opposite pivot at least 10 bars away and with a move of at least `3 ATR`; emit no Fibonacci evidence when no valid swing exists. Never treat Fibonacci levels as generic support/resistance without retaining their source.

- [ ] **Step 6: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/patterns.test.ts`

Expected: all old and new pattern tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analysis/patterns.ts src/lib/analysis/supportResistance.ts src/lib/analysis/__tests__/patterns.test.ts
git commit -m "refactor: model pattern lifecycle and swing Fibonacci"
```

---

### Task 6: Make Volume and Chanlun Evidence Structured and Symmetric

**Files:**
- Modify: `src/lib/analysis/volumeForce.ts`
- Modify: `src/lib/analysis/chanlun.ts`
- Modify: `src/lib/analysis/__tests__/volumeForce.test.ts`
- Modify: `src/lib/analysis/__tests__/chanlun.test.ts`

- [ ] **Step 1: Write failing structured-output tests**

```ts
it("reports bearish expansion rather than a generic volume breakout", () => {
  const result = analyzePriceVolume(bearishExpansionFixture());
  expect(result).toMatchObject({
    relativeVolume: expect.any(Number),
    volumeDirection: "bearish",
    cmfTrend: "falling",
    obvTrend: "falling",
  });
});

it("exposes forming bottom fractal without parsing the Chinese description", () => {
  expect(analyzeChanLun(formingBottomFixture())).toMatchObject({
    formingFractal: "bottom",
    currentStrokeDirection: "down",
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/volumeForce.test.ts src/lib/analysis/__tests__/chanlun.test.ts`

Expected: FAIL because the structured fields do not exist.

- [ ] **Step 3: Add structured fields**

Extend `VolumeAnalysisResult` with:

```ts
relativeVolume: number;
volumeDirection: "bullish" | "bearish" | "neutral";
cmfTrend: "rising" | "falling" | "flat";
obvTrend: "rising" | "falling" | "flat";
isLowVolumePullback: boolean;
```

Calculate relative volume against the prior 20 completed bars, not a moving average that includes the current bar. Determine slopes from normalized 5-bar regression. Keep legacy booleans until all consumers migrate.

Extend `ChanLunResult` with:

```ts
formingFractal: "top" | "bottom" | "none";
centralZone?: { low: number; high: number; pricePosition: "above" | "inside" | "below" };
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/volumeForce.test.ts src/lib/analysis/__tests__/chanlun.test.ts`

Expected: all volume and Chanlun tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/volumeForce.ts src/lib/analysis/chanlun.ts src/lib/analysis/__tests__/volumeForce.test.ts src/lib/analysis/__tests__/chanlun.test.ts
git commit -m "refactor: expose structured volume and chanlun evidence"
```

---

### Task 7: Build the Single Evidence Snapshot

**Files:**
- Create: `src/lib/analysis/evidenceBuilder.ts`
- Create: `src/lib/analysis/__tests__/evidenceBuilder.test.ts`

- [ ] **Step 1: Write failing snapshot completeness and deduplication tests**

```ts
it("emits every catalog family as active, neutral, or insufficient", () => {
  const snapshot = buildEvidenceSnapshot(completeFixture());
  expect(new Set(snapshot.items.map(item => item.family))).toEqual(new Set(SIGNAL_FAMILIES));
});

it("combines three bottom divergences into one momentum-family score candidate", () => {
  const snapshot = buildEvidenceSnapshot(allBottomDivergencesFixture());
  expect(snapshot.items.filter(item => item.id === "daily.momentum.bottom_divergence")).toHaveLength(1);
  expect(snapshot.items.find(item => item.id === "daily.momentum.bottom_divergence")?.values).toMatchObject({
    sources: "macd,rsi,kdj",
  });
});

it("keeps EMA, VPVR, Fibonacci, and horizontal levels typed", () => {
  expect(buildEvidenceSnapshot(levelFixture()).levels.map(level => level.source)).toEqual(
    expect.arrayContaining(["ema", "vpvr", "fibonacci", "horizontal"])
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/evidenceBuilder.test.ts`

Expected: FAIL because `evidenceBuilder.ts` does not exist.

- [ ] **Step 3: Implement the builder as the sole fact adapter**

`buildEvidenceSnapshot` accepts already-calculated daily and weekly indicators, volume, pattern, candlestick, support/resistance, wave, Chanlun, and `DataQuality`. It must:

- Produce stable IDs such as `daily.macd.golden_cross`, `weekly.ema.bullish`, and `daily.pattern.doubleBottom.confirmed`.
- Emit an `insufficient` item for catalog families lacking samples.
- Mark evidence provisional from `DataQuality`.
- Merge divergence sources into one score candidate while preserving source names in `values`.
- Determine weekly regime from price/EMA20/EMA60 slopes, MACD state, RSI state, KDJ state, Ichimoku, and weekly volume; no single indicator can decide the regime.
- Determine daily phase as base, pullback, breakout, extended, breakdown, or range.
- Keep every level typed and cluster confluence by source family, not by number of nearly identical prices.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/evidenceBuilder.test.ts`

Expected: snapshot completeness, deduplication, and typed levels pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis/evidenceBuilder.ts src/lib/analysis/__tests__/evidenceBuilder.test.ts
git commit -m "feat: build unified analysis evidence snapshot"
```

---

### Task 8: Replace Additive Heat Scoring with Gated Entry Assessment

**Files:**
- Rewrite: `src/lib/analysis/scoring.ts`
- Rewrite: `src/lib/analysis/__tests__/scoring.test.ts`

- [ ] **Step 1: Write failing scenario and hard-cap tests**

```ts
it("rates a healthy pullback above an extended high-volume rally", () => {
  expect(calculateEntryAssessment(healthyPullbackSnapshot()).ruleScore)
    .toBeGreaterThan(calculateEntryAssessment(extendedRallySnapshot()).ruleScore);
});

it("does not treat oversold oscillators in a falling knife as a triggered left entry", () => {
  const result = calculateEntryAssessment(fallingKnifeSnapshot());
  expect(result.leftStatus).toBe("watch");
  expect(result.ruleScore).toBeLessThanOrEqual(2.9);
});

it("makes bearish volume and top structures lower the actual score", () => {
  const neutral = calculateEntryAssessment(neutralSnapshot());
  const bearish = calculateEntryAssessment(bearishVolumeTopSnapshot());
  expect(bearish.ruleScore).toBeLessThan(neutral.ruleScore);
});

it.each([
  ["missing stop", noStopSnapshot(), 2.5],
  ["reward risk below one", rewardRiskSnapshot(0.8), 2.4],
  ["reward risk below one point five", rewardRiskSnapshot(1.3), 3.2],
  ["extended climax", extendedClimaxSnapshot(), 2.8],
])("applies the %s hard cap", (_name, snapshot, cap) => {
  const result = calculateEntryAssessment(snapshot);
  expect(result.hardCap).toBeLessThanOrEqual(cap);
  expect(result.ruleScore).toBeLessThanOrEqual(cap);
});
```

Add a test that strong-trend holder evidence cannot raise entry score, a missing weekly context receives no bonus, and three divergence sources do not outscore one confirmed divergence merely by duplication.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/scoring.test.ts`

Expected: FAIL against the old positional argument API and additive score model.

- [ ] **Step 3: Implement the five score dimensions**

```ts
export interface EntryAssessment {
  ruleScore: number;
  aiAdjustment: number;
  finalScore: number;
  hardCap: number;
  dimensions: {
    priceLocation: number;
    payoffQuality: number;
    setupMaturity: number;
    timeframeContext: number;
    confirmationQuality: number;
  };
  leftStatus: ScenarioStatus;
  rightStatus: ScenarioStatus;
  activeSetup: "left" | "right" | "none";
  riskPlan: { stop?: number; target?: number; rewardRisk?: number; stopDistancePct?: number };
  reasons: string[];
}
```

Calculate dimensions with caps `1.00`, `1.25`, `1.25`, `0.75`, and `0.75`. Require one location/structure and one short-term confirmation for `left=triggered`. Require a price-level break plus bullish volume or a successful low-volume retest for `right=triggered`. Use the nearest strong typed support below price plus `0.5 ATR` buffer for stop, and the nearest meaningful typed resistance or pattern target at least `1.5 ATR` above price for target.

Apply all design hard caps after dimension scoring. Deduct contradictory evidence within its owning dimension before clamping that dimension; do not clamp an aggregate bearish volume/pattern bucket to zero after describing a deduction.

- [ ] **Step 4: Keep a temporary compatibility adapter**

Export `toLegacyScoreDetail(assessment)` so existing route/UI compilation can continue during migration. Set `totalScore = finalScore` and `scoreReasons = reasons`; mark legacy component fields deprecated and map them from the five named dimensions without using them for decisions.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/scoring.test.ts`

Expected: all scenario, symmetry, and cap tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/scoring.ts src/lib/analysis/__tests__/scoring.test.ts
git commit -m "refactor: gate entry score by setup and payoff"
```

---

### Task 9: Generate Independent Strategy Advice and a Complete Local Report

**Files:**
- Create: `src/lib/analysis/strategyAdvice.ts`
- Create: `src/lib/analysis/__tests__/strategyAdvice.test.ts`
- Rewrite: `src/lib/analysis/fallbackReport.ts`
- Rewrite: `src/lib/analysis/__tests__/fallbackReport.test.ts`

- [ ] **Step 1: Write failing strategy-separation tests**

```ts
it("can recommend holding while rejecting a new extended entry", () => {
  const advice = buildStrategyAdvice(strongButExtendedSnapshot(), extendedAssessment());
  expect(advice.holder.action).toBe("hold_protect");
  expect(advice.rightAdd.action).toBe("avoid_chasing");
  expect(advice.leftEntry.action).toBe("not_applicable");
});

it("always gives a traceable structural and ATR stop", () => {
  const advice = buildStrategyAdvice(triggeredLeftSnapshot(), triggeredLeftAssessment());
  expect(advice.exitStop.structuralStop).toBe(94.2);
  expect(advice.exitStop.atrStop).toBe(93.6);
  expect(advice.exitStop.trigger).toBe("close");
});
```

- [ ] **Step 2: Write failing local-report fact tests**

```ts
it("describes actual evidence instead of inferring indicators from total score", () => {
  const report = generateLocalReport(bearishMacdHighRuleScoreFixture(), "zh-CN");
  expect(report.technicalAnalysis).toContain("MACD死叉");
  expect(report.technicalAnalysis).not.toContain("MACD金叉");
});

it("covers every signal catalog section without AI", () => {
  const report = generateLocalReport(completeReportFixture(), "zh-CN");
  for (const section of new Set(SIGNAL_CATALOG.map(item => item.reportSection))) {
    expect(report.technicalAnalysis).toContain(section);
  }
});
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/strategyAdvice.test.ts src/lib/analysis/__tests__/fallbackReport.test.ts`

Expected: FAIL because strategy advice is not independent and fallback text infers facts from score.

- [ ] **Step 4: Implement deterministic advice**

Return structured actions and descriptions:

```ts
export interface StrategyAdvice {
  holder: { action: "hold" | "hold_protect" | "reduce" | "exit"; text: string };
  leftEntry: { action: "wait" | "probe" | "not_applicable"; text: string };
  rightAdd: { action: "wait_breakout" | "add_on_retest" | "avoid_chasing"; text: string };
  exitStop: {
    structuralStop?: number;
    atrStop?: number;
    trigger: "close" | "intraday";
    text: string;
  };
}
```

Holder action uses trend integrity and invalidation, never entry score. Left/right actions use their scenario status. Exit uses the assessment risk plan and evidence invalidation.

- [ ] **Step 5: Rewrite the local report from evidence sections**

Generate overview, four-part recommendation, and technical analysis from `EvidenceSnapshot`, `EntryAssessment`, and `StrategyAdvice`. Render every catalog section in a stable order. Inactive signals get a short neutral line; insufficient families get an explicit sample warning. Preserve `zh-CN`, `zh-TW`, `en`, and `ja` routing, but all languages must format the same numeric facts.

- [ ] **Step 6: Run tests and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/strategyAdvice.test.ts src/lib/analysis/__tests__/fallbackReport.test.ts`

Expected: all strategy and local-report tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/analysis/strategyAdvice.ts src/lib/analysis/fallbackReport.ts src/lib/analysis/__tests__/strategyAdvice.test.ts src/lib/analysis/__tests__/fallbackReport.test.ts
git commit -m "feat: generate independent strategy and local analysis"
```

---

### Task 10: Validate AI Score Review and Evidence-Bound Reasoning

**Files:**
- Create: `src/lib/analysis/aiScoreReview.ts`
- Create: `src/lib/analysis/__tests__/aiScoreReview.test.ts`
- Modify: `src/lib/analysis/llmProxy.ts`

- [ ] **Step 1: Write failing validation tests**

```ts
it("accepts a reasoned adjustment that references existing evidence", () => {
  const result = validateAiScoreReview({
    adjustment: -0.3,
    confidence: 0.8,
    alignment: "more_cautious",
    reasons: [{ evidenceIds: ["weekly.macd.death_cross"], text: "周线动能与日线修复冲突" }],
    conflicts: [],
    changeConditions: [],
  }, evidenceIds(), 4.1, 5);
  expect(result.appliedAdjustment).toBe(-0.3);
  expect(result.finalScore).toBe(3.8);
});

it.each([
  ["clips positive adjustment", 0.9, 0.5],
  ["clips negative adjustment", -0.8, -0.5],
])("%s", (_name, adjustment, expected) => {
  expect(validReview(adjustment).appliedAdjustment).toBe(expected);
});

it("rejects nonzero adjustment without valid evidence reasons", () => {
  expect(invalidEvidenceReview().appliedAdjustment).toBe(0);
});

it("cannot lift the final score above the rule hard cap", () => {
  expect(validReview(0.5, { ruleScore: 3.1, hardCap: 3.2 }).finalScore).toBe(3.2);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/aiScoreReview.test.ts`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement strict server-side validation**

Parse unknown JSON without adding a schema dependency. Require finite numbers, `confidence` in `0..1`, a known alignment, non-empty reason text, and every cited ID to exist in the snapshot. Clamp adjustment to `-0.5..0.5`, round applied adjustment and final score to one decimal, and retain a `validationWarnings` array. A zero adjustment may have no reason.

- [ ] **Step 4: Tighten the LLM system boundary**

Update provider system messages to say the model receives immutable technical facts; it may interpret or challenge the rule score but must not recalculate indicators or introduce outside facts. Keep the existing SSRF, model-name, timeout, and upstream-error protections unchanged.

- [ ] **Step 5: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/aiScoreReview.test.ts src/lib/analysis/__tests__/llmProxy.test.ts`

Expected: AI review and existing proxy security tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/aiScoreReview.ts src/lib/analysis/llmProxy.ts src/lib/analysis/__tests__/aiScoreReview.test.ts
git commit -m "feat: validate bounded AI score review"
```

---

### Task 11: Create the Pure Analysis Engine and Integrate the Route Handler

**Files:**
- Create: `src/lib/analysis/analysisEngine.ts`
- Create: `src/lib/analysis/__tests__/analysisEngine.test.ts`
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Write a failing end-to-end engine test**

```ts
it("builds one coherent realtime snapshot for indicators, score, strategy, and report", () => {
  const result = runAnalysisEngine({
    symbol: "300757.SZ",
    dailyCandles: dailyWithRealtimeClose(114),
    weeklyCandles: staleProviderWeeklyClose(102),
    asOf: "2026-07-23T06:00:00.000Z",
    language: "zh-CN",
  });

  expect(result.weeklyCandles.at(-1)?.close).toBe(114);
  expect(result.snapshot.price).toBe(114);
  expect(result.entryAssessment.ruleScore).toBe(result.legacyScore.totalScore);
  expect(result.localReport.recommendation).toContain(result.strategyAdvice.exitStop.text);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/analysisEngine.test.ts`

Expected: FAIL because `analysisEngine.ts` does not exist.

- [ ] **Step 3: Implement pure orchestration**

`runAnalysisEngine` must merge the current week, calculate daily and weekly EMA/BOLL/MACD/KDJ/RSI/ATR/Ichimoku/volume, analyze classic and candlestick patterns, build support/resistance, wave and Chanlun, create `EvidenceSnapshot`, calculate rule entry assessment, strategy, legacy score, and local report. It performs no network calls and reads no cache.

- [ ] **Step 4: Run engine test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/analysisEngine.test.ts`

Expected: coherent snapshot test passes.

- [ ] **Step 5: Replace inline route calculations with the engine**

Follow the repository's Next.js 16.2.7 Route Handler guides already read from:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`

Keep `POST(request: Request)` and `NextResponse.json`. After provider/realtime candle acquisition, call `runAnalysisEngine`. Generate the AI prompt from the snapshot, rule dimensions, hard cap, strategy, last 20 daily summaries, and last 12 weekly summaries. Require AI JSON keys:

```json
{
  "overview": "string",
  "technicalAnalysis": "string",
  "strategyCommentary": "string",
  "scoreReview": {
    "adjustment": 0,
    "confidence": 0,
    "alignment": "agree",
    "reasons": [],
    "conflicts": [],
    "changeConditions": []
  }
}
```

Validate `scoreReview`, apply it to the entry assessment, update the legacy `score.totalScore`, and prepend a deterministic verified score block to the returned report. Always return the complete local report when AI is absent or invalid.

- [ ] **Step 6: Add prompt and fallback regression assertions**

Export prompt building and parsed-result application as pure helpers. Test that the prompt contains MACD/KDJ/RSI event timing, Fibonacci, Ichimoku, TD, classic patterns, candlesticks, weekly provisional state, rule score, and evidence IDs. Test that an invalid AI response leaves final score equal to rule score.

- [ ] **Step 7: Run route-adjacent tests and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/analysisEngine.test.ts src/lib/analysis/__tests__/fallbackReport.test.ts src/lib/analysis/__tests__/aiScoreReview.test.ts`

Expected: all engine, report, and AI review tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/analysis/analysisEngine.ts src/app/api/analyze/route.ts src/lib/analysis/__tests__/analysisEngine.test.ts
git commit -m "refactor: route analysis through unified evidence engine"
```

---

### Task 12: Present Rule Score, AI Adjustment, Scenarios, and Data Status

**Files:**
- Create: `src/lib/analysis/presentation.ts`
- Create: `src/lib/analysis/__tests__/presentation.test.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write failing presentation tests**

```ts
it("labels rule, AI adjustment, final score, and scenario status", () => {
  const view = buildEntryScorePresentation(assessmentFixture({
    ruleScore: 3.6,
    aiAdjustment: -0.2,
    finalScore: 3.4,
    leftStatus: "triggered",
    rightStatus: "watch",
  }), "zh-CN");
  expect(view).toMatchObject({
    ruleLabel: "规则基础分",
    adjustmentText: "-0.2",
    finalLabel: "最终综合分",
    leftText: "触发",
    rightText: "观察",
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:run -- src/lib/analysis/__tests__/presentation.test.ts`

Expected: FAIL because the presentation helper does not exist.

- [ ] **Step 3: Implement localized presentation mapping**

Return labels for all four supported languages and all scenario states. Format adjustment with an explicit sign and format `asOf` plus provisional daily/weekly warnings.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:run -- src/lib/analysis/__tests__/presentation.test.ts`

Expected: presentation tests pass.

- [ ] **Step 5: Update the existing compact score area**

Keep the current work-focused layout. The primary number remains the final score. Add two compact rows below it for rule score and AI adjustment, two small status indicators for left/right state, and a timestamp/provisional label near the provider badge. Do not add nested cards or explanatory feature copy. Use existing palette and layout primitives; ensure the longest translated labels wrap without overlapping the price or chart.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analysis/presentation.ts src/lib/analysis/__tests__/presentation.test.ts src/app/page.tsx
git commit -m "feat: show transparent entry score composition"
```

---

### Task 13: Run Full Regression and Build Verification

**Files:**
- Modify only files required by failures found in this task.

- [ ] **Step 1: Run focused analysis tests**

Run:

```bash
npm run test:run -- src/lib/analysis/__tests__/indicators.test.ts src/lib/analysis/__tests__/technicalSignals.test.ts src/lib/analysis/__tests__/candlestickPatterns.test.ts src/lib/analysis/__tests__/patterns.test.ts src/lib/analysis/__tests__/volumeForce.test.ts src/lib/analysis/__tests__/chanlun.test.ts src/lib/analysis/__tests__/evidence.test.ts src/lib/analysis/__tests__/evidenceBuilder.test.ts src/lib/analysis/__tests__/scoring.test.ts src/lib/analysis/__tests__/strategyAdvice.test.ts src/lib/analysis/__tests__/fallbackReport.test.ts src/lib/analysis/__tests__/aiScoreReview.test.ts src/lib/analysis/__tests__/analysisEngine.test.ts
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 2: Run the full test suite**

Run: `npm run test:run`

Expected: all repository tests pass.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run TypeScript checking**

Run: `npx tsc --noEmit`

Expected: exit code 0 with no type errors.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 6: Inspect diff and requirement coverage**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Verify against the design: all catalog families, all approved classic patterns, all approved candlestick patterns, five score dimensions, four strategy outputs, `+/-0.5` AI adjustment, hard-cap enforcement, realtime weekly synchronization, full local report, and transparent UI are present.

- [ ] **Step 7: Commit final regression fixes**

```bash
git add src docs
git commit -m "test: verify swing analysis scoring redesign"
```
