import type { Candle } from "./indicators";
import type { EvidenceSnapshot } from "./evidence";
import type { EntryAssessment } from "./scoring";
import type { StrategyAdvice } from "./strategyAdvice";
import { buildAiNativeAnalystPrompt } from "./aiNativeAnalysisPrompt";

export interface AnalysisPromptInput {
  snapshot: EvidenceSnapshot;
  entryAssessment: EntryAssessment;
  strategyAdvice: StrategyAdvice;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  language: string;
  currencySymbol: string;
}

export function buildEvidenceAnalystPrompt(input: AnalysisPromptInput): string {
  return buildAiNativeAnalystPrompt(input)
    .replace("There is no prior score, fixed weighting table, local score cap, or predetermined market regime to preserve.",
      "The rule-score reference at the end applies to numerical scoring only. Interpret facts and make the technical decision independently.") + `
MODE: RULE SCORE + AI INTERPRETATION
The numerical score in this mode is a rule baseline plus an evidence-backed adjustment of at most +/-0.5 (bounded by hardCap).
This numerical convention does NOT bind your outlook, opportunity, risk plan or report to the local rule interpretation.
Distinguish rule baseline from your own assessment if they differ; do not claim the baseline represents your independent conviction.
Return the complete analysis JSON above, plus scoreReview:
{"adjustment":0,"confidence":0.7,"alignment":"agree","outlook":"neutral","reasons":[{"evidenceIds":["existing.id"],"text":"reason"}],"conflicts":[],"changeConditions":[]}.
alignment is agree, more_cautious, or more_constructive. scoreReview.outlook must equal scoreAssessment.outlook.
The visible numerical score will be computed from this baseline; all report sections and strategyAdvice must describe YOUR one coherent technical judgment.
No local report or local strategy is supplied or appended.
RULE_SCORE_REFERENCE:
${JSON.stringify({ruleScore: input.entryAssessment.ruleScore, hardCap: input.entryAssessment.hardCap})}`;
}
