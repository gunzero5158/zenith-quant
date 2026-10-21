import { requestJevDecision, type JevConfig } from "./jevClient";
import { buildJevFollowUpRequest, resolveJevDecision, resolveJevPrimaryDecision, type JevDecisionRequest, type JevReading } from "./jevDecision";

/** Repair semantic conflicts with Jev itself, not with local trading rules. */
export async function requestConsistentJevDecision(request: JevDecisionRequest, readings: JevReading[], config: JevConfig, deadline: number) {
  let feedback: Record<string, unknown> = {};
  const usage = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const primaryResponse = await requestJevDecision({...request.state, ...feedback}, request.primaryQuestions, config, deadline);
    usage.push(primaryResponse.usage);
    let primary;
    try {
      primary = resolveJevPrimaryDecision(primaryResponse.answers, request);
    } catch (error) {
      feedback = {validationFeedback:error instanceof Error ? error.message : "Invalid primary decision", previousAnswers:primaryResponse.answers};
      continue;
    }
    const follow = buildJevFollowUpRequest(request, primary);
    const response = await requestJevDecision({...follow.state, ...feedback}, follow.questions, config, deadline);
    usage.push(response.usage);
    try {
      return {decision: resolveJevDecision(primary, response.answers, request, readings), model: response.model, usage};
    } catch (error) {
      feedback = {validationFeedback: error instanceof Error ? error.message : "Contradictory decision", previousPrimary: primaryResponse.answers, previousAnswers: response.answers};
    }
  }
  throw new Error(`Jev consistency validation failed after one repair: ${feedback.validationFeedback}`);
}
