# Rooftop Quant

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Rooftop Quant (Chinese name **天台分析**, Japanese name **屋上クオンツ**) is a self-hostable stock technical-analysis workbench for US, Hong Kong, China A-share, and Japanese equities. It turns multi-timeframe market data, dozens of indicators, and pattern detection into one structured evidence snapshot, then reaches a conclusion in one of three switchable ways: local rule scoring, an independent large-language-model judgment, or a decision made by Jev, a dedicated decision model. Every conclusion is logged and later compared with the actual price, so which approach deserves trust is answered by its track record rather than by guesswork.

This tool provides analytical reference based on public market data, common technical indicators, and AI output. It is not investment advice. Markets carry risk; make your own decisions and bear the results yourself.

## Recent updates (September 2026)

- **Third analysis mode: Jev Decision.** [Jev](https://docs.typesafe.ai) (TypeSafe's System One decision model) answers typed questions about the evidence with calibrated probabilities; the LLM only writes the report around those decisions. The score panel shows a bullish / neutral / bearish probability bar, the current setup stage, and how split the evidence is.
- **Track record panel.** Every analysis is logged automatically and compared with the price 5, 10, and 20 trading days on. Four tracks (rules only, Rules + LLM, LLM Native, Jev) are summarized by outlook hit rate, average change after bullish and bearish calls, performance by score bucket, target-first versus stop-first for recommended entries, and whether Jev's probabilities are calibrated.
- **AI sees facts, not rule opinions.** The rule engine's bullish / bearish tag on each evidence item is withheld from both AI modes; the model receives state, description, and values and reads them itself.
- **Left and right status are one judgment.** Both AI modes now decide a single setup stage (left developing, right executable, extended, ...) that maps to a coherent left / right pair, so "right confirmed while left is still watching" can no longer occur. No actionable entry is issued under a bearish outlook.
- **Modes renamed** to Rules + LLM, LLM Native, and Jev Decision.
- Classical pattern names and descriptions are now English data; chart markers are shown in the UI language.

## How an analysis works

The first half is the same in every mode and costs nothing in AI fees:

1. Fetch daily and weekly candles and merge a live quote where the market supports it.
2. Compute every indicator locally: EMA, Bollinger Bands, Ichimoku, MACD, KDJ, RSI, ATR, volume, OBV, CMF, VPVR, support / resistance, Fibonacci, 18 classical patterns, 24 candlestick patterns, TD Sequential, Elliott Wave, and Chanlun.
3. Assemble an **evidence snapshot**: each item carries a state, a description, how many bars ago it fired, and whether its bar has closed, plus a set of candidate support and resistance levels.

The mode decides who draws the conclusion. All three share the snapshot and keep separate caches; switching modes never reuses another mode's conclusion.

### Rules + LLM (default)

The local engine scores 0-5 across five dimensions, evaluates the left-side reversal and right-side confirmation paths separately, and derives a stop and target from the candidate levels. With an LLM configured, the model reviews the conclusion but may only adjust it within ±0.5, and every reason must cite existing evidence.

This mode is stable, explainable, comparable across stocks, and works without any key (via the built-in local report engine). Its judgment comes from hand-written formulas whose weights have not been back-tested.

### LLM Native

The model receives the evidence snapshot and recent candles only: no rule score, score cap, predetermined regime, or rule direction tags. In one request it independently returns the outlook, a 0-5 score, confidence, setup stage, holder / entry / stop advice, and the full report.

The server enforces discipline: stops and targets must come from the candidate levels; an actionable entry without a complete stop-target pair, or under a bearish outlook, is downgraded to waiting; the left side cannot still be watching once the right side is confirmed. These corrections change states, never the model's score.

### Jev Decision

Jev produces no text. It answers three kinds of question: a choice (probability per option), a yes / no (probability of yes), and a score (level plus confidence). It is tens of times faster and hundreds of times cheaper than an LLM, its output is fixed in shape, and it cannot fabricate. In exchange it cannot do arithmetic, gives no rationale, and is less accurate in languages other than English.

The mode is built around those traits as three dependent calls, each seeing the previous conclusions:

1. **Read every signal.** For each evidence item: does this signal imply bullish, neutral, or bearish for the next 5-20 trading days? The material is facts only: state, English description, bars since the signal. Distances from price to each level are pre-computed in code as "extremely close / close / moderate / far"; raw indicator values are not sent.
2. **Outlook and stage.** Probabilities for bullish / neutral / bearish, and which of nine setup stages applies now.
3. **Score and plan.** A 0-5 entry score, holder action, stop trigger, and one stop and one target chosen from the candidate levels.

Code handles what Jev cannot: it measures the bullish-versus-bearish split from the per-signal readings weighted by probability; it checks the reward-to-risk of the chosen stop and target and downgrades an executable plan below 1.2 to watching; it keeps no actionable entry under a bearish outlook. The LLM then does one job: explain the immutable decisions. The technical report ends with Jev's signal-by-signal readings.

This mode needs both a Jev API key and an LLM. Jev is currently supported through TypeSafe's official endpoint only.

### The three modes side by side

| | Rules + LLM | LLM Native | Jev Decision |
| --- | --- | --- | --- |
| Who decides | Local rules; AI adjusts ±0.5 | The LLM | Jev |
| Who writes the report | LLM (optional) | LLM | LLM |
| Keys needed | None (LLM optional) | LLM | Jev + LLM |
| Source of confidence | — | Self-reported | Calibrated probabilities |
| Same input, same result | Yes | No | Mostly |
| Typical latency | Seconds | Tens of seconds | ~1.5 s for Jev + the report |

None of the three has yet been shown to be more accurate than the others. That is what the next section is for.

## Track record

The clipboard icon at the top right opens the track-record panel. It writes down what each analysis concluded and checks the answer later.

**Logging is automatic.** When an analysis completes, the running mode's conclusion is recorded: outlook, probabilities, score, stage, left / right status, stop, target, and the model used. Whatever mode you use, a free rules-only record is added alongside as the baseline, since the engine computes it on every request anyway. One stock, one mode, one trading day yields one record. Simulated data is never logged.

**Checking is free.** Opening the panel fetches the latest candles and compares each record with the price 5, 10, and 20 trading bars on, without calling any model. A record is final after 20 bars.

**What it reports:**

- Outlook hit rate: bullish requires a gain above 1.5x ATR, bearish a loss beyond 1.5x ATR, neutral a move inside that band.
- Average change after bullish and after bearish calls, against the all-record average. The calls are useful only if the change after bullish clearly exceeds the average.
- Average change for scores ≥ 3.5 versus < 2.5, to see whether the score discriminates.
- Entry plans: target hit first versus stop hit first.
- Jev calibration: of the records where it said "bullish 70%", did about 70% rise?

Records carry a per-track logic version, so results from different logic are never pooled. With fewer than 30 samples the numbers are indicative only. Records live in the browser with JSON export and import; export before switching devices or clearing browser data.

## Features

- Search stocks across four markets and keep analysis history and quote snapshots in the browser.
- Linked price and indicator panes, daily / weekly switch, red-up or green-up coloring, pattern markers in the UI language.
- Left and right scenarios shown as **not formed, watch, intraday provisional, confirmed, too late**.
- Reports in three parts: market overview, strategy, technical detail; Jev mode appends its signal readings.
- With the local fallback on, the rules mode uses the built-in report engine when the LLM fails; the two AI modes fail explicitly and never silently fall back to rule scoring.
- Offline simulated data is clearly flagged and is never sent to any model.
- UI in Simplified Chinese, Traditional Chinese, English, and Japanese.

## Analysis coverage

| Category | Coverage |
| --- | --- |
| Trend and volatility | EMA, Bollinger Bands, Ichimoku, ATR, daily / weekly structure |
| Momentum | MACD, KDJ, RSI, recent crosses and divergences |
| Volume and flow | Volume averages, OBV, CMF, volume confirmation |
| Price location | Horizontal support / resistance, Fibonacci retracements, VPVR value area and major nodes |
| Structure and patterns | 18 classical patterns, 24 location-aware candlestick patterns, TD Sequential |
| Market structure | Elliott Wave heuristics; Chanlun fractals, strokes, and pivots |
| Decision support | Setup stage, invalidation, targets, reward / risk, data-quality score cap |

Classical patterns include double and triple tops / bottoms, head and shoulders (and inverse), cup and handle, rounding tops / bottoms, bull and bear flags, rectangles, symmetric / ascending / descending triangles, pennants, and rising / falling wedges. Patterns are evidence, not standalone trade signals.

## Markets and data

| Market | Examples |
| --- | --- |
| US | `AAPL`, `MSFT` |
| Hong Kong | `0700.HK`, `9988.HK` |
| China A-shares | `600519.SS`, `000001.SZ` |
| Japan | `7203.T`, `9984.T` |

The app falls back across Yahoo Finance, EastMoney, Tonghuashun, Kabutan, Tencent, and optional Twelve Data / FMP depending on the market. Live quotes are merged into the snapshot so price, indicators, and score share the latest bar. Last-resort or simulated data is never cached as primary data.

## Quick start

### Requirements

- Node.js 20.9 or later
- npm

### Install and run

```bash
git clone https://github.com/gunzero5158/zenith-quant.git
cd zenith-quant
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Production: `npm run build && npm run start`.

## Configuration

### Large language model

Open **Model Settings** at the top right and enter the provider (Google Gemini, OpenAI, Anthropic, or any OpenAI-compatible service), model name, API key, optional base URL, and whether to enable the local report fallback.

### Jev decision model

The same dialog has a Jev section: enter an official TypeSafe API key. The URL and model name may be left blank; they default to `https://api.typesafe.ai` and `jev-latest`. Only Jev Decision mode uses it, and that mode also needs the LLM settings above.

All credentials stay in the browser. During an analysis they pass through this app's server route to the chosen upstream and are not persisted server-side. Private and internal hosts are blocked by default; self-hosted setups that need an internal model can opt in:

```env
ZENITH_ALLOW_PRIVATE_LLM_HOSTS=true
```

### Optional data providers

Create `.env.local` to enable extra fallback providers:

```env
TWELVE_DATA_API_KEY=your_key
FMP_API_KEY=your_key
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run the test suite once |

## Privacy and limits

- Analysis history, cached reports, track records, display preferences, and model settings are stored in browser storage or cookies; this deployment has no database.
- Market data and model output come from external services and may be delayed, missing, unavailable, or wrong.
- A demo-mode notice means the current result uses simulated data.
- Jev's probabilities express its confidence in reading the evidence, not the odds that the price rises; its accuracy on stocks has not been independently validated, so use it together with the track record.
- Indicators, patterns, scores, and generated reports are probabilistic decision aids, not price predictions or trade instructions.

## Stack

- Next.js 16 and React 19
- TypeScript
- Lightweight Charts 5
- Tailwind CSS 4
- Vitest

## License

[MIT License](./LICENSE).
