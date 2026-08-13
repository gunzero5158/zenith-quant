"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import dynamic from "next/dynamic";
import { BrainCircuit, Check, Database, Info, ListChecks, Search, Settings, ShieldAlert, Star, TrendingUp, TrendingDown, RefreshCw, Trash2, Zap } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import SettingsModal from "@/components/SettingsModal";
import { LLMConfig } from "@/lib/analysis/llmProxy";
import { formatMarketPrice, getMarketCurrencySymbol, normalizeManualSymbolInput } from "@/lib/analysis/market";
import { Candle, IchimokuResult } from "@/lib/analysis/indicators";
import { EntryAssessment, ScoreDetail } from "@/lib/analysis/scoring";
import { AiEntryAssessment } from "@/lib/analysis/aiAnalysisResult";
import { AnalysisMode, DEFAULT_ANALYSIS_MODE, isAnalysisMode } from "@/lib/analysis/analysisMode";
import { PatternResult } from "@/lib/analysis/patterns";
import { WaveAnalysisResult } from "@/lib/analysis/waveTheory";
import { ChanLunResult } from "@/lib/analysis/chanlun";
import { SupportResistanceResult } from "@/lib/analysis/supportResistance";
import { VolumeAnalysisResult } from "@/lib/analysis/volumeForce";
import {
  ANALYSIS_CACHE_VERSION,
  isAnalysisCacheCompatible,
  isAnalysisCacheReusableByTime,
  isAShareAnalysisCacheReusable,
  isAShareSymbol,
  isMarketTrading,
} from "@/lib/analysis/analysisCache";
import { DataQuality, ScenarioStatus } from "@/lib/analysis/evidence";
import { buildEntryScorePresentation } from "@/lib/analysis/presentation";
import { mergeAnalysisQuoteIntoWatchlist, WatchQuote } from "@/lib/analysis/watchlistQuote";

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
  entryAssessment?: EntryAssessment | AiEntryAssessment;
  analysisMode?: AnalysisMode;
  dataQuality?: DataQuality;
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
  version: number;
  timestamp: number;
  language: EffectiveLanguage;
  data: StockAnalysisData;
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

async function fetchQuoteMap(symbols: string, signal?: AbortSignal): Promise<Record<string, WatchQuote>> {
  const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`Quote request failed (${res.status})`);
  }

  const data = await res.json() as QuotesResponse;
  const quotes = data.quotes || {};
  return Object.fromEntries(
    Object.entries(quotes).filter(([, quote]) => (
      Number.isFinite(quote?.price) && Number.isFinite(quote?.change)
    ))
  );
}

const APP_LANGUAGES: AppLanguage[] = ["auto", "zh-CN", "zh-TW", "en", "ja"];

const isAppLanguage = (value: string): value is AppLanguage => APP_LANGUAGES.includes(value as AppLanguage);

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const subscribeMounted = () => () => undefined;
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

