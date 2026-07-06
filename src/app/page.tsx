"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import dynamic from "next/dynamic";
import { Search, Settings, Star, TrendingUp, TrendingDown, RefreshCw, Trash2, Zap } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import SettingsModal from "@/components/SettingsModal";
import { LLMConfig } from "@/lib/analysis/llmProxy";
import { formatMarketPrice, getMarketCurrencySymbol, normalizeManualSymbolInput } from "@/lib/analysis/market";
import { Candle, IchimokuResult } from "@/lib/analysis/indicators";
import { ScoreDetail } from "@/lib/analysis/scoring";
import { PatternResult } from "@/lib/analysis/patterns";
import { WaveAnalysisResult } from "@/lib/analysis/waveTheory";
import { ChanLunResult } from "@/lib/analysis/chanlun";
import { SupportResistanceResult } from "@/lib/analysis/supportResistance";
import { VolumeAnalysisResult } from "@/lib/analysis/volumeForce";

// Keep lightweight-charts out of the initial bundle
const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

interface SearchSuggestion {
  symbol: string;
  name: string;
  exchDisp: string;
  typeDisp: string;
}

type AppLanguage = "auto" | "zh-CN" | "zh-TW" | "en" | "ja";
type EffectiveLanguage = Exclude<AppLanguage, "auto">;

interface TechnicalIndicators {
  ema5: number[];
  ema10: number[];
  ema20: number[];
  ema60: number[];
  bollUpper: number[];
  bollMiddle: number[];
  bollLower: number[];
  macdDif: number[];
  macdDea: number[];
  macdHist: number[];
  kdjK: number[];
  kdjD: number[];
  kdjJ: number[];
  rsi: number[];
  atr: number[];
  ichimoku: IchimokuResult;
}

interface StockAnalysisData {
  symbol: string;
  companyName: string;
  companyNameEn?: string;
  price: number;
  changePercent: number;
  score: ScoreDetail;
  dailyCandles: Candle[];
  weeklyCandles: Candle[];
  indicators: TechnicalIndicators;
  patterns: PatternResult;
  wave: WaveAnalysisResult;
  chanlun: ChanLunResult;
  sr: SupportResistanceResult;
  volumeAnalysis: VolumeAnalysisResult;
  reportOverview: string;
  reportRecommendation: string;
  reportTechnical: string;
  isLLMUsed: boolean;
  isMock?: boolean;
  dataSource?: "yahoo" | "yahoo-chart" | "eastmoney" | "tonghuashun" | "kabutan" | "tencent" | "twelve-data" | "fmp" | "provider" | "mock";
  currencySymbol?: string;
}

interface AnalysisCacheEntry {
  timestamp: number;
  data: StockAnalysisData;
}

interface WatchQuote {
  price: number;
  change: number;
  isMock?: boolean;
}

interface QuotesResponse {
  quotes?: Record<string, WatchQuote>;
}

interface SearchResponse {
  quotes?: SearchSuggestion[];
}

interface ApiErrorResponse {
  error?: string;
}

const APP_LANGUAGES: AppLanguage[] = ["auto", "zh-CN", "zh-TW", "en", "ja"];

const isAppLanguage = (value: string): value is AppLanguage => APP_LANGUAGES.includes(value as AppLanguage);

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const subscribeMounted = () => () => undefined;
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "zh-CN": {
    title: "Antigravity 天顶分析系统",
    logo: "Antigravity 天顶分析",
    searchPlaceholder: "输入代码或拼音搜索... (e.g. AAPL, 700, 600519)",
    llmSettings: "大模型配置",
    watchlist: "分析历史",
    loading: "正在实时获取并分析 {symbol} 多周期数据，请稍候...",
    scoreLabel: "买点魅力分",
    supportLabel: "支撑位 (近期极值)",
    resistanceLabel: "压力位 (近期极值)",
    pocLabel: "筹码密集峰 (POC)",
    overviewHeader: "🔮 智能分析综述",
    strategyHeader: "💡 交易策略建议",
    technicalHeader: "🔬 各类技术指标与形态分析",
    welcomeTitle: "欢迎使用 Antigravity 天顶分析系统",
    welcomeSubtitle: "在上方搜索框输入全球任意有效的美股、港股、A股或日股代码，或在左侧自选股中点击，即可加载实时技术研报与 K 线图。",
    chartDaily: "日 K 线",
    chartWeekly: "周 K 线",
    chartNotice: "* 图表双图层联动缩放已启用",
    settingsTitle: "⚙️ 自定义大模型分析员配置",
    settingsSubtitle: "在此配置您的 API 密钥以启用智能 AI 研报分析。密钥保存在您的本地浏览器中，绝不会被上传或持久化保存。",
    saveBtn: "保存配置",
    cancelBtn: "取消",
    providerLabel: "提供商 / Provider",
    modelLabel: "模型名称 / Model Name",
    apiKeyLabel: "API Key",
    baseUrlLabel: "API Base URL (中转站必填，通常需以 /v1 结尾)",
    languageLabel: "显示语言 / Language",
    langAuto: "自动检测 / Auto Detect",
    langZhCN: "简体中文 (Simplified Chinese)",
    langZhTW: "繁體中文 (Traditional Chinese)",
    langEn: "English",
    langJa: "日本語 (Japanese)",
    ruleBadge: "内置算法生成",
    llmBadge: "LLM 生成",
    queryFailed: "查询失败",
    queryError: "查询出错",
    loadingText: "加载中...",
    noSupport: "无",
    noResistance: "无",
    customEndpointOption: "Custom Endpoint (apimax等中转站)",
    fallbackLabel: "启用本地非AI指标兜底分析",
    fallbackDesc: "若大模型因额度不足/网络异常等原因生成失败，允许自动降级并启用内置技术指标算法计算评分与报表。"
  },
  "zh-TW": {
    title: "Antigravity 天頂分析系統",
    logo: "Antigravity 天頂分析",
    searchPlaceholder: "輸入代碼或拼音搜尋... (e.g. AAPL, 700, 600519)",
    llmSettings: "大模型配置",
    watchlist: "分析歷史",
    loading: "正在實時獲取並分析 {symbol} 多週期數據，請稍候...",
    scoreLabel: "買點魅力分",
    supportLabel: "支撐位 (近期極值)",
    resistanceLabel: "壓力位 (近期極值)",
    pocLabel: "籌碼密集峰 (POC)",
    overviewHeader: "🔮 智能分析綜述",
    strategyHeader: "💡 交易策略建議",
    technicalHeader: "🔬 各類技術指標與形態分析",
    welcomeTitle: "歡迎使用 Antigravity 天頂分析系統",
    welcomeSubtitle: "在上方搜尋框輸入全球任意有效的美股、港股、A股或日股代碼，或在左側自選股中點擊，即可加載實時技術研報與 K 線圖。",
    chartDaily: "日 K 線",
    chartWeekly: "周 K 線",
    chartNotice: "* 圖表雙圖層連動縮放已啟用",
    settingsTitle: "⚙️ 圖形界面與大模型分析員配置",
    settingsSubtitle: "在此配置您的 API 密鑰以啟用智能 AI 研報分析。密鑰保存在您的本地瀏覽器中，絕不會被上傳或持久化保存。",
    saveBtn: "儲存配置",
    cancelBtn: "取消",
    providerLabel: "提供商 / Provider",
    modelLabel: "模型名稱 / Model Name",
    apiKeyLabel: "API Key",
    baseUrlLabel: "API Base URL (中轉站必填，通常需以 /v1 結尾)",
    languageLabel: "顯示語言 / Language",
    langAuto: "自動檢測 / Auto Detect",
    langZhCN: "简体中文 (Simplified Chinese)",
    langZhTW: "繁體中文 (Traditional Chinese)",
    langEn: "English",
    langJa: "日本語 (Japanese)",
    ruleBadge: "內置算法生成",
    llmBadge: "LLM 生成",
    queryFailed: "查詢失敗",
    queryError: "查詢出錯",
    loadingText: "加載中...",
    noSupport: "無",
    noResistance: "無",
    customEndpointOption: "Custom Endpoint (apimax等中轉站)",
    fallbackLabel: "啟用本地非AI指標兜底分析",
    fallbackDesc: "若大模型因額度不足/網絡異常等原因生成失敗，允許自動降級並啟用內置技術指標算法計算評分與報表。"
  },
  "en": {
    title: "Antigravity ZenithAnalysis Analyzer",
    logo: "Antigravity ZenithAnalysis",
    searchPlaceholder: "Enter ticker to search... (e.g., AAPL, 0700.HK)",
    llmSettings: "LLM Config",
    watchlist: "Analysis History",
    loading: "Fetching and analyzing multi-period data for {symbol}, please wait...",
    scoreLabel: "Entry Appeal Score",
    supportLabel: "Support (Recent Pivot)",
    resistanceLabel: "Resistance (Recent Pivot)",
    pocLabel: "Volume Profile POC",
    overviewHeader: "🔮 AI Analysis Overview",
    strategyHeader: "💡 Trading Strategy & Advice",
    technicalHeader: "🔬 Technical Indicators & Patterns",
    welcomeTitle: "Welcome to Antigravity ZenithAnalysis",
    welcomeSubtitle: "Enter any US, HK, CN, or JP stock ticker in the search bar above, or click on a stock in your watchlist to load real-time technical analysis and charts.",
    chartDaily: "Daily Chart",
    chartWeekly: "Weekly Chart",
    chartNotice: "* Dual-pane chart zoom sync is enabled",
    settingsTitle: "⚙️ Custom AI Analyst Configuration",
    settingsSubtitle: "Configure your API credentials here to enable advanced AI-powered technical reports. Keys are stored locally in your browser and never uploaded.",
    saveBtn: "Save Settings",
    cancelBtn: "Cancel",
    providerLabel: "Provider",
    modelLabel: "Model Name",
    apiKeyLabel: "API Key",
    baseUrlLabel: "API Base URL (Required for Custom/中转站, usually ends with /v1)",
    languageLabel: "Language",
    langAuto: "Auto Detect",
    langZhCN: "简体中文 (Simplified Chinese)",
    langZhTW: "繁體中文 (Traditional Chinese)",
    langEn: "English",
    langJa: "日本語 (Japanese)",
    ruleBadge: "Algorithm Generated",
    llmBadge: "LLM Generated",
    queryFailed: "Query Failed",
    queryError: "Query Error",
    loadingText: "Loading...",
    noSupport: "None",
    noResistance: "None",
    customEndpointOption: "Custom Endpoint (apimax & other relays)",
    fallbackLabel: "Enable Local Non-AI Fallback Analysis",
    fallbackDesc: "If LLM generation fails due to network/quota limits, allow automatic fallback to built-in technical indicators scoring & report."
  },
  "ja": {
    title: "Antigravity 天頂分析システム (ZenithAnalysis)",
    logo: "Antigravity 天頂分析",
    searchPlaceholder: "コードを入力... (e.g. AAPL, 700)",
    llmSettings: "AIモデル設定",
    watchlist: "分析履歴",
    loading: "{symbol} の複数周期データを取得・分析中、しばらくお待ちください...",
    scoreLabel: "買い場魅力度",
    supportLabel: "サポートライン (支持線)",
    resistanceLabel: "レジスタンスライン (抵抗線)",
    pocLabel: "価格帯別出来高 POC",
    overviewHeader: "🔮 AI相場概況サマリー",
    strategyHeader: "💡 推奨取引戦略・アドバイス",
    technicalHeader: "🔬 テクニカル指標・パターン分析詳細",
    welcomeTitle: "Antigravity 天頂分析システムへようこそ",
    welcomeSubtitle: "上部の検索ボックスに米国株、香港株、中国株、日本株の有効なコードを入力するか、左側のお気に入り銘柄をクリックすると、リアルタイムのレポート与チャートが表示されます。",
    chartDaily: "日足チャート",
    chartWeekly: "週足チャート",
    chartNotice: "* チャートの時間軸ズーム連動機能が有効です",
    settingsTitle: "⚙️ AIアナリストのカスタム設定",
    settingsSubtitle: "APIキーを設定すると、高度なAIテクニカルレポートが有効になります。キーはブラウザにローカル保存され、送信されることはありません。",
    saveBtn: "設定を保存",
    cancelBtn: "キャンセル",
    providerLabel: "プロバイダー / Provider",
    modelLabel: "モデル名 / Model Name",
    apiKeyLabel: "APIキー / API Key",
    baseUrlLabel: "API Base URL (中継サーバーは必須、通常は /v1 で終わる)",
    languageLabel: "表示言語 / Language",
    langAuto: "自動判定 / Auto Detect",
    langZhCN: "简体中文 (Simplified Chinese)",
    langZhTW: "繁體中文 (Traditional Chinese)",
    langEn: "English",
    langJa: "日本語 (Japanese)",
    ruleBadge: "システム生成",
    llmBadge: "LLM 生成",
    queryFailed: "取得失敗",
    queryError: "エラー発生",
    loadingText: "読込中...",
    noSupport: "なし",
    noResistance: "なし",
    customEndpointOption: "Custom Endpoint (apimax等の代理サーバー)",
    fallbackLabel: "ローカルの非AIバックアップ分析を有効にする",
    fallbackDesc: "大モデルの生成がネットワークエラーやクォータ不足で失敗した場合、組み込みのテクニカル分析アルゴリズムによるスコアとレポートへの自动切り替えを許可します。"
  }
};

