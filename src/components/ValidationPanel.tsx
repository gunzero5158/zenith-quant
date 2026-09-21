"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type { EffectiveLanguage } from "@/lib/i18n/translations";
import { validationLabels } from "@/lib/validation/labels";
import { evaluateOutcome, GroupStat, jevCalibration, OutcomeCandle, summarizeTrack } from "@/lib/validation/outcomes";
import {
  isValidationRecord,
  loadValidationRecords,
  mergeValidationRecords,
  saveValidationRecords,
  VALIDATION_HORIZONS,
  ValidationRecord,
  ValidationTrack,
} from "@/lib/validation/records";

interface ValidationPanelProps {
  language: EffectiveLanguage;
  upColor: string;
  downColor: string;
  onClose: () => void;
}

const TRACKS: ValidationTrack[] = ["rule", "rule-ai", "ai-native", "jev-ai"];
const RECENT_LIMIT = 100;
// Outcomes only change when a new daily bar closes, so a recent evaluation is reused.
const REEVALUATE_AFTER_MS = 6 * 60 * 60 * 1000;

function needsEvaluation(record: ValidationRecord, now: number): boolean {
  if (record.outcome?.complete) return false;
  return !record.outcome || now - record.outcome.evaluatedAt > REEVALUATE_AFTER_MS;
}

