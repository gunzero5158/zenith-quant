# Changelog

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
