"use client";

import React, { useState } from "react";
import { LLMConfig } from "@/lib/analysis/llmProxy";

type AppLanguage = "auto" | "zh-CN" | "zh-TW" | "en" | "ja";
type EffectiveLanguage = Exclude<AppLanguage, "auto">;

const APP_LANGUAGES: AppLanguage[] = ["auto", "zh-CN", "zh-TW", "en", "ja"];

const isAppLanguage = (value: string): value is AppLanguage => APP_LANGUAGES.includes(value as AppLanguage);

interface SettingsModalProps {
  isOpen: boolean;
  initialConfig: LLMConfig;
  appLanguage: AppLanguage;
  onLanguageChange: (lang: AppLanguage) => void;
  useFallback: boolean;
  onToggleFallback: () => void;
  effectiveLang: EffectiveLanguage;
  t: Record<string, string>;
  onSave: (config: LLMConfig) => void;
  onClose: () => void;
}

export default function SettingsModal({
  isOpen,
  initialConfig,
  appLanguage,
  onLanguageChange,
  useFallback,
  onToggleFallback,
  t,
  onSave,
  onClose,
}: SettingsModalProps) {
  // Form fields live in local state to avoid re-rendering the whole page on
  // every keystroke; the config is committed to the parent only on save.
  const [config, setConfig] = useState<LLMConfig>(initialConfig);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(config);
  };

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={styles.modalTitle}>{t.settingsTitle}</h3>
        <p style={styles.modalSubtitle}>
          {t.settingsSubtitle}
        </p>

        <form onSubmit={handleSubmit} style={styles.modalForm}>
          <div style={styles.formGroup}>
            <label style={styles.label}>{t.providerLabel}</label>
            <select
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              style={styles.select}
            >
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">{t.customEndpointOption}</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t.modelLabel}</label>
            <input
              type="text"
              required
              placeholder="e.g. gemini-1.5-flash, gpt-4o-mini, claude-3-5-sonnet-20241022"
              value={config.modelName}
              onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t.apiKeyLabel}</label>
            <input
              type="password"
              required
              placeholder="API Key"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              {t.baseUrlLabel}
            </label>
            <input
              type="text"
              placeholder="http://..."
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>{t.languageLabel}</label>
            <select
              value={appLanguage}
              onChange={(e) => {
                const newLang = e.target.value;
                if (isAppLanguage(newLang)) {
                  onLanguageChange(newLang);
                }
              }}
              style={styles.select}
            >
              <option value="auto">{t.langAuto}</option>
              <option value="zh-CN">{t.langZhCN}</option>
              <option value="zh-TW">{t.langZhTW}</option>
              <option value="en">{t.langEn}</option>
              <option value="ja">{t.langJa}</option>
            </select>
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "rgba(41, 98, 255, 0.05)",
            border: "1px dashed rgba(41, 98, 255, 0.25)",
            borderRadius: "6px",
            padding: "10px 12px",
            marginTop: "6px"
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", flex: 1, paddingRight: "12px" }}>
              <span style={{ fontSize: "13px", fontWeight: "bold", color: "#ffffff" }}>
                {t.fallbackLabel}
              </span>
              <span style={{ fontSize: "11px", color: "#787b86", lineHeight: "1.4" }}>
                {t.fallbackDesc}
              </span>
            </div>
            <div
              onClick={onToggleFallback}
              style={{
                width: "44px",
                height: "22px",
                borderRadius: "11px",
                backgroundColor: useFallback ? "#2962ff" : "#2a2e39",
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.2s",
                border: "1px solid " + (useFallback ? "#2962ff" : "#363c4e")
              }}
            >
              <div style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                backgroundColor: "#ffffff",
                position: "absolute",
                top: "1px",
                left: useFallback ? "23px" : "2px",
                transition: "left 0.2s",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)"
              }} />
            </div>
          </div>

          <div style={styles.modalActions}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelBtn}
            >
              {t.cancelBtn}
            </button>
            <button type="submit" style={styles.saveBtn}>
              {t.saveBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "#1c2030",
    border: "1px solid #2a2e39",
    borderRadius: "8px",
    width: "480px",
    padding: "24px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  },
  modalTitle: {
    fontSize: "20px",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "8px",
  },
  modalSubtitle: {
    fontSize: "13px",
    color: "#787b86",
    lineHeight: "1.4",
    marginBottom: "16px",
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: "bold",
    color: "#d1d4dc",
  },
  select: {
    backgroundColor: "#2a2e39",
    border: "1px solid #363c4e",
    borderRadius: "4px",
    color: "#ffffff",
    padding: "8px",
    fontSize: "14px",
    outline: "none",
  },
  input: {
    backgroundColor: "#2a2e39",
    border: "1px solid #363c4e",
    borderRadius: "4px",
    color: "#ffffff",
    padding: "8px",
    fontSize: "14px",
    outline: "none",
  },
  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
  cancelBtn: {
    backgroundColor: "#2a2e39",
    border: "none",
    color: "#d1d4dc",
    padding: "8px 16px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
  },
  saveBtn: {
    backgroundColor: "#2962ff",
    border: "none",
    color: "#ffffff",
    padding: "8px 16px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
  },
};