export default function ValidationPanel({ language, upColor, downColor, onClose }: ValidationPanelProps) {
  const t = validationLabels(language);
  const [records, setRecords] = useState<ValidationRecord[]>(() => loadValidationRecords());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoRefreshedRef = useRef(false);

  const persist = useCallback((next: ValidationRecord[]) => {
    setRecords(next);
    if (!saveValidationRecords(next)) setNotice(validationLabels(language).storageFailed);
  }, [language]);

  const refreshOutcomes = useCallback(async (force: boolean) => {
    const now = Date.now();
    const current = loadValidationRecords();
    const symbols = [...new Set(current.filter((record) => (force ? !record.outcome?.complete : needsEvaluation(record, now))).map((record) => record.symbol))];
    if (symbols.length === 0) return;

    setNotice("");
    setProgress({ done: 0, total: symbols.length });
    const candlesBySymbol = new Map<string, OutcomeCandle[]>();
    let failed = 0;
    for (const [index, symbol] of symbols.entries()) {
      try {
        // The keyless local-rule path returns the daily candles without calling any
        // model. It may serve simulated candles when live data fails; those are skipped below.
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, language, analysisMode: "rule-ai", useFallback: true }),
        });
        const data = await res.json() as { dailyCandles?: OutcomeCandle[]; isMock?: boolean };
        if (res.ok && !data.isMock && Array.isArray(data.dailyCandles)) candlesBySymbol.set(symbol, data.dailyCandles);
        else failed += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: symbols.length });
    }

    // Reload before writing so an analysis logged during the refresh is not overwritten.
    persist(loadValidationRecords().map((record) => {
      const candles = candlesBySymbol.get(record.symbol);
      if (!candles || record.outcome?.complete) return record;
      return { ...record, outcome: evaluateOutcome(record, candles, Date.now()) ?? record.outcome };
    }));
    setProgress(null);
    if (failed > 0) setNotice(validationLabels(language).refreshFailed(failed));
  }, [language, persist]);

  useEffect(() => {
    if (autoRefreshedRef.current) return;
    autoRefreshedRef.current = true;
    void refreshOutcomes(false);
  }, [refreshOutcomes]);

  const stats = useMemo(() => TRACKS.map((track) => summarizeTrack(track, records)), [records]);
  const calibration = useMemo(() => jevCalibration(records), [records]);

  const exportRecords = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(records, null, 1)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `zenith-validation-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRecords = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!Array.isArray(parsed) || !parsed.every(isValidationRecord)) throw new Error("invalid");
      // Existing records win so an import never discards a newer local outcome.
      persist(mergeValidationRecords(parsed, loadValidationRecords()));
      setNotice("");
    } catch {
      setNotice(t.importFailed);
    }
  };

  const clearRecords = () => {
    if (window.confirm(t.clearConfirm)) persist([]);
  };

  const signed = (value: number | undefined) => {
    if (typeof value !== "number") return <span style={styles.muted}>—</span>;
    return <span style={{ color: value > 0 ? upColor : value < 0 ? downColor : "#d1d4dc" }}>{value > 0 ? "+" : ""}{value.toFixed(1)}%</span>;
  };
  const group = (stat: GroupStat) => (
    <>{signed(stat.averageReturnPct)} <span style={styles.muted}>({stat.count})</span></>
  );
  const rate = (value: number | undefined) => (typeof value === "number" ? `${Math.round(value * 100)}%` : "—");

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label={t.title}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h3 style={styles.title}>{t.title}</h3>
          <button type="button" aria-label={t.close} onClick={onClose} style={styles.iconBtn}><X size={18} /></button>
        </div>
        <p style={styles.intro}>{t.intro}</p>

        <div style={styles.toolbar}>
          <button type="button" onClick={() => void refreshOutcomes(true)} disabled={progress !== null || records.length === 0} style={styles.primaryBtn}>
            <RefreshCw size={14} /> {progress ? t.refreshing(progress.done, progress.total) : t.refresh}
          </button>
          <button type="button" onClick={exportRecords} disabled={records.length === 0} style={styles.btn}><Download size={14} /> {t.exportData}</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={styles.btn}><Upload size={14} /> {t.importData}</button>
          <button type="button" onClick={clearRecords} disabled={records.length === 0} style={styles.btn}><Trash2 size={14} /> {t.clear}</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(event) => {
              void importRecords(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
        {notice && <p style={styles.notice}>{notice}</p>}

        {records.length === 0 ? (
          <p style={styles.empty}>{t.empty}</p>
        ) : (
          <>
            <h4 style={styles.sectionTitle}>{t.summaryTitle}</h4>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[t.track, t.records, t.evaluated, t.hitRate, t.allAverage, t.afterBullish, t.afterBearish, t.highScore, t.lowScore, t.plans].map((heading) => (
                      <th key={heading} style={styles.th}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.map((stat) => (
                    <tr key={stat.track}>
                      <td style={styles.tdName}>{t.tracks[stat.track]}</td>
                      <td style={styles.td}>{stat.total}</td>
                      <td style={styles.td}>{stat.evaluated}</td>
                      <td style={styles.td}>{rate(stat.outlookHitRate)} <span style={styles.muted}>({stat.outlookJudged})</span></td>
                      <td style={styles.td}>{group(stat.all)}</td>
                      <td style={styles.td}>{group(stat.byOutlook.bullish)}</td>
                      <td style={styles.td}>{group(stat.byOutlook.bearish)}</td>
                      <td style={styles.td}>{group(stat.byScore.high)}</td>
                      <td style={styles.td}>{group(stat.byScore.low)}</td>
                      <td style={styles.td}>{stat.plan.target + stat.plan.stop > 0 ? t.planValue(stat.plan.target, stat.plan.stop) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.note}>{t.summaryNote} {t.smallSample}</p>

            <h4 style={styles.sectionTitle}>{t.calibrationTitle}</h4>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>{[t.statedBucket, t.samples, t.statedAverage, t.actualUp].map((heading) => <th key={heading} style={styles.th}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {calibration.map((bucket) => (
                    <tr key={bucket.label}>
                      <td style={styles.tdName}>{bucket.label}</td>
                      <td style={styles.td}>{bucket.count}</td>
                      <td style={styles.td}>{rate(bucket.statedProbability)}</td>
                      <td style={styles.td}>{rate(bucket.actualUpRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.note}>{t.calibrationNote}</p>

            <h4 style={styles.sectionTitle}>{t.recentTitle}</h4>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {[t.date, t.stock, t.track, t.outlook, t.score, ...VALIDATION_HORIZONS.map((horizon) => t.days(horizon)), t.plan].map((heading) => (
                      <th key={heading} style={styles.th}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, RECENT_LIMIT).map((record) => (
                    <tr key={record.id}>
                      <td style={styles.td}>{record.barDate}</td>
                      <td style={styles.tdName}>{record.symbol}</td>
                      <td style={styles.td}>{t.tracks[record.track] ?? record.track}</td>
                      <td style={styles.td}>
                        {record.outlook ? t.outlooks[record.outlook] : "—"}
                        {record.outlook && record.outlookProbabilities ? ` ${Math.round(record.outlookProbabilities[record.outlook] * 100)}%` : ""}
                      </td>
                      <td style={styles.td}>{record.score.toFixed(1)}</td>
                      {VALIDATION_HORIZONS.map((horizon) => (
                        <td key={horizon} style={styles.td}>
                          {typeof record.outcome?.returns[horizon] === "number" ? signed(record.outcome.returns[horizon]) : <span style={styles.muted}>{t.pending}</span>}
                        </td>
                      ))}
                      <td style={styles.td}>{record.outcome?.plan ? t.planResults[record.outcome.plan] : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  panel: {
    backgroundColor: "#1c2030", border: "1px solid #2a2e39", borderRadius: "8px",
    width: "1040px", maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 24px)", overflowY: "auto",
    padding: "20px 24px 24px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
  },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" },
  title: { fontSize: "20px", fontWeight: "bold", color: "#ffffff", margin: 0 },
  iconBtn: { background: "none", border: "none", color: "#9aa7b8", cursor: "pointer", padding: "4px", display: "flex" },
  intro: { fontSize: "13px", color: "#9aa7b8", lineHeight: 1.6, margin: "10px 0 14px" },
  toolbar: { display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "10px" },
  btn: {
    display: "flex", alignItems: "center", gap: "6px", backgroundColor: "#2a2e39", border: "1px solid #363c4e",
    color: "#d1d4dc", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "13px",
  },
  primaryBtn: {
    display: "flex", alignItems: "center", gap: "6px", backgroundColor: "#2962ff", border: "1px solid #2962ff",
    color: "#ffffff", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontWeight: "bold",
  },
  notice: { fontSize: "12.5px", color: "#fbbf24", margin: "0 0 10px" },
  empty: { fontSize: "14px", color: "#9aa7b8", padding: "28px 0", textAlign: "center" },
  sectionTitle: { fontSize: "14px", fontWeight: "bold", color: "#ffffff", margin: "18px 0 8px" },
  tableWrap: { overflowX: "auto", border: "1px solid #2a2e39", borderRadius: "6px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px", whiteSpace: "nowrap" },
  th: { textAlign: "left", padding: "8px 10px", color: "#9aa7b8", fontWeight: 600, backgroundColor: "#171b28", borderBottom: "1px solid #2a2e39" },
  td: { padding: "7px 10px", color: "#d1d4dc", borderBottom: "1px solid #232838", fontVariantNumeric: "tabular-nums" },
  tdName: { padding: "7px 10px", color: "#ffffff", fontWeight: 600, borderBottom: "1px solid #232838" },
  muted: { color: "#787b86" },
  note: { fontSize: "12px", color: "#787b86", lineHeight: 1.6, margin: "8px 0 0" },
};
