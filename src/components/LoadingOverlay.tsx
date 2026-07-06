"use client";

import React, { useState, useEffect, useRef } from "react";

type EffectiveLanguage = "zh-CN" | "zh-TW" | "en" | "ja";

interface LoadingOverlayProps {
  symbol: string;
  effectiveLang: EffectiveLanguage;
}

const STEPS: { label: Record<EffectiveLanguage, string>; subLabel: Record<EffectiveLanguage, string> }[] = [
  {
    label: {
      "zh-CN": "连接多源行情服务器",
      "zh-TW": "連接多源行情服務器",
      "en": "Connecting to Market Servers",
      "ja": "市場サーバーへの接続"
    },
    subLabel: {
      "zh-CN": "建立安全 WebSocket 与 REST 极速数据通道",
      "zh-TW": "建立安全 WebSocket 與 REST 極速數據通道",
      "en": "Establishing secure WebSocket & REST data tunnels",
      "ja": "セキュアなWebSocketおよびRESTデータチャネルの確立中"
    }
  },
  {
    label: {
      "zh-CN": "下载并清洗 K 线历史数据",
      "zh-TW": "下載並清洗 K 線歷史數據",
      "en": "Downloading & Cleaning K-Line Data",
      "ja": "K線データの取得とクレンジング"
    },
    subLabel: {
      "zh-CN": "拉取 250 日日K及 150 周K数据并排除异常波动",
      "zh-TW": "拉取 250 日日K及 150 周K數據並排除異常波動",
      "en": "Fetching 250 daily & 150 weekly bars and filtering anomalies",
      "ja": "日足250本および週足150本のデータを取得し、異常値を除去"
    }
  },
  {
    label: {
      "zh-CN": "计算多维度量化指标",
      "zh-TW": "計算多維度量化指標",
      "en": "Running Technical Quant Indicators",
      "ja": "テクニカル指標の並行計算"
    },
    subLabel: {
      "zh-CN": "并行矩阵计算 EMA, BOLL, MACD, RSI, KDJ, ATR 序列",
      "zh-TW": "並行矩陣計算 EMA, BOLL, MACD, RSI, KDJ, ATR 序列",
      "en": "Computing multi-period EMA, Bollinger, MACD, RSI, KDJ, ATR matrices",
      "ja": "複数期間のEMA、ボリンジャー、MACD、RSI、KDJ、ATR行列の計算"
    }
  },
  {
    label: {
      "zh-CN": "探测波浪理论与缠论形态",
      "zh-TW": "探測波浪理論與纏論形態",
      "en": "Detecting Elliot Waves & Chanlun Structures",
      "ja": "波動および纏論パターンの検出"
    },
    subLabel: {
      "zh-CN": "识别 1-5 推进浪与 ABC 调整浪，构建缠论分型、笔划及中枢",
      "zh-TW": "識別 1-5 推進浪與 ABC 調整浪，構建纏論分型、筆劃及中樞",
      "en": "Detecting 1-5 Impulse/ABC Correction waves and Chanlun stroke elements",
      "ja": "エリオット推進・修正波のカウントおよび纏論の頂底分型・筆画分析"
    }
  },
  {
    label: {
      "zh-CN": "大模型智能组装报告",
      "zh-TW": "大模型智能組裝報告",
      "en": "Assembling AI Quantitative Report",
      "ja": "AIモデルによるスマートレポート生成"
    },
    subLabel: {
      "zh-CN": "驱动智能 analysis 员模型对客观算力指标执行多因子融合推理",
      "zh-TW": "驅動智能 analysis 員模型對客觀算力指標執行多因子融合推理",
      "en": "Running multi-factor integration reasoning via configured LLM model",
      "ja": "客観的指標をAIプロンプトに注入し、テクニカル分析を自動統合"
    }
  }
];

const FLOATING_SYMBOLS = [
  { text: "EMA", top: "15%", left: "10%", delay: "0s", size: "48px" },
  { text: "MACD", top: "25%", left: "80%", delay: "2s", size: "60px" },
  { text: "BOLL", top: "70%", left: "15%", delay: "4s", size: "54px" },
  { text: "RSI", top: "80%", left: "75%", delay: "1s", size: "46px" },
  { text: "KDJ", top: "45%", left: "85%", delay: "5s", size: "40px" },
  { text: "Wave 5", top: "85%", left: "45%", delay: "3s", size: "64px" },
  { text: "Chanlun", top: "12%", left: "50%", delay: "6s", size: "58px" },
];

