"use client";

import React, { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, ISeriesApi, LineStyle, SeriesMarker, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";
import { Candle } from "@/lib/analysis/indicators";

interface StockChartProps {
  candles: Candle[];
  indicators: {
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
  };
  patterns: {
    tdSequential: number[];
    tdSignal: string;
    fibonacciLevels: { label: string; price: number }[];
    isDoubleBottom: boolean;
    isHeadAndShoulders: boolean;
    isCupAndHandle: boolean;
    isRoundingTop: boolean;
  };
  sr: {
    horizontalSupports: number[];
    horizontalResistances: number[];
    volumePOC: number;
  };
  wave: {
    wavePoints: { index: number; price: number; type: "high" | "low"; label: string }[];
  };
  isRedUp: boolean;
}

type IndicatorTab = "volume" | "macd" | "kdj" | "rsi";

export default function StockChart({ candles, indicators, patterns, sr, wave, isRedUp }: StockChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const indContainerRef = useRef<HTMLDivElement>(null);
  
  const [indTab, setIndTab] = useState<IndicatorTab>("macd");
  const [showEMA, setShowEMA] = useState(true);
  const [showBOLL, setShowBOLL] = useState(false);

  // Keep references to clean up charts
  const priceChartRef = useRef<IChartApi | null>(null);
  const indChartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!priceContainerRef.current || !indContainerRef.current || candles.length === 0) return;

    // Clear previous charts
    if (priceChartRef.current) {
      try {
        priceChartRef.current.remove();
      } catch (e) {}
      priceChartRef.current = null;
    }
    if (indChartRef.current) {
      try {
        indChartRef.current.remove();
      } catch (e) {}
      indChartRef.current = null;
    }

    const priceWidth = priceContainerRef.current.clientWidth;
    const commonChartOptions = {
      layout: {
        background: { color: "#131722" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#2a2e39" },
        horzLines: { color: "#2a2e39" },
      },
      timeScale: {
        borderColor: "#2a2e39",
        rightOffset: 10,
        barSpacing: 6,
      },
      rightPriceScale: {
        borderColor: "#2a2e39",
      },
    };

    // ----------------------------------------------------
    // 1. Initialize Price Chart (Top Pane)
    // ----------------------------------------------------
    const priceChart: any = createChart(priceContainerRef.current, {
      ...commonChartOptions,
      width: priceWidth,
      height: 380,
    });
    priceChartRef.current = priceChart;

    const upColor = isRedUp ? "#f23645" : "#089981";
    const downColor = isRedUp ? "#089981" : "#f23645";

    const candlestickSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });

    // Format candle data for lightweight-charts
    // time format can be 'YYYY-MM-DD' or timestamp
    const chartCandles = candles.map((c) => {
      const d = new Date(c.date);
      const formattedDate = d.toISOString().split("T")[0];
      return {
        time: formattedDate,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });

    candlestickSeries.setData(chartCandles);

    // 2. Draw EMAs
    if (showEMA) {
      const ema5Series = priceChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, title: "EMA 5" });
      const ema10Series = priceChart.addSeries(LineSeries, { color: "#e0a96d", lineWidth: 1, title: "EMA 10" });
      const ema20Series = priceChart.addSeries(LineSeries, { color: "#ff2a2a", lineWidth: 1, title: "EMA 20" });
      const ema60Series = priceChart.addSeries(LineSeries, { color: "#089981", lineWidth: 1, title: "EMA 60" });

      ema5Series.setData(mapIndicatorData(candles, indicators.ema5));
      ema10Series.setData(mapIndicatorData(candles, indicators.ema10));
      ema20Series.setData(mapIndicatorData(candles, indicators.ema20));
      ema60Series.setData(mapIndicatorData(candles, indicators.ema60));
    }

    // 3. Draw BOLL Bands
    if (showBOLL) {
      const bollUpperSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BOLL Upper" });
      const bollMiddleSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.4)", lineWidth: 1, title: "BOLL Middle" });
      const bollLowerSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BOLL Lower" });

      bollUpperSeries.setData(mapIndicatorData(candles, indicators.bollUpper));
      bollMiddleSeries.setData(mapIndicatorData(candles, indicators.bollMiddle));
      bollLowerSeries.setData(mapIndicatorData(candles, indicators.bollLower));
    }

    // 4. Draw Horizontal Support & Resistance Levels
    // We add PriceLines to the candlestick series
    sr.horizontalSupports.forEach((lvl) => {
      candlestickSeries.createPriceLine({
        price: lvl,
        color: "rgba(8, 153, 129, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "支",
      });
    });

    sr.horizontalResistances.forEach((lvl) => {
      candlestickSeries.createPriceLine({
        price: lvl,
        color: "rgba(242, 54, 69, 0.5)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "阻",
      });
    });

    // Draw POC level
    if (sr.volumePOC) {
      candlestickSeries.createPriceLine({
        price: sr.volumePOC,
        color: "rgba(59, 130, 246, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "POC",
      });
    }

    // 5. Draw Markers on Candlestick for TD 9 and Geometric Patterns
    const markers: SeriesMarker<string>[] = [];

    // TD signals
    patterns.tdSequential.forEach((val, idx) => {
      if (idx < candles.length) {
        const time = new Date(candles[idx].date).toISOString().split("T")[0];
        if (val === 9) {
          markers.push({
            time,
            position: "aboveBar",
            color: "#ff2a2a",
            shape: "arrowDown",
            text: "九转(9) 卖",
          });
        } else if (val === -9) {
          markers.push({
            time,
            position: "belowBar",
            color: "#089981",
            shape: "arrowUp",
            text: "九转(9) 买",
          });
        }
      }
    });

    // Double bottom or Cup handle breakouts
    if (patterns.isDoubleBottom) {
      const lastCandleTime = new Date(candles[candles.length - 1].date).toISOString().split("T")[0];
      markers.push({
        time: lastCandleTime,
        position: "belowBar",
        color: "#fbbf24",
        shape: "circle",
        text: "W底突破",
      });
    }

    if (patterns.isCupAndHandle) {
      const lastCandleTime = new Date(candles[candles.length - 1].date).toISOString().split("T")[0];
      markers.push({
        time: lastCandleTime,
        position: "belowBar",
        color: "#00b0ff",
        shape: "square",
        text: "杯柄突破",
      });
    }

    // Wave points
    wave.wavePoints.forEach((wp) => {
      if (wp.index >= 0 && wp.index < candles.length) {
        const time = new Date(candles[wp.index].date).toISOString().split("T")[0];
        markers.push({
          time,
          position: wp.type === "high" ? "aboveBar" : "belowBar",
          color: wp.type === "high" ? "#ea4335" : "#34a853",
          shape: wp.type === "high" ? "arrowDown" : "arrowUp",
          text: wp.label,
        });
      }
    });

    if (markers.length > 0) {
      // Sort markers chronologically to prevent rendering issues in lightweight-charts
      markers.sort((a, b) => a.time.localeCompare(b.time));
      createSeriesMarkers(candlestickSeries, markers);
    }

    // ----------------------------------------------------
    // 2. Initialize Indicator Chart (Bottom Pane)
    // ----------------------------------------------------
    const indChart: any = createChart(indContainerRef.current, {
      ...commonChartOptions,
      width: priceWidth,
      height: 180,
    });
    indChartRef.current = indChart;

    if (indTab === "macd") {
      const difSeries = indChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1.5, title: "DIF" });
      const deaSeries = indChart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1.5, title: "DEA" });
      const histSeries = indChart.addSeries(HistogramSeries, {
        upColor: upColor,
        downColor: downColor,
        title: "MACD Hist",
      });

      difSeries.setData(mapIndicatorData(candles, indicators.macdDif));
      deaSeries.setData(mapIndicatorData(candles, indicators.macdDea));
      
      const histData = mapIndicatorData(candles, indicators.macdHist).map((item: any) => ({
        ...item,
        color: item.value >= 0 ? upColor : downColor,
      }));
      histSeries.setData(histData);
    } 
    
    else if (indTab === "kdj") {
      const kSeries = indChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1.2, title: "K" });
      const dSeries = indChart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1.2, title: "D" });
      const jSeries = indChart.addSeries(LineSeries, { color: "#e040fb", lineWidth: 1.2, title: "J" });

      kSeries.setData(mapIndicatorData(candles, indicators.kdjK));
      dSeries.setData(mapIndicatorData(candles, indicators.kdjD));
      jSeries.setData(mapIndicatorData(candles, indicators.kdjJ));

      // Threshold lines
      kSeries.createPriceLine({ price: 80, color: "rgba(255,255,255,0.15)", lineWidth: 1, title: "超买 80" });
      kSeries.createPriceLine({ price: 20, color: "rgba(255,255,255,0.15)", lineWidth: 1, title: "超卖 20" });
    } 
    
    else if (indTab === "rsi") {
      const rsiSeries = indChart.addSeries(LineSeries, { color: "#9575cd", lineWidth: 1.5, title: "RSI" });
      rsiSeries.setData(mapIndicatorData(candles, indicators.rsi));

      // Overbought/oversold boundaries
      rsiSeries.createPriceLine({ price: 70, color: "rgba(242,54,69,0.3)", lineWidth: 1, title: "超买 70" });
      rsiSeries.createPriceLine({ price: 30, color: "rgba(8,153,129,0.3)", lineWidth: 1, title: "超卖 30" });
      rsiSeries.createPriceLine({ price: 50, color: "rgba(255,255,255,0.1)", lineWidth: 1 });
    } 
    
    else if (indTab === "volume") {
      const upColorRgb = isRedUp ? "rgba(242, 54, 69, 0.6)" : "rgba(8, 153, 129, 0.6)";
      const downColorRgb = isRedUp ? "rgba(8, 153, 129, 0.6)" : "rgba(242, 54, 69, 0.6)";

      const volSeries = indChart.addSeries(HistogramSeries, {
        upColor: upColorRgb,
        downColor: downColorRgb,
        title: "Volume",
      });

      const mappedVol = candles.map((c, idx) => {
        const time = new Date(c.date).toISOString().split("T")[0];
        const color = idx === 0 ? upColorRgb : (c.close >= candles[idx - 1].close ? upColorRgb : downColorRgb);
        return {
          time,
          value: c.volume,
          color,
        };
      });
      volSeries.setData(mappedVol);
    }

    // ----------------------------------------------------
    // 3. Synchronize TimeScale (Zoom & Pan Linkage)
    // ----------------------------------------------------
    const priceTimeScale = priceChart.timeScale();
    const indTimeScale = indChart.timeScale();

    let isSyncingPrice = false;
    let isSyncingInd = false;

    priceTimeScale.subscribeVisibleLogicalRangeChange((range: any) => {
      if (isSyncingInd || !range) return;
      isSyncingPrice = true;
      indTimeScale.setVisibleLogicalRange(range);
      isSyncingPrice = false;
    });

    indTimeScale.subscribeVisibleLogicalRangeChange((range: any) => {
      if (isSyncingPrice || !range) return;
      isSyncingInd = true;
      priceTimeScale.setVisibleLogicalRange(range);
      isSyncingInd = false;
    });

    // Link Crosshair
    priceChart.subscribeCrosshairMove((param: any) => {
      if (param.time) {
        indChart.setCrosshairPosition(param.point ? param.point.x : 0, param.time, {} as any);
      } else {
        indChart.clearCrosshairPosition();
      }
    });

    indChart.subscribeCrosshairMove((param: any) => {
      if (param.time) {
        priceChart.setCrosshairPosition(param.point ? param.point.x : 0, param.time, {} as any);
      } else {
        priceChart.clearCrosshairPosition();
      }
    });

    // ----------------------------------------------------
    // 4. Resize Handling
    // ----------------------------------------------------
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries.length === 0) return;
      const newWidth = entries[0].contentRect.width;
      priceChart.resize(newWidth, 380);
      indChart.resize(newWidth, 180);
    });
    resizeObserver.observe(priceContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (priceChartRef.current) {
        try {
          priceChartRef.current.remove();
        } catch (e) {}
        priceChartRef.current = null;
      }
      if (indChartRef.current) {
        try {
          indChartRef.current.remove();
        } catch (e) {}
        indChartRef.current = null;
      }
    };
  }, [candles, indTab, showEMA, showBOLL, isRedUp]);

  // Map backend indicators (which are close-aligned array of numbers) to lightweight-charts time objects
  const mapIndicatorData = (candles: Candle[], values: number[]) => {
    if (!values) return [];
    return candles
      .map((c, i) => {
        const time = new Date(c.date).toISOString().split("T")[0];
        const val = values[i];
        return {
          time,
          value: typeof val === "number" ? val : NaN,
        };
      })
      .filter((item) => !isNaN(item.value));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, backgroundColor: "#131722" }}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.btnGroup}>

          <button
            onClick={() => setShowEMA(!showEMA)}
            style={{ ...styles.btn, backgroundColor: showEMA ? "#2962ff" : "#2a2e39" }}
          >
            EMA (5/10/20/60)
          </button>
          <button
            onClick={() => setShowBOLL(!showBOLL)}
            style={{ ...styles.btn, backgroundColor: showBOLL ? "#2962ff" : "#2a2e39" }}
          >
            BOLL
          </button>
        </div>

        <div style={styles.btnGroup}>
          {(["macd", "kdj", "rsi", "volume"] as IndicatorTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setIndTab(tab)}
              style={{
                ...styles.btn,
                backgroundColor: indTab === tab ? "#2962ff" : "#2a2e39",
                textTransform: "uppercase",
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main K-Line Area */}
      <div ref={priceContainerRef} style={{ width: "100%" }} />

      {/* Secondary Indicator Area */}
      <div ref={indContainerRef} style={{ width: "100%", borderTop: "1px solid #2a2e39" }} />
    </div>
  );
}

const styles = {
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1c2030",
    borderBottom: "1px solid #2a2e39",
    padding: "8px 12px",
    gap: "10px",
  },
  btnGroup: {
    display: "flex",
    gap: "6px",
  },
  btn: {
    border: "none",
    color: "#ffffff",
    padding: "5px 12px",
    fontSize: "12px",
    borderRadius: "4px",
    cursor: "pointer",
    fontWeight: 600,
    transition: "background-color 0.2s",
  },
};
