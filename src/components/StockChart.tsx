"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  SeriesType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  LogicalRange,
  MismatchDirection,
  MouseEventParams,
  Time,
  LineData,
} from "lightweight-charts";
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
    ichimoku?: {
      tenkanSen: number[];
      kijunSen: number[];
      senkouSpanA: number[];
      senkouSpanB: number[];
      chikouSpan: number[];
      cloudSignal: "bullish" | "bearish" | "neutral";
      cloudDescription: string;
    };
  };
  patterns: {
    tdSequential: number[];
    tdSignal: string;
    fibonacciLevels: { label: string; price: number }[];
    activePatterns?: { key: string; name: string; bias: "bullish" | "bearish" | "neutral"; confidence: number; description: string }[];
    isDoubleBottom: boolean;
    isDoubleTop?: boolean;
    isTripleBottom?: boolean;
    isTripleTop?: boolean;
    isHeadAndShoulders: boolean;
    isCupAndHandle: boolean;
    isRoundingTop: boolean;
    isBullFlag?: boolean;
    isBearFlag?: boolean;
    isRectangle?: boolean;
    isTrianglePennant?: boolean;
    isRisingWedge?: boolean;
    isFallingWedge?: boolean;
  };
  sr: {
    horizontalSupports: number[];
    horizontalResistances: number[];
    volumePOC: number;
    volumeSupportNodes?: number[];
    volumeResistanceNodes?: number[];
    volumeProfile?: {
      poc: number;
      valueAreaHigh: number;
      valueAreaLow: number;
      nodes: { price: number; volume: number; volumeShare: number }[];
    };
  };
  wave: {
    wavePoints: { index: number; price: number; type: "high" | "low"; label: string }[];
  };
  isRedUp: boolean;
}

type IndicatorTab = "volume" | "macd" | "kdj" | "rsi";
type IndicatorPoint = LineData<Time>;

const mapIndicatorData = (times: string[], values: number[]): IndicatorPoint[] => {
  if (!values) return [];
  return times
    .map((time, i) => {
      const val = values[i];
      return {
        time,
        value: typeof val === "number" ? val : NaN,
      };
    })
    .filter((item) => !isNaN(item.value));
};

// Read the value of a series at the crosshair's logical index so we can hand
// setCrosshairPosition a real PRICE (its first argument), never a pixel coordinate.
const getSeriesPriceAt = (series: ISeriesApi<SeriesType>, param: MouseEventParams<Time>): number => {
  if (param.logical == null) return 0;
  const bar = series.dataByIndex(param.logical, MismatchDirection.NearestLeft) as
    | { value?: number; close?: number }
    | null;
  if (bar && typeof bar.value === "number") return bar.value;
  if (bar && typeof bar.close === "number") return bar.close;
  return 0;
};

