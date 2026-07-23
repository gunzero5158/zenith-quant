# AI Report Quality Design

## Goal

Restore concise but decision-useful analysis after the unified evidence-engine refactor. The visible report must match the selected or automatically detected language, explain the important technical evidence in plain language, and avoid duplicating score information already shown in the score panel.

## User-Facing Behavior

- The overview states the directional view, trend quality, current price position, main opportunity, and main risk in short readable paragraphs.
- The technical report contains only meaningful indicator and pattern categories. Each included category explains the current state, what it means, and how it affects the 5-20 trading-day decision.
- Confirmed or recently triggered events such as MACD/KDJ crosses, RSI or MACD divergence, breakouts, breakdowns, volume confirmation, and active chart or candlestick patterns must not be omitted.
- Categories with no distinctive or actionable information may be omitted instead of producing repetitive filler.
- The raw local evidence list is never prepended to a successful AI report. It remains an internal fact source and the fallback report when AI generation fails.
- The overview no longer contains a separate "Verified entry score" block. The score panel remains the single display for the rule score, AI adjustment, final score, and left/right setup status.

## Generation Contract

The analyst prompt explicitly names the target language and requires all user-visible prose to use it. It requests JSON with `overview`, `technicalAnalysis`, `strategyCommentary`, and `scoreReview`.

The prompt supplies immutable evidence and prohibits invented data or recalculation. It also requires:

- synthesis instead of translating evidence item by item;
- concrete indicator values, levels, event timing, and evidence meaning where relevant;
- concise omission of inactive categories;
- a structured overview and readable technical sections;
- the existing four strategy perspectives: holder, left entry, right add, and exit/stop;
- a bounded AI score adjustment of at most 0.5 with evidence-backed reasons.

## Report Composition

On successful AI generation:

- `reportOverview` is the AI overview only;
- `reportTechnical` is the AI technical analysis only;
- `reportRecommendation` keeps the deterministic four-part strategy and appends AI commentary only when it adds useful context;
- score validation and the structured API score fields remain unchanged.

If an AI field is missing, the matching localized local-report field is used as a fallback. The API does not combine the full local evidence list with a present AI technical report.

## Language And Cache

The browser cache records the effective report language. A cache entry generated for another language is invalid and must be removed before refetching. Changing the language selector triggers a fresh analysis for the active symbol so report prose and interface labels remain aligned.

The market-data cache can remain symbol-based because candles and calculated evidence are language-neutral. Localized report text must be regenerated from the cached evidence for the current request language.

## Verification

Automated tests will verify:

- the prompt explicitly selects Simplified Chinese, Traditional Chinese, English, or Japanese;
- the prompt requires synthesis, meaningful-category selection, event preservation, and readable interpretation;
- successful AI composition does not prepend the local technical evidence or duplicate the score block;
- missing AI fields still fall back safely;
- analysis cache entries are rejected when their stored language differs from the effective language.

The final verification includes the focused tests, full test suite, lint, type checking, production build, and a local browser check using a Chinese-language analysis request.
