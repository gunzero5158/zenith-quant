"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore, useCallback } from "react";
import dynamic from "next/dynamic";
import { BrainCircuit, Info, ListChecks, Search, Settings, Star, TrendingUp, TrendingDown, RefreshCw, Trash2 } from "lucide-react";
import LoadingOverlay from "@/components/LoadingOverlay";
import SettingsModal from "@/components/SettingsModal";
import MarkdownBlock from "@/components/MarkdownBlock";
import WelcomeScreen from "@/components/WelcomeScreen";
import PromoFooter from "@/components/PromoFooter";
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
import {
  AppLanguage,
  EffectiveLanguage,
  TRANSLATIONS,
  isAppLanguage,
} from "@/lib/i18n/translations";
import { styles } from "./pageStyles";

// Keep lightweight-charts out of the initial bundle
const StockChart = dynamic(() => import("@/components/StockChart"), { ssr: false });

interface SearchSuggestion {
  symbol: string;
  name: string;
  exchDisp: string;
  typeDisp: string;
}
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
const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const subscribeMounted = () => () => undefined;
const getClientMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;


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


const LANG_OPTION_STYLE: React.CSSProperties = { backgroundColor: "#1c2030", color: "#ffffff" };

export default function Home() {
  const mounted = useSyncExternalStore(subscribeMounted, getClientMountedSnapshot, getServerMountedSnapshot);
  const [activeSymbol, setActiveSymbol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchingSuggestions, setSearchingSuggestions] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [stockData, setStockData] = useState<StockAnalysisData | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly">("daily");
  const [showMockWarning, setShowMockWarning] = useState(true);

  const lastRequestedSymbolRef = useRef("");
  const analyzeAbortRef = useRef<AbortController | null>(null);
  const currentRequestSymbolRef = useRef("");
  const watchlistHydratedRef = useRef(false);
  const suggestionQueryRef = useRef("");
  const searchRequestRef = useRef<{
    query: string;
    promise: Promise<SearchSuggestion[]>;
  } | null>(null);
  const searchSubmittingRef = useRef(false);

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

  const requestSearchSuggestions = useCallback((query: string): Promise<SearchSuggestion[]> => {
    const normalizedQuery = query.trim();
    if (searchRequestRef.current?.query === normalizedQuery) {
      return searchRequestRef.current.promise;
    }

    const promise = fetch(`/api/search?q=${encodeURIComponent(normalizedQuery)}`)
      .then(async (response) => {
        if (!response.ok) return [];
        const data = await response.json() as SearchResponse;
        return data.quotes || [];
      })
      .catch((error: unknown) => {
        console.error("Fetch autocomplete suggestions failed:", error);
        return [];
      });
    searchRequestRef.current = { query: normalizedQuery, promise };
    return promise;
  }, []);

  // Autocomplete suggestion fetcher
  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length === 0) {
      return;
    }

    let cancelled = false;
    const delayDebounceFn = setTimeout(async () => {
      const results = await requestSearchSuggestions(query);
      if (cancelled) return;
      suggestionQueryRef.current = query;
      setSuggestions(results);
      setShowSuggestions(true);
      setSearchingSuggestions(false);
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(delayDebounceFn);
    };
  }, [requestSearchSuggestions, searchQuery]);

  const handleSelectSymbol = (sym: string) => {
    setActiveSymbol(normalizeManualSymbolInput(sym));
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const handleSearchSubmit = async () => {
    const query = searchQuery.trim();
    if (!query || searchSubmittingRef.current) return;
    searchSubmittingRef.current = true;
    if (suggestionQueryRef.current === query && suggestions[0]?.symbol) {
      handleSelectSymbol(suggestions[0].symbol);
      searchSubmittingRef.current = false;
      return;
    }

    const isExplicitTicker = (
      /^[A-Z]{1,5}$/i.test(query) ||
      /^\d{6}(?:\.(?:SS|SH|SZ))?$/i.test(query) ||
      /^\d{1,5}\.HK$/i.test(query) ||
      /^\d{3}[0-9A-Z]\.T$/i.test(query)
    );
    if (isExplicitTicker) {
      handleSelectSymbol(query.toUpperCase());
      searchSubmittingRef.current = false;
      return;
    }

    const results = await requestSearchSuggestions(query);
    handleSelectSymbol(results[0]?.symbol || query.toUpperCase());
    searchSubmittingRef.current = false;
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
        .pulse-indicator {
          animation: indicator-pulse 1.8s infinite ease-in-out;
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
              setSuggestions([]);
              suggestionQueryRef.current = "";
              if (value.trim().length === 0) {
                setShowSuggestions(false);
                setSearchingSuggestions(false);
              } else {
                setShowSuggestions(true);
                setSearchingSuggestions(true);
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
          {showSuggestions && searchingSuggestions && suggestions.length === 0 && (
            <div style={styles.suggestionsDropdown}>
              <div style={styles.suggestionItem}>{t.loadingText}</div>
            </div>
          )}
          {showSuggestions && !searchingSuggestions && searchQuery.trim() && suggestions.length === 0 && (
            <div style={styles.suggestionsDropdown}>
              <div style={styles.suggestionItem}>{t.noSearchResults}</div>
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
                      <span style={styles.eastMoneyBadge}>⚡ {t.sourceEastMoney}</span>
                    )}
                    {stockData.dataSource === "tonghuashun" && (
                      <span style={styles.tonghuashunBadge}>⚡ {t.sourceTonghuashun}</span>
                    )}
                    {(stockData.dataSource === "yahoo" || stockData.dataSource === "yahoo-chart") && (
                      <span style={styles.yahooBadge}>🌐 {t.sourceYahoo}</span>
                    )}
                    {stockData.dataSource === "tencent" && (
                      <span style={styles.providerBadge}>⚡ {t.sourceTencent}</span>
                    )}
                    {stockData.dataSource === "kabutan" && (
                      <span style={styles.providerBadge}>🌐 {t.sourceKabutan}</span>
                    )}
                    {stockData.dataSource === "twelve-data" && (
                      <span style={styles.providerBadge}>🌐 Twelve Data</span>
                    )}
                    {stockData.dataSource === "fmp" && (
                      <span style={styles.providerBadge}>🌐 FMP</span>
                    )}
                    {stockData.dataSource === "provider" && (
                      <span style={styles.providerBadge}>🌐 {t.sourceMarketApi}</span>
                    )}
                    {scorePresentation?.dataStatus && (
                      <span style={styles.dataStatus}>{scorePresentation.dataStatus}</span>
                    )}
                    {stockData.dataSource === "mock" && (
                      <span style={styles.mockBadge}>⚠️ {t.sourceMock}</span>
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
            <WelcomeScreen
              analysisMode={analysisMode}
              t={t}
              onAnalysisModeChange={setAnalysisMode}
              onSelectSymbol={handleSelectSymbol}
            />
          )}
        </main>

      </div>

      <aside className="app-disclaimer" style={styles.disclaimer} role="note">
        <Info size={13} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span>{t.disclaimer}</span>
      </aside>

      <PromoFooter effectiveLang={effectiveLang} />


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
