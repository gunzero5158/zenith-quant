import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { Candle, calculateEMA, calculateBOLL, calculateMACD, calculateKDJ, calculateRSI, calculateATR } from "@/lib/analysis/indicators";
import { convertSymbolToSina, fetchSinaAShareKlines } from "./sinaUtils";

const yahooFinance = new YahooFinance();
import { analyzePriceVolume } from "@/lib/analysis/volumeForce";
import { calculateSupportResistance } from "@/lib/analysis/supportResistance";
import { analyzeWaveTheory } from "@/lib/analysis/waveTheory";
import { analyzeChanLun } from "@/lib/analysis/chanlun";
import { analyzePatterns } from "@/lib/analysis/patterns";
import { calculateStockScore } from "@/lib/analysis/scoring";
import { generateFallbackReport } from "@/lib/analysis/fallbackReport";
import { generateLLMReport, LLMConfig } from "@/lib/analysis/llmProxy";
import { generateMockCandles } from "@/lib/analysis/mockData";

// Simple in-memory cache for technical analysis data (1 hour TTL)
interface CacheEntry {
  timestamp: number;
  data: {
    dailyCandles: Candle[];
    weeklyCandles: Candle[];
    indicators: any;
    patterns: any;
    wave: any;
    chanlun: any;
    sr: any;
    score: any;
    price: number;
    changePercent: number;
    companyName: string;
    companyNameEn?: string;
    volumeAnalysis: any;
    isMock?: boolean;
    dataSource?: 'yahoo' | 'eastmoney' | 'sina' | 'mock';
  };
}

const techCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, llmConfig, language, useFallback } = body as { symbol: string; llmConfig?: LLMConfig; language?: string; useFallback?: boolean };
    const effectiveLang = language || "zh-CN";

    if (!symbol) {
      return NextResponse.json({ error: "Missing stock symbol" }, { status: 400 });
    }

    const cleanSymbol = symbol.trim().toUpperCase();
    const cacheKey = `${cleanSymbol}_${effectiveLang}`;
    const now = Date.now();

    let techData: CacheEntry["data"];

    // Check if technical data is cached
    if (techCache[cacheKey] && now - techCache[cacheKey].timestamp < CACHE_TTL) {
      techData = techCache[cacheKey].data;
    } else {
      // 1. Fetch stock data with fallback to EastMoney and mock data
      let dailyCandles: Candle[] = [];
      let weeklyCandles: Candle[] = [];
      let companyName = cleanSymbol;
      let companyNameEn = "";
      let currentPrice = 0;
      let changePercent = 0;
      let isMock = false;
      let dataSource: 'yahoo' | 'eastmoney' | 'sina' | 'mock' = 'yahoo';

      try {
        let quote: any = null;
        try {
          quote = (await yahooFinance.quote(cleanSymbol)) as any;
        } catch (err: any) {
          console.error("Yahoo Quote error for:", cleanSymbol, err);
          throw new Error(`无法获取股票 [${cleanSymbol}] 的实时报价: ${err?.message || err}`);
        }

        companyNameEn = quote?.longName || quote?.shortName || "";
        // Try to fetch Chinese/Native name from EastMoney
        try {
          const secid = convertSymbolToEastMoneySecid(cleanSymbol);
          if (secid) {
            const nameRes = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
              headers: { "Referer": "https://quote.eastmoney.com/" }
            });
            if (nameRes.ok) {
              const nameData = await nameRes.json();
              companyName = nameData?.data?.f58 || companyNameEn || cleanSymbol;
            } else {
              companyName = companyNameEn || cleanSymbol;
            }
          } else {
            companyName = companyNameEn || cleanSymbol;
          }
        } catch (e) {
          companyName = companyNameEn || cleanSymbol;
        }

        currentPrice = quote?.regularMarketPrice || 0;
        changePercent = quote?.regularMarketChangePercent || 0;

        // 2. Fetch historical candles
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const threeYearsAgo = new Date();
        threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
        const today = new Date();

        const dailyRaw = (await yahooFinance.historical(cleanSymbol, {
          period1: oneYearAgo,
          period2: today,
          interval: "1d",
        })) as any[];

        const weeklyRaw = (await yahooFinance.historical(cleanSymbol, {
          period1: threeYearsAgo,
          period2: today,
          interval: "1wk",
        })) as any[];

        if (!dailyRaw || dailyRaw.length < 65) {
          throw new Error("雅虎财经返回的K线数据长度不足(少于65天)");
        }

        dailyCandles = dailyRaw
          .filter((c: any) => c.open !== undefined && c.high !== undefined && c.low !== undefined && c.close !== undefined && c.volume !== undefined)
          .map((c: any) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

        weeklyCandles = weeklyRaw
          .filter((c: any) => c.open !== undefined && c.high !== undefined && c.low !== undefined && c.close !== undefined && c.volume !== undefined)
          .map((c: any) => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));

        dataSource = "yahoo";
      } catch (networkErr: any) {
        console.warn("Yahoo Finance fetch failed, attempting EastMoney API:", networkErr);
        const secid = convertSymbolToEastMoneySecid(cleanSymbol);
        let eastMoneySuccess = false;

        if (secid) {
          try {
            console.log(`Fetching EastMoney klines for secid: ${secid}`);
            const dailyRaw = await fetchEastMoneyKlines(secid, false);
            const weeklyRaw = await fetchEastMoneyKlines(secid, true);

            if (dailyRaw.length >= 65) {
              dailyCandles = dailyRaw;
              weeklyCandles = weeklyRaw;

              const lastCandle = dailyCandles[dailyCandles.length - 1];
              const prevCandle = dailyCandles[dailyCandles.length - 2] || lastCandle;

              currentPrice = lastCandle.close;
              changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;

              // Fetch company name from EastMoney Web API
              try {
                const nameRes = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f58`, {
                  headers: { "Referer": "https://quote.eastmoney.com/" }
                });
                if (nameRes.ok) {
                  const nameData = await nameRes.json();
                  companyName = nameData?.data?.f58 || cleanSymbol;
                } else {
                  companyName = cleanSymbol;
                }
              } catch (e) {
                companyName = cleanSymbol;
              }

              isMock = false;
              dataSource = "eastmoney";
              eastMoneySuccess = true;
              console.log(`Successfully loaded real data from EastMoney for: ${companyName}`);
            }
          } catch (emErr: any) {
            console.error("EastMoney API failed as well:", emErr);
          }
        }

        let realDataSuccess = false;

        if (eastMoneySuccess) {
          realDataSuccess = true;
        } else {
          // Try Sina Finance (Only A-share) if EastMoney failed
          const sinaSymbol = convertSymbolToSina(cleanSymbol);
          if (sinaSymbol) {
            try {
              console.log(`Fetching Sina klines for symbol: ${sinaSymbol}`);
              const dailyRaw = await fetchSinaAShareKlines(sinaSymbol, false);
              const weeklyRaw = await fetchSinaAShareKlines(sinaSymbol, true);

              if (dailyRaw.length >= 65) {
                dailyCandles = dailyRaw;
                weeklyCandles = weeklyRaw;

                const lastCandle = dailyCandles[dailyCandles.length - 1];
                const prevCandle = dailyCandles[dailyCandles.length - 2] || lastCandle;

                currentPrice = lastCandle.close;
                changePercent = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;
                companyName = cleanSymbol;

                isMock = false;
                dataSource = "sina";
                realDataSuccess = true;
                console.log(`Successfully loaded real data from Sina for: ${cleanSymbol}`);
              }
            } catch (sinaErr: any) {
              console.error("Sina API failed as well:", sinaErr);
            }
          }
        }

        if (!realDataSuccess) {
          console.warn("All real data APIs (Yahoo, EastMoney, Sina) failed, rolling back to mock data.");
          isMock = true;
          dataSource = "mock";
          const mockDaily = generateMockCandles(cleanSymbol, 250, false);
          const mockWeekly = generateMockCandles(cleanSymbol, 150, true);

          dailyCandles = mockDaily.candles;
          weeklyCandles = mockWeekly.candles;
          companyName = mockDaily.companyName;
          currentPrice = mockDaily.price;
          changePercent = mockDaily.changePercent;
        }
      }

      const latestPrice = currentPrice || dailyCandles[dailyCandles.length - 1].close;

      // 3. Run Technical Calculations
      // Daily Indicators
      const dailyEma5 = calculateEMA(dailyCandles, 5);
      const dailyEma10 = calculateEMA(dailyCandles, 10);
      const dailyEma20 = calculateEMA(dailyCandles, 20);
      const dailyEma60 = calculateEMA(dailyCandles, 60);
      
      const dailyBoll = calculateBOLL(dailyCandles, 20, 2);
      const dailyMacd = calculateMACD(dailyCandles, 12, 26, 9);
      const dailyKdj = calculateKDJ(dailyCandles, 9, 3, 3);
      const dailyRsi = calculateRSI(dailyCandles, 14);
      const dailyAtr = calculateATR(dailyCandles, 14);

      // Weekly Indicators (for resonance)
      const weeklyEma5 = calculateEMA(weeklyCandles, 5);
      const weeklyEma10 = calculateEMA(weeklyCandles, 10);
      const weeklyEma20 = calculateEMA(weeklyCandles, 20);
      const weeklyEma60 = calculateEMA(weeklyCandles, 60);
      const weeklyMacd = calculateMACD(weeklyCandles, 12, 26, 9);

      // Detailed Engines
      const dailyVolumeAnalysis = analyzePriceVolume(dailyCandles);
      const dailyWaveResult = analyzeWaveTheory(dailyCandles);
      const dailyChanLunResult = analyzeChanLun(dailyCandles);

      const latestIdx = dailyCandles.length - 1;
      const dailyPatterns = analyzePatterns(
        dailyCandles,
        dailyMacd.dif,
        dailyRsi,
        dailyKdj.k
      );

      const dailySupportResistance = calculateSupportResistance(
        dailyCandles,
        latestPrice,
        dailyEma20[latestIdx],
        dailyEma60[latestIdx],
        dailyBoll.upper[latestIdx],
        dailyBoll.lower[latestIdx]
      );

      const stockScore = calculateStockScore(
        dailyCandles,
        { ema5: dailyEma5, ema10: dailyEma10, ema20: dailyEma20, ema60: dailyEma60 },
        dailyMacd,
        dailyKdj,
        dailyRsi,
        dailyVolumeAnalysis,
        dailyPatterns,
        dailyWaveResult,
        weeklyCandles,
        { ema5: weeklyEma5, ema10: weeklyEma10, ema20: weeklyEma20, ema60: weeklyEma60 },
        weeklyMacd
      );

      // Save to tech data structure
      techData = {
        dailyCandles,
        weeklyCandles,
        price: latestPrice,
        changePercent,
        companyName,
        companyNameEn,
        indicators: {
          ema5: dailyEma5,
          ema10: dailyEma10,
          ema20: dailyEma20,
          ema60: dailyEma60,
          bollUpper: dailyBoll.upper,
          bollMiddle: dailyBoll.middle,
          bollLower: dailyBoll.lower,
          macdDif: dailyMacd.dif,
          macdDea: dailyMacd.dea,
          macdHist: dailyMacd.hist,
          kdjK: dailyKdj.k,
          kdjD: dailyKdj.d,
          kdjJ: dailyKdj.j,
          rsi: dailyRsi,
          atr: dailyAtr,
        },
        patterns: dailyPatterns,
        wave: dailyWaveResult,
        chanlun: dailyChanLunResult,
        sr: dailySupportResistance,
        score: stockScore,
        volumeAnalysis: dailyVolumeAnalysis,
        isMock,
        dataSource,
      };

      // Write to cache
      techCache[cacheKey] = {
        timestamp: now,
        data: techData,
      };
    }

    // 4. Generate Report (Either LLM or Fallback)
    let reportOverview = "";
    let reportRecommendation = "";
    let reportTechnical = "";
    let isLLMUsed = false;

    if (llmConfig && llmConfig.apiKey) {
      try {
        const prompt = buildAnalystPrompt(cleanSymbol, techData, effectiveLang);
        const reportText = await generateLLMReport(prompt, llmConfig);
        
        // Clean markdown blocks if LLM accidentally outputted them
        let cleanedText = reportText.trim();
        if (cleanedText.startsWith("```json")) {
          cleanedText = cleanedText.substring(7);
        } else if (cleanedText.startsWith("```")) {
          cleanedText = cleanedText.substring(3);
        }
        if (cleanedText.endsWith("```")) {
          cleanedText = cleanedText.substring(0, cleanedText.length - 3);
        }
        cleanedText = cleanedText.trim();

        const parsed = JSON.parse(cleanedText);
        reportOverview = parsed.overview || "";
        reportRecommendation = parsed.recommendation || "";
        reportTechnical = parsed.technicalAnalysis || "";
        isLLMUsed = true;
      } catch (err: any) {
        console.error("LLM Generation or parsing failed:", err);
        // Only fallback to local engine if useFallback is explicitly enabled
        if (useFallback) {
          const fallback = generateFallbackReport(
            `${techData.companyName} (${cleanSymbol})`,
            techData.price,
            techData.changePercent,
            techData.score,
            techData.volumeAnalysis,
            techData.patterns,
            techData.wave,
            techData.chanlun,
            techData.sr,
            effectiveLang
          );
          let errorPrefix = "⚠️ **大模型分析失败，已自动使用本地规则引擎兜底生成。**\n";
          if (effectiveLang === "zh-TW") errorPrefix = "⚠️ **大模型分析失敗，已自動使用本地規則引擎兜底生成。**\n";
          else if (effectiveLang === "en") errorPrefix = "⚠️ **AI analysis failed, fallback report generated by local engine.**\n";
          else if (effectiveLang === "ja") errorPrefix = "⚠️ **AI分析が失敗したため、ローカルルールエンジンによってレポートが生成されました。**\n";
          
          reportOverview = `${errorPrefix}*(Error: ${err?.message || err})*\n\n` + fallback.overview;
          reportRecommendation = fallback.recommendation;
          reportTechnical = fallback.technicalAnalysis;
        } else {
          // No fallback allowed: return the raw LLM error
          return NextResponse.json({
            error: `AI 分析失败: ${err?.message || err}。请检查您的 API Key 与模型配置，或在“大模型配置”中开启本地算法兜底。`,
          }, { status: 500 });
        }
      }
    } else if (useFallback) {
      // No API key but fallback is enabled
      const fallback = generateFallbackReport(
        `${techData.companyName} (${cleanSymbol})`,
        techData.price,
        techData.changePercent,
        techData.score,
        techData.volumeAnalysis,
        techData.patterns,
        techData.wave,
        techData.chanlun,
        techData.sr,
        effectiveLang
      );
      reportOverview = fallback.overview;
      reportRecommendation = fallback.recommendation;
      reportTechnical = fallback.technicalAnalysis;
    } else {
      // No API key and no fallback: return error guiding user to configure
      const errMsg = effectiveLang === "en"
        ? "Please configure your LLM API Key in Settings, or enable the local algorithm fallback engine."
        : effectiveLang === "ja"
        ? "設定画面でAIモデルのAPIキーを構成するか、ローカルアルゴリズムのフォールバックを有効にしてください。"
        : "请在右上角“大模型配置”中填写 API Key，或开启本地算法兜底引擎。";
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    return NextResponse.json({
      symbol: cleanSymbol,
      companyName: techData.companyName,
      companyNameEn: techData.companyNameEn,
      price: techData.price,
      changePercent: techData.changePercent,
      score: techData.score,
      dailyCandles: techData.dailyCandles,
      weeklyCandles: techData.weeklyCandles,
      indicators: techData.indicators,
      patterns: techData.patterns,
      wave: techData.wave,
      chanlun: techData.chanlun,
      sr: techData.sr,
      volumeAnalysis: techData.volumeAnalysis,
      reportOverview,
      reportRecommendation,
      reportTechnical,
      isLLMUsed,
      isMock: techData.isMock,
      dataSource: techData.dataSource,
    });
  } catch (error: any) {
    console.error("API Analyze main thread error:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}

function buildAnalystPrompt(symbol: string, data: CacheEntry["data"], language: string = "zh-CN"): string {
  const score = data.score;
  const sr = data.sr;
  const wave = data.wave;
  const chan = data.chanlun;

  // --- 1. ENGLISH PROMPT ---
  if (language === "en") {
    return `Please act as a senior Wall Street quantitative analyst specializing in TradingView stock ideas. Write a professional, highly insightful, and comprehensive stock analysis report.
The stock to analyze is: **${data.companyName} (${symbol})**, currently priced at **$${data.price.toFixed(2)}** with a daily change of **${data.changePercent.toFixed(2)}%**.

We have computed technical metrics and patterns using mathematical algorithms. Based on the objective data below, write a professional technical report.

### 1. Moving Average Trends & Multi-Period Resonance
- **Overall Quantitative Score**: ${score.totalScore.toFixed(1)} / 5.0
- **Scoring & Resonance Details**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. Support, Resistance & Volume Profile POC
- **Horizontal Support Levels (Historical Extreme Points)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "None"}
- **Horizontal Resistance Levels (Historical Extreme Points)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "None"}
- **Point of Control (POC)**: $${sr.volumePOC}
- **Dynamic Moving Average Support**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL Lower Band=$${sr.dynamicBOLLLower}

### 3. Momentum & Oscillator Indicators (MACD/KDJ/RSI)
- **Latest MACD**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **Latest RSI**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **Latest KDJ**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. Volume Profile & Smart Money Flow
- **Latest CMF (Chaikin Money Flow)**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (Note: CMF > 0.05 indicates net inflow; CMF > 0.15 indicates strong inflow; CMF < -0.05 indicates net outflow)
- **Latest OBV (On-Balance Volume)**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **Volume & Cash Flow Characteristics**: ${data.volumeAnalysis.volumeDescription}
- **Volume Breakout**: ${data.volumeAnalysis.hasVolumeBreakout ? "Yes (Volume Breakout/Volume Selloff)" : "No (No significant volume breakout)"}
- **Price-Volume Divergence**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "Yes (Warning: Price-Volume Divergence)" : "No (Normal price-volume relationship)"}

### 5. Classical Chart Patterns & Divergences
- **Detected Patterns & Divergences**: ${data.patterns.patternDescription}

### 6.神奇九转 (TD Sequential)
- **TD Signal**: ${data.patterns.tdSignal || "No significant TD signal currently"}

### 7. Elliott Wave Theory
- **Current Wave**: ${wave.currentWave}
- **Structure Description**: ${wave.waveDescription}

### 8. Chanlun (Zenith Theory) Structure
- **Current Stroke Direction**: ${chan.currentStrokeDirection === "up" ? "Upward Stroke" : "Downward Stroke"}
- **Detailed Structure & Central Hub (Pivot)**: ${chan.chanlunDescription}

---
### Writing Requirements & Output Format:
You must output a valid JSON string ONLY. Do not wrap it in markdown block tags (no \`\`\`json or \`\`\`).
The entire JSON output (keys and values) must be written in English.

JSON format template:
{
  "overview": "(This is the overall market analysis overview. Write a rich, insightful summary paragraph of 3-4 short paragraphs, analyzing the overall bull/bear state, core trend, and market outlook. Separate paragraphs with double newlines. Do not mention score details.)",
  "recommendation": "(Structured trading advice in markdown list format covering three dimensions:\n- **Existing holders / bullish positions**: dynamic trailing stop strategy, target EMA level, and key price to reduce exposure.\n- **Left-side entry / preparing to buy**: bottom-fishing suitability, support level to scale in, and confirmation signals.\n- **Right-side breakout / momentum chasers**: breakout confirmation and stop-loss placement.\nEach advice must cite concrete price levels from S/R, EMA, or POC.)",
  "technicalAnalysis": "(Core detailed analysis covering: 1. MA Trends & Multi-Period Resonance, 2. Support, Resistance & POC, 3. Momentum (MACD/KDJ/RSI), 4. Volume & Smart Money (CMF and OBV analysis), 5. Chart Patterns & Divergences, 6. TD Sequential, 7. Elliott Wave, 8. Chanlun Structure. Be detailed and cover all 8 items.)"
}

Write in a professional, Wall-Street quantitative analyst tone. Do not invent facts, base strictly on the metrics provided. Please write the entire report in English.
**Important Note**: Please strictly distinguish between 'Smart Money Flow (represented by CMF and OBV)' and 'Momentum/Oscillators (represented by RSI/KDJ/MACD)'. Do not mix them up in the analysis.`;
  }

  // --- 2. JAPANESE PROMPT ---
  if (language === "ja") {
    return `プロのウォール街金融クオンツアナリストとして、TradingView用の極めて洞察に満ちたプロフェッショナルな株式テクニカル分析レポートを作成してください。
分析対象銘柄: **${data.companyName} (${symbol})**、現在価格: **$${data.price.toFixed(2)}**、本日の騰落率: **${data.changePercent.toFixed(2)}%**。

厳密な数学的アルゴリズムを用いて計算された指標データに基づいて、以下の全方位的なレポートを日本語で作成してください。

### 1. 移動平均線トレンドと複数周期共鳴
- **総合クオンツスコア**: ${score.totalScore.toFixed(1)} / 5.0 点
- **スコアリングおよび共鳴根拠**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. サポート・レジスタンスとPOC価格帯出来高
- **水平サポートライン (過去極値)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "なし"}
- **水平レジスタンスライン (過去極値)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "なし"}
- **出来高高密度エリア (POC)**: $${sr.volumePOC}
- **動的移動平均線サポート**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下限=$${sr.dynamicBOLLLower}

### 3. モメンタム・買われすぎ売られすぎ指標 (MACD/KDJ/RSI)
- **MACD最新値**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI最新値**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ最新値**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 出来高分析と主要資金動向
- **CMF (Chaikin Money Flow) 最新値**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 は大口の純流入、CMF > 0.15 は強い流入、CMF < -0.05 は大口の純流出を示します)
- **OBV (On-Balance Volume) 最新値**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **出来高・資金流向特徴**: ${data.volumeAnalysis.volumeDescription}
- **出来高ブレイクアウト**: ${data.volumeAnalysis.hasVolumeBreakout ? "はい (出来高急増ブレイク/急増売り)" : "いいえ"}
- **出来高・価格乖離 (ダイバージェンス)**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "はい (警告：出来高乖離あり)" : "いいえ"}

### 5. チャートパターンとダイバージェンス
- **検出されたパターン・ダイバージェンス**: ${data.patterns.patternDescription}

### 6. 神奇九転 (TD Sequential)
- **TDシグナル**: ${data.patterns.tdSignal || "現在、明らかな九転シグナルはありません"}

### 7. エリオット波動理論
- **現在の波動**: ${wave.currentWave}
- **波動構造説明**: ${wave.waveDescription}

### 8. 纏論 (チャンルン) 構造
- **現在のストローク方向**: ${chan.currentStrokeDirection === "up" ? "上昇筆" : "下降筆"}
- **構造詳細と中枢**: ${chan.chanlunDescription}

---
### レポート作成要件と出力フォーマット：
出力は有効な JSON 文字列のみにしてください（\`\`\`json などのマークダウンブロックタグで囲まないでください）。
JSON 内のすべてのキーと値は 日本語 で記述してください。

JSON出力フォーマット：
{
  "overview": "（相場分析概況サマリー。全体的なトレンド、重要走勢、後市の判断を分析してください。マークダウンの二重改行を用いて3〜4つの段落に適切に分割し、1つの長い段落にまとめないでください。スコア情報は含めないでください。）",
  "recommendation": "（マークダウンのリスト形式による、次の3つの側面の具体的な取引戦略提案：\n- **既存の保有者 / ロングポジション**: トレーリングストップ戦略、対象移動平均線レベル、およびポジション削減をトリガーする重要価格。\n- **逆張りエントリー / 購入準備**: 底値買いの適否、打診買いのサポート水準、確認用シグナル。\n- **順張りブレイクアウト / モメンタム追随**: ブレイクアウトの確認方法、損切りライン。\n提案には必ず上記のサポート/レジスタンス、EMA、POC等の具体的な数値を引用してください。）",
  "technicalAnalysis": "（核心テクニカル分析。以下の項目を漏れなく詳細に分析してください：1. 移動平均線トレンドと複数周期共鳴、2. サポート・レジスタンスとPOC、3. モメンタム指標、4. 出来高と主要資金動向 (CMFとOBVに基づく)、5. チャートパターンとダイバージェンス、6. 神奇九転、7. エリオット波動、8. 纏論構造。8つのステップすべてを含めてください。）"
}

プロフェッショナルなクオンツアナリストのトーンで記述してください。データを捏造せず、提示された事実のみに基づき日本語で作成してください。
**重要事項**: 「出来高と主要資金動向（CMF/OBVで示される）」と「モメンタム指標（RSI/KDJ/MACDで示される）」は厳格に区別してください。これらを分析内で混同しないでください。`;
  }

  // --- 3. TRADITIONAL CHINESE PROMPT ---
  if (language === "zh-TW") {
    return `請作為一名資深華爾街金融量化分析師，撰寫一篇地道、專業、富有洞察力的 TradingView 股票分析想法（Stock Idea）。
你要分析的股票是: **${data.companyName} (${symbol})**，當前價格為 **$${data.price.toFixed(2)}**，今日漲跌幅為 **${data.changePercent.toFixed(2)}%**。

我們已經使用嚴謹的數學演算法，計算出了這隻股票各項指標和形態識別的客觀結果。請根據以下客觀數據，編寫一份全方位專業技術研報。

### 1. 均線趨勢與多週期共振
- **系統綜合打分**: ${score.totalScore.toFixed(1)} / 5.0 分
- **打分與共振依據 (核心動能與均線掃描結果)**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. 支撐阻力與POC籌碼
- **水平支撐位 (歷史極值點)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "無"}
- **水平壓力位 (歷史極值點)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "無"}
- **籌碼密集峰 (POC)**: $${sr.volumePOC}
- **動態均線支撐**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下軌=$${sr.dynamicBOLLLower}

### 3. 動能與超買超賣指標 (MACD/KDJ/RSI)
- **MACD 最新值**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI 最新值**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ 最新值**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 量價與主力資金 (買賣力道)
- **CMF (Chaikin Money Flow) 最新值**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 代表主力淨流入，CMF > 0.15 代表強勁淨流入；CMF < -0.05 代表主力淨流出)
- **OBV (On-Balance Volume) 最新值**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **量價與資金流向特徵**: ${data.volumeAnalysis.volumeDescription}
- **放量突破**: ${data.volumeAnalysis.hasVolumeBreakout ? "是 (放量突破/放量拋售)" : "否 (無明顯放量突破)"}
- **量價背離**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "是 (警告：量價背離)" : "否 (量價配合正常)"}

### 5. 經典幾何形態與頂底背離
- **檢測到的形態與背離**: ${data.patterns.patternDescription}

### 6. 神奇九轉 (TD Sequential)
- **TD信號**: ${data.patterns.tdSignal || "當前無明顯九轉信號"}

### 7. 艾略特波浪理論
- **當前浪型**: ${wave.currentWave}
- **結構描述**: ${wave.waveDescription}

### 8. 纏論結構
- **當前畫筆方向**: ${chan.currentStrokeDirection === "up" ? "向上筆" : "向下筆"}
- **結構細節與中樞**: ${chan.chanlunDescription}

---
### 撰寫要求與輸出格式：
您必須僅輸出一個有效的 JSON 字串。請勿使用 markdown 代碼塊包裹它（不要使用 \`\`\`json 或 \`\`\`）。
JSON 內部的所有屬性值必須使用 繁體中文 撰寫。

JSON 格式要求如下：
{
  "overview": "（這裡是智能分析綜述。撰寫一段豐富、深刻且有洞察力的分析綜述，概括整體多空局勢、核心走勢狀態及後市研判。請務必使用 markdown 雙換行進行合理邏輯分段，分為 3-4 個簡短段落，拒絕長篇大論擠在單一長段落中，絕不包含打分邏輯）",
  "recommendation": "（利用 markdown 列表格式提供以下三個維度的具體交易策略建議：\n- **已有持倉 / 準備看多者**: 動態移動止損策略、跟蹤哪一條 EMA、觸發減倉的關鍵支撐位。\n- **左側交易 / 準備建倉者**: 是否適合抄底、在哪個支撐位附近分批建倉、需要等待什麼確認信號。\n- **右側突破 / 動量追隨者**: 是否確認放量突破、哪裡設置止損位。\n每項建議必須引用上述支撐壓力、EMA、POC 的具體價格。絕不可模糊其詞。）",
  "technicalAnalysis": "（核心詳細分析！必須按分類對以下項目進行全面解讀：1.均線趨勢與多週期共振(日周線關係)，2.支撐阻力與POC籌碼，3.動能指標(MACD/KDJ/RSI)，4.量價與主力資金(買賣力道，基於 CMF 和 OBV 深度分析主力意圖與量價健康度，切勿與 3.動能指標 混為一談)，5.經典幾何形態與頂底背離，6.神奇九轉，7.波浪理論，8.纏論結構。分析必須詳實，8個步驟缺一不可。）"
}

請使用 TradingView 獨有的「技術流」大V語調。不要虛構數據，必須嚴格基於上述給出的指標事實，使用 繁體中文 進行解讀。
**特別注意**：請嚴格區分「買賣力道（量價與主力資金，由 CMF 和 OBV 體現）」和「動能/超買超賣（由 RSI/KDJ/MACD 震盪指標體現）」，嚴禁在分析中將它們混淆。`;
  }

  // --- 4. SIMPLIFIED CHINESE PROMPT (DEFAULT) ---
  return `请作为一名资深华尔街金融量化分析师，撰写一篇地道、专业、富有洞察力的 TradingView 股票分析想法（Stock Idea）。
你要分析的股票是: **${data.companyName} (${symbol})**，当前价格为 **$${data.price.toFixed(2)}**，今日涨跌幅为 **${data.changePercent.toFixed(2)}%**。

我们已经使用严谨的数学算法，计算出了这只股票各项指标和形态识别的客观结果。请根据以下客观数据，编写一份全方位的专业技术研报。

### 1. 均线趋势与多周期共振
- **系统综合打分**: ${score.totalScore.toFixed(1)} / 5.0 分
- **打分与共振依据 (核心动能与均线扫描结果)**:
${score.scoreReasons.map((r: string) => `  * ${r}`).join("\n")}

### 2. 支撑阻力与POC筹码
- **水平支撑位 (历史极值点)**: ${sr.horizontalSupports.map((p: number) => `$${p}`).join(", ") || "无"}
- **水平压力位 (历史极值点)**: ${sr.horizontalResistances.map((p: number) => `$${p}`).join(", ") || "无"}
- **筹码密集峰 (POC)**: $${sr.volumePOC}
- **动态均线支撑**: 20EMA=$${sr.dynamicSupportEMA20}, 60EMA=$${sr.dynamicSupportEMA60}, BOLL下轨=$${sr.dynamicBOLLLower}

### 3. 动能与超买超卖指标 (MACD/KDJ/RSI)
- **MACD 最新值**: DIF=${data.indicators.macdDif[data.indicators.macdDif.length-1]?.toFixed(2)}, DEA=${data.indicators.macdDea[data.indicators.macdDea.length-1]?.toFixed(2)}
- **RSI 最新值**: ${data.indicators.rsi[data.indicators.rsi.length-1]?.toFixed(2)}
- **KDJ 最新值**: K=${data.indicators.kdjK[data.indicators.kdjK.length-1]?.toFixed(2)}, D=${data.indicators.kdjD[data.indicators.kdjD.length-1]?.toFixed(2)}, J=${data.indicators.kdjJ[data.indicators.kdjJ.length-1]?.toFixed(2)}

### 4. 量价与主力资金 (买卖力道)
- **CMF (Chaikin Money Flow) 最新值**: ${data.volumeAnalysis.cmf[data.volumeAnalysis.cmf.length-1]?.toFixed(4)} (注意: CMF > 0.05 代表主力净流入，CMF > 0.15 代表强劲净流入；CMF < -0.05 代表主力净流出)
- **OBV (On-Balance Volume) 最新值**: ${data.volumeAnalysis.obv[data.volumeAnalysis.obv.length-1]?.toFixed(0)}
- **量价与资金流向特征**: ${data.volumeAnalysis.volumeDescription}
- **放量突破**: ${data.volumeAnalysis.hasVolumeBreakout ? "是 (放量突破/放量抛售)" : "否 (无明显放量突破)"}
- **量价背离**: ${data.volumeAnalysis.hasPriceVolumeDivergence ? "是 (警告：量价背离)" : "否 (量价配合正常)"}

### 5. 经典几何形态与顶底背离
- **检测到的形态与背离**: ${data.patterns.patternDescription}

### 6. 神奇九转 (TD Sequential)
- **TD信号**: ${data.patterns.tdSignal || "当前无明显九转信号"}

### 7. 艾略特波浪理论
- **当前浪型**: ${wave.currentWave}
- **结构描述**: ${wave.waveDescription}

### 8. 缠论结构
- **当前画笔方向**: ${chan.currentStrokeDirection === "up" ? "向上笔" : "向下笔"}
- **结构细节与中枢**: ${chan.chanlunDescription}

---
### 撰写要求与输出格式：
You must output a valid JSON string ONLY. Do not wrap it in markdown block tags (no \`\`\`json or \`\`\$).
JSON 内的所有属性值必须使用 简体中文 撰写。

JSON 格式要求如下：
{
  "overview": "（这里是智能分析综述。撰写一段丰富、深刻且有洞察力的分析综述，概括整体多空局势、核心走势状态及后市研判。请务必使用 markdown 双换行进行合理逻辑分段，分为 3-4 个简短段落，拒绝长篇大论挤在单一长段落中，绝不包含打分逻辑）",
  "recommendation": "（利用 markdown 列表格式提供以下三个维度的具体交易策略建议：\n- **已有持仓 / 准备看多者**: 动态移动止损策略、跟踪哪一条 EMA、触发减仓的关键支撑位。\n- **左侧交易 / 準備建倉者**: 是否适合抄底、哪个支撑位附近分批建仓、需要等待什么确认信号。\n- **右侧突破 / 动量追随者**: 是否确认放量突破、哪里设置止损位。\n每项建议必须引用上述支撑压力、EMA、POC 的具体价格。绝不可模糊其词。）",
  "technicalAnalysis": "（核心详细分析！必须按分类对以下项目进行全面解读：1.均线趋势与多周期共振(日周线关系)，2.支撑阻力与POC筹码，3.动能指标(MACD/KDJ/RSI)，4.量价与主力资金(买卖力道，基于 CMF 和 OBV 深度分析主力意图与量价健康度，切勿与 3.动能指标 混为一谈)，5.经典几何形态与顶底背离，6.神奇九转，7.波浪理论，8.缠论结构。分析必须详实，8个步骤缺一不可。）"
}

请使用 TradingView 独有的“技术流”大V语调。不要虚构数据，必须严格基于上述给出的指标事实，使用 简体中文 进行解读。
**特别注意**：请严格区分“买卖力道（量价与主力资金，由 CMF 和 OBV 体现）”和“动能/超买超卖（由 RSI/KDJ/MACD 震荡指标体现）”，严禁在分析中将它们混淆。`;
}

function convertSymbolToEastMoneySecid(symbol: string): string | null {
  const clean = symbol.trim().toUpperCase();

  // 1. A-share (e.g. 600519.SS, 000001.SZ, 300059.SZ, 688001.SH)
  if (clean.endsWith(".SS") || clean.endsWith(".SH")) {
    const code = clean.split(".")[0];
    return `1.${code}`;
  }
  if (clean.endsWith(".SZ")) {
    const code = clean.split(".")[0];
    return `0.${code}`;
  }
  // A-share raw numbers without suffix (e.g. 600519)
  if (/^\d{6}$/.test(clean)) {
    if (clean.startsWith("60") || clean.startsWith("68") || clean.startsWith("90")) {
      return `1.${clean}`;
    } else {
      return `0.${clean}`;
    }
  }

  // 2. HK stock (e.g. 0700.HK, 9988.HK)
  if (clean.endsWith(".HK")) {
    const rawCode = clean.split(".")[0];
    const code = rawCode.padStart(5, "0");
    return `116.${code}`;
  }
  if (/^\d{4,5}$/.test(clean) && !clean.includes(".")) {
    const code = clean.padStart(5, "0");
    return `116.${code}`;
  }

  // 3. US stock (e.g. AAPL, TSLA, MSFT)
  if (/^[A-Z]{1,5}$/.test(clean)) {
    return `105.${clean}`;
  }

  // 4. Japan stock (e.g. 9984.T)
  if (clean.endsWith(".T")) {
    const code = clean.split(".")[0];
    return `200.${code}`;
  }

  return null;
}

async function fetchEastMoneyKlines(secid: string, isWeekly: boolean = false): Promise<Candle[]> {
  const klt = isWeekly ? "102" : "101";
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=${klt}&fqt=1&beg=19900101&end=20991231&lmt=300&ut=fa5fd190ac2ec2c49a057690f96c340f`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://quote.eastmoney.com/"
    }
  });

  if (!res.ok) {
    throw new Error(`东财K线接口请求失败, status: ${res.status}`);
  }

  const data = await res.json();
  const klines = data?.data?.klines;

  if (!klines || klines.length === 0) {
    throw new Error(`东财K线数据返回为空 (secid: ${secid})`);
  }

  return klines.map((item: string) => {
    const parts = item.split(",");
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      high: parseFloat(parts[3]),
      low: parseFloat(parts[4]),
      volume: parseInt(parts[5], 10) || 0
    };
  });
}

