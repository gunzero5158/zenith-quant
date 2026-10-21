/** Generation-time contract shared by the three AI report paths, never a local verdict. */
export const REPORT_CONSISTENCY_CONTRACT = `
Before writing, form ONE coherent decision from the supplied technical facts. Then write all sections from that decision.
Separate observed facts, interpretations and conditional scenarios. Quote dates, prices and indicator values accurately; do not invent missing data.
For each conclusion identify the subject (existing holding or new entry), horizon, whether it applies now or after a condition, and invalidation.
A weak weekly trend and a short rebound, or waiting now and buying after confirmation, are NOT contradictions. Explain the different horizons/conditions.
Do not describe a pending condition as already satisfied. Use the same entry, stop, target and stop-trigger convention everywhere for the SAME plan.
The primary scenario, alternative scenario, overview, structured status/actions and technical discussion must agree. Counter-evidence must remain visible.
Check the COMPLETE report for contradictions before returning JSON, including prose versus structured fields. Correct your own decision or explanation, not the supplied facts.
Model confidence is unvalidated certainty, not a trading win rate. Consistency does not guarantee prediction accuracy.
Local fallback reports and local rule thresholds are not an authority over your interpretation. Never copy a fallback report or silently replace your analysis with one.
Do not impose a universal reward/risk cutoff such as 1.2. Assess payoff, uncertainty, evidence quality, nearby obstacles and the forecast horizon together. A confirmed setup with a modest edge may justify a small exploratory position with explicit invalidation, rather than an automatic no-entry verdict. A small position does not itself make a poor opportunity attractive; explain why taking that risk is justified or why waiting is preferable.
Express your actual judgment in natural language, not a canned sentence mapped from a status or score. Keep confirmed/actionable status, entry action and prose aligned: if you recommend a small probe, do not also say no entry is supported for the same scenario; if you recommend waiting, do not label that entry confirmed. Do not infer trading win rate from model confidence or direction probabilities.
If a requested decision cannot be supported by facts, say what is missing and select a consistent waiting scenario; do not invent a rationale.
`;
