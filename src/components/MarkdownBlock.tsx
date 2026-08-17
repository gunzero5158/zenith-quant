import React from "react";
import { styles } from "@/app/pageStyles";
import type { EffectiveLanguage } from "@/lib/i18n/translations";

const parseBoldText = (text: string) => {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} style={{ color: "#ffffff" }}>{part}</strong> : part));
};

// Memoized Markdown renderer so the three report blocks are not re-parsed
// on every unrelated re-render of the page.
const MarkdownBlock = React.memo(function MarkdownBlock({ text, effectiveLang }: { text: string; effectiveLang: EffectiveLanguage }) {
  if (!text) return null;

  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, idx) => {
        const cleanLine = line.trim();

        if (cleanLine.startsWith("*(Error:") || cleanLine.startsWith("*(error:")) {
          let rawError = cleanLine;
          if (cleanLine.startsWith("*(Error:")) {
            rawError = cleanLine.replace("*(Error:", "");
          } else {
            rawError = cleanLine.replace("*(error:", "");
          }
          if (rawError.endsWith(")*")) {
            rawError = rawError.substring(0, rawError.length - 2);
          }
          rawError = rawError.trim();

          return (
            <details key={idx} style={{
              margin: "12px 0",
              padding: "10px 14px",
              backgroundColor: "rgba(242, 54, 69, 0.02)",
              border: "1px dashed rgba(242, 54, 69, 0.15)",
              borderRadius: "6px",
              cursor: "pointer",
              width: "100%",
              boxSizing: "border-box"
            }}>
              <summary style={{
                fontSize: "12px",
                color: "#787b86",
                fontWeight: 600,
                userSelect: "none",
                outline: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}>
                <span>🔍</span>
                <span>
                  {effectiveLang === "zh-CN" && "展开查看底层错误日志详情"}
                  {effectiveLang === "zh-TW" && "展開查看底層錯誤日誌詳情"}
                  {effectiveLang === "en" && "Expand to view raw error details"}
                  {effectiveLang === "ja" && "生の技術エラーログを展開して表示"}
                </span>
              </summary>
              <div style={{
                marginTop: "8px",
                padding: "10px",
                backgroundColor: "#0d0f14",
                border: "1px solid #2a2e39",
                borderRadius: "4px",
                overflowX: "auto",
                cursor: "text"
              }}>
                <code style={{
                  fontFamily: "monospace",
                  fontSize: "11px",
                  color: "#f23645",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all"
                }}>
                  {rawError}
                </code>
              </div>
            </details>
          );
        }

        if (cleanLine.startsWith("## ")) {
          return <h2 key={idx} style={styles.mdH2}>{cleanLine.replace("## ", "")}</h2>;
        }
        if (cleanLine.startsWith("### ")) {
          return <h3 key={idx} style={styles.mdH3}>{cleanLine.replace("### ", "")}</h3>;
        }
        if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
          const content = cleanLine.substring(2);
          return (
            <ul key={idx} style={styles.mdUl}>
              <li style={styles.mdLi}>{parseBoldText(content)}</li>
            </ul>
          );
        }
        if (cleanLine === "---") {
          return <hr key={idx} style={styles.mdHr} />;
        }
        if (!cleanLine) {
          return <div key={idx} style={{ height: "8px" }} />;
        }

        return <p key={idx} style={styles.mdP}>{parseBoldText(cleanLine)}</p>;
      })}
    </>
  );
});

export default MarkdownBlock;
