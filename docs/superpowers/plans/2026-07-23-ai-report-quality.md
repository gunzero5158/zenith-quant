# AI Report Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore localized, concise, decision-useful AI reports without exposing the raw evidence list or duplicating the entry score.

**Architecture:** Keep the evidence snapshot as the immutable analysis source, strengthen the LLM output contract, and move response composition into a pure tested helper. Keep market-data caching language-neutral while regenerating localized fallback prose per request, and make the browser report cache language-aware.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest

---

### Task 1: Strengthen The Analyst Prompt

**Files:**
- Modify: `src/lib/analysis/analysisPrompt.ts`
- Modify: `src/lib/analysis/__tests__/analysisEngine.test.ts`

- [ ] **Step 1: Write failing prompt-contract tests**

Add assertions that each requested language maps to an explicit target-language instruction and that the prompt requires synthesis, omission of inactive categories, preservation of triggered crosses/divergences/patterns, concrete values, plain-language meaning, and 5-20 day decision impact.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/analysis/__tests__/analysisEngine.test.ts`

Expected: FAIL because the current prompt does not contain the required report-quality contract.

- [ ] **Step 3: Implement the prompt contract**

Add a target-language map and explicit instructions for:

```text
Write every user-visible field in Simplified Chinese / Traditional Chinese / English / Japanese.
Synthesize evidence; do not translate or enumerate the raw evidence list.
Select only meaningful categories, but never omit confirmed or recent trigger events.
For every included category state the fact, its meaning, and its effect on the swing decision.
```

Require a 2-3 paragraph overview and compact Markdown sections in `technicalAnalysis`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/analysis/__tests__/analysisEngine.test.ts`

Expected: PASS.

### Task 2: Compose AI Reports Without Raw Evidence Or Duplicate Score

**Files:**
- Create: `src/lib/analysis/reportComposition.ts`
- Create: `src/lib/analysis/__tests__/reportComposition.test.ts`
- Modify: `src/app/api/analyze/route.ts`

- [ ] **Step 1: Write failing report-composition tests**

Define tests for a pure `composeAiReport` helper. Given complete AI fields, expect the overview and technical report to equal AI prose and exclude local headings and `Verified entry score`. Given missing AI fields, expect localized local-report fallbacks. Expect deterministic strategy text to remain and optional AI commentary to be appended under a localized heading.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/analysis/__tests__/reportComposition.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure composer and use it in the route**

Implement:

```ts
composeAiReport(parsed, localReport, language): {
  overview: nonEmpty(parsed.overview) ?? localReport.overview,
  technicalAnalysis: nonEmpty(parsed.technicalAnalysis) ?? localReport.technicalAnalysis,
  recommendation: localReport.recommendation + localizedOptionalAiCommentary,
}
```

Remove the `verifiedScoreBlock` and stop concatenating `localReport.technicalAnalysis` before successful AI output.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/lib/analysis/__tests__/reportComposition.test.ts`

Expected: PASS.

### Task 3: Localize Fallbacks Per Request And Invalidate Wrong-Language Browser Cache

**Files:**
- Modify: `src/app/api/analyze/route.ts`
- Modify: `src/lib/analysis/analysisCache.ts`
- Modify: `src/lib/analysis/__tests__/analysisCache.test.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write failing cache-language tests**

Add `isAnalysisCacheLanguageCompatible(cachedLanguage, requestedLanguage)` tests that accept exact matches and reject missing or different languages.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/lib/analysis/__tests__/analysisCache.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement request-local fallback generation**

Generate `localReport` from `techData.snapshot`, `techData.entryAssessment`, and `techData.strategyAdvice` after cache retrieval using the current `effectiveLang`. Use that local variable for mock, fallback, and AI-field fallback paths.

- [ ] **Step 4: Implement language-aware browser caching**

Store `language` in `AnalysisCacheEntry`, compute `requestLang` before cache lookup, reject old/different-language entries, and force a refresh when the effective language selector changes.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/analysis/__tests__/analysisCache.test.ts src/lib/analysis/__tests__/reportComposition.test.ts src/lib/analysis/__tests__/analysisEngine.test.ts`

Expected: PASS.

### Task 4: Full Verification And Local Acceptance

**Files:**
- No production files added beyond Tasks 1-3.

- [ ] **Step 1: Run full automated verification**

Run: `npm run test:run`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

Expected: all commands exit 0 with no new errors.

- [ ] **Step 2: Restart the local development server**

Run the Next.js development server on port 3000 as a detached Windows process and poll `http://localhost:3000` until it returns HTTP 200.

- [ ] **Step 3: Verify the local Chinese report path**

Submit a Chinese analysis request with the configured local LLM settings, confirm the response has no `经验证的入场评分`, confirm the technical report does not begin with the local `技术证据` catalog, and confirm generated prose is Chinese and contains readable indicator meaning.

- [ ] **Step 4: Commit the implementation locally**

Stage only the files from Tasks 1-3 and commit with:

```text
fix: restore localized AI analysis quality
```

Do not push GitHub before user acceptance.
