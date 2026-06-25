# Changelog

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
