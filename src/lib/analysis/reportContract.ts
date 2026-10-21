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
If a requested decision cannot be supported by facts, say what is missing and select a consistent waiting scenario; do not invent a rationale.
`;