const getTerminalLogsForStep = (step: number, symbol: string) => {
  const time = () => `[${new Date().toLocaleTimeString()}]`;
  switch (step) {
    case 0:
      return [
        `${time()} [SYSTEM] Initializing Zenith-Quant Engine v0.3.0...`,
        `${time()} [NET] Connecting to market server cluster...`,
        `${time()} [NET] Establishing WebSocket handshake with remote host...`,
        `${time()} [NET] Connection open. Protocol: secure wss/rest tunnel.`,
        `${time()} [SYSTEM] Core engine startup: loading technical analytics schema.`
      ];
    case 1:
      return [
        `${time()} [DATA] Querying historical quotes database for ${symbol}...`,
        `${time()} [DATA] Downloading historical candles (Daily: 250 bars, Weekly: 150 bars)...`,
        `${time()} [DATA] Data extraction complete. Extracted [Open, High, Low, Close, Volume].`,
        `${time()} [DATA] Running anomaly filter: checking for split adjustments...`,
        `${time()} [DATA] Pre-processing completed: 0 null values, data validation OK.`
      ];
    case 2:
      return [
        `${time()} [QUANT] Spawning parallel indicators computing matrix...`,
        `${time()} [QUANT] - Computing EMA (5, 10, 20, 60) series... OK.`,
        `${time()} [QUANT] - Computing Bollinger Bands (20, 2.0)... Bands generated.`,
        `${time()} [QUANT] - Computing MACD (12, 26, 9) oscillators... DIF/DEA spread resolved.`,
        `${time()} [QUANT] - Computing KDJ (9, 3, 3) stochastic indicators... OK.`,
        `${time()} [QUANT] - Computing RSI (14) & ATR (14) volatility range... Done.`,
        `${time()} [QUANT] All base technical metrics calculated. Memory block allocated.`
      ];
    case 3:
      return [
        `${time()} [ALGO] Activating Elliott Wave Theory pattern matcher...`,
        `${time()} [ALGO] - Swing high/low extrema calculated. Lookback: 120 bars.`,
        `${time()} [ALGO] - Template matching: analyzing 5-wave impulse/3-wave ABC structures.`,
        `${time()} [ALGO] Activating Chanlun Stroke & Segment resolver...`,
        `${time()} [ALGO] - Resolving K-line inclusions: merging swallow-up candles.`,
        `${time()} [ALGO] - Scanning for Ding/Di FenXing pivot points...`,
        `${time()} [ALGO] - Connecting strokes... Alternating high-low sequence resolved.`,
        `${time()} [ALGO] Clustering support & resistance pivots via density estimation...`,
        `${time()} [ALGO] - Support zones identified. POC chip volume peak mapped.`
      ];
    case 4:
      return [
        `${time()} [AI] Quantitative indicators scoring calculated. Stock score loaded.`,
        `${time()} [AI] Assembling prompt payload... Injecting 64 objective quant metrics.`,
        `${time()} [AI] AI Analyst model dispatched. Waiting for model response...`,
        `${time()} [AI] Synthesizing report: Overview, Strategy, and Technical breakout.`,
        `${time()} [SYSTEM] Analysis complete. Preparing interface rendering.`
      ];
    default:
      return [];
  }
};

