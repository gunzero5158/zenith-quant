const CANONICAL_EVIDENCE_ID = /`?(?:daily|weekly)\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)+`?/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeUserVisibleAnalysisText(
  value: string,
  evidenceIds: Iterable<string> = []
): string {
  let sanitized = value.replace(CANONICAL_EVIDENCE_ID, "");
  const knownIds = [...new Set(evidenceIds)]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  for (const id of knownIds) {
    sanitized = sanitized.replace(new RegExp(`\`?${escapeRegExp(id)}\`?`, "gu"), "");
  }

  return sanitized
    .replace(/([（(])\s*[,，;；:：]?\s*([）)])/g, "")
    .replace(/([（(])\s*[,，;；:：]\s*/g, "$1")
    .replace(/[ \t]+([,，.。;；:：!！?？、）)])/g, "$1")
    .replace(/([（(])[ \t]+/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
