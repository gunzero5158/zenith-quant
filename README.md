# Zenith-Analysis

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Zenith-Analysis is a self-hosted stock technical-analysis workspace for US, Hong Kong, mainland China A-share, and Japanese markets. It combines multi-timeframe market data, deterministic technical evidence, an entry-attractiveness score, interactive charts, and optional LLM-generated reports in one responsive dashboard.

The project is designed for research and education. It does not provide investment advice or guarantee the accuracy or availability of third-party market data.

## What It Does

- Searches stocks across supported markets and keeps a browser-side analysis history with quote snapshots.
- Builds daily and weekly technical-analysis snapshots from real market data when a provider is available.
- Displays synchronized price and indicator panes with daily/weekly switching and regional red-up or green-up color modes.
- Produces a 0-5 entry-attractiveness score from explicit rule-based evidence and data-quality constraints.
- Lets a configured LLM review the evidence and adjust the rule score by at most `+/-0.5`.
- Generates separate overview, strategy, and technical-detail report sections.
- Falls back to a built-in local report when LLM generation fails and fallback is enabled.
- Clearly marks offline demo data when live providers cannot return a usable result.

## Analysis Coverage

| Area | Included analysis |
| --- | --- |
| Trend and volatility | EMA, Bollinger Bands, Ichimoku Cloud, ATR, daily/weekly structure |
| Momentum | MACD, KDJ, RSI, recent crosses and divergences |
| Volume and capital flow | Volume averages, OBV, CMF, volume-price confirmation |
| Price location | Horizontal support/resistance, Fibonacci retracement, VPVR value area and major nodes |
| Structures and patterns | Classical chart patterns, contextual candlestick patterns, TD Sequential |
| Market structure | Elliott Wave heuristics and Chanlun pivots, strokes, and central-zone context |
| Decision support | Entry scenarios, invalidation levels, targets, reward/risk context, data-quality caps |

Detected classical structures include double and triple tops/bottoms, head-and-shoulders formations, cup and handle, rounding structures, flags, rectangles, triangles, pennants, and rising/falling wedges. Pattern output is evidence for analysis, not a trading signal by itself.

## Markets and Data

| Market | Example symbols |
| --- | --- |
| United States | `AAPL`, `MSFT` |
| Hong Kong | `0700.HK`, `9988.HK` |
| Mainland China A-share | `600519.SS`, `000001.SZ` |
| Japan | `7203.T`, `9984.T` |

Market-data availability depends on the symbol, market, network, and upstream service. The application uses market-aware fallback paths across Yahoo Finance, EastMoney, Tonghuashun, Kabutan, Tencent, and optional Twelve Data/FMP integrations. Provider order varies by endpoint and market.

Realtime quotes are merged into analysis snapshots where supported so the displayed current price, change, indicators, and score use a consistent latest candle. Last-resort or simulated data is not cached as primary market data.

## AI Reports and Scoring

The analysis engine first builds an immutable evidence snapshot and calculates a deterministic entry-attractiveness score. The score incorporates trend, momentum, support/resistance, volatility, volume, VPVR, Fibonacci, pattern context, and data quality.

When an LLM is configured, the model receives the structured evidence rather than being asked to invent or recalculate indicators. It may challenge the rule score only within `+/-0.5` and is instructed to cite the supplied evidence. The final report is split into:

- market and setup overview;
- strategy, conditions, and risk controls;
- detailed technical evidence.

Supported UI provider choices are Google Gemini, OpenAI, and Anthropic. An OpenAI-compatible Base URL can also be supplied for compatible services. If no LLM is configured, or an LLM request fails with local fallback enabled, the built-in report engine remains available.

## Getting Started

### Requirements

- Node.js 20.9 or newer
- npm

### Install and Run

```bash
git clone https://github.com/gunzero5158/zenith-quant.git
cd zenith-quant
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production build:

```bash
npm run build
npm run start
```

## Configuration

### LLM

Open **AI Settings** in the application and configure:

- provider;
- model name;
- API key;
- optional API Base URL;
- whether local report fallback is enabled.

The browser stores this configuration locally. During analysis, the credentials are sent to this application's server route and then to the selected upstream LLM endpoint. The application does not intentionally persist LLM credentials on the server.

Private or internal custom LLM hosts are blocked by default. Self-hosted deployments that intentionally use a private endpoint can opt in:

```env
ZENITH_ALLOW_PRIVATE_LLM_HOSTS=true
```

### Optional Market-Data Providers

Create `.env.local` to enable additional fallback providers:

```env
TWELVE_DATA_API_KEY=your_key
FMP_API_KEY=your_key
```

These keys are optional. The application can still use its built-in provider chain without them, subject to upstream availability.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest in watch mode |
| `npm run test:run` | Run the test suite once |

## Privacy and Limitations

- Analysis history, cached reports, display preferences, and LLM settings are stored in browser storage or cookies.
- Market data and AI output come from external services and may be delayed, incomplete, unavailable, or incorrect.
- A demo-mode warning indicates that the current result is based on simulated rather than live market data.
- Local caching reduces repeat requests, but force refresh can request a new analysis.
- Technical indicators, patterns, scores, and generated reports are probabilistic decision-support tools, not forecasts or execution instructions.

## Tech Stack

- Next.js 16 and React 19
- TypeScript
- Lightweight Charts 5
- Tailwind CSS 4
- Vitest

## License

Licensed under the [MIT License](./LICENSE).