export default function LoadingOverlay({ symbol, effectiveLang }: LoadingOverlayProps) {
  const [loadingStep, setLoadingStep] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const pendingLogsRef = useRef<string[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Queue the logs of the newly reached step for progressive printing
  useEffect(() => {
    const stepLogs = getTerminalLogsForStep(loadingStep, symbol);
    pendingLogsRef.current = [...pendingLogsRef.current, ...stepLogs];
  }, [loadingStep, symbol]);

  // Drive the stepper & terminal log printing while mounted
  useEffect(() => {
    const stepInterval = setInterval(() => {
      setLoadingStep((prev) => (prev < 4 ? prev + 1 : prev));
    }, 800);

    const logInterval = setInterval(() => {
      if (pendingLogsRef.current.length > 0) {
        const next = pendingLogsRef.current[0];
        pendingLogsRef.current = pendingLogsRef.current.slice(1);
        setTerminalLogs((prev) => [...prev, next]);
      }
    }, 120);

    return () => {
      clearInterval(stepInterval);
      clearInterval(logInterval);
    };
  }, []);

  // Scroll terminal to bottom when new logs print
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  return (
    <div style={styles.loadingContainer}>
      <style>{`
        @keyframes border-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes floating-bg {
          0% { transform: translateY(0px) rotate(0deg); opacity: 0.015; }
          50% { transform: translateY(-30px) rotate(180deg); opacity: 0.05; }
          100% { transform: translateY(0px) rotate(360deg); opacity: 0.015; }
        }
        @keyframes spin-clockwise {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spin-counterclockwise {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes pulse-badge {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; filter: drop-shadow(0 0 4px #2962ff); }
        }
        .feature-card {
          background: linear-gradient(135deg, rgba(23, 27, 38, 0.75) 0%, rgba(15, 18, 26, 0.9) 100%) !important;
          border: 1px solid rgba(255, 255, 255, 0.06) !important;
          backdrop-filter: blur(16px);
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .feature-card:hover {
          transform: translateY(-6px);
          border-color: rgba(41, 98, 255, 0.6) !important;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 25px rgba(41, 98, 255, 0.25) !important;
        }
        .quick-badge-btn {
          transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
          position: relative;
          overflow: hidden;
        }
        .quick-badge-btn:hover {
          transform: translateY(-2px) scale(1.03);
          background-color: #1a52f5 !important;
          box-shadow: 0 6px 20px rgba(41, 98, 255, 0.45) !important;
        }
        .quick-badge-btn::after {
          content: '';
          position: absolute;
          top: -50%;
          left: -60%;
          width: 20%;
          height: 200%;
          background: rgba(255,255,255,0.13);
          transform: rotate(30deg);
          transition: none;
        }
        .quick-badge-btn:hover::after {
          left: 150%;
          transition: all 0.6s ease-in-out;
        }
        .guide-step-card {
          transition: border-color 0.2s;
        }
        .guide-step-card:hover {
          border-color: rgba(41, 98, 255, 0.3) !important;
        }
        .glow-border-container {
          background: linear-gradient(90deg, #2962ff, #089981, #fbbf24, #2962ff);
          background-size: 300% 300%;
          animation: border-flow 4s ease infinite;
          padding: 1.5px;
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(41, 98, 255, 0.1);
        }
      `}</style>

      {FLOATING_SYMBOLS.map((op, idx) => (
        <div
          key={idx}
          style={{
            position: "absolute",
            top: op.top,
            left: op.left,
            fontSize: op.size,
            fontWeight: "bold",
            color: "rgba(41, 98, 255, 0.06)",
            fontFamily: "monospace",
            userSelect: "none",
            pointerEvents: "none",
            animation: `floating-bg 12s ease-in-out infinite`,
            animationDelay: op.delay,
            zIndex: 1,
          }}
        >
          {op.text}
        </div>
      ))}

      <div className="glow-border-container" style={{ zIndex: 2 }}>
        <div style={{
          background: "linear-gradient(135deg, #1c2030 0%, #131722 100%)",
          borderRadius: "11px",
          padding: "24px 28px",
          width: "780px",
          maxHeight: "82vh",
          boxSizing: "border-box",
          display: "flex",
          gap: "24px",
          backdropFilter: "blur(20px)",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ width: "320px", display: "flex", flexDirection: "column", gap: "16px", borderRight: "1px solid #2a2e39", paddingRight: "20px" }}>
            <div style={styles.loadingHeader}>
              <div style={styles.techLoaderWrapper}>
                <div style={styles.outerRing}></div>
                <div style={styles.innerRing}></div>
                <div style={styles.centerDot}></div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={styles.loadingTitle}>
                  {effectiveLang === "zh-CN" && `正在实时分析 ${symbol}`}
                  {effectiveLang === "zh-TW" && `正在實時分析 ${symbol}`}
                  {effectiveLang === "en" && `Analyzing ${symbol} in real-time`}
                  {effectiveLang === "ja" && `${symbol} をリアルタイム分析中`}
                </span>
                <span style={{ fontSize: "11px", color: "#787b86" }}>
                  {effectiveLang === "zh-CN" && "深度量化分析计算引擎启动中..."}
                  {effectiveLang === "zh-TW" && "深度量化分析計算引擎啟動中..."}
                  {effectiveLang === "en" && "Initializing multi-period quant engine..."}
                  {effectiveLang === "ja" && "複数ファクターのクオンツエンジンを初期化中..."}
                </span>
              </div>
            </div>

            <div style={{ ...styles.stepperContainer, gap: "12px" }}>
              {STEPS.map((step, idx) => {
                const isCompleted = loadingStep > idx;
                const isCurrent = loadingStep === idx;
                const isPending = loadingStep < idx;

                return (
                  <div key={idx} style={{
                    ...styles.stepItem,
                    opacity: isPending ? 0.35 : 1,
                    transform: isCurrent ? "scale(1.015)" : "scale(1)",
                    transition: "all 0.3s ease",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      ...styles.stepIcon,
                      ...(isCompleted ? styles.stepIconCompleted : {}),
                      ...(isCurrent ? styles.stepIconCurrent : {}),
                    }}>
                      {isCompleted ? "✓" : isCurrent ? "●" : ""}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                      <div style={{
                        ...styles.stepLabel,
                        color: isCompleted ? "#089981" : isCurrent ? "#ffffff" : "#787b86",
                        fontWeight: isCurrent ? "bold" : "normal",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}>
                        {step.label[effectiveLang] || step.label["zh-CN"]}
                        {isCurrent && (
                          <span style={styles.runningBadge}>
                            {effectiveLang === "zh-CN" && "计算中..."}
                            {effectiveLang === "zh-TW" && "計算中..."}
                            {effectiveLang === "en" && "ACTIVE"}
                            {effectiveLang === "ja" && "処理中..."}
                          </span>
                        )}
                      </div>
                      {(isCurrent || isCompleted) && (
                        <div style={{
                          fontSize: "12px",
                          color: isCurrent ? "#2962ff" : "#5d606b",
                          marginTop: "4px",
                          transition: "all 0.3s ease",
                        }}>
                          {step.subLabel[effectiveLang] || step.subLabel["zh-CN"]}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: "220px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid #2a2e39", paddingBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#089981", boxShadow: "0 0 6px #089981" }}></span>
                <span style={{ fontSize: "11px", fontWeight: "bold", color: "#089981", letterSpacing: "1px", fontFamily: "monospace" }}>QUANT ANALYSIS TERMINAL</span>
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#f23645", opacity: 0.8 }}></span>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#fbbf24", opacity: 0.8 }}></span>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: "#089981", opacity: 0.8 }}></span>
              </div>
            </div>

            <div
              ref={terminalRef}
              style={{
                flex: 1,
                backgroundColor: "#0d0f14",
                border: "1px solid #2a2e39",
                borderRadius: "6px",
                padding: "12px",
                fontFamily: "'Courier New', Monaco, Consolas, monospace",
                fontSize: "11px",
                color: "#39ff14",
                overflowY: "auto",
                lineHeight: "1.6",
                boxShadow: "inset 0 0 15px rgba(0, 0, 0, 0.85)",
                position: "relative",
              }}
            >
              <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "100%",
                background: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
                backgroundSize: "100% 4px, 6px 100%",
                pointerEvents: "none",
                zIndex: 3,
              }}></div>

              <div style={{ zIndex: 4, position: "relative" }}>
                {terminalLogs.map((log, i) => (
                  <div key={i} style={{ whiteSpace: "pre-wrap", borderBottom: "1px solid rgba(57, 255, 20, 0.03)", paddingBottom: "2px" }}>
                    {log}
                  </div>
                ))}
                <span style={{ display: "inline-block", width: "8px", height: "12px", backgroundColor: "#39ff14", animation: "pulse-glow 1s step-end infinite", marginLeft: "4px", verticalAlign: "middle" }}></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#131722",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  loadingHeader: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    borderBottom: "1px solid #2a2e39",
    paddingBottom: "20px",
  },
  techLoaderWrapper: {
    position: "relative",
    width: "60px",
    height: "60px",
    flexShrink: 0,
  },
  outerRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: "50%",
    border: "2.5px solid transparent",
    borderTop: "2.5px solid #2962ff",
    borderLeft: "2.5px solid #2962ff",
    animation: "spin-clockwise 1.5s linear infinite",
  },
  innerRing: {
    position: "absolute",
    top: "7px",
    left: "7px",
    right: "7px",
    bottom: "7px",
    borderRadius: "50%",
    border: "2px solid transparent",
    borderBottom: "2px solid #089981",
    borderRight: "2px solid #089981",
    animation: "spin-counterclockwise 1.2s linear infinite",
  },
  centerDot: {
    position: "absolute",
    top: "22px",
    left: "22px",
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    backgroundColor: "#2962ff",
    boxShadow: "0 0 12px #2962ff",
    animation: "pulse-glow 1.5s ease-in-out infinite",
  },
  loadingTitle: {
    fontSize: "17px",
    fontWeight: "bold",
    color: "#ffffff",
    letterSpacing: "0.5px",
  },
  stepperContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  stepItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: "16px",
  },
  stepIcon: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "2px solid #363c4e",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
    fontWeight: "bold",
    color: "#787b86",
    flexShrink: 0,
    marginTop: "2px",
  },
  stepIconCompleted: {
    backgroundColor: "#089981",
    border: "2px solid #089981",
    color: "#ffffff",
  },
  stepIconCurrent: {
    backgroundColor: "#2962ff",
    border: "2px solid #2962ff",
    color: "#ffffff",
    boxShadow: "0 0 10px rgba(41, 98, 255, 0.6)",
  },
  stepLabel: {
    fontSize: "14px",
    lineHeight: "1.4",
  },
  runningBadge: {
    fontSize: "10px",
    color: "#ffffff",
    backgroundColor: "#2962ff",
    padding: "1px 6px",
    borderRadius: "4px",
    fontWeight: "bold",
    animation: "pulse-badge 1.5s ease-in-out infinite",
    letterSpacing: "0.5px",
  },
};
