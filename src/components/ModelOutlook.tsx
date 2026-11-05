import type { EntryScorePresentation, JevScorePresentation } from "@/lib/analysis/presentation";

export default function ModelOutlook({ score, jev, language }: {
  score: EntryScorePresentation;
  jev?: JevScorePresentation | null;
  language: string;
}) {
  const label = language === "en" ? "AI outlook" : language === "ja" ? "AI予測" : "AI预估";
  const note = language === "en" ? "Model certainty (not win rate)" : language === "ja" ? "モデル確信度（勝率ではない）" : "模型确定度（非胜率）";
  const distributionLabel = language === "en" ? "Model direction distribution" : language === "ja" ? "モデルの方向分布" : "模型方向分布";
  return (
    <div className="model-outlook">
      <p><span>{[label, score.opportunity?.horizon].filter(Boolean).join(" · ")} · </span><strong>{score.outlookText ?? "—"}</strong></p>
      {jev ? <p className="decision-secondary">{distributionLabel}：{jev.outlook.map(part => `${part.label} ${part.percent}%`).join(" · ")}</p>
        : null}
      {!jev && score.confidenceText ? <p className="decision-secondary">{note} {score.confidenceText}</p> : null}
      {jev?.conflictText && <p className="decision-secondary">{jev.conflictLabel} {jev.conflictText}</p>}
    </div>
  );
}