const TRANSLATIONS: Record<string, Record<string, string>> = {
  "zh-CN": {
    title: "天台分析",
    logo: "天台分析",
    disclaimer: "本工具仅基于公开行情、常规技术指标及 AI 提供分析参考，不构成投资建议或买卖指导。市场有风险，投资决策请独立判断并自行承担风险。",
    searchPlaceholder: "输入代码或拼音搜索... (e.g. AAPL, 700, 600519)",
    llmSettings: "大模型配置",
    watchlist: "分析历史",
    lastAnalyzed: "上次 {time}",
    loading: "正在实时获取并分析 {symbol} 多周期数据，请稍候...",
    scoreLabel: "买点魅力分",
    supportLabel: "支撑位 (近期极值)",
    resistanceLabel: "压力位 (近期极值)",
    pocLabel: "筹码密集峰 (POC)",
    overviewHeader: "🔮 智能分析综述",
    strategyHeader: "💡 交易策略建议",
    technicalHeader: "🔬 各类技术指标与形态分析",
    welcomeTitle: "欢迎使用天台分析",
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
    fallbackDesc: "若大模型因额度不足/网络异常等原因生成失败，允许自动降级并启用内置技术指标算法计算评分与报表。",
    analysisModeLabel: "分析模式", ruleAiMode: "规则评分 + AI", aiNativeMode: "纯 AI 分析",
    welcomeEyebrow: "双引擎技术分析工作台",
    welcomeIntro: "基于同一份客观行情与技术指标，选择规则框架复核，或让 AI 独立完成判断。",
    modeSectionTitle: "选择本次分析方式",
    modeSectionSubtitle: "切换只改变结论如何形成，不改变底层行情、K 线和技术指标。",
    ruleAiSummary: "本地规则先形成可解释的基础分，AI 再结合完整证据复核结论。",
    ruleAiPoint1: "固定评分维度，结果稳定、便于横向比较",
    ruleAiPoint2: "AI 调整限制在 ±0.5，保留规则约束",
    ruleAiBestFor: "适合：稳定筛选、连续跟踪、结果复核",
    aiNativeSummary: "不向 AI 提供规则分或预设走势，由模型根据客观证据独立评分与分析。",
    aiNativePoint1: "AI 自主判断走势、入场质量与置信度",
    aiNativePoint2: "独立生成左右侧状态、风险方案与结论",
    aiNativeBestFor: "适合：开放判断、复杂结构、观点探索",
    selectedMode: "当前模式",
    selectMode: "选择此模式",
    objectiveTitle: "统一客观数据底座",
    objectiveDesc: "两种模式共享真实行情、日周 K 线、EMA、MACD、KDJ、RSI、成交量、支撑压力、形态与结构证据。",
    riskNoticeTitle: "分析边界与风险提示",
    riskNoticeDesc: "本工具提供基于公开行情和技术指标的客观分析，不构成投资建议、收益承诺或买卖指令。AI 与规则模型均可能出错，投资决策请独立判断并自行承担风险。",
    guideTitle: "新手快速入门",
    guideSubtitle: "完成一次分析只需四步，配置会保存在当前浏览器中。",
    guideStep1Title: "配置 AI 模型",
    guideStep1Desc: "在右上角打开大模型配置，填写提供商、模型与 API Key。",
    guideStep2Title: "选择分析模式",
    guideStep2Desc: "按需求选择规则评分 + AI，或由 AI 独立判断。",
    guideStep3Title: "输入股票代码",
    guideStep3Desc: "使用顶部搜索框，也可从分析历史或示例标的进入。",
    guideStep4Title: "查看分析结论",
    guideStep4Desc: "结合趋势、证据、入场条件和风险方案独立决策。",
    quickStartTitle: "选择标的开始分析",
    quickStartDesc: "先选择分析模式，再搜索股票代码或从下方示例开始。"
  },
  "zh-TW": {
    title: "天台分析",
    logo: "天台分析",
    disclaimer: "本工具僅基於公開行情、常規技術指標及 AI 提供分析參考，不構成投資建議或買賣指導。市場有風險，投資決策請獨立判斷並自行承擔風險。",
    searchPlaceholder: "輸入代碼或拼音搜尋... (e.g. AAPL, 700, 600519)",
    llmSettings: "大模型配置",
    watchlist: "分析歷史",
    lastAnalyzed: "上次 {time}",
    loading: "正在實時獲取並分析 {symbol} 多週期數據，請稍候...",
    scoreLabel: "買點魅力分",
    supportLabel: "支撐位 (近期極值)",
    resistanceLabel: "壓力位 (近期極值)",
    pocLabel: "籌碼密集峰 (POC)",
    overviewHeader: "🔮 智能分析綜述",
    strategyHeader: "💡 交易策略建議",
    technicalHeader: "🔬 各類技術指標與形態分析",
    welcomeTitle: "歡迎使用天台分析",
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
    fallbackDesc: "若大模型因額度不足/網絡異常等原因生成失敗，允許自動降級並啟用內置技術指標算法計算評分與報表。",
    analysisModeLabel: "分析模式", ruleAiMode: "規則評分 + AI", aiNativeMode: "純 AI 分析",
    welcomeEyebrow: "雙引擎技術分析工作台",
    welcomeIntro: "基於同一份客觀行情與技術指標，選擇規則框架複核，或讓 AI 獨立完成判斷。",
    modeSectionTitle: "選擇本次分析方式",
    modeSectionSubtitle: "切換只改變結論如何形成，不改變底層行情、K 線和技術指標。",
    ruleAiSummary: "本地規則先形成可解釋的基礎分，AI 再結合完整證據複核結論。",
    ruleAiPoint1: "固定評分維度，結果穩定、便於橫向比較",
    ruleAiPoint2: "AI 調整限制在 ±0.5，保留規則約束",
    ruleAiBestFor: "適合：穩定篩選、連續追蹤、結果複核",
    aiNativeSummary: "不向 AI 提供規則分或預設走勢，由模型根據客觀證據獨立評分與分析。",
    aiNativePoint1: "AI 自主判斷走勢、入場品質與置信度",
    aiNativePoint2: "獨立生成左右側狀態、風險方案與結論",
    aiNativeBestFor: "適合：開放判斷、複雜結構、觀點探索",
    selectedMode: "目前模式",
    selectMode: "選擇此模式",
    objectiveTitle: "統一客觀數據底座",
    objectiveDesc: "兩種模式共享真實行情、日週 K 線、EMA、MACD、KDJ、RSI、成交量、支撐壓力、形態與結構證據。",
    riskNoticeTitle: "分析邊界與風險提示",
    riskNoticeDesc: "本工具提供基於公開行情和技術指標的客觀分析，不構成投資建議、收益承諾或買賣指令。AI 與規則模型均可能出錯，投資決策請獨立判斷並自行承擔風險。",
    guideTitle: "新手快速入門",
    guideSubtitle: "完成一次分析只需四步，設定會保存在目前瀏覽器中。",
    guideStep1Title: "設定 AI 模型",
    guideStep1Desc: "在右上角開啟大模型設定，填寫供應商、模型與 API Key。",
    guideStep2Title: "選擇分析模式",
    guideStep2Desc: "按需求選擇規則評分 + AI，或由 AI 獨立判斷。",
    guideStep3Title: "輸入股票代碼",
    guideStep3Desc: "使用頂部搜尋框，也可從分析歷史或範例標的進入。",
    guideStep4Title: "查看分析結論",
    guideStep4Desc: "結合趨勢、證據、入場條件和風險方案獨立決策。",
    quickStartTitle: "選擇標的開始分析",
    quickStartDesc: "先選擇分析模式，再搜尋股票代碼或從下方範例開始。"
  },
  "en": {
    title: "Rooftop Quant",
    logo: "Rooftop Quant",
    disclaimer: "AI analysis based on public market data and standard technical indicators. Not investment advice or trading guidance. Markets involve risk; decide independently and at your own risk.",
    searchPlaceholder: "Enter ticker to search... (e.g., AAPL, 0700.HK)",
    llmSettings: "LLM Config",
    watchlist: "Analysis History",
    lastAnalyzed: "Last {time}",
    loading: "Fetching and analyzing multi-period data for {symbol}, please wait...",
    scoreLabel: "Entry Appeal Score",
    supportLabel: "Support (Recent Pivot)",
    resistanceLabel: "Resistance (Recent Pivot)",
    pocLabel: "Volume Profile POC",
    overviewHeader: "🔮 AI Analysis Overview",
    strategyHeader: "💡 Trading Strategy & Advice",
    technicalHeader: "🔬 Technical Indicators & Patterns",
    welcomeTitle: "Welcome to Rooftop Quant",
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
    fallbackDesc: "If LLM generation fails due to network/quota limits, allow automatic fallback to built-in technical indicators scoring & report.",
    analysisModeLabel: "Analysis mode", ruleAiMode: "Rules + AI", aiNativeMode: "AI Native",
    welcomeEyebrow: "Dual-engine technical analysis workspace",
    welcomeIntro: "Use the same objective market data and indicators with either a governed rule framework or independent AI judgment.",
    modeSectionTitle: "Choose how this analysis is formed",
    modeSectionSubtitle: "Switching modes changes the decision process, not the underlying quotes, candles, or indicators.",
    ruleAiSummary: "Local rules produce an explainable base score, then AI reviews the conclusion against the full evidence set.",
    ruleAiPoint1: "Fixed scoring dimensions for stable comparison",
    ruleAiPoint2: "AI adjustment limited to ±0.5 under rule constraints",
    ruleAiBestFor: "Best for: screening, ongoing tracking, and review",
    aiNativeSummary: "AI receives no rule score or predetermined outlook and independently evaluates the objective evidence.",
    aiNativePoint1: "AI judges outlook, entry quality, and confidence",
    aiNativePoint2: "Independent setup states, risk plan, and conclusion",
    aiNativeBestFor: "Best for: open judgment and complex structures",
    selectedMode: "Current mode",
    selectMode: "Select mode",
    objectiveTitle: "One objective data foundation",
    objectiveDesc: "Both modes share live quotes, daily and weekly candles, EMA, MACD, KDJ, RSI, volume, levels, patterns, and structural evidence.",
    riskNoticeTitle: "Analysis boundary and risk notice",
    riskNoticeDesc: "This tool provides objective analysis based on public market data and technical indicators. It is not investment advice, a return guarantee, or a trading instruction. AI and rule models can be wrong; make independent decisions and bear your own risk.",
    guideTitle: "Quick start",
    guideSubtitle: "Complete an analysis in four steps. Your model settings stay in this browser.",
    guideStep1Title: "Configure an AI model",
    guideStep1Desc: "Open Model Settings at the top right and enter the provider, model, and API key.",
    guideStep2Title: "Choose an analysis mode",
    guideStep2Desc: "Use Rules + AI for governed scoring, or AI Native for independent judgment.",
    guideStep3Title: "Enter a stock ticker",
    guideStep3Desc: "Use the top search bar, analysis history, or one of the example symbols.",
    guideStep4Title: "Review the conclusion",
    guideStep4Desc: "Use the trend, evidence, entry conditions, and risk plan to make your own decision.",
    quickStartTitle: "Choose a symbol to begin",
    quickStartDesc: "Select an analysis mode, then search a ticker or start with an example below."
  },
  "ja": {
    title: "屋上クオンツ",
    logo: "屋上クオンツ",
    disclaimer: "公開市場データ、一般的なテクニカル指標、AI による参考分析です。投資助言・売買指示ではありません。投資判断はご自身の責任で行ってください。",
    searchPlaceholder: "コードを入力... (e.g. AAPL, 700)",
    llmSettings: "AIモデル設定",
    watchlist: "分析履歴",
    lastAnalyzed: "前回 {time}",
    loading: "{symbol} の複数周期データを取得・分析中、しばらくお待ちください...",
    scoreLabel: "買い場魅力度",
    supportLabel: "サポートライン (支持線)",
    resistanceLabel: "レジスタンスライン (抵抗線)",
    pocLabel: "価格帯別出来高 POC",
    overviewHeader: "🔮 AI相場概況サマリー",
    strategyHeader: "💡 推奨取引戦略・アドバイス",
    technicalHeader: "🔬 テクニカル指標・パターン分析詳細",
    welcomeTitle: "屋上クオンツへようこそ",
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
    fallbackDesc: "大モデルの生成がネットワークエラーやクォータ不足で失敗した場合、組み込みのテクニカル分析アルゴリズムによるスコアとレポートへの自动切り替えを許可します。",
    analysisModeLabel: "分析モード", ruleAiMode: "ルール + AI", aiNativeMode: "AI判断",
    welcomeEyebrow: "デュアルエンジン・テクニカル分析ワークスペース",
    welcomeIntro: "同じ客観的な市場データと指標を使い、ルールに基づく評価または AI の独自判断を選べます。",
    modeSectionTitle: "今回の分析方法を選択",
    modeSectionSubtitle: "モード切替で変わるのは結論の形成方法だけで、株価、ローソク足、指標は共通です。",
    ruleAiSummary: "ローカルルールが説明可能な基礎スコアを作成し、AI が全根拠から結論を再評価します。",
    ruleAiPoint1: "固定評価軸により安定した比較が可能",
    ruleAiPoint2: "AI 調整は ±0.5 以内でルール制約を維持",
    ruleAiBestFor: "用途：スクリーニング、継続追跡、結果確認",
    aiNativeSummary: "ルールスコアや事前の見通しを渡さず、AI が客観的根拠から独自に評価します。",
    aiNativePoint1: "AI が見通し、エントリー品質、確信度を判断",
    aiNativePoint2: "左右状態、リスク計画、結論を独自生成",
    aiNativeBestFor: "用途：自由な判断、複雑な構造、見解探索",
    selectedMode: "現在のモード",
    selectMode: "このモードを選択",
    objectiveTitle: "共通の客観データ基盤",
    objectiveDesc: "両モードは実際の株価、日足・週足、EMA、MACD、KDJ、RSI、出来高、支持抵抗、パターン、構造根拠を共有します。",
    riskNoticeTitle: "分析範囲とリスク注意",
    riskNoticeDesc: "本ツールは公開市場データとテクニカル指標に基づく客観的分析を提供します。投資助言、収益保証、売買指示ではありません。AI とルールモデルは誤る可能性があり、投資判断はご自身の責任で行ってください。",
    guideTitle: "クイックスタート",
    guideSubtitle: "4つの手順で分析を開始できます。モデル設定はこのブラウザに保存されます。",
    guideStep1Title: "AIモデルを設定",
    guideStep1Desc: "右上のモデル設定を開き、プロバイダー、モデル、APIキーを入力します。",
    guideStep2Title: "分析モードを選択",
    guideStep2Desc: "ルール + AI、または AI による独自判断を選びます。",
    guideStep3Title: "銘柄コードを入力",
    guideStep3Desc: "上部の検索欄、分析履歴、または例示銘柄から開始します。",
    guideStep4Title: "分析結果を確認",
    guideStep4Desc: "トレンド、根拠、エントリー条件、リスク計画から独自に判断します。",
    quickStartTitle: "銘柄を選んで分析開始",
    quickStartDesc: "分析モードを選択し、銘柄コードを検索するか、下の例から開始してください。"
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
const ANALYSIS_TIMESTAMPS_KEY = "zenith_analysis_timestamps";
const analysisCacheId = (symbol: string, mode: AnalysisMode) => `${mode}:${symbol}`;
const analysisCacheKey = (id: string) => `zenith_analysis_${id}`;

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
const touchAnalysisCache = (symbol: string, mode: AnalysisMode) => {
  try {
    const id = analysisCacheId(symbol, mode);
    const updated = [id, ...readAnalysisCacheIndex().filter((item) => item !== id)];
    for (const evicted of updated.slice(ANALYSIS_CACHE_LIMIT)) {
      localStorage.removeItem(analysisCacheKey(evicted));
    }
    localStorage.setItem(ANALYSIS_CACHE_INDEX_KEY, JSON.stringify(updated.slice(0, ANALYSIS_CACHE_LIMIT)));
  } catch (e) {
    console.error("Update analysis cache index failed:", e);
  }
};

const readAnalysisCache = (symbol: string, mode: AnalysisMode): AnalysisCacheEntry | null => {
  try {
    const cachedStr = localStorage.getItem(analysisCacheKey(analysisCacheId(symbol, mode)));
    if (!cachedStr) return null;
    return JSON.parse(cachedStr) as AnalysisCacheEntry;
  } catch (e) {
    console.error("Cache parse error", e);
    return null;
  }
};

const writeAnalysisCache = (symbol: string, mode: AnalysisMode, entry: AnalysisCacheEntry) => {
  try {
    localStorage.setItem(analysisCacheKey(analysisCacheId(symbol, mode)), JSON.stringify(entry));
    touchAnalysisCache(symbol, mode);
  } catch (e) {
    console.error("Failed to save cache", e);
  }
};

const removeAnalysisCache = (symbol: string, mode: AnalysisMode) => {
  try {
    const id = analysisCacheId(symbol, mode);
    localStorage.removeItem(analysisCacheKey(id));
    localStorage.setItem(
      ANALYSIS_CACHE_INDEX_KEY,
      JSON.stringify(readAnalysisCacheIndex().filter((item) => item !== id))
    );
  } catch (e) {
    console.error("Failed to remove cache", e);
  }
};

const readAnalysisTimestamps = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(ANALYSIS_TIMESTAMPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => (
        typeof entry[1] === "number" && Number.isFinite(entry[1])
      ))
    );
  } catch (e) {
    console.error("Read analysis timestamps failed:", e);
    return {};
  }
};

