# Changelog

## 0.6.0 - 2026-09-22

### Added
- Jev Decision analysis mode: TypeSafe's Jev decision model reads every evidence item, decides outlook and setup stage, then scores the entry and picks a stop and target from the supplied levels, all with calibrated probabilities; the LLM only writes the report around those immutable decisions. Score panel shows a bullish/neutral/bearish probability bar, the setup stage, and the bullish-versus-bearish split of the readings.
- Track-record panel: every analysis logs its conclusion plus a free rules-only baseline, and outcomes are checked against the price 5, 10, and 20 trading bars later (outlook hit rate, average change after bullish/bearish calls, score-bucket performance, target-first vs stop-first, Jev probability calibration). Records live in the browser with JSON export/import and carry a per-track logic version.
- Jev API key, URL, and model fields in Settings.

### Changed
- Analysis modes renamed to Rules + LLM, LLM Native, and Jev Decision.
- Both AI modes receive evidence facts without the rule engine's bullish/bearish tags, decide a single coherent setup stage instead of separate left/right statuses, and never issue an actionable entry under a bearish outlook.
- Classical pattern names and descriptions are emitted in English; chart markers are localized per UI language.
- `generateLLMReport` accepts an optional system prompt.

### Fixed
- Left side could remain "watch" while the right side was "triggered" in AI modes.
- English pattern names such as "Double top" appeared in the Chinese chart.

## 0.5.4 - 2026-07-06

### Fixed
- Separated A-share realtime quotes from historical daily K-line data, so current price and change percent no longer fall back to the previous trading day's close when daily candles lag.
- Added EastMoney realtime quotes for A-shares, and merged intraday quote data into the latest daily candle before indicators and scoring are calculated.
- Prevented A-share realtime analysis and quote responses from being held by longer-lived technical or quote caches.
- Fixed EastMoney K-line requests by restoring the explicit historical date range required by the API.
- Added Tonghuashun market data fallback for A-share, Hong Kong, and US symbols, including current-day candle merging and quote change calculation.
- Removed Sina Finance from the runtime fallback chain so analyses no longer degrade to Sina data.

## 0.5.3 - 2026-07-02

### Changed
- Renamed the score display to "买点魅力分" and reworked the scoring model around buy-entry odds, reward/risk, trend setup, support/resistance, VPVR, Fibonacci, ChanLun, and classical-pattern context.
- Tuned AI prompt scoring semantics so model-generated reports evaluate entry attractiveness instead of recent trading heat.

### Fixed
- Hardened US and Hong Kong market data loading: EastMoney now uses market-code candidates, node retries, bounded K-line windows, and a Node HTTPS request path for more reliable server-side access.
- Added Tencent Finance as a final real-data fallback for quotes and K-line analysis when Yahoo, EastMoney, optional providers, and other primary sources are unavailable.
- Prevented last-resort Tencent fallback data from occupying the primary analysis cache, so primary providers are retried on later requests.
- Reduced quote and analysis performance pressure by avoiding uncancelled timeout races, serializing quote fetches, and limiting EastMoney candles to the recent analysis window instead of full history.

## 0.5.2 - 2026-06-25

### Added
- Added Ichimoku Cloud calculation and VPVR value-area context to the technical analysis pipeline.
- Added detection for additional classical structures: bull flag, bear flag, rectangle/range, triangle pennant, triple bottom/top, double top, and rising/falling wedges.
- Added chart overlays for Fibonacci levels, VPVR value-area boundaries, major VPVR nodes, and active classical pattern markers.

### Changed
- Expanded the AI analyst prompt back to a full report format while keeping the new Fibonacci, VPVR, Ichimoku, ATR, and pattern context.
- Reworked the scoring model so higher scores represent stronger current buy/accumulate attractiveness, with explicit reward/risk, ATR distance, support/resistance, and VPVR positioning checks.
- Local fallback reports now include the added Fibonacci, VPVR, ATR, Ichimoku, and actionable pattern context.

### Fixed
- Prevented mock/demo market data from being cached as if it were real analysis data.
- Skipped LLM generation when only mock/demo candles are available, avoiding API use on simulated market data.
- Restored company-name display fallbacks when a real data provider or display-name endpoint fails.
- Ignored local Codex dev-server logs so they are not committed.

## 0.5.1 - 2026-06-16

### Fixed
- Restored the stock search autocomplete boundary: Yahoo Finance remains the primary source, and fallback providers are only used when Yahoo search is unavailable.
- Prevented stale autocomplete requests from overwriting newer input results in the search box.
- Fixed Japanese stock fallback data loading through Kabutan for quotes and full technical analysis.
- Fixed market-specific currency symbols so A-share, Hong Kong, Japanese, and US prices are no longer all displayed as USD.
- Reworked the fallback scoring model so higher scores better represent stronger buy attractiveness instead of simply rewarding hot trading activity.
- Hardened LLM report handling and local fallback report generation so API failures degrade cleanly.

### Added
- Optional Twelve Data and FMP fallback providers for quote, historical candle, and search suggestion data.
- Kabutan daily data parser for Japanese stocks, including quote and K-line fallback support.
- Market currency helper utilities and tests.
- Search API regression tests to ensure Yahoo results are not overridden when Yahoo is available.
- Provider fallback tests covering missing API keys, Twelve Data parsing, and FMP fallback behavior.
- Local dev log files in `.gitignore`.

### Changed
- Data source fallback order is now more explicit:
  - Search: Yahoo -> Twelve Data/FMP -> EastMoney -> static common suggestions.
  - Quotes: Kabutan/EastMoney -> Yahoo -> Twelve Data/FMP -> mock data.
  - Analysis candles: Yahoo -> Yahoo Chart -> Kabutan -> EastMoney -> Sina -> Twelve Data/FMP -> mock data.
- Analysis result badges now display Twelve Data and FMP when those optional providers are used.

### Notes
- Twelve Data and FMP are optional. Configure `TWELVE_DATA_API_KEY` or `FMP_API_KEY` on the server to enable them.
- EastMoney has useful US, Hong Kong, and A-share coverage, but it is not a full Yahoo search replacement, especially for pinyin and Japanese stock discovery.
