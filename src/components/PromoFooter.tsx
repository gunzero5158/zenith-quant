import { Zap } from "lucide-react";
import type { EffectiveLanguage } from "@/lib/i18n/translations";

interface PromoFooterProps {
  effectiveLang: EffectiveLanguage;
}

const PROMO_COPY: Record<EffectiveLanguage, { prefix: string; suffix: string; cta: string }> = {
  en: {
    prefix: "No API Key yet? Get all-in-one API access at",
    suffix: "— one key for GPT, Claude, Gemini, DeepSeek & more, with quick setup.",
    cta: "Buy API Key & Token",
  },
  ja: {
    prefix: "APIキーをお持ちでないですか？",
    suffix: "— GPT / Claude / Gemini / DeepSeek などのマルチモデルAPIキーとトークンを一撃で購入。",
    cta: "APIトークンを購入",
  },
  "zh-CN": {
    prefix: "还没有 API Key？前往",
    suffix: "一键购买多合一大模型 API 和 Token（支持 GPT / Claude / Gemini / DeepSeek 等主流模型）",
    cta: "购买 API 和 Token",
  },
  "zh-TW": {
    prefix: "還沒有 API Key？前往",
    suffix: "一鍵購買多合一大模型 API 和 Token（支援 GPT / Claude / Gemini / DeepSeek 等主流模型）",
    cta: "購買 API 和 Token",
  },
};

const linkStyle = {
  color: "#5eead4",
  fontWeight: "bold",
  textDecoration: "underline",
} as const;

export default function PromoFooter({ effectiveLang }: PromoFooterProps) {
  const copy = PROMO_COPY[effectiveLang];

  return (
    <div className="apimax-footer" style={{
      backgroundColor: "#111822",
      borderTop: "1px solid #263244",
      padding: "10px 24px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: "16px",
      fontSize: "13.5px",
      color: "#aab6c5",
      zIndex: 99,
      boxShadow: "0 -6px 20px rgba(0, 0, 0, 0.24)",
    }}>
      <Zap size={15} style={{ color: "#fbbf24", fill: "rgba(251,191,36,0.22)", flexShrink: 0 }} />
      <span className="apimax-footer-copy" style={{ flexGrow: 1, textAlign: "center" }}>
        {copy.prefix}{" "}
        <a href="https://apimax.io" target="_blank" rel="noopener noreferrer" style={linkStyle}>
          APIMax.io
        </a>{" "}
        {copy.suffix}
      </span>
      <a
        href="https://apimax.io"
        target="_blank"
        rel="noopener noreferrer"
        className="quick-badge-btn apimax-footer-cta"
        style={{
          backgroundColor: "rgba(45, 212, 191, 0.12)",
          border: "1px solid rgba(45, 212, 191, 0.48)",
          color: "#5eead4",
          padding: "7px 14px",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: "bold",
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
          transition: "background-color 160ms ease, border-color 160ms ease",
        }}
      >
        {copy.cta}
      </a>
    </div>
  );
}