function StockChart({ candles, indicators, patterns, sr, wave, isRedUp }: StockChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const indContainerRef = useRef<HTMLDivElement>(null);

  const [indTab, setIndTab] = useState<IndicatorTab>("macd");
  const [showEMA, setShowEMA] = useState(true);
  const [showBOLL, setShowBOLL] = useState(false);

  // Keep references so the split effects can share chart/series handles
  const priceChartRef = useRef<IChartApi | null>(null);
  const indChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indCrosshairSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // Latest palette, readable at chart-creation time without re-running that effect.
  // Updated in an effect declared BEFORE Effect A so it runs first on every commit.
  const isRedUpRef = useRef(isRedUp);
  useEffect(() => {
    isRedUpRef.current = isRedUp;
  }, [isRedUp]);

  // Precompute 'YYYY-MM-DD' time strings once per data change; reused by every series
  const times = useMemo(
    () => candles.map((c) => new Date(c.date).toISOString().split("T")[0]),
    [candles]
  );

  // ----------------------------------------------------
  // Effect A: create both charts, candlestick series, S/R + fib price lines,
  // markers, timescale/crosshair sync and resize handling.
  // Only re-runs when the underlying data changes.
  // ----------------------------------------------------
  useEffect(() => {
    if (!priceContainerRef.current || !indContainerRef.current || candles.length === 0) return;

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
    const priceChart = createChart(priceContainerRef.current, {
      ...commonChartOptions,
      width: priceWidth,
      height: 380,
    });
    priceChartRef.current = priceChart;

    const upColor = isRedUpRef.current ? "#f23645" : "#089981";
    const downColor = isRedUpRef.current ? "#089981" : "#f23645";

    const candlestickSeries = priceChart.addSeries(CandlestickSeries, {
      upColor: upColor,
      downColor: downColor,
      borderVisible: false,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
    candleSeriesRef.current = candlestickSeries;

    // Format candle data for lightweight-charts
    // time format can be 'YYYY-MM-DD' or timestamp
    const chartCandles = candles.map((c, i) => ({
      time: times[i],
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candlestickSeries.setData(chartCandles);

    // 2. Draw Horizontal Support & Resistance Levels
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

    patterns.fibonacciLevels?.forEach((level) => {
      candlestickSeries.createPriceLine({
        price: level.price,
        color: "rgba(168, 85, 247, 0.35)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: `FIB ${level.label}`,
      });
    });

    if (sr.volumeProfile) {
      [sr.volumeProfile.valueAreaLow, sr.volumeProfile.valueAreaHigh].forEach((price, idx) => {
        candlestickSeries.createPriceLine({
          price,
          color: "rgba(59, 130, 246, 0.35)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: idx === 0 ? "VAL" : "VAH",
        });
      });

      sr.volumeProfile.nodes.slice(0, 3).forEach((node) => {
        if (node.price === sr.volumePOC) return;
        candlestickSeries.createPriceLine({
          price: node.price,
          color: "rgba(14, 165, 233, 0.28)",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: false,
          title: "VPVR",
        });
      });
    }

    // 3. Draw Markers on Candlestick for TD 9 and Geometric Patterns
    const markers: SeriesMarker<string>[] = [];

    // TD signals
    patterns.tdSequential.forEach((val, idx) => {
      if (idx < candles.length) {
        const time = times[idx];
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
      const lastCandleTime = times[candles.length - 1];
      markers.push({
        time: lastCandleTime,
        position: "belowBar",
        color: "#fbbf24",
        shape: "circle",
        text: "W底突破",
      });
    }

    if (patterns.isCupAndHandle) {
      const lastCandleTime = times[candles.length - 1];
      markers.push({
        time: lastCandleTime,
        position: "belowBar",
        color: "#00b0ff",
        shape: "square",
        text: "杯柄突破",
      });
    }

    if (patterns.activePatterns && patterns.activePatterns.length > 0) {
      const lastCandleTime = times[candles.length - 1];
      patterns.activePatterns.slice(0, 3).forEach((pattern) => {
        if (pattern.key === "doubleBottom" || pattern.key === "cupAndHandle") return;
        markers.push({
          time: lastCandleTime,
          position: pattern.bias === "bearish" ? "aboveBar" : "belowBar",
          color: pattern.bias === "bearish" ? "#f23645" : pattern.bias === "bullish" ? "#089981" : "#fbbf24",
          shape: pattern.bias === "bearish" ? "arrowDown" : pattern.bias === "bullish" ? "arrowUp" : "circle",
          text: pattern.name,
        });
      });
    }

    // Wave points
    wave.wavePoints.forEach((wp) => {
      if (wp.index >= 0 && wp.index < candles.length) {
        const time = times[wp.index];
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
    // 4. Initialize Indicator Chart (Bottom Pane)
    // Its series are managed by Effect C so switching tabs never rebuilds the chart.
    // ----------------------------------------------------
    const indChart = createChart(indContainerRef.current, {
      ...commonChartOptions,
      width: priceWidth,
      height: 180,
    });
    indChartRef.current = indChart;

    // ----------------------------------------------------
    // 5. Synchronize TimeScale (Zoom & Pan Linkage)
    // ----------------------------------------------------
    const priceTimeScale = priceChart.timeScale();
    const indTimeScale = indChart.timeScale();

    let isSyncingPrice = false;
    let isSyncingInd = false;

    priceTimeScale.subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
      if (isSyncingInd || !range) return;
      isSyncingPrice = true;
      indTimeScale.setVisibleLogicalRange(range);
      isSyncingPrice = false;
    });

    indTimeScale.subscribeVisibleLogicalRangeChange((range: LogicalRange | null) => {
      if (isSyncingPrice || !range) return;
      isSyncingInd = true;
      priceTimeScale.setVisibleLogicalRange(range);
      isSyncingInd = false;
    });

    // Link Crosshair — series handles are read from refs so the subscriptions
    // stay valid when Effect C swaps the indicator pane's series.
    priceChart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      const targetSeries = indCrosshairSeriesRef.current;
      if (param.time && targetSeries) {
        indChart.setCrosshairPosition(getSeriesPriceAt(targetSeries, param), param.time, targetSeries);
      } else {
        indChart.clearCrosshairPosition();
      }
    });

    indChart.subscribeCrosshairMove((param: MouseEventParams<Time>) => {
      const targetSeries = candleSeriesRef.current;
      if (param.time && targetSeries) {
        priceChart.setCrosshairPosition(getSeriesPriceAt(targetSeries, param), param.time, targetSeries);
      } else {
        priceChart.clearCrosshairPosition();
      }
    });

    // ----------------------------------------------------
    // 6. Resize Handling
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
      candleSeriesRef.current = null;
      indCrosshairSeriesRef.current = null;
      if (priceChartRef.current) {
        try {
          priceChartRef.current.remove();
        } catch {}
        priceChartRef.current = null;
      }
      if (indChartRef.current) {
        try {
          indChartRef.current.remove();
        } catch {}
        indChartRef.current = null;
      }
    };
  }, [
    candles,
    times,
    patterns.activePatterns,
    patterns.fibonacciLevels,
    patterns.isCupAndHandle,
    patterns.isDoubleBottom,
    patterns.tdSequential,
    sr.horizontalResistances,
    sr.horizontalSupports,
    sr.volumePOC,
    sr.volumeProfile,
    wave.wavePoints,
  ]);

  // ----------------------------------------------------
  // Effect B: EMA / BOLL overlays — added to and removed from the existing
  // price chart, so toggling never rebuilds the charts.
  // ----------------------------------------------------
  useEffect(() => {
    const priceChart = priceChartRef.current;
    if (!priceChart || candles.length === 0) return;

    const overlaySeries: ISeriesApi<"Line">[] = [];

    if (showEMA) {
      const ema5Series = priceChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, title: "EMA 5" });
      const ema10Series = priceChart.addSeries(LineSeries, { color: "#e0a96d", lineWidth: 1, title: "EMA 10" });
      const ema20Series = priceChart.addSeries(LineSeries, { color: "#ff2a2a", lineWidth: 1, title: "EMA 20" });
      const ema60Series = priceChart.addSeries(LineSeries, { color: "#089981", lineWidth: 1, title: "EMA 60" });

      ema5Series.setData(mapIndicatorData(times, indicators.ema5));
      ema10Series.setData(mapIndicatorData(times, indicators.ema10));
      ema20Series.setData(mapIndicatorData(times, indicators.ema20));
      ema60Series.setData(mapIndicatorData(times, indicators.ema60));

      overlaySeries.push(ema5Series, ema10Series, ema20Series, ema60Series);
    }

    if (showBOLL) {
      const bollUpperSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BOLL Upper" });
      const bollMiddleSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.4)", lineWidth: 1, title: "BOLL Middle" });
      const bollLowerSeries = priceChart.addSeries(LineSeries, { color: "rgba(251, 191, 36, 0.6)", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "BOLL Lower" });

      bollUpperSeries.setData(mapIndicatorData(times, indicators.bollUpper));
      bollMiddleSeries.setData(mapIndicatorData(times, indicators.bollMiddle));
      bollLowerSeries.setData(mapIndicatorData(times, indicators.bollLower));

      overlaySeries.push(bollUpperSeries, bollMiddleSeries, bollLowerSeries);
    }

    return () => {
      overlaySeries.forEach((s) => {
        try {
          priceChart.removeSeries(s);
        } catch {}
      });
    };
  }, [
    showEMA,
    showBOLL,
    candles,
    times,
    indicators.ema5,
    indicators.ema10,
    indicators.ema20,
    indicators.ema60,
    indicators.bollUpper,
    indicators.bollMiddle,
    indicators.bollLower,
  ]);

  // ----------------------------------------------------
  // Effect C: bottom indicator pane series — swaps only the series on the
  // existing indicator chart when the tab (or palette) changes.
  // ----------------------------------------------------
  useEffect(() => {
    const indChart = indChartRef.current;
    if (!indChart || candles.length === 0) return;

    const upColor = isRedUp ? "#f23645" : "#089981";
    const downColor = isRedUp ? "#089981" : "#f23645";

    const indSeries: ISeriesApi<SeriesType>[] = [];

    if (indTab === "macd") {
      const difSeries = indChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, title: "DIF" });
      const deaSeries = indChart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1, title: "DEA" });
      const histSeries = indChart.addSeries(HistogramSeries, {
        color: upColor,
        title: "MACD Hist",
      });
      indCrosshairSeriesRef.current = difSeries;

      difSeries.setData(mapIndicatorData(times, indicators.macdDif));
      deaSeries.setData(mapIndicatorData(times, indicators.macdDea));

      const histData = mapIndicatorData(times, indicators.macdHist).map((item) => ({
        ...item,
        color: item.value >= 0 ? upColor : downColor,
      }));
      histSeries.setData(histData);

      indSeries.push(difSeries, deaSeries, histSeries);
    }

    else if (indTab === "kdj") {
      const kSeries = indChart.addSeries(LineSeries, { color: "#2962ff", lineWidth: 1, title: "K" });
      const dSeries = indChart.addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1, title: "D" });
      const jSeries = indChart.addSeries(LineSeries, { color: "#e040fb", lineWidth: 1, title: "J" });
      indCrosshairSeriesRef.current = kSeries;

      kSeries.setData(mapIndicatorData(times, indicators.kdjK));
      dSeries.setData(mapIndicatorData(times, indicators.kdjD));
      jSeries.setData(mapIndicatorData(times, indicators.kdjJ));

      // Threshold lines
      kSeries.createPriceLine({ price: 80, color: "rgba(255,255,255,0.15)", lineWidth: 1, title: "超买 80" });
      kSeries.createPriceLine({ price: 20, color: "rgba(255,255,255,0.15)", lineWidth: 1, title: "超卖 20" });

      indSeries.push(kSeries, dSeries, jSeries);
    }

    else if (indTab === "rsi") {
      const rsiSeries = indChart.addSeries(LineSeries, { color: "#9575cd", lineWidth: 1, title: "RSI" });
      indCrosshairSeriesRef.current = rsiSeries;
      rsiSeries.setData(mapIndicatorData(times, indicators.rsi));

      // Overbought/oversold boundaries
      rsiSeries.createPriceLine({ price: 70, color: "rgba(242,54,69,0.3)", lineWidth: 1, title: "超买 70" });
      rsiSeries.createPriceLine({ price: 30, color: "rgba(8,153,129,0.3)", lineWidth: 1, title: "超卖 30" });
      rsiSeries.createPriceLine({ price: 50, color: "rgba(255,255,255,0.1)", lineWidth: 1 });

      indSeries.push(rsiSeries);
    }

    else if (indTab === "volume") {
      const upColorRgb = isRedUp ? "rgba(242, 54, 69, 0.6)" : "rgba(8, 153, 129, 0.6)";
      const downColorRgb = isRedUp ? "rgba(8, 153, 129, 0.6)" : "rgba(242, 54, 69, 0.6)";

      const volSeries = indChart.addSeries(HistogramSeries, {
        color: upColorRgb,
        title: "Volume",
      });
      indCrosshairSeriesRef.current = volSeries;

      const mappedVol = candles.map((c, idx) => {
        const time = times[idx];
        const color = idx === 0 ? upColorRgb : (c.close >= candles[idx - 1].close ? upColorRgb : downColorRgb);
        return {
          time,
          value: c.volume,
          color,
        };
      });
      volSeries.setData(mappedVol);

      indSeries.push(volSeries);
    }

    // Keep the panes aligned after swapping the indicator series
    const priceChart = priceChartRef.current;
    if (priceChart) {
      const range = priceChart.timeScale().getVisibleLogicalRange();
      if (range) indChart.timeScale().setVisibleLogicalRange(range);
    }

    return () => {
      indCrosshairSeriesRef.current = null;
      indSeries.forEach((s) => {
        try {
          indChart.removeSeries(s);
        } catch {}
      });
    };
  }, [
    indTab,
    isRedUp,
    candles,
    times,
    indicators.macdDif,
    indicators.macdDea,
    indicators.macdHist,
    indicators.kdjK,
    indicators.kdjD,
    indicators.kdjJ,
    indicators.rsi,
  ]);

  // ----------------------------------------------------
  // Effect D: palette toggle — restyle the candlestick series in place
  // instead of recreating anything. (Per-bar volume/MACD histogram colors
  // live in the data, so Effect C re-runs for those via its isRedUp dep.)
  // ----------------------------------------------------
  useEffect(() => {
    const candlestickSeries = candleSeriesRef.current;
    if (!candlestickSeries) return;

    const upColor = isRedUp ? "#f23645" : "#089981";
    const downColor = isRedUp ? "#089981" : "#f23645";

    candlestickSeries.applyOptions({
      upColor: upColor,
      downColor: downColor,
      wickUpColor: upColor,
      wickDownColor: downColor,
    });
  }, [isRedUp]);

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

export default React.memo(StockChart);

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