const getCookie = (name: string): string => {
  if (typeof document === "undefined") return "";
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return decodeURIComponent(parts.pop()?.split(";").shift() || "");
  return "";
};

const setCookie = (name: string, value: string, days = 365) => {
  if (typeof document === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = `; expires=${date.toUTCString()}`;
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}; path=/`;
};

// ----------------------------------------------------
// Analysis result localStorage cache with a simple LRU cap.
// A recency index (most recent first) is kept under
// `zenith_analysis_index`; entries beyond the cap are evicted.
// ----------------------------------------------------
const ANALYSIS_CACHE_LIMIT = 6;
const ANALYSIS_CACHE_INDEX_KEY = "zenith_analysis_index";
const analysisCacheKey = (symbol: string) => `zenith_analysis_${symbol}`;

const readAnalysisCacheIndex = (): string[] => {
  try {
    const raw = localStorage.getItem(ANALYSIS_CACHE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch (e) {
    console.error("Read analysis cache index failed:", e);
  }
  return [];
};

// Move `symbol` to the front of the recency index and evict overflow entries
const touchAnalysisCache = (symbol: string) => {
  try {
    const updated = [symbol, ...readAnalysisCacheIndex().filter((item) => item !== symbol)];
    for (const evicted of updated.slice(ANALYSIS_CACHE_LIMIT)) {
      localStorage.removeItem(analysisCacheKey(evicted));
    }
    localStorage.setItem(ANALYSIS_CACHE_INDEX_KEY, JSON.stringify(updated.slice(0, ANALYSIS_CACHE_LIMIT)));
  } catch (e) {
    console.error("Update analysis cache index failed:", e);
  }
};

const readAnalysisCache = (symbol: string): AnalysisCacheEntry | null => {
  try {
    const cachedStr = localStorage.getItem(analysisCacheKey(symbol));
    if (!cachedStr) return null;
    return JSON.parse(cachedStr) as AnalysisCacheEntry;
  } catch (e) {
    console.error("Cache parse error", e);
    return null;
  }
};

const writeAnalysisCache = (symbol: string, entry: AnalysisCacheEntry) => {
  try {
    localStorage.setItem(analysisCacheKey(symbol), JSON.stringify(entry));
    touchAnalysisCache(symbol);
  } catch (e) {
    console.error("Failed to save cache", e);
  }
};

const removeAnalysisCache = (symbol: string) => {
  try {
    localStorage.removeItem(analysisCacheKey(symbol));
    localStorage.setItem(
      ANALYSIS_CACHE_INDEX_KEY,
      JSON.stringify(readAnalysisCacheIndex().filter((item) => item !== symbol))
    );
  } catch (e) {
    console.error("Failed to remove cache", e);
  }
};

const isNonTradingHours = (symbol: string): boolean => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const bjTime = new Date(utc + (3600000 * 8)); // UTC+8
  
  const day = bjTime.getDay();
  const hour = bjTime.getHours();
  const min = bjTime.getMinutes();
  
  if (day === 0 || day === 6) return true; // Weekend
  
  const isA = /^(SH|SZ|BJ)\d{6}$/i.test(symbol) || /^\d{6}(?:\.(?:SS|SH|SZ))?$/i.test(symbol);
  const isHK = /^(HK\d{4}|\d{4}\.HK)$/i.test(symbol);
  const isJP = /^\d{3}[0-9A-Z]\.T$/i.test(symbol) || /^\d{3}[A-Z]$/i.test(symbol);
  
  if (isA) {
    if (hour < 9 || hour >= 15) return true;
    if (hour === 9 && min < 30) return true;
    if (hour === 11 && min >= 30) return true;
    if (hour === 12) return true;
    return false;
  } else if (isHK) {
    if (hour < 9 || hour >= 16) return true;
    if (hour === 9 && min < 30) return true;
    if (hour === 12) return true;
    return false;
  } else if (isJP) {
    // Japanese stock trading hours: JST 09:00-11:30 and 12:30-15:00
    // Translated to Beijing Time (UTC+8): 08:00-10:30 and 11:30-14:00
    if (hour < 8 || hour >= 14) return true;
    if (hour === 10 && min >= 30) return true;
    if (hour === 11 && min < 30) return true;
    return false;
  } else {
    // US: 05:00 - 21:00 Beijing time is roughly non-trading
    if (hour >= 5 && hour < 21) return true;
    return false;
  }
};

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

const LANG_OPTION_STYLE: React.CSSProperties = { backgroundColor: "#1c2030", color: "#ffffff" };

export default function Home() {
  const mounted = useSyncExternalStore(subscribeMounted, getClientMountedSnapshot, getServerMountedSnapshot);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<StockAnalysisData | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly">("daily");
  const [showMockWarning, setShowMockWarning] = useState(true);

  const lastRequestedSymbolRef = useRef("");
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const currentRequestSymbolRef = useRef("");
  const watchlistHydratedRef = useRef(false);

  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, WatchQuote>>({});

  const [isRedUp, setIsRedUp] = useState(true);

  const toggleColorMode = () => {
    const newVal = !isRedUp;
    localStorage.setItem("zenith_chart_color_mode", newVal ? "red-up" : "green-up");
    setIsRedUp(newVal);
  };
  
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({
    provider: "gemini",
    apiKey: "",
    baseUrl: "",
    modelName: "gemini-1.5-flash",
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>("auto");
  const [useFallback, setUseFallback] = useState(true);

  const getEffectiveLang = (): EffectiveLanguage => {
    if (!mounted) return "zh-CN"; // SSR and first hydration render must be identical to avoid mismatch
    if (appLanguage !== "auto") return appLanguage;
    if (typeof navigator === "undefined") return "zh-CN";
    const navLang = navigator.language.toLowerCase();
    if (navLang.includes("zh-tw") || navLang.includes("zh-hk") || navLang.includes("zh-mo")) {
      return "zh-TW";
    }
    if (navLang.includes("zh")) {
      return "zh-CN";
    }
    if (navLang.includes("ja")) {
      return "ja";
    }
    return "en";
  };

  const effectiveLang = getEffectiveLang();
  const t = TRANSLATIONS[effectiveLang];
  const upColor = isRedUp ? "#f23645" : "#089981";
  const downColor = isRedUp ? "#089981" : "#f23645";

  const renderStockName = () => {
    if (!stockData) return "";
    const name = stockData.companyName || "";
    const nameEn = stockData.companyNameEn || "";

    if (!nameEn) return name;
    if (!name) return nameEn;

    const clean = (s: string) => s.toLowerCase().replace(/[\s\.,\-\(\)]/g, "");

    if (clean(name) === clean(nameEn)) {
      return name;
    }

    return `${name} (${nameEn})`;
  };

  const searchRef = useRef<HTMLDivElement>(null);

  // Initialize client settings from localStorage & cookies
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;

      // 0. Load color mode (isRedUp)
      const savedColorMode = localStorage.getItem("zenith_chart_color_mode");
      if (savedColorMode === "green-up") {
        setIsRedUp(false);
      } else {
        setIsRedUp(true);
      }

      // 1. Load Analysis History from cookie
      const savedHistory = getCookie("analysis_history");
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory) as unknown;
          if (Array.isArray(parsed)) {
            setWatchlist(parsed);
          }
        } catch (e) {
          console.error("Parse analysis history cookie failed:", e);
        }
      } else {
        // Migrate from old localStorage watchlist if exists
        const oldWatchlist = localStorage.getItem("watchlist");
        if (oldWatchlist) {
          try {
            const parsed = JSON.parse(oldWatchlist) as unknown;
            if (Array.isArray(parsed)) {
              setWatchlist(parsed);
              setCookie("analysis_history", JSON.stringify(parsed));
            }
          } catch {
            // Fallback to default
          }
        } else {
          const defaultHistory = ["AAPL", "0700.HK", "600519.SS", "9984.T"];
          setWatchlist(defaultHistory);
          setCookie("analysis_history", JSON.stringify(defaultHistory));
        }
      }
      watchlistHydratedRef.current = true;

      // 1.5 Load Watchlist Quotes Cache
      const savedQuotes = localStorage.getItem("watchlistQuotes");
      if (savedQuotes) {
        try {
          const parsedQuotes = JSON.parse(savedQuotes) as Record<string, WatchQuote>;
          setWatchlistQuotes(parsedQuotes);
        } catch (e) {
          console.error("Parse cached watchlist quotes failed:", e);
        }
      }

      // 2. Load LLM Config
      const savedConfig = localStorage.getItem("llmConfig");
      if (savedConfig) {
        setLlmConfig(JSON.parse(savedConfig) as LLMConfig);
      }

      // 3. Load Language
      const savedLanguage = localStorage.getItem("appLanguage");
      if (savedLanguage && isAppLanguage(savedLanguage)) {
        setAppLanguage(savedLanguage);
      }

      // 4. Load Fallback toggle
      const savedFallback = localStorage.getItem("zenith_use_fallback");
      if (savedFallback === "false") {
        setUseFallback(false);
      }
    });

    // Load APIMax banner - default always visible

    // Close suggestions on click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Persist analysis history to cookie whenever it changes (after hydration)
  useEffect(() => {
    if (!watchlistHydratedRef.current) return;
    setCookie("analysis_history", JSON.stringify(watchlist));
  }, [watchlist]);

  // Fetch Watchlist simple quotes on load and when watchlist MEMBERSHIP changes.
  // The membership key ignores reordering (recency reshuffles after each analysis).
  const watchlistKey = [...watchlist].sort().join(",");

  useEffect(() => {
    if (!watchlistKey) return;

    const fetchWatchlistQuotes = async () => {
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(watchlistKey)}`);
        if (res.ok) {
          const data = await res.json() as QuotesResponse;
          const newQuotes = data.quotes || {};
          setWatchlistQuotes(newQuotes);
          localStorage.setItem("watchlistQuotes", JSON.stringify(newQuotes));
        }
      } catch (e) {
        console.error("Fetch watchlist quotes failed:", e);
      }
    };

    fetchWatchlistQuotes();
  }, [watchlistKey]);

  const fetchActiveStockData = useCallback(async (forceFetch: boolean | React.MouseEvent = false, overrideConfig?: LLMConfig) => {
    const isForce = forceFetch === true || (forceFetch && typeof forceFetch === "object" && "nativeEvent" in forceFetch);
    const requestedSymbol = activeSymbol;
    const config = overrideConfig ?? llmConfig;

    if (!isForce) {
      const cachedObj = readAnalysisCache(requestedSymbol);
      if (cachedObj) {
        try {
          const cacheDate = new Date(cachedObj.timestamp);
          const now = new Date();
          const isSameDay = cacheDate.toDateString() === now.toDateString();
          if (isSameDay && isNonTradingHours(requestedSymbol)) {
            console.log("[CACHE] Using cached analysis for", requestedSymbol);
            const cachedData = cachedObj.data;
            if (cachedData.isMock) {
              removeAnalysisCache(requestedSymbol);
            } else {
              touchAnalysisCache(requestedSymbol);
              const resolvedSymbol = cachedData.symbol || requestedSymbol;
              // A cache hit supersedes any in-flight analysis request
              analyzeAbortRef.current?.abort();
              analyzeAbortRef.current = null;
              currentRequestSymbolRef.current = resolvedSymbol;
              setLoading(false);
              setStockData(cachedData);
              if (resolvedSymbol !== requestedSymbol) {
                lastRequestedSymbolRef.current = resolvedSymbol;
                setActiveSymbol(resolvedSymbol);
              }
              setWatchlist((prev) => {
                const filtered = prev.filter((item) => item !== requestedSymbol && item !== resolvedSymbol);
                return [resolvedSymbol, ...filtered].slice(0, 15);
              });
              return;
            }
          }
        } catch (e) {
          console.error("Cache parse error", e);
        }
      }
    }

    // Abort any previous in-flight analysis so slow responses cannot win
    analyzeAbortRef.current?.abort();
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    currentRequestSymbolRef.current = requestedSymbol;

    setLoading(true);

    let requestLang: EffectiveLanguage = appLanguage === "auto" ? "zh-CN" : appLanguage;
    if (appLanguage === "auto") {
      const navLang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "zh-cn";
      if (navLang.includes("zh-tw") || navLang.includes("zh-hk") || navLang.includes("zh-mo")) {
        requestLang = "zh-TW";
      } else if (navLang.includes("zh")) {
        requestLang = "zh-CN";
      } else if (navLang.includes("ja")) {
        requestLang = "ja";
      } else {
        requestLang = "en";
      }
    }
    const requestT = TRANSLATIONS[requestLang];

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: requestedSymbol,
          llmConfig: config.apiKey ? config : undefined,
          language: requestLang,
          useFallback,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json() as ApiErrorResponse;
        if (analyzeAbortRef.current !== controller) return;
        alert(`${requestT.queryFailed}: ${err.error || "Unknown Error"}`);
        return;
      }

      const data = await res.json() as StockAnalysisData;
      // Ignore stale responses: a newer request (or cache hit) has taken over
      if (analyzeAbortRef.current !== controller || currentRequestSymbolRef.current !== requestedSymbol) {
        return;
      }
      const resolvedSymbol = data.symbol || requestedSymbol;
      setStockData(data);
      if (resolvedSymbol !== requestedSymbol) {
        lastRequestedSymbolRef.current = resolvedSymbol;
        setActiveSymbol(resolvedSymbol);
      }
      setShowMockWarning(true);

      if (!data.isMock) {
        writeAnalysisCache(resolvedSymbol, {
          timestamp: Date.now(),
          data
        });
      }

      // Update analysis history (persisted to cookie by effect)
      setWatchlist((prev) => {
        const filtered = prev.filter((item) => item !== requestedSymbol && item !== resolvedSymbol);
        return [resolvedSymbol, ...filtered].slice(0, 15);
      });
    } catch (caught: unknown) {
      if (controller.signal.aborted) return;
      const e = { message: getErrorMessage(caught) };
      console.error(e);
      alert(`${requestT.queryError}: ${e.message || e}`);
    } finally {
      if (analyzeAbortRef.current === controller) {
        setLoading(false);
      }
    }
  }, [activeSymbol, appLanguage, llmConfig, useFallback]);

  const fetchActiveStockDataRef = useRef(fetchActiveStockData);
  useEffect(() => {
    fetchActiveStockDataRef.current = fetchActiveStockData;
  }, [fetchActiveStockData]);

  // Main fetch call for active stock data
  useEffect(() => {
    if (!activeSymbol) return;
    if (lastRequestedSymbolRef.current === activeSymbol) {
      lastRequestedSymbolRef.current = "";
      return;
    }
    queueMicrotask(() => {
      fetchActiveStockDataRef.current();
    });
  }, [activeSymbol]);

  // Autocomplete suggestion fetcher
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length === 0) {
      return;
    }

    const controller = new AbortController();
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json() as SearchResponse;
          setSuggestions(data.quotes || []);
          setShowSuggestions(true);
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          console.error("Fetch autocomplete suggestions failed:", e);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      clearTimeout(delayDebounceFn);
    };
  }, [searchQuery]);

  const handleSelectSymbol = (sym: string) => {
    setActiveSymbol(normalizeManualSymbolInput(sym));
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const handleRemoveWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting the item
    setWatchlist((prev) => prev.filter((item) => item !== sym));
  };

  const handleSaveSettings = (newConfig: LLMConfig) => {
    const prevConfigStr = localStorage.getItem("llmConfig");
    const prevApiKey = prevConfigStr ? JSON.parse(prevConfigStr).apiKey : "";
    // The state default is `true` and the loader only flips it off for the
    // literal "false", so a missing key must also be treated as `true`.
    const prevFallback = localStorage.getItem("zenith_use_fallback") !== "false";

    localStorage.setItem("llmConfig", JSON.stringify(newConfig));
    localStorage.setItem("appLanguage", appLanguage);
    localStorage.setItem("zenith_use_fallback", useFallback ? "true" : "false");
    setLlmConfig(newConfig);
    setIsSettingsOpen(false);

    if (activeSymbol && (prevApiKey !== newConfig.apiKey || prevFallback !== useFallback)) {
      fetchActiveStockData(true, newConfig);
    }
  };

  const renderStarRating = (val: number) => {
    const fullStars = Math.floor(val);
    const halfStar = val % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    return (
      <div style={{ display: "flex", gap: "2px", color: "#fbbf24" }}>
        {Array(fullStars).fill(0).map((_, i) => <Star key={`f-${i}`} size={16} fill="#fbbf24" />)}
        {halfStar === 1 && <Star key="h-1" size={16} fill="url(#halfStarGrad)" />}
        {Array(emptyStars).fill(0).map((_, i) => <Star key={`e-${i}`} size={16} />)}
        
        <svg width="0" height="0">
          <defs>
            <linearGradient id="halfStarGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="50%" stopColor="#fbbf24" />
              <stop offset="50%" stopColor="transparent" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes indicator-pulse {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes indicator-pulse-green {
          0%, 100% { transform: scale(1); opacity: 0.75; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        .pulse-indicator {
          animation: ${isRedUp ? "indicator-pulse" : "indicator-pulse-green"} 1.8s infinite ease-in-out;
        }
        .color-mode-btn {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .color-mode-btn:hover {
          transform: translateY(-1px);
          border-color: ${isRedUp ? "rgba(242, 54, 69, 0.3)" : "rgba(8, 153, 129, 0.3)"} !important;
          box-shadow: ${isRedUp ? "0 4px 12px rgba(242, 54, 69, 0.2), inset 0 0 6px rgba(242, 54, 69, 0.2)" : "0 4px 12px rgba(8, 153, 129, 0.2), inset 0 0 6px rgba(8, 153, 129, 0.2)"} !important;
        }
        .color-mode-btn:active {
          transform: translateY(0);
        }
      `}</style>
      {/* 1. Header Area */}
      <header style={styles.header}>
        <div style={styles.brand}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="url(#logoGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 6px rgba(0, 245, 212, 0.75))",
              marginRight: "4px"
            }}
          >
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            <defs>
              <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00f5d4" />
                <stop offset="100%" stopColor="#2962ff" />
              </linearGradient>
            </defs>
          </svg>
          <span style={styles.logoText}>
            Antigravity{" "}
            <span style={{ color: "#2962ff" }}>
              {effectiveLang === "zh-CN" && "天顶分析"}
              {effectiveLang === "zh-TW" && "天頂分析"}
              {effectiveLang === "en" && "ZenithAnalysis"}
              {effectiveLang === "ja" && "天頂分析"}
            </span>
          </span>
        </div>

        {/* Search & Autocomplete */}
        <div ref={searchRef} style={styles.searchContainer}>
          <Search size={16} style={styles.searchIcon} />
          <input
            type="text"
            className="search-input-glow"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSearchQuery(value);
              if (value.trim().length === 0) {
                setSuggestions([]);
                setShowSuggestions(false);
              }
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                handleSelectSymbol((showSuggestions && suggestions[0]?.symbol) || searchQuery.trim().toUpperCase());
              }
            }}
            style={styles.searchInput}
          />

          {showSuggestions && suggestions.length > 0 && (
            <div style={styles.suggestionsDropdown}>
              {suggestions.map((s) => (
                <div
                  key={s.symbol}
                  onClick={() => handleSelectSymbol(s.symbol)}
                  style={styles.suggestionItem}
                >
                  <span style={styles.sSymbol}>{s.symbol}</span>
                  <span style={styles.sName}>{s.name}</span>
                  <span style={styles.sExchange}>{s.exchDisp}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Toolbar Settings */}
        <div style={styles.headerRight}>
          <div style={styles.langSelectContainer}>
            <span style={{ fontSize: "14px" }}>🌐</span>
            <select
              value={appLanguage}
              onChange={(e) => {
                const newLang = e.target.value;
                if (!isAppLanguage(newLang)) return;
                setAppLanguage(newLang);
                localStorage.setItem("appLanguage", newLang);
              }}
              style={styles.langSelect}
            >
              <option value="auto" style={LANG_OPTION_STYLE}>{t.langAuto}</option>
              <option value="zh-CN" style={LANG_OPTION_STYLE}>{t.langZhCN}</option>
              <option value="zh-TW" style={LANG_OPTION_STYLE}>{t.langZhTW}</option>
              <option value="en" style={LANG_OPTION_STYLE}>{t.langEn}</option>
              <option value="ja" style={LANG_OPTION_STYLE}>{t.langJa}</option>
            </select>
          </div>

          <button onClick={() => setIsSettingsOpen(true)} style={styles.settingsBtn}>
            <Settings size={18} style={{ marginRight: "6px" }} />
            {t.llmSettings}
          </button>
          <button onClick={() => fetchActiveStockData(true)} style={styles.refreshBtn}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* 2. Mock Data Warning Banner */}
      {stockData?.isMock && showMockWarning && (
        <div style={styles.mockWarningBanner}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>⚠️</span>
            <span>
              {effectiveLang === "zh-CN" && "当前真实行情源不可用或暂不支持该代码，系统已自动降级为本地模拟演示模式（数据为算法实时模拟生成）。请检查代码、网络连接或代理设置。"}
              {effectiveLang === "zh-TW" && "當前真實行情源不可用或暫不支援該代碼，系統已自動降級為本地模擬演示模式（數據為算法即時模擬生成）。請檢查代碼、網絡連接或代理設定。"}
              {effectiveLang === "en" && "Live market data sources are unavailable or do not support this ticker. The system has fallen back to offline demo mode with algorithmic simulation."}
              {effectiveLang === "ja" && "リアルタイムの市場データソースが利用できない、またはこのコードに対応していないため、オフラインデモモード（シミュレーションデータ）にフォールバックしました。"}
            </span>
          </div>
          <button 
            onClick={() => setShowMockWarning(false)} 
            style={styles.closeWarningBtn}
          >
            ✕
          </button>
        </div>
      )}

      {/* 3. Main Dashboard Layout */}
      <div style={styles.body}>
        {/* Left Watchlist Sidebar */}
        <aside style={styles.sidebar}>
          <div style={styles.sidebarHeader}>{t.watchlist}</div>
          <div style={styles.watchlistContainer}>
            {watchlist.map((sym) => {
              const quote = watchlistQuotes[sym];
              const isUp = quote ? quote.change >= 0 : true;
              return (
                <div
                  key={sym}
                  onClick={() => setActiveSymbol(sym)}
                  style={{
                    ...styles.watchItem,
                    backgroundColor: activeSymbol === sym ? "#2a2e39" : "transparent",
                  }}
                >
                  <div style={styles.watchItemLeft}>
                    <span style={styles.watchSymbol}>{sym}</span>
                  </div>
                  {quote ? (
                    <div style={styles.watchItemRight}>
                      {quote.isMock ? (
                        <>
                          {/* Real quote unavailable: show a placeholder instead of mock values */}
                          <span style={styles.watchPrice}>--</span>
                          <span style={{ ...styles.watchChange, color: "#787b86" }}>--</span>
                        </>
                      ) : (
                        <>
                          <span style={styles.watchPrice}>{formatMarketPrice(sym, quote.price)}</span>
                          <span
                            style={{
                              ...styles.watchChange,
                              color: isUp ? upColor : downColor,
                            }}
                          >
                            {isUp ? "+" : ""}{quote.change.toFixed(2)}%
                          </span>
                        </>
                      )}
                      <button
                        onClick={(e) => handleRemoveWatchlist(sym, e)}
                        style={styles.removeWatchBtn}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ) : (
                    <div style={styles.watchLoading}>{t.loadingText}</div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center/Right Main Content Area */}
        <main style={styles.main}>
          {loading ? (
            <LoadingOverlay key={activeSymbol} symbol={activeSymbol} effectiveLang={effectiveLang} />
          ) : stockData ? (
            <div style={styles.dashboardGrid}>
              <div style={styles.topRow}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap" }}>
                    <h1 style={styles.tickerName}>{renderStockName()}</h1>
                    <span style={styles.tickerSymbol}>{stockData.symbol}</span>
                    {stockData.dataSource === "eastmoney" && (
                      <span style={styles.eastMoneyBadge}>⚡ 东方财富</span>
                    )}
                    {stockData.dataSource === "tonghuashun" && (
                      <span style={styles.tonghuashunBadge}>⚡ 同花顺</span>
                    )}
                    {(stockData.dataSource === "yahoo" || stockData.dataSource === "yahoo-chart") && (
                      <span style={styles.yahooBadge}>🌐 雅虎财经</span>
                    )}
                    {stockData.dataSource === "kabutan" && (
                      <span style={styles.kabutanBadge}>🌐 株探</span>
                    )}
                    {stockData.dataSource === "twelve-data" && (
                      <span style={styles.providerBadge}>🌐 Twelve Data</span>
                    )}
                    {stockData.dataSource === "fmp" && (
                      <span style={styles.providerBadge}>🌐 FMP</span>
                    )}
                    {stockData.dataSource === "mock" && (
                      <span style={styles.mockBadge}>⚠️ 模拟演示</span>
                    )}
                  </div>
                  <div style={styles.priceContainer}>
                    <span style={styles.currentPrice}>{formatMarketPrice(stockData.symbol || activeSymbol, stockData.price)}</span>
                    <span
                      style={{
                        ...styles.priceChange,
                        color: stockData.changePercent >= 0 ? upColor : downColor,
                      }}
                    >
                      {stockData.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {stockData.changePercent >= 0 ? "+" : ""}{stockData.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>

                <div style={styles.statsContainer}>
                  <div style={styles.statItem}>
                    <span style={styles.statLabel}>{t.scoreLabel}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={styles.statValue}>
                        <span style={{ fontSize: "20px", color: "#2962ff" }}>{stockData.score.totalScore.toFixed(1)}</span>
                        <span style={{ fontSize: "11px", color: "#787b86" }}>/ 5.0</span>
                      </div>
                      <div>{renderStarRating(stockData.score.totalScore)}</div>
                    </div>
                  </div>

                  <div style={styles.statDivider} />

                  <div style={styles.statItem}>
                    <span style={styles.statLabel}>{t.supportLabel}</span>
                    <span style={{ ...styles.statValue, color: "#089981" }}>
                      {stockData.sr.horizontalSupports[0] ? `${stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}${stockData.sr.horizontalSupports[0].toFixed(2)}` : t.noSupport}
                    </span>
                  </div>

                  <div style={styles.statDivider} />

                  <div style={styles.statItem}>
                    <span style={styles.statLabel}>{t.resistanceLabel}</span>
                    <span style={{ ...styles.statValue, color: "#f23645" }}>
                      {stockData.sr.horizontalResistances[0] ? `${stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}${stockData.sr.horizontalResistances[0].toFixed(2)}` : t.noResistance}
                    </span>
                  </div>

                  <div style={styles.statDivider} />

                  <div style={styles.statItem}>
                    <span style={styles.statLabel}>{t.pocLabel}</span>
                    <span style={{ ...styles.statValue, color: "#fbbf24" }}>
                      {stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}{stockData.sr.volumePOC.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div style={styles.workspaceGrid}>
                <div style={styles.leftColumn}>
                  <div style={styles.summaryCard}>
                    <div style={styles.cardHeader}>{t.overviewHeader}</div>
                    <div style={styles.cardBodyAutoScroll}>
                      <MarkdownBlock text={stockData.reportOverview} effectiveLang={effectiveLang} />
                    </div>
                  </div>
                  
                  <div style={styles.chartArea}>
                    <div style={styles.chartSelector}>
                      <button
                        onClick={() => setChartPeriod("daily")}
                        style={{
                          ...styles.periodBtn,
                          backgroundColor: chartPeriod === "daily" ? "#2962ff" : "#2a2e39",
                        }}
                      >
                        {t.chartDaily}
                      </button>
                      <button
                        onClick={() => setChartPeriod("weekly")}
                        style={{
                          ...styles.periodBtn,
                          backgroundColor: chartPeriod === "weekly" ? "#2962ff" : "#2a2e39",
                        }}
                      >
                        {t.chartWeekly}
                      </button>
                      <span style={{ fontSize: "11px", color: "#787b86" }}>
                        {t.chartNotice}
                      </span>
                      <button
                        onClick={toggleColorMode}
                        className="color-mode-btn"
                        style={{
                          ...styles.periodBtn,
                          marginLeft: "auto",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: "20px",
                          padding: "5px 12px",
                          cursor: "pointer",
                          backgroundColor: isRedUp ? "rgba(242, 54, 69, 0.15)" : "rgba(8, 153, 129, 0.15)",
                          color: "#ffffff",
                          boxShadow: isRedUp ? "inset 0 0 4px rgba(242, 54, 69, 0.2)" : "inset 0 0 4px rgba(8, 153, 129, 0.2)",
                        }}
                      >
                        <span style={{
                          width: "7px",
                          height: "7px",
                          borderRadius: "50%",
                          backgroundColor: isRedUp ? "#f23645" : "#089981",
                          boxShadow: isRedUp ? "0 0 6px 1px #f23645" : "0 0 6px 1px #089981",
                          display: "inline-block",
                        }} className="pulse-indicator" />
                        <span style={{ fontSize: "11.5px", fontWeight: "bold", letterSpacing: "0.5px" }}>
                          {effectiveLang === "zh-CN" && (isRedUp ? "红涨绿跌" : "绿涨红跌")}
                          {effectiveLang === "zh-TW" && (isRedUp ? "紅漲綠跌" : "綠漲紅跌")}
                          {effectiveLang === "en" && (isRedUp ? "Red-Up" : "Green-Up")}
                          {effectiveLang === "ja" && (isRedUp ? "赤高緑安" : "緑高赤安")}
                        </span>
                      </button>
                    </div>
                    
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                      <StockChart
                        candles={chartPeriod === "daily" ? stockData.dailyCandles : stockData.weeklyCandles}
                        indicators={stockData.indicators}
                        patterns={stockData.patterns}
                        sr={stockData.sr}
                        wave={stockData.wave}
                        isRedUp={isRedUp}
                      />
                    </div>
                  </div>
                </div>

                <div style={styles.rightColumn}>
                  <div style={styles.recommendationCard}>
                    <div style={styles.cardHeader}>{t.strategyHeader}</div>
                    <div style={styles.cardBodyAutoScroll}>
                      <MarkdownBlock text={stockData.reportRecommendation} effectiveLang={effectiveLang} />
                    </div>
                  </div>

                  <div style={styles.reportArea}>
                    <div style={styles.reportHeader}>
                      <span>{t.technicalHeader}</span>
                      {stockData.isLLMUsed ? (
                        <span style={styles.llmBadge}>{t.llmBadge} ({llmConfig.provider})</span>
                      ) : (
                        <span style={styles.ruleBadge}>{t.ruleBadge}</span>
                      )}
                    </div>
                    <div style={styles.reportScroll}>
                      <MarkdownBlock text={stockData.reportTechnical} effectiveLang={effectiveLang} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              ...styles.welcomeContainer,
              background: "radial-gradient(circle at center, #182030 0%, #131722 100%)",
              padding: "40px 20px",
              overflowY: "auto",
            }}>
              <style>{`
                .gradient-title {
                  background: linear-gradient(135deg, #ffffff 0%, #2962ff 100%);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  filter: drop-shadow(0 0 20px rgba(41, 98, 255, 0.15));
                }
                @keyframes search-glow {
                  0%, 100% { box-shadow: 0 0 6px rgba(41, 98, 255, 0.15), 0 0 12px rgba(8, 153, 129, 0.08); }
                  50% { box-shadow: 0 0 14px rgba(41, 98, 255, 0.35), 0 0 28px rgba(8, 153, 129, 0.18); }
                }
                .search-input-glow {
                  animation: search-glow 2.5s ease-in-out infinite;
                  border: 1.5px solid rgba(41, 98, 255, 0.4) !important;
                }
                .search-input-glow:focus {
                  animation: none;
                  box-shadow: 0 0 20px rgba(41, 98, 255, 0.5), 0 0 40px rgba(8, 153, 129, 0.2) !important;
                  border-color: #2962ff !important;
                }
                @keyframes guide-number-pulse {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(41, 98, 255, 0.3); }
                  50% { box-shadow: 0 0 8px 3px rgba(41, 98, 255, 0.25); }
                }
                .guide-step-number {
                  animation: guide-number-pulse 2s ease-in-out infinite;
                }
                .apimax-ad-card {
                  background: linear-gradient(135deg, rgba(13, 27, 62, 0.8) 0%, rgba(26, 16, 64, 0.6) 50%, rgba(10, 14, 26, 0.9) 100%) !important;
                  border: 1px solid rgba(41, 98, 255, 0.25) !important;
                  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
                }
                .apimax-ad-card:hover {
                  border-color: rgba(96, 165, 250, 0.6) !important;
                  box-shadow: 0 8px 30px rgba(41, 98, 255, 0.2), 0 0 20px rgba(96, 165, 250, 0.1) !important;
                  transform: translateY(-2px);
                }
              `}</style>
              
              <div style={styles.welcomeHero}>
                <div style={{
                  position: "relative",
                  width: "80px",
                  height: "80px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: "pulse-glow 2.5s ease-in-out infinite",
                  marginBottom: "8px",
                }}>
                  <svg
                    width="80"
                    height="80"
                    viewBox="0 0 64 64"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ filter: "drop-shadow(0 0 12px rgba(41, 98, 255, 0.6))" }}
                  >
                    {/* Grid Background */}
                    <circle cx="32" cy="32" r="30" fill="url(#heroBgGrad)" stroke="url(#heroStrokeGrad)" strokeWidth="1.5" strokeDasharray="3 3" />
                    {/* Candlesticks */}
                    <rect x="18" y="28" width="4" height="18" rx="1" fill="#089981" />
                    <line x1="20" y1="22" x2="20" y2="48" stroke="#089981" strokeWidth="1.5" />
                    
                    <rect x="28" y="22" width="4" height="20" rx="1" fill="#f23645" />
                    <line x1="30" y1="16" x2="30" y2="44" stroke="#f23645" strokeWidth="1.5" />

                    <rect x="38" y="14" width="4" height="22" rx="1" fill="#089981" />
                    <line x1="40" y1="8" x2="40" y2="40" stroke="#089981" strokeWidth="1.5" />
                    
                    {/* Trend line */}
                    <path d="M12 42 L24 32 L36 26 L48 12" stroke="url(#heroTrendGrad)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="48" cy="12" r="4" fill="#fbbf24" style={{ filter: "drop-shadow(0 0 8px #fbbf24)" }} />
                    
                    {/* Gradients */}
                    <defs>
                      <linearGradient id="heroBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(41, 98, 255, 0.05)" />
                        <stop offset="100%" stopColor="rgba(13, 23, 42, 0.4)" />
                      </linearGradient>
                      <linearGradient id="heroStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#2962ff" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#089981" stopOpacity="0.2" />
                      </linearGradient>
                      <linearGradient id="heroTrendGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#2962ff" />
                        <stop offset="50%" stopColor="#00f5d4" />
                        <stop offset="100%" stopColor="#fbbf24" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <h1 className="gradient-title" style={{ ...styles.welcomeTitle, fontSize: "32px", marginTop: "12px", marginBottom: "16px" }}>{t.welcomeTitle}</h1>
                <p style={{ ...styles.welcomeSubtitle, fontSize: "14.5px", color: "#b2b5be", lineHeight: "1.6" }}>
                  {effectiveLang === "zh-CN" && "针对全球主流的美股、港股、A股与日股，系统采用多维度指标、多形态结构进行综合技术面扫描，为您一键组装出具备 TradingView 深度的大脑级分析研报。"}
                  {effectiveLang === "zh-TW" && "針對全球主流的美股、港股、A股與日股，系統採用多維度指標、多形態結構進行綜合技術面掃描，為您一鍵組裝出具備 TradingView 深度的大腦級分析研報。"}
                  {effectiveLang === "en" && "Scanning global stock markets through multi-dimensional technical indicators and chart patterns to assemble detailed, professional analyst-grade reports in one click."}
                  {effectiveLang === "ja" && "グローバル株式を対象に、複数時間軸のテクニカル指標と相場形態を総合スキャン。TradingViewスタイルのスマートレポートをワンクリックで自動作成。"}
                </p>
              </div>

              {/* Bento-style Features Grid */}
              <div style={styles.welcomeFeatures}>
                <div className="feature-card" style={styles.featureCard}>
                  <div style={styles.featureIcon}>🔬</div>
                  <h3 style={styles.featureTitle}>
                    {effectiveLang === "zh-CN" && "多维指标扫描"}
                    {effectiveLang === "zh-TW" && "多維指標掃描"}
                    {effectiveLang === "en" && "Indicators Scan"}
                    {effectiveLang === "ja" && "複数指標 of 分析"}
                  </h3>
                  <p style={styles.featureDesc}>
                    {effectiveLang === "zh-CN" && "日K与周K双周期共振，计算 EMA 多均线排列、布林线轨道收敛、MACD、KDJ 及 RSI 指标。"}
                    {effectiveLang === "zh-TW" && "日K與周K雙週期共振，計算 EMA 多均線排列、布林線軌道收斂、MACD、KDJ 及 RSI 指標。"}
                    {effectiveLang === "en" && "Calculates EMA arrangements, Bollinger Band limits, MACD, KDJ, and RSI across daily and weekly frames."}
                    {effectiveLang === "ja" && "日足・週足 of EMA配列、ボリンジャーバンド、MACD、KDJ、RSIなどの指標を並行計算。"}
                  </p>
                </div>

                <div className="feature-card" style={styles.featureCard}>
                  <div style={styles.featureIcon}>📊</div>
                  <h3 style={styles.featureTitle}>
                    {effectiveLang === "zh-CN" && "筹码与水平支撑压力"}
                    {effectiveLang === "zh-TW" && "籌碼與水平支撐壓力"}
                    {effectiveLang === "en" && "Volume Profile & Support/Resistance"}
                    {effectiveLang === "ja" && "出来高POCとサポート・レジスタンス"}
                  </h3>
                  <p style={styles.featureDesc}>
                    {effectiveLang === "zh-CN" && "基于极值密度聚类自动绘制水平支撑压力线，结合筹码量分布计算多空博弈控制点 (POC)。"}
                    {effectiveLang === "zh-TW" && "基於極值密度聚類自動繪製水平支撐壓力線，結合籌碼量分布計算多空博弈控制點 (POC)。"}
                    {effectiveLang === "en" && "Draws support lines via swing pivot clustering, and locates Volume Profile Control Points (POC)."}
                    {effectiveLang === "ja" && "波値の密度クラスタリングからレジサポ線を自動描画し、出来高POCから主要な価格帯を特定。"}
                  </p>
                </div>

                <div className="feature-card" style={styles.featureCard}>
                  <div style={styles.featureIcon}>🌊</div>
                  <h3 style={styles.featureTitle}>
                    {effectiveLang === "zh-CN" && "波浪理论与简易缠论"}
                    {effectiveLang === "zh-TW" && "波浪理論與簡易纏論"}
                    {effectiveLang === "en" && "Wave & Chanlun Theory"}
                    {effectiveLang === "ja" && "エリオット波動と纏論"}
                  </h3>
                  <p style={styles.featureDesc}>
                    {effectiveLang === "zh-CN" && "自动识别艾略特 1-5 浪主升与 ABC 调整，并通过缠论算法提取 K 线合并、分型及笔画结构。"}
                    {effectiveLang === "zh-TW" && "自動識別艾略特 1-5 浪主升與 ABC 調整，並通過纏論算法提取 K 線合併、分型及筆畫結構。"}
                    {effectiveLang === "en" && "Identifies Impulse/Correction wave counts and processes Chanlun K-line inclusion & strokes."}
                    {effectiveLang === "ja" && "エリオット波動の1-5推進波・ABC修正波を検出し、K線包含処理や頂底分型から筆画を構成。"}
                  </p>
                </div>

                <div className="feature-card" style={styles.featureCard}>
                  <div style={styles.featureIcon}>🤖</div>
                  <h3 style={styles.featureTitle}>
                    {effectiveLang === "zh-CN" && "大模型智能研报"}
                    {effectiveLang === "zh-TW" && "大模型智能研報"}
                    {effectiveLang === "en" && "AI Analyst Report"}
                    {effectiveLang === "ja" && "AIモデルによるスマートレポート"}
                  </h3>
                  <p style={styles.featureDesc}>
                    {effectiveLang === "zh-CN" && "输入客观算法结果，驱动您自选的 AI 模型一键撰写极富量化深度的行情概况与操作策略。"}
                    {effectiveLang === "zh-TW" && "輸入客觀算法結果，驅動您自選 of AI 模型一鍵撰寫極富量化深度的行情概况與操作策略。"}
                    {effectiveLang === "en" && "Injects computed outputs into your configured LLM to generate professional analyst-grade stock ideas."}
                    {effectiveLang === "ja" && "計算された客観データをAIプロンプトに注入し、TradingViewライクな専門レポートを即座に作成。"}
                  </p>
                </div>
              </div>

              {/* Step Guide */}
              <div className="guide-step-card" style={{
                ...styles.welcomeGuide,
                background: "linear-gradient(135deg, rgba(28, 32, 48, 0.4) 0%, rgba(20, 24, 38, 0.6) 100%)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.04)"
              }}>
                <h3 style={styles.guideTitle}>
                  {effectiveLang === "zh-CN" && "💡 新手快速入门"}
                  {effectiveLang === "zh-TW" && "💡 新手快速入門"}
                  {effectiveLang === "en" && "💡 Quick Start Guide"}
                  {effectiveLang === "ja" && "💡 クイックスタートガイド"}
                </h3>
                <div style={styles.guideSteps}>
                  <div style={styles.guideStepItem}>
                    <span style={styles.guideStepNumber}>1</span>
                    <span>
                      {effectiveLang === "zh-CN" && "在上方搜索框输入全球任意有效股票代码 (如 AAPL, 700.HK, 600519)"}
                      {effectiveLang === "zh-TW" && "在上方搜尋框輸入全球任意有效股票代碼 (如 AAPL, 700.HK, 600519)"}
                      {effectiveLang === "en" && "Type any stock symbol (e.g. AAPL, 0700.HK) in the top search bar"}
                      {effectiveLang === "ja" && "上部の検索ボックスに銘柄コード（例：AAPL, 700.HK, 600519）を入力します"}
                    </span>
                  </div>
                  <div style={styles.guideStepItem}>
                    <span style={styles.guideStepNumber}>2</span>
                    <span>
                      {effectiveLang === "zh-CN" && "点击左侧自选股列表 (Watchlist) 快速查看常用热门标的行情"}
                      {effectiveLang === "zh-TW" && "點擊左側自選股列表 (Watchlist) 快速查看常用熱門標的行情"}
                      {effectiveLang === "en" && "Or click items in the left Watchlist sidebar for a quick view"}
                      {effectiveLang === "ja" && "または、左側のお気に入りリスト（Watchlist）をクリックしてすばやく切り替えます"}
                    </span>
                  </div>
                  <div style={styles.guideStepItem}>
                    <span style={styles.guideStepNumber}>3</span>
                    <span>
                      {effectiveLang === "zh-CN" && "点击右上角“大模型配置”输入您的 API 密钥，启用 AI 强力研报分析"}
                      {effectiveLang === "zh-TW" && "點擊右上角“大模型配置”輸入您的 API 密鑰，啟用 AI 強力研報分析"}
                      {effectiveLang === "en" && "Configure LLM provider & API Key in the top right Settings to enable AI analyst"}
                      {effectiveLang === "ja" && "右上の「AIモデル設定」からAPIキーを入力し、AI分析レポートを有効にします"}
                    </span>
                  </div>
                  <div style={styles.guideStepItem}>
                    <span style={styles.guideStepNumber}>4</span>
                    <span>
                      {effectiveLang === "zh-CN" && (
                        <>
                          还没有大模型 API Key？推荐前往{" "}
                          <a
                            href="https://apimax.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
                          >
                            APIMax.io
                          </a>{" "}
                          一键购买多合一 API 和 Token，极速启用 AI 研报分析。
                        </>
                      )}
                      {effectiveLang === "zh-TW" && (
                        <>
                          還沒有大模型 API Key？推薦前往{" "}
                          <a
                            href="https://apimax.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
                          >
                            APIMax.io
                          </a>{" "}
                          一鍵購買多合一 API 和 Token，極速啟用 AI 研報分析。
                        </>
                      )}
                      {effectiveLang === "en" && (
                        <>
                          No API Key? Visit{" "}
                          <a
                            href="https://apimax.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
                          >
                            APIMax.io
                          </a>{" "}
                          to purchase a multi-model API key and token to unlock AI report features.
                        </>
                      )}
                      {effectiveLang === "ja" && (
                        <>
                          APIキーをお持ちでないですか？{" "}
                          <a
                            href="https://apimax.io"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
                          >
                            APIMax.io
                          </a>{" "}
                          でマルチモデルのAPIキーとトークンを購入し、AI分析レポートを有効にします。
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Tickers Experiencing */}
              <div style={styles.welcomeQuickStart}>
                <h4 style={styles.quickStartTitle}>
                  {effectiveLang === "zh-CN" && "🚀 一键快捷体验特色股票"}
                  {effectiveLang === "zh-TW" && "🚀 一鍵快捷體驗特色股票"}
                  {effectiveLang === "en" && "🚀 Quick Click Stock Demos"}
                  {effectiveLang === "ja" && "🚀 デモ銘柄をワンクリックでロード"}
                </h4>
                <div style={styles.quickStartBadges}>
                  <button onClick={() => handleSelectSymbol("AAPL")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                    🇺🇸 苹果 (AAPL)
                  </button>
                  <button onClick={() => handleSelectSymbol("0700.HK")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                    🇭🇰 腾讯控股 (0700.HK)
                  </button>
                  <button onClick={() => handleSelectSymbol("600519.SS")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                    🇨🇳 贵州茅台 (600519.SS)
                  </button>
                  <button onClick={() => handleSelectSymbol("9984.T")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                    🇯🇵 软银集团 (9984.T)
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>

      </div>

      {/* 4. APIMax.io Bottom Banner Ad - tri-language - Always Constant */}
      <div style={{
        background: "linear-gradient(90deg, rgba(10, 14, 26, 0.95) 0%, rgba(20, 36, 78, 0.95) 40%, rgba(32, 20, 78, 0.95) 70%, rgba(10, 14, 26, 0.95) 100%)",
        borderTop: "1px solid rgba(41, 98, 255, 0.4)",
        padding: "10px 24px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "16px",
        fontSize: "13.5px",
        color: "#d1d4dc",
        zIndex: 99,
        backdropFilter: "blur(16px)",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.5), 0 0 15px rgba(41, 98, 255, 0.1)",
        transition: "all 0.3s ease",
      }}>
        <Zap size={15} style={{ color: "#fbbf24", fill: "#fbbf24", filter: "drop-shadow(0 0 4px #fbbf24)", flexShrink: 0 }} />
        <span style={{ letterSpacing: "0.3px", flexGrow: 1, textAlign: "center" }}>
          {effectiveLang === "en" && (
            <>
              No API Key yet? Get all-in-one API access at{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              — one key for GPT, Claude, Gemini, DeepSeek & more, with quick setup.
            </>
          )}
          {effectiveLang === "ja" && (
            <>
              APIキーをお持ちでないですか？{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              — GPT / Claude / Gemini / DeepSeek などのマルチモデルAPIキーとトークンを一撃で購入。
            </>
          )}
          {(effectiveLang === "zh-CN" || effectiveLang === "zh-TW") && (
            <>
              还没有 API Key？前往{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#60a5fa", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              一键购买多合一大模型 API 和 Token（支持 GPT / Claude / Gemini / DeepSeek 等主流模型）
            </>
          )}
        </span>
        <a
          href="https://apimax.io"
          target="_blank"
          rel="noopener noreferrer"
          className="quick-badge-btn"
          style={{
            backgroundColor: "#2962ff",
            color: "#fff",
            padding: "6px 16px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "bold",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
            boxShadow: "0 0 10px rgba(41, 98, 255, 0.4)",
            transition: "transform 0.2s, background-color 0.2s",
          }}
        >
          {effectiveLang === "en" ? "Buy API Key & Token" : effectiveLang === "ja" ? "APIトークンを購入" : "购买 API 和 Token"}
        </a>
      </div>


      {/* 3. Settings Dialog */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          initialConfig={llmConfig}
          appLanguage={appLanguage}
          onLanguageChange={setAppLanguage}
          useFallback={useFallback}
          onToggleFallback={() => setUseFallback(!useFallback)}
          effectiveLang={effectiveLang}
          t={t}
          onSave={handleSaveSettings}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------
// UI Styles (TradingView Dark Theme)
// ----------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    backgroundColor: "#131722",
    overflow: "hidden",
  },
  header: {
    height: "56px",
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 10,
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  logoIcon: {
    fontSize: "20px",
  },
  logoText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: "16px",
    letterSpacing: "0.5px",
  },
  searchContainer: {
    position: "relative",
    width: "350px",
    display: "flex",
    alignItems: "center",
  },
  searchIcon: {
    position: "absolute",
    left: "12px",
    color: "#787b86",
  },
  searchInput: {
    width: "100%",
    backgroundColor: "#2a2e39",
    border: "1px solid #363c4e",
    borderRadius: "4px",
    color: "#ffffff",
    padding: "8px 38px 8px 36px",
    fontSize: "13px",
    outline: "none",
    transition: "border-color 0.2s",
  },
  addWatchlistBtn: {
    position: "absolute",
    right: "8px",
    backgroundColor: "transparent",
    border: "none",
    color: "#787b86",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsDropdown: {
    position: "absolute",
    top: "38px",
    left: 0,
    width: "100%",
    backgroundColor: "#1c2030",
    border: "1px solid #2a2e39",
    borderRadius: "4px",
    boxShadow: "0 8px 16px rgba(0,0,0,0.5)",
    maxHeight: "300px",
    overflowY: "auto",
    zIndex: 100,
  },
  suggestionItem: {
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #2a2e39",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px",
    color: "#d1d4dc",
    transition: "background-color 0.15s",
  },
  sSymbol: {
    fontWeight: "bold",
    color: "#ffffff",
    width: "80px",
  },
  sName: {
    flex: 1,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    paddingRight: "8px",
    color: "#787b86",
  },
  sExchange: {
    fontSize: "11px",
    color: "#2962ff",
    backgroundColor: "rgba(41,98,255,0.1)",
    padding: "2px 6px",
    borderRadius: "3px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  langSelectContainer: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#2a2e39",
    borderRadius: "4px",
    padding: "0 8px 0 10px",
    gap: "6px",
    height: "28px",
  },
  langSelect: {
    backgroundColor: "transparent",
    border: "none",
    color: "#d1d4dc",
    fontSize: "12px",
    fontWeight: 600,
    outline: "none",
    cursor: "pointer",
  },
  settingsBtn: {
    backgroundColor: "#2a2e39",
    border: "none",
    color: "#d1d4dc",
    padding: "6px 12px",
    fontSize: "12px",
    fontWeight: 600,
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "background 0.2s",
  },
  refreshBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#787b86",
    cursor: "pointer",
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  sidebar: {
    width: "220px",
    borderRight: "1px solid #2a2e39",
    backgroundColor: "#131722",
    display: "flex",
    flexDirection: "column",
  },
  sidebarHeader: {
    fontSize: "11px",
    color: "#787b86",
    fontWeight: "bold",
    letterSpacing: "1px",
    padding: "16px 12px 8px 12px",
    borderBottom: "1px solid #1c2030",
  },
  watchlistContainer: {
    flex: 1,
    overflowY: "auto",
  },
  watchItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 12px",
    cursor: "pointer",
    borderBottom: "1px solid #1c2030",
    transition: "background-color 0.2s",
  },
  watchItemLeft: {
    display: "flex",
    flexDirection: "column",
  },
  watchSymbol: {
    fontWeight: "bold",
    color: "#ffffff",
    fontSize: "13px",
  },
  watchItemRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    position: "relative",
    paddingRight: "20px",
  },
  watchPrice: {
    fontSize: "13px",
    color: "#ffffff",
  },
  watchChange: {
    fontSize: "11px",
    fontWeight: "bold",
    marginTop: "2px",
  },
  removeWatchBtn: {
    position: "absolute",
    right: 0,
    top: "10px",
    backgroundColor: "transparent",
    border: "none",
    color: "#787b86",
    cursor: "pointer",
    opacity: 0.5,
  },
  watchLoading: {
    fontSize: "12px",
    color: "#787b86",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    position: "relative",
    minHeight: 0,
  },
  welcomeContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    backgroundColor: "#131722",
  },
  dashboardGrid: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
  },
  topRow: {
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    padding: "16px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
  },
  statsContainer: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#171b26",
    border: "1px solid #2a2e39",
    borderRadius: "8px",
    padding: "12px 24px",
    gap: "24px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  statLabel: {
    fontSize: "12.5px",
    color: "#787b86",
    marginBottom: "6px",
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: "18.5px",
    fontWeight: "bold",
    color: "#d1d4dc",
    display: "flex",
    alignItems: "baseline",
    gap: "4px",
  },
  statDivider: {
    width: "1px",
    height: "36px",
    backgroundColor: "#2a2e39",
  },
  leftColumn: {
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #2a2e39",
    overflow: "hidden",
    height: "100%",
    minHeight: 0,
  },
  rightColumn: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#171b26",
    overflow: "hidden",
    height: "100%",
    minHeight: 0,
  },
  summaryCard: {
    backgroundColor: "#171b26",
    borderBottom: "1px solid #2a2e39",
    display: "flex",
    flexDirection: "column",
    flex: "0 1 auto",
    maxHeight: "32vh",
    minHeight: "104px",
    overflow: "hidden",
  },
  recommendationCard: {
    backgroundColor: "#171b26",
    borderBottom: "1px solid #2a2e39",
    display: "flex",
    flexDirection: "column",
    flex: "0 1 auto",
    maxHeight: "32vh",
    minHeight: "104px",
    overflow: "hidden",
  },
  cardHeader: {
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    padding: "8px 12px",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#ffffff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBodyAuto: {
    flex: 1,
    padding: "16px 20px",
    overflowY: "visible",
    fontSize: "14.5px",
    lineHeight: "1.6",
    color: "#d1d4dc",
  },
  cardBodyAutoScroll: {
    flex: 1,
    padding: "12px 16px",
    overflowY: "auto",
    minHeight: 0,
    fontSize: "14.5px",
    lineHeight: "1.6",
    color: "#d1d4dc",
  },
  tickerInfo: {
    display: "flex",
    alignItems: "baseline",
    gap: "12px",
    flexWrap: "wrap",
  },
  tickerName: {
    fontSize: "26px",
    fontWeight: "bold",
    color: "#ffffff",
  },
  tickerSymbol: {
    fontSize: "15px",
    color: "#787b86",
  },
  priceContainer: {
    display: "flex",
    alignItems: "baseline",
    gap: "8px",
  },
  currentPrice: {
    fontSize: "26px",
    fontWeight: "bold",
    color: "#ffffff",
  },
  priceChange: {
    fontSize: "15px",
    fontWeight: "bold",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },
  scoreCard: {
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    border: "1px solid #2962ff",
    borderRadius: "6px",
    padding: "10px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 4px 12px rgba(41, 98, 255, 0.15)",
  },
  scoreVal: {
    fontSize: "26px",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "4px",
  },
  scoreSub: {
    fontSize: "11px",
    color: "#787b86",
    marginTop: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  workspaceGrid: {
    display: "grid",
    gridTemplateColumns: "3fr 2fr",
    flex: 1,
    minHeight: "620px",
    overflow: "hidden",
  },
  chartArea: {
    display: "flex",
    flexDirection: "column",
    overflow: "auto",
    flex: 1,
    minHeight: "460px",
  },
  chartSelector: {
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
  periodBtn: {
    border: "none",
    color: "#ffffff",
    padding: "4px 10px",
    fontSize: "12px",
    borderRadius: "3px",
    cursor: "pointer",
    fontWeight: 600,
  },
  reportArea: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#171b26",
    overflow: "hidden",
    flex: 1,
  },
  reportHeader: {
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    padding: "10px 16px",
    fontSize: "14px",
    fontWeight: "bold",
    color: "#ffffff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  llmBadge: {
    fontSize: "11px",
    color: "#34a853",
    backgroundColor: "rgba(52,168,83,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
  },
  ruleBadge: {
    fontSize: "11px",
    color: "#fbbf24",
    backgroundColor: "rgba(251,191,36,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
  },
  reportScroll: {
    flex: 1,
    padding: "16px 20px",
    overflowY: "auto",
    lineHeight: "1.65",
    fontSize: "14.5px",
    color: "#d1d4dc",
  },

  // Markdown rendering styles
  mdH2: {
    fontSize: "16.5px",
    fontWeight: "bold",
    color: "#ffffff",
    borderLeft: "3px solid #2962ff",
    paddingLeft: "8px",
    marginTop: "18px",
    marginBottom: "10px",
  },
  mdH3: {
    fontSize: "14.5px",
    fontWeight: "bold",
    color: "#ffffff",
    marginTop: "12px",
    marginBottom: "6px",
  },
  mdUl: {
    paddingLeft: "16px",
    marginBottom: "6px",
  },
  mdLi: {
    fontSize: "14.5px",
    marginBottom: "4px",
    color: "#d1d4dc",
  },
  mdP: {
    fontSize: "14.5px",
    marginBottom: "10px",
    color: "#b2b5be",
  },
  mdHr: {
    border: "none",
    borderTop: "1px solid #2a2e39",
    margin: "16px 0",
  },
  mockWarningBanner: {
    backgroundColor: "#fbbf24",
    color: "#0f172a",
    padding: "8px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13.5px",
    fontWeight: 500,
    zIndex: 9,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
  },
  closeWarningBtn: {
    backgroundColor: "transparent",
    border: "none",
    color: "#0f172a",
    fontSize: "16px",
    cursor: "pointer",
    fontWeight: "bold",
    padding: "0 4px",
    display: "flex",
    alignItems: "center",
  },
  eastMoneyBadge: {
    fontSize: "11px",
    color: "#089981",
    backgroundColor: "rgba(8,153,129,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  tonghuashunBadge: {
    fontSize: "11px",
    color: "#f59e0b",
    backgroundColor: "rgba(245,158,11,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  yahooBadge: {
    fontSize: "11px",
    color: "#2962ff",
    backgroundColor: "rgba(41,98,255,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  kabutanBadge: {
    fontSize: "11px",
    color: "#38bdf8",
    backgroundColor: "rgba(56,189,248,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  providerBadge: {
    fontSize: "11px",
    color: "#a78bfa",
    backgroundColor: "rgba(167,139,250,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  mockBadge: {
    fontSize: "11px",
    color: "#fbbf24",
    backgroundColor: "rgba(251,191,36,0.15)",
    padding: "2px 6px",
    borderRadius: "10px",
    fontWeight: "bold",
    marginLeft: "8px",
    display: "inline-block",
  },
  welcomeHero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    maxWidth: "700px",
    marginBottom: "32px",
  },
  welcomeFeatures: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    width: "100%",
    maxWidth: "760px",
    marginBottom: "32px",
  },
  featureCard: {
    backgroundColor: "#171b26",
    border: "1px solid #2a2e39",
    borderRadius: "8px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    transition: "border-color 0.2s, transform 0.2s",
  },
  featureIcon: {
    fontSize: "24px",
  },
  featureTitle: {
    fontSize: "15px",
    fontWeight: "bold",
    color: "#ffffff",
  },
  featureDesc: {
    fontSize: "13px",
    color: "#787b86",
    lineHeight: "1.5",
  },
  welcomeGuide: {
    backgroundColor: "#1c2030",
    border: "1px solid #2a2e39",
    borderRadius: "8px",
    padding: "20px 24px",
    width: "100%",
    maxWidth: "760px",
    marginBottom: "32px",
  },
  guideTitle: {
    fontSize: "15px",
    fontWeight: "bold",
    color: "#ffffff",
    marginBottom: "16px",
  },
  guideSteps: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  guideStepItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "13.5px",
    color: "#d1d4dc",
  },
  guideStepNumber: {
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    backgroundColor: "#2a2e39",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: "bold",
    color: "#2962ff",
    flexShrink: 0,
  },
  welcomeQuickStart: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
  },
  quickStartTitle: {
    fontSize: "14px",
    color: "#787b86",
    fontWeight: 600,
  },
  quickStartBadges: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  quickBadgeBtn: {
    backgroundColor: "#2962ff",
    border: "none",
    color: "#ffffff",
    padding: "8px 16px",
    fontSize: "13.5px",
    fontWeight: "bold",
    borderRadius: "20px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(41, 98, 255, 0.25)",
    transition: "transform 0.2s, background-color 0.2s",
  },
};
