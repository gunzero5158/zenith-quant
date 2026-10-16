import type { EntryScorePresentation, JevScorePresentation } from "@/lib/analysis/presentation";

export default function ModelOutlook({ score, jev, language }: {
  score: EntryScorePresentation;
  jev?: JevScorePresentation | null;
  language: string;
}) {
  const label = language === "en" ? "Model outlook" : language === "ja" ? "モデル見通し" : "模型趋势";
  const note = language === "en" ? "Model certainty, not a win rate" : language === "ja" ? "モデルの確信度・勝率ではありません" : "模型确定度，非交易胜率";
  return (
    <div className="model-outlook">
      <p><span>{label} · </span><strong>{score.outlookText ?? "—"}</strong></p>
      {jev ? <p className="decision-secondary">{jev.outlook.map(part => `${part.label} ${part.percent}%`).join(" · ")}</p>
        : score.confidenceText ? <p className="decision-secondary">{score.confidenceLabel} {score.confidenceText}</p> : null}
      {(jev || score.confidenceText) && <p className="decision-secondary">{note}</p>}
      {jev?.conflictText && <p className="decision-secondary">{jev.conflictLabel} {jev.conflictText}</p>}
    </div>
  );
}
