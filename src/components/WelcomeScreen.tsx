"use client";

import {
  BrainCircuit,
  Check,
  Database,
  ListChecks,
  Search,
  Settings,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { styles } from "@/app/pageStyles";
import type { AnalysisMode } from "@/lib/analysis/analysisMode";
import type { TranslationStrings } from "@/lib/i18n/translations";

interface WelcomeScreenProps {
  analysisMode: AnalysisMode;
  t: TranslationStrings;
  onAnalysisModeChange: (mode: AnalysisMode) => void;
  onSelectSymbol: (symbol: string) => void;
}

const MODE_OPTIONS = [
  {
    mode: "rule-ai" as const,
    icon: ListChecks,
    titleKey: "ruleAiMode",
    summaryKey: "ruleAiSummary",
    pointKeys: ["ruleAiPoint1", "ruleAiPoint2"],
    bestForKey: "ruleAiBestFor",
    accent: "#2dd4bf",
    accentSoft: "rgba(45, 212, 191, 0.10)",
    border: "rgba(45, 212, 191, 0.58)",
  },
  {
    mode: "ai-native" as const,
    icon: BrainCircuit,
    titleKey: "aiNativeMode",
    summaryKey: "aiNativeSummary",
    pointKeys: ["aiNativePoint1", "aiNativePoint2"],
    bestForKey: "aiNativeBestFor",
    accent: "#fbbf24",
    accentSoft: "rgba(251, 191, 36, 0.10)",
    border: "rgba(251, 191, 36, 0.58)",
  },
] as const;

const GUIDE_STEPS = [
  { icon: Settings, titleKey: "guideStep1Title", descKey: "guideStep1Desc" },
  { icon: ListChecks, titleKey: "guideStep2Title", descKey: "guideStep2Desc" },
  { icon: Search, titleKey: "guideStep3Title", descKey: "guideStep3Desc" },
  { icon: TrendingUp, titleKey: "guideStep4Title", descKey: "guideStep4Desc" },
] as const;

const QUICK_SYMBOLS = ["AAPL", "0700.HK", "600519.SS", "9984.T"] as const;

export default function WelcomeScreen({
  analysisMode,
  t,
  onAnalysisModeChange,
  onSelectSymbol,
}: WelcomeScreenProps) {
  return (
    <div className="welcome-container" style={{
      ...styles.welcomeContainer,
      backgroundColor: "#0b1018",
      padding: "32px 20px 40px",
      overflowY: "auto",
    }}>
      <style>{`
        .search-input-glow {
          border: 1px solid rgba(45, 212, 191, 0.45) !important;
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }
        .search-input-glow:focus {
          box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12) !important;
          border-color: #2dd4bf !important;
        }
        .mode-card:hover {
          border-color: rgba(255, 255, 255, 0.24) !important;
          background-color: #151d29 !important;
        }
        .mode-card:focus-visible, .analysis-mode-switch button:focus-visible, .quick-badge-btn:focus-visible {
          outline: 3px solid rgba(255, 255, 255, 0.75);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .search-input-glow, .mode-card { transition: none !important; }
        }
      `}</style>

      <div className="welcome-content" style={styles.welcomeContent}>
        <div className="welcome-hero" style={styles.welcomeHero}>
          <div style={styles.welcomeEyebrow}>{t.welcomeEyebrow}</div>
          <h1 style={styles.welcomeTitle}>{t.welcomeTitle}</h1>
          <p style={styles.welcomeSubtitle}>{t.welcomeIntro}</p>
        </div>

        <section className="welcome-mode-section" style={styles.welcomeModeSection} aria-labelledby="mode-section-title">
          <div className="welcome-section-heading" style={styles.welcomeSectionHeading}>
            <div>
              <h2 id="mode-section-title" style={styles.welcomeSectionTitle}>{t.modeSectionTitle}</h2>
              <p style={styles.welcomeSectionSubtitle}>{t.modeSectionSubtitle}</p>
            </div>
            <div style={styles.sharedDataBadge}><Database size={15} /> {t.objectiveTitle}</div>
          </div>

          <div className="welcome-mode-grid" style={styles.welcomeModeGrid}>
            {MODE_OPTIONS.map((option) => {
              const selected = analysisMode === option.mode;
              const ModeIcon = option.icon;
              return (
                <button
                  key={option.mode}
                  type="button"
                  className="mode-card"
                  aria-pressed={selected}
                  onClick={() => onAnalysisModeChange(option.mode)}
                  style={{
                    ...styles.welcomeModeCard,
                    backgroundColor: selected ? option.accentSoft : "#111822",
                    borderColor: selected ? option.border : "#263244",
                    boxShadow: selected ? `inset 0 3px 0 ${option.accent}, 0 12px 30px rgba(0,0,0,0.22)` : "none",
                  }}
                >
                  <span style={styles.modeCardTop}>
                    <span style={{ ...styles.modeIcon, color: option.accent, backgroundColor: option.accentSoft }}>
                      <ModeIcon size={23} />
                    </span>
                    <span style={{ ...styles.modeSelectionState, color: selected ? option.accent : "#8b98aa" }}>
                      {selected && <Check size={14} />}
                      {selected ? t.selectedMode : t.selectMode}
                    </span>
                  </span>
                  <strong style={styles.modeTitle}>{t[option.titleKey]}</strong>
                  <span style={styles.modeSummary}>{t[option.summaryKey]}</span>
                  <span style={styles.modePoints}>
                    {option.pointKeys.map((pointKey) => (
                      <span key={pointKey} style={styles.modePoint}>
                        <Check size={14} color={option.accent} /> {t[pointKey]}
                      </span>
                    ))}
                  </span>
                  <span style={{ ...styles.modeBestFor, borderColor: option.border }}>{t[option.bestForKey]}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="welcome-info-grid" style={styles.welcomeInfoGrid}>
          <section style={styles.objectivePanel}>
            <Database size={20} color="#2dd4bf" />
            <div>
              <h2 style={styles.infoPanelTitle}>{t.objectiveTitle}</h2>
              <p style={styles.infoPanelText}>{t.objectiveDesc}</p>
            </div>
          </section>
          <section style={styles.riskPanel} role="note">
            <ShieldAlert size={20} color="#fbbf24" />
            <div>
              <h2 style={styles.infoPanelTitle}>{t.riskNoticeTitle}</h2>
              <p style={styles.infoPanelText}>{t.riskNoticeDesc}</p>
            </div>
          </section>
        </div>

        <section className="welcome-guide" style={styles.welcomeGuide} aria-labelledby="guide-title">
          <div className="guide-heading" style={styles.guideHeading}>
            <h2 id="guide-title" style={styles.welcomeSectionTitle}>{t.guideTitle}</h2>
            <p style={styles.welcomeSectionSubtitle}>{t.guideSubtitle}</p>
          </div>
          <div className="guide-steps" style={styles.guideSteps}>
            {GUIDE_STEPS.map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div className="guide-step" style={styles.guideStep} key={step.titleKey}>
                  <div style={styles.guideStepMarker}>
                    <span style={styles.guideStepNumber}>{index + 1}</span>
                    <StepIcon size={17} color="#5eead4" />
                  </div>
                  <strong style={styles.guideStepTitle}>{t[step.titleKey]}</strong>
                  <p style={styles.guideStepDesc}>{t[step.descKey]}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="welcome-quick-start" style={styles.welcomeQuickStart}>
          <div>
            <h2 style={styles.quickStartTitle}>{t.quickStartTitle}</h2>
            <p style={styles.quickStartDesc}>{t.quickStartDesc}</p>
          </div>
          <div style={styles.quickStartBadges}>
            {QUICK_SYMBOLS.map((symbol) => (
              <button
                key={symbol}
                type="button"
                onClick={() => onSelectSymbol(symbol)}
                className="quick-badge-btn"
                style={styles.quickBadgeBtn}
              >
                {symbol}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
