# Rooftop Quant

[English](./README.md) | [简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Rooftop Quant (天台分析 / 屋上クオンツ) is a self-hosted technical-analysis workspace for US, Hong Kong, mainland China A-share, and Japanese stocks. It combines multi-timeframe market data, deterministic indicator preprocessing, interactive charts, and AI-native market judgment in one dashboard.

AI analysis is based on public market data and standard technical indicators. It is not investment advice or trading guidance. Markets involve risk; decide independently and at your own risk.

## AI-Native Decision Flow

This experimental branch deliberately does not calculate a local score for the model to review.

1. The local engine normalizes daily and weekly candles and calculates objective indicator values, events, data-quality status, and candidate trade levels.
2. The configured AI is the sole decision-maker for market outlook, the 0-5 entry-attractiveness score, confidence, setup state, and holder/entry/exit advice. There are no fixed weights, local score caps, or `+/-0.5` adjustment limits.
3. The server validates the answer without replacing the AI's judgment. Evidence references must exist, strategy fields must agree with the selected setup, and actionable entries must use a coherent stop and target from supplied levels.
4. Reward/risk and stop distance are derived by the server from the AI-selected prices, preventing arithmetic inconsistencies.

Confidence means certainty in the conclusion, not bullishness. The model is instructed to consider data completeness, independent evidence agreement, timeframe conflict, provisional candles, and proximity to confirmation or invalidation, and to explain its confidence.

## Analysis Coverage

- Trend and volatility: EMA, Bollinger Bands, Ichimoku Cloud, ATR, daily/weekly context.
- Momentum: MACD, KDJ, RSI, recent crosses, thresholds, and divergences.
- Volume and capital flow: relative volume, OBV, CMF, and price-volume confirmation.
- Price location: horizontal levels, Fibonacci, VPVR, dynamic levels, and pattern levels.
- Structures: classical chart patterns, contextual candlesticks, TD Sequential, Elliott Wave heuristics, and Chanlun context.
- Decision output: bullish/neutral/bearish outlook, AI score and confidence, left/right setup state, four-part strategy advice, stop, target, and derived reward/risk.

The AI receives calculated values and event timing but is told not to recalculate indicators or introduce news, fundamentals, unseen prices, or outside facts. Simulated candles are never sent to the AI as if they were live data.

## Markets and Data

| Market | Examples |
| --- | --- |
| United States | `AAPL`, `MSFT` |
| Hong Kong | `0700.HK`, `9988.HK` |
| Mainland China A-share | `600519.SS`, `000001.SZ` |
| Japan | `7203.T`, `9984.T` |

Provider availability depends on symbol, market, network, and upstream services. The application uses market-aware fallback paths across Yahoo Finance, EastMoney, Tonghuashun, Kabutan, Tencent, and optional Twelve Data/FMP integrations. Analysis history uses market-session-aware freshness and does not treat mock data as proof of a live result.

## Getting Started

Requirements: Node.js 20.9 or newer and npm.

```bash
git clone https://github.com/gunzero5158/zenith-quant.git
cd zenith-quant
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Configure an AI provider, model, and API key in **AI Settings** before running analysis. Supported UI choices are Google Gemini, OpenAI, Anthropic, and OpenAI-compatible custom endpoints.

Optional market-data providers can be enabled in `.env.local`:

```env
TWELVE_DATA_API_KEY=your_key
FMP_API_KEY=your_key
```

Private custom AI hosts are blocked by default. A self-hosted deployment can explicitly allow them with `ZENITH_ALLOW_PRIVATE_LLM_HOSTS=true`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run test:run` | Run the test suite once |

## Privacy and Limitations

- Analysis history, cached reports, display preferences, and AI settings are stored in browser storage or cookies.
- AI credentials are forwarded through this application's server route to the selected provider and are not intentionally persisted on the server.
- Market data and AI output may be delayed, incomplete, unavailable, or incorrect.
- Technical indicators, patterns, scores, and generated reports are decision-support tools, not forecasts or execution instructions.

Licensed under the [MIT License](./LICENSE).
