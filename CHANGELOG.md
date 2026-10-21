# Changelog

## 0.8.1 - 2026-10-21

### Fixed
- Remove the remaining local reward/risk veto and synthetic entry verdict from AI decision presentation; retain local thresholds only for rule-only fallback decisions.
- Ask all three AI paths to weigh payoff and uncertainty contextually, explain position sizing, and keep status, actions and prose consistent without a universal 1.2 cutoff.
- Label Jev percentages as model direction distribution rather than an unexplained certainty metric.

### Notes
- Live model wording requires acceptance with configured providers; deterministic checks do not validate forecast accuracy.

## 0.8.0 - 2026-10-21

### Changed
- Isolate local fallback reports from all three AI report paths. Successful reports retain model-authored summaries, strategies and technical discussion without local template substitution.
- Share a fact/condition/horizon consistency contract at generation time. Reject contradictory structured decisions instead of rewriting them; allow one model repair within the original timeout budget.
- Keep rule-score arithmetic in rule+AI mode, but let the AI independently interpret facts and author its strategy. Remove rule-based score caps, entry downgrades and prose replacement from pure LLM and Jev report validation.
- Remove locally injected strategy warnings from AI reports and invalidate old report caches so previously substituted reports are not reused.

### Notes
- Model judgment and prose consistency still require live acceptance; deterministic checks do not prove forecasts correct or exhaustively verify natural-language claims.

## 0.7.3 - 2026-10-16

### Changed
- Compact the opportunity card across all modes: show status once, distinguish current daily/weekly conditions from the AI forecast horizon, and combine certainty with its non-win-rate label.
- Remove empty status badges and redundant separators. Use the declared forecast horizon even when no opportunity is selected.

## 0.7.2 - 2026-10-16

### Changed
- Merge model outlook and certainty into the existing opportunity/trend card in all three modes. Move risk conditions into the strategy area and remove the separate disclosure panel.

### Fixed
- Retain up to fifteen analysis results per mode instead of six results shared across all modes. Recover quota-limited writes by evicting older analysis caches only, and keep recent results in memory when persistent storage is unavailable.
- Use the same market-session cache policy for all modes: ten minutes during trading, completed-session reuse while closed, and refresh at the next open. Remove the extra A-share quote comparison that could unexpectedly trigger another model call.
- Coalesce repeated clicks on an in-progress analysis, isolate history timestamps by mode, and prevent quote-storage failures from breaking analysis completion.

### Validation
- 430 tests cover cache mode isolation, expiry boundaries, session transitions, quota recovery, and blocked storage. Live model calls and browser interaction require separate acceptance.

## 0.7.1 - 2026-10-16

### Fixed
- Evaluate unconfirmed opportunities at their required confirmation price, including reward/risk scoring. Reject paths whose first obstacle or viable entry range lies below confirmation; present their levels as observation candidates rather than executable trades.
- Require rule-mode AI reports to acknowledge the selected status, plan, stop, and target. On mismatch, preserve technical synthesis but use the local summary and actions with a visible explanation. Clarify that oversold potential and nearby support do not authorize an entry or redefine its stop.
- Distinguish missing horizontal support from other support types and clarify that VPVR POC is historical volume concentration, not automatically a target.

### Changed
- Replace the crowded upper-right score box with a full-width responsive decision summary: entry quality, opportunity/trend, and price-reference cards, with separate expandable risk conditions and model details.
- Invalidate earlier cached analyses and derive the loading screen version from package metadata.

### Validation
- 422 tests, lint, and production build passed. Live 688048.SS analysis returned non-mock EastMoney data; model-generated prose still requires live-model acceptance.

## 0.7.0 - 2026-10-16

### Added
- Separate rebound, pullback, and breakout opportunities from current trend strength, with explicit forecast horizons, price confirmation, and frozen entry/stop/target plans.
- Versioned outcome records and paired old/new rule baselines from the same market snapshot. The validation panel groups results by model, market, version, and horizon, and reports simulated execution outcomes with configurable costs and slippage.

### Changed
- Rules + LLM, LLM Native, and Jev Decision now share factual plan boundaries while retaining their respective decision logic. A weak background trend alone no longer rules out a short-horizon rebound opportunity.
- Actionable entries require price confirmation and a usable risk/reward plan. Public entry states and strategy text are reconciled with the selected plan.
- Local reports include opportunity-specific reasoning and localized technical evidence in Chinese, English, and Japanese. Model certainty is not presented as a verified win rate.

### Fixed
- Normalize provider weekly candle dates and avoid treating unfinished or future weekly bars as completed.
- Use opportunity-relevant stops rather than unrelated historical pattern levels, and preserve actual confirmation dates.
- Correct close-based stop simulation around opening gaps and T+1 restrictions; distinguish ambiguous, untriggered, and unverifiable outcomes.
- Invalidate incompatible analysis caches and render fourth-level Markdown headings correctly.

### Validation
- 419 automated tests, ESLint, and the production build passed. Real non-mock market-data requests were exercised across A-share, Hong Kong, US, and Japanese examples.
- Live LLM and Jev calls require user acceptance on the deployed site. Simulated outcomes and model probabilities are not evidence of improved investment returns.

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