const writeAnalysisTimestamps = (timestamps: Record<string, number>) => {
  try {
    localStorage.setItem(ANALYSIS_TIMESTAMPS_KEY, JSON.stringify(timestamps));
  } catch (e) {
    console.error("Write analysis timestamps failed:", e);
  }
};

const resolveEffectiveLanguage = (language: AppLanguage): EffectiveLanguage => {
  if (language !== "auto") return language;
  const navLang = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "zh-cn";
  if (navLang.includes("zh-tw") || navLang.includes("zh-hk") || navLang.includes("zh-mo")) return "zh-TW";
  if (navLang.includes("zh")) return "zh-CN";
  if (navLang.includes("ja")) return "ja";
  return "en";
};

const ANALYSIS_TIMESTAMP_LOCALES: Record<EffectiveLanguage, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
};

const formatAnalysisTimestamp = (timestamp: number, language: EffectiveLanguage): string => (
  new Intl.DateTimeFormat(ANALYSIS_TIMESTAMP_LOCALES[language], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp))
);

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
  const [analysisTimestamps, setAnalysisTimestamps] = useState<Record<string, number>>({});

  const recordAnalysisTimestamp = useCallback((symbol: string, timestamp: number) => {
    setAnalysisTimestamps((previous) => ({ ...previous, [symbol]: timestamp }));
    writeAnalysisTimestamps({ ...readAnalysisTimestamps(), [symbol]: timestamp });
  }, []);

  const syncAnalysisQuoteToWatchlist = useCallback((data: StockAnalysisData, symbol: string) => {
    setWatchlistQuotes((previous) => {
      const updated = mergeAnalysisQuoteIntoWatchlist(previous, {
        symbol,
        price: data.price,
        changePercent: data.changePercent,
        isMock: data.isMock,
      });
      localStorage.setItem("watchlistQuotes", JSON.stringify(updated));
      return updated;
    });
  }, []);

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
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>(DEFAULT_ANALYSIS_MODE);

  const getEffectiveLang = (): EffectiveLanguage => {
    if (!mounted) return "zh-CN"; // SSR and first hydration render must be identical to avoid mismatch
    return resolveEffectiveLanguage(appLanguage);
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

      const savedAnalysisMode = localStorage.getItem("zenith_analysis_mode");
      if (isAnalysisMode(savedAnalysisMode)) {
        setAnalysisMode(savedAnalysisMode);
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

    let cancelled = false;
    const symbols = watchlistKey.split(",");
    queueMicrotask(() => {
      if (cancelled) return;
      const timestamps = readAnalysisTimestamps();
      let changed = false;
      for (const symbol of symbols) {
        if (timestamps[symbol]) continue;
        const cached = readAnalysisCache(symbol, analysisMode)
          ?? readAnalysisCache(symbol, DEFAULT_ANALYSIS_MODE);
        if (cached?.timestamp && Number.isFinite(cached.timestamp)) {
          timestamps[symbol] = cached.timestamp;
          changed = true;
        }
      }
      setAnalysisTimestamps(timestamps);
      if (changed) writeAnalysisTimestamps(timestamps);
    });

    return () => {
      cancelled = true;
    };
  }, [analysisMode, watchlistKey]);

  useEffect(() => {
    if (!watchlistKey) return;

    const fetchWatchlistQuotes = async () => {
      try {
        const newQuotes = await fetchQuoteMap(watchlistKey);
        setWatchlistQuotes(newQuotes);
        localStorage.setItem("watchlistQuotes", JSON.stringify(newQuotes));
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
    const requestLang = resolveEffectiveLanguage(appLanguage);
    currentRequestSymbolRef.current = requestedSymbol;

    if (!isForce) {
      let cachedObj = readAnalysisCache(requestedSymbol, analysisMode);
      if (cachedObj && !isAnalysisCacheCompatible(cachedObj.version, cachedObj.language, requestLang)) {
        removeAnalysisCache(requestedSymbol, analysisMode);
        cachedObj = null;
      }
      if (cachedObj) {
        try {
          const cachedData = cachedObj.data;
          const nowTimestamp = Date.now();
          const marketTrading = isMarketTrading(requestedSymbol, nowTimestamp);

          if (cachedData.isMock) {
            removeAnalysisCache(requestedSymbol, analysisMode);
          } else {
            let canReuseCache = isAnalysisCacheReusableByTime(
              requestedSymbol,
              cachedObj.timestamp,
              nowTimestamp
            );

            if (canReuseCache && !marketTrading && isAShareSymbol(requestedSymbol)) {
              canReuseCache = false;
              try {
                const latestQuotes = await fetchQuoteMap(requestedSymbol);
                if (currentRequestSymbolRef.current !== requestedSymbol) return;

                const latestQuote = latestQuotes[requestedSymbol.toUpperCase()];
                if (latestQuote) {
                  setWatchlistQuotes((previous) => {
                    const updated = { ...previous, [requestedSymbol]: latestQuote };
                    localStorage.setItem("watchlistQuotes", JSON.stringify(updated));
                    return updated;
                  });

                  canReuseCache = isAShareAnalysisCacheReusable({
                    symbol: requestedSymbol,
                    cacheTimestamp: cachedObj.timestamp,
                    nowTimestamp: Date.now(),
                    cachedQuote: {
                      price: cachedData.price,
                      change: cachedData.changePercent,
                    },
                    latestQuote,
                  });
                }
              } catch (e) {
                console.warn("Validate A-share analysis cache failed:", e);
              }
            }

            if (!canReuseCache) {
              removeAnalysisCache(requestedSymbol, analysisMode);
            } else {
              console.log("[CACHE] Using cached analysis for", requestedSymbol);
              touchAnalysisCache(requestedSymbol, analysisMode);
              const resolvedSymbol = cachedData.symbol || requestedSymbol;
              // A cache hit supersedes any in-flight analysis request
              analyzeAbortRef.current?.abort();
              analyzeAbortRef.current = null;
              currentRequestSymbolRef.current = resolvedSymbol;
              setLoading(false);
              setStockData(cachedData);
              recordAnalysisTimestamp(resolvedSymbol, cachedObj.timestamp);
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

    setStockData(null);
    setLoading(true);

    const requestT = TRANSLATIONS[requestLang];

    try {
      let quoteSnapshot: { symbol: string; price: number; change: number } | undefined;
      if (isAShareSymbol(requestedSymbol)) {
        const latestQuotes = await fetchQuoteMap(requestedSymbol, controller.signal);
        if (analyzeAbortRef.current !== controller || currentRequestSymbolRef.current !== requestedSymbol) return;

        const latestQuote = latestQuotes[requestedSymbol.toUpperCase()];
        if (latestQuote && !latestQuote.isMock) {
          quoteSnapshot = {
            symbol: requestedSymbol.toUpperCase(),
            price: latestQuote.price,
            change: latestQuote.change,
          };
          setWatchlistQuotes((previous) => {
            const updated = { ...previous, [requestedSymbol]: latestQuote };
            localStorage.setItem("watchlistQuotes", JSON.stringify(updated));
            return updated;
          });
        }
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: requestedSymbol,
          llmConfig: config.apiKey ? config : undefined,
          language: requestLang,
          useFallback,
          quoteSnapshot,
          analysisMode,
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
      syncAnalysisQuoteToWatchlist(data, resolvedSymbol);
      if (resolvedSymbol !== requestedSymbol) {
        lastRequestedSymbolRef.current = resolvedSymbol;
        setActiveSymbol(resolvedSymbol);
      }
      setShowMockWarning(true);

      const analyzedAt = Date.now();
      recordAnalysisTimestamp(resolvedSymbol, analyzedAt);

      if (!data.isMock) {
        writeAnalysisCache(resolvedSymbol, analysisMode, {
          version: ANALYSIS_CACHE_VERSION,
          timestamp: analyzedAt,
          language: requestLang,
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
  }, [activeSymbol, analysisMode, appLanguage, llmConfig, recordAnalysisTimestamp, syncAnalysisQuoteToWatchlist, useFallback]);

  const fetchActiveStockDataRef = useRef(fetchActiveStockData);
  useEffect(() => {
    fetchActiveStockDataRef.current = fetchActiveStockData;
  }, [fetchActiveStockData]);

  const previousLanguageSelectionRef = useRef<AppLanguage>(appLanguage);
  useEffect(() => {
    if (previousLanguageSelectionRef.current === appLanguage) return;
    previousLanguageSelectionRef.current = appLanguage;
    if (!activeSymbol) return;
    removeAnalysisCache(activeSymbol, analysisMode);
    queueMicrotask(() => fetchActiveStockDataRef.current(true));
  }, [activeSymbol, analysisMode, appLanguage]);

  const previousAnalysisModeRef = useRef<AnalysisMode>(analysisMode);
  useEffect(() => {
    if (previousAnalysisModeRef.current === analysisMode) return;
    previousAnalysisModeRef.current = analysisMode;
    localStorage.setItem("zenith_analysis_mode", analysisMode);
    analyzeAbortRef.current?.abort();
    analyzeAbortRef.current = null;
    setStockData(null);
    if (activeSymbol) queueMicrotask(() => fetchActiveStockDataRef.current());
  }, [activeSymbol, analysisMode]);

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

  const handleSearchSubmit = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    if (suggestions[0]?.symbol) {
      handleSelectSymbol(suggestions[0].symbol);
      return;
    }
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json() as SearchResponse;
        if (data.quotes?.[0]?.symbol) {
          handleSelectSymbol(data.quotes[0].symbol);
          return;
        }
      }
    } catch (error: unknown) {
      console.warn("Resolve submitted search query failed:", error);
    }
    handleSelectSymbol(query.toUpperCase());
  };

  const handleHistorySelect = (symbol: string) => {
    if (symbol === activeSymbol) {
      void fetchActiveStockDataRef.current();
      return;
    }
    setActiveSymbol(symbol);
  };

  const handleRemoveWatchlist = (sym: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting the item
    setWatchlist((prev) => prev.filter((item) => item !== sym));
    const timestamps = readAnalysisTimestamps();
    delete timestamps[sym];
    writeAnalysisTimestamps(timestamps);
    setAnalysisTimestamps(timestamps);
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

  const scorePresentation = stockData?.entryAssessment
    ? buildEntryScorePresentation(stockData.entryAssessment, effectiveLang, stockData.dataQuality)
    : undefined;
  const scenarioTone = (status: ScenarioStatus): React.CSSProperties => ({
    color: status === "triggered" ? "#089981" : status === "provisional" ? "#2962ff" : status === "too_late" ? "#f23645" : status === "watch" ? "#fbbf24" : "#787b86",
    borderColor: status === "triggered" ? "rgba(8,153,129,0.45)" : status === "provisional" ? "rgba(41,98,255,0.45)" : status === "too_late" ? "rgba(242,54,69,0.45)" : status === "watch" ? "rgba(251,191,36,0.45)" : "#363c4e",
  });

  return (
    <div className="app-shell" style={styles.container}>
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
      <header className="app-header" style={styles.header}>
        <div className="app-brand" style={styles.brand}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#2dd4bf"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: "drop-shadow(0 0 5px rgba(45, 212, 191, 0.38))",
              marginRight: "4px"
            }}
          >
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
          <span className="app-logo-text" style={styles.logoText}>{t.logo}</span>
        </div>

        {/* Search & Autocomplete */}
        <div ref={searchRef} className="app-search" style={styles.searchContainer}>
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
                e.preventDefault();
                void handleSearchSubmit();
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

        <div className="analysis-mode-switch" role="group" aria-label={t.analysisModeLabel} style={styles.analysisModeSwitch}>
          {(["rule-ai", "ai-native"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={analysisMode === mode}
              onClick={() => setAnalysisMode(mode)}
              style={{
                ...styles.analysisModeButton,
                ...(analysisMode === mode
                  ? mode === "rule-ai"
                    ? styles.ruleModeButtonActive
                    : styles.aiModeButtonActive
                  : {}),
              }}
            >
              {mode === "rule-ai" ? <ListChecks size={15} /> : <BrainCircuit size={15} />}
              {mode === "rule-ai" ? t.ruleAiMode : t.aiNativeMode}
            </button>
          ))}
        </div>

        {/* Toolbar Settings */}
        <div className="app-header-actions" style={styles.headerRight}>
          <div className="app-language" style={styles.langSelectContainer}>
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

          <button className="app-settings" aria-label={t.llmSettings} onClick={() => setIsSettingsOpen(true)} style={styles.settingsBtn}>
            <Settings size={18} style={{ marginRight: "6px" }} />
            <span className="app-settings-label">{t.llmSettings}</span>
          </button>
          <button className="app-refresh" aria-label="Refresh" onClick={() => fetchActiveStockData(true)} style={styles.refreshBtn}>
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      {/* 2. Mock Data Warning Banner */}
      {stockData?.isMock && showMockWarning && (
        <div className="mock-warning" style={styles.mockWarningBanner}>
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
      <div className="app-body" style={styles.body}>
        {/* Left Watchlist Sidebar */}
        <aside className="app-sidebar" style={styles.sidebar}>
          <div className="app-sidebar-header" style={styles.sidebarHeader}>{t.watchlist}</div>
          <div className="app-watchlist" style={styles.watchlistContainer}>
            {watchlist.map((sym) => {
              const quote = watchlistQuotes[sym];
              const isUp = quote ? quote.change >= 0 : true;
              const analysisTimestamp = analysisTimestamps[sym];
              const formattedAnalysisTime = analysisTimestamp
                ? formatAnalysisTimestamp(analysisTimestamp, effectiveLang)
                : "";
              return (
                <div
                  key={sym}
                  onClick={() => handleHistorySelect(sym)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleHistorySelect(sym);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="app-watch-item"
                  style={{
                    ...styles.watchItem,
                    backgroundColor: activeSymbol === sym ? "#2a2e39" : "transparent",
                  }}
                >
                  <div style={styles.watchItemLeft}>
                    <span style={styles.watchSymbol}>{sym}</span>
                    {analysisTimestamp && (
                      <span
                        style={styles.watchTimestamp}
                        title={new Date(analysisTimestamp).toLocaleString(ANALYSIS_TIMESTAMP_LOCALES[effectiveLang])}
                      >
                        {t.lastAnalyzed.replace("{time}", formattedAnalysisTime)}
                      </span>
                    )}
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
        <main className="app-main" style={styles.main}>
          {loading ? (
            <LoadingOverlay key={activeSymbol} symbol={activeSymbol} effectiveLang={effectiveLang} />
          ) : stockData ? (
            <div className="dashboard-grid" style={styles.dashboardGrid}>
              <div className="dashboard-top" style={styles.topRow}>
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
                    {stockData.dataSource === "tencent" && (
                      <span style={styles.providerBadge}>⚡ 腾讯行情</span>
                    )}
                    {stockData.dataSource === "kabutan" && (
                      <span style={styles.providerBadge}>🌐 株探</span>
                    )}
                    {stockData.dataSource === "twelve-data" && (
                      <span style={styles.providerBadge}>🌐 Twelve Data</span>
                    )}
                    {stockData.dataSource === "fmp" && (
                      <span style={styles.providerBadge}>🌐 FMP</span>
                    )}
                    {stockData.dataSource === "provider" && (
                      <span style={styles.providerBadge}>🌐 Market Data API</span>
                    )}
                    {scorePresentation?.dataStatus && (
                      <span style={styles.dataStatus}>{scorePresentation.dataStatus}</span>
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

                <div className="stats-grid" style={styles.statsContainer}>
                  <div className="stat-item stat-item-score" style={styles.statItem}>
                    <span style={styles.statLabel}>{scorePresentation?.finalLabel || t.scoreLabel}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={styles.statValue}>
                        <span style={{ fontSize: "20px", color: "#2962ff" }}>{scorePresentation?.finalText || stockData.score.totalScore.toFixed(1)}</span>
                        <span style={{ fontSize: "11px", color: "#787b86" }}>/ 5.0</span>
                      </div>
                      <div>{renderStarRating(stockData.entryAssessment?.finalScore ?? stockData.score.totalScore)}</div>
                    </div>
                    {scorePresentation && stockData.entryAssessment && (
                      <>
                        <div style={styles.scoreBreakdownRow}>
                          {scorePresentation.mode === "ai-native" ? (
                            <>
                              <span>{scorePresentation.confidenceLabel} {scorePresentation.confidenceText}</span>
                              <span>{scorePresentation.outlookLabel} {scorePresentation.outlookText}</span>
                            </>
                          ) : (
                            <>
                              <span>{scorePresentation.ruleLabel} {scorePresentation.ruleText}</span>
                              <span style={{ color: "aiAdjustment" in stockData.entryAssessment && stockData.entryAssessment.aiAdjustment < 0 ? "#f23645" : "aiAdjustment" in stockData.entryAssessment && stockData.entryAssessment.aiAdjustment > 0 ? "#089981" : "#787b86" }}>
                                {scorePresentation.adjustmentLabel} {scorePresentation.adjustmentText}
                              </span>
                            </>
                          )}
                        </div>
                        <div style={styles.scenarioRow}>
                          <span style={{ ...styles.scenarioBadge, ...scenarioTone(stockData.entryAssessment.leftStatus) }}>
                            {scorePresentation.leftLabel} {scorePresentation.leftText}
                          </span>
                          <span style={{ ...styles.scenarioBadge, ...scenarioTone(stockData.entryAssessment.rightStatus) }}>
                            {scorePresentation.rightLabel} {scorePresentation.rightText}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="stat-divider" style={styles.statDivider} />

                  <div className="stat-item" style={styles.statItem}>
                    <span style={styles.statLabel}>{t.supportLabel}</span>
                    <span style={{ ...styles.statValue, color: "#089981" }}>
                      {stockData.sr.horizontalSupports[0] ? `${stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}${stockData.sr.horizontalSupports[0].toFixed(2)}` : t.noSupport}
                    </span>
                  </div>

                  <div className="stat-divider" style={styles.statDivider} />

                  <div className="stat-item" style={styles.statItem}>
                    <span style={styles.statLabel}>{t.resistanceLabel}</span>
                    <span style={{ ...styles.statValue, color: "#f23645" }}>
                      {stockData.sr.horizontalResistances[0] ? `${stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}${stockData.sr.horizontalResistances[0].toFixed(2)}` : t.noResistance}
                    </span>
                  </div>

                  <div className="stat-divider" style={styles.statDivider} />

                  <div className="stat-item" style={styles.statItem}>
                    <span style={styles.statLabel}>{t.pocLabel}</span>
                    <span style={{ ...styles.statValue, color: "#fbbf24" }}>
                      {stockData.currencySymbol || getMarketCurrencySymbol(stockData.symbol || activeSymbol)}{stockData.sr.volumePOC.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="workspace-grid" style={styles.workspaceGrid}>
                <div className="workspace-primary" style={styles.leftColumn}>
                  <div className="summary-card" style={styles.summaryCard}>
                    <div style={styles.cardHeader}>{t.overviewHeader}</div>
                    <div style={styles.cardBodyAutoScroll}>
                      <MarkdownBlock text={stockData.reportOverview} effectiveLang={effectiveLang} />
                    </div>
                  </div>
                  
                  <div className="chart-area" style={styles.chartArea}>
                    <div className="chart-selector" style={styles.chartSelector}>
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

                <div className="workspace-secondary" style={styles.rightColumn}>
                  <div className="recommendation-card" style={styles.recommendationCard}>
                    <div style={styles.cardHeader}>{t.strategyHeader}</div>
                    <div style={styles.cardBodyAutoScroll}>
                      <MarkdownBlock text={stockData.reportRecommendation} effectiveLang={effectiveLang} />
                    </div>
                  </div>

                  <div className="report-area" style={styles.reportArea}>
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
                    {([
                      {
                        mode: "rule-ai" as const,
                        icon: ListChecks,
                        title: t.ruleAiMode,
                        summary: t.ruleAiSummary,
                        points: [t.ruleAiPoint1, t.ruleAiPoint2],
                        bestFor: t.ruleAiBestFor,
                        accent: "#2dd4bf",
                        accentSoft: "rgba(45, 212, 191, 0.10)",
                        border: "rgba(45, 212, 191, 0.58)",
                      },
                      {
                        mode: "ai-native" as const,
                        icon: BrainCircuit,
                        title: t.aiNativeMode,
                        summary: t.aiNativeSummary,
                        points: [t.aiNativePoint1, t.aiNativePoint2],
                        bestFor: t.aiNativeBestFor,
                        accent: "#fbbf24",
                        accentSoft: "rgba(251, 191, 36, 0.10)",
                        border: "rgba(251, 191, 36, 0.58)",
                      },
                    ]).map((option) => {
                      const selected = analysisMode === option.mode;
                      const ModeIcon = option.icon;
                      return (
                        <button
                          key={option.mode}
                          type="button"
                          className="mode-card"
                          aria-pressed={selected}
                          onClick={() => setAnalysisMode(option.mode)}
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
                          <strong style={styles.modeTitle}>{option.title}</strong>
                          <span style={styles.modeSummary}>{option.summary}</span>
                          <span style={styles.modePoints}>
                            {option.points.map((point: string) => (
                              <span key={point} style={styles.modePoint}><Check size={14} color={option.accent} /> {point}</span>
                            ))}
                          </span>
                          <span style={{ ...styles.modeBestFor, borderColor: option.border }}>{option.bestFor}</span>
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
                    {[
                      { icon: Settings, title: t.guideStep1Title, desc: t.guideStep1Desc },
                      { icon: ListChecks, title: t.guideStep2Title, desc: t.guideStep2Desc },
                      { icon: Search, title: t.guideStep3Title, desc: t.guideStep3Desc },
                      { icon: TrendingUp, title: t.guideStep4Title, desc: t.guideStep4Desc },
                    ].map((step, index) => {
                      const StepIcon = step.icon;
                      return (
                        <div className="guide-step" style={styles.guideStep} key={step.title}>
                          <div style={styles.guideStepMarker}>
                            <span style={styles.guideStepNumber}>{index + 1}</span>
                            <StepIcon size={17} color="#5eead4" />
                          </div>
                          <strong style={styles.guideStepTitle}>{step.title}</strong>
                          <p style={styles.guideStepDesc}>{step.desc}</p>
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
                    <button onClick={() => handleSelectSymbol("AAPL")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                      AAPL
                    </button>
                    <button onClick={() => handleSelectSymbol("0700.HK")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                      0700.HK
                    </button>
                    <button onClick={() => handleSelectSymbol("600519.SS")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                      600519.SS
                    </button>
                    <button onClick={() => handleSelectSymbol("9984.T")} className="quick-badge-btn" style={styles.quickBadgeBtn}>
                      9984.T
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>

      </div>

      <aside className="app-disclaimer" style={styles.disclaimer} role="note">
        <Info size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{t.disclaimer}</span>
      </aside>

      {/* 4. APIMax.io Bottom Banner Ad - tri-language - Always Constant */}
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
          {effectiveLang === "en" && (
            <>
              No API Key yet? Get all-in-one API access at{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#5eead4", fontWeight: "bold", textDecoration: "underline" }}
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
                style={{ color: "#5eead4", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              — GPT / Claude / Gemini / DeepSeek などのマルチモデルAPIキーとトークンを一撃で購入。
            </>
          )}
          {effectiveLang === "zh-CN" && (
            <>
              还没有 API Key？前往{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#5eead4", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              一键购买多合一大模型 API 和 Token（支持 GPT / Claude / Gemini / DeepSeek 等主流模型）
            </>
          )}
          {effectiveLang === "zh-TW" && (
            <>
              還沒有 API Key？前往{" "}
              <a
                href="https://apimax.io"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#5eead4", fontWeight: "bold", textDecoration: "underline" }}
              >
                APIMax.io
              </a>{" "}
              一鍵購買多合一大模型 API 和 Token（支援 GPT / Claude / Gemini / DeepSeek 等主流模型）
            </>
          )}
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
          {effectiveLang === "en" ? "Buy API Key & Token" : effectiveLang === "ja" ? "APIトークンを購入" : effectiveLang === "zh-TW" ? "購買 API 和 Token" : "购买 API 和 Token"}
        </a>
      </div>


      {/* 3. Settings Dialog */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          initialConfig={llmConfig}
          appLanguage={appLanguage}
          onLanguageChange={setAppLanguage}
          analysisMode={analysisMode}
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
    backgroundColor: "#111822",
    borderBottom: "1px solid #263244",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    zIndex: 10,
  },
  analysisModeSwitch: {
    display: "flex",
    alignItems: "center",
    height: "40px",
    padding: "4px",
    gap: "4px",
    backgroundColor: "#0b1018",
    border: "1px solid #334155",
    borderRadius: "7px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  analysisModeButton: {
    height: "30px",
    padding: "0 12px",
    border: "1px solid transparent",
    borderRadius: "5px",
    backgroundColor: "transparent",
    color: "#9aa7b8",
    fontSize: "12px",
    fontWeight: 700,
    whiteSpace: "nowrap",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "7px",
    transition: "background-color 160ms ease, color 160ms ease, border-color 160ms ease",
  },
  ruleModeButtonActive: {
    backgroundColor: "rgba(45, 212, 191, 0.16)",
    borderColor: "rgba(45, 212, 191, 0.58)",
    color: "#5eead4",
  },
  aiModeButtonActive: {
    backgroundColor: "rgba(251, 191, 36, 0.14)",
    borderColor: "rgba(251, 191, 36, 0.58)",
    color: "#fcd34d",
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
    letterSpacing: 0,
  },
  disclaimer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    gap: "7px",
    padding: "6px 16px",
    borderTop: "1px solid #2a2e39",
    backgroundColor: "#11151f",
    color: "#8b93a7",
    fontSize: "11px",
    lineHeight: 1.45,
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
    minWidth: 0,
    flex: 1,
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
    flexShrink: 0,
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
    justifyContent: "flex-start",
    height: "100%",
    backgroundColor: "#0b1018",
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
    flexWrap: "wrap",
  },
  watchTimestamp: {
    color: "#787b86",
    fontSize: "12px",
    lineHeight: 1.35,
    marginTop: "3px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  statsContainer: {
    display: "flex",
    alignItems: "center",
    backgroundColor: "#171b26",
    border: "1px solid #2a2e39",
    borderRadius: "8px",
    padding: "12px 24px",
    gap: "24px",
    flexWrap: "wrap",
    justifyContent: "center",
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
  scoreBreakdownRow: {
    display: "flex",
    gap: "10px",
    marginTop: "6px",
    color: "#787b86",
    fontSize: "11px",
    lineHeight: 1.35,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  scenarioRow: {
    display: "flex",
    gap: "6px",
    marginTop: "6px",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  scenarioBadge: {
    border: "1px solid #363c4e",
    borderRadius: "4px",
    padding: "2px 5px",
    fontSize: "10.5px",
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  },
  dataStatus: {
    color: "#787b86",
    fontSize: "10.5px",
    lineHeight: 1.3,
    maxWidth: "260px",
    overflowWrap: "anywhere",
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
  welcomeContent: {
    width: "min(100%, 980px)",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
  },
  welcomeHero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left",
    maxWidth: "760px",
    gap: "8px",
    paddingTop: "4px",
  },
  welcomeEyebrow: {
    color: "#5eead4",
    fontSize: "12px",
    fontWeight: 800,
    textTransform: "uppercase",
  },
  welcomeTitle: {
    color: "#f8fafc",
    fontSize: "34px",
    lineHeight: 1.2,
    fontWeight: 780,
  },
  welcomeSubtitle: {
    color: "#9aa7b8",
    fontSize: "15px",
    lineHeight: 1.65,
    maxWidth: "720px",
  },
  welcomeModeSection: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  welcomeSectionHeading: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "16px",
  },
  welcomeSectionTitle: {
    color: "#f8fafc",
    fontSize: "18px",
    lineHeight: 1.35,
    fontWeight: 750,
  },
  welcomeSectionSubtitle: {
    color: "#8b98aa",
    fontSize: "13px",
    lineHeight: 1.55,
    marginTop: "5px",
  },
  sharedDataBadge: {
    display: "flex",
    alignItems: "center",
    gap: "7px",
    color: "#b8c4d3",
    border: "1px solid #334155",
    backgroundColor: "#111822",
    borderRadius: "6px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: 650,
    whiteSpace: "nowrap",
  },
  welcomeModeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },
  welcomeModeCard: {
    width: "100%",
    minHeight: "250px",
    border: "1px solid",
    borderRadius: "8px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    textAlign: "left",
    color: "#d8e1ea",
    cursor: "pointer",
    transition: "background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
  },
  modeCardTop: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    marginBottom: "16px",
  },
  modeIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  modeSelectionState: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontWeight: 750,
  },
  modeTitle: {
    color: "#f8fafc",
    fontSize: "17px",
    lineHeight: 1.35,
    marginBottom: "7px",
  },
  modeSummary: {
    color: "#a6b1c1",
    fontSize: "13px",
    lineHeight: 1.55,
    minHeight: "41px",
  },
  modePoints: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    marginTop: "15px",
  },
  modePoint: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    color: "#cbd5e1",
    fontSize: "12.5px",
    lineHeight: 1.45,
  },
  modeBestFor: {
    marginTop: "auto",
    paddingTop: "14px",
    borderTop: "1px solid",
    width: "100%",
    color: "#94a3b8",
    fontSize: "12px",
    lineHeight: 1.45,
  },
  welcomeInfoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "14px",
  },
  objectivePanel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "16px 18px",
    border: "1px solid #263244",
    borderRadius: "8px",
    backgroundColor: "#101720",
  },
  riskPanel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    padding: "16px 18px",
    border: "1px solid rgba(251, 191, 36, 0.32)",
    borderRadius: "8px",
    backgroundColor: "rgba(251, 191, 36, 0.055)",
  },
  infoPanelTitle: {
    color: "#e5edf5",
    fontSize: "13.5px",
    lineHeight: 1.35,
    fontWeight: 750,
    marginBottom: "5px",
  },
  infoPanelText: {
    color: "#94a3b8",
    fontSize: "12.5px",
    lineHeight: 1.55,
  },
  welcomeGuide: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    paddingTop: "4px",
  },
  guideHeading: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "20px",
  },
  guideSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "1px",
    overflow: "hidden",
    border: "1px solid #263244",
    borderRadius: "7px",
    backgroundColor: "#263244",
  },
  guideStep: {
    minHeight: "152px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    backgroundColor: "#111822",
  },
  guideStepMarker: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  },
  guideStepNumber: {
    color: "#0b1018",
    backgroundColor: "#2dd4bf",
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    fontWeight: 800,
  },
  guideStepTitle: {
    color: "#e5edf5",
    fontSize: "13.5px",
    lineHeight: 1.4,
    marginBottom: "7px",
  },
  guideStepDesc: {
    color: "#8b98aa",
    fontSize: "12px",
    lineHeight: 1.55,
  },
  welcomeQuickStart: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    paddingTop: "4px",
  },
  quickStartTitle: {
    fontSize: "14px",
    color: "#e5edf5",
    fontWeight: 750,
  },
  quickStartDesc: {
    fontSize: "12px",
    color: "#768499",
    lineHeight: 1.45,
    marginTop: "4px",
  },
  quickStartBadges: {
    display: "flex",
    gap: "12px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  quickBadgeBtn: {
    backgroundColor: "#172230",
    border: "1px solid #334155",
    color: "#d9e4ee",
    padding: "8px 14px",
    fontSize: "12.5px",
    fontWeight: "bold",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 160ms ease, border-color 160ms ease",
  },
};
