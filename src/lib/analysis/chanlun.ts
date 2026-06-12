import { Candle } from "./indicators";

export interface MergedKLine {
  date: Date | string;
  high: number;
  low: number;
  close: number;
  open: number;
}

export interface FenXing {
  index: number; // Index in the merged K-line array
  type: "ding" | "di"; // Ding = Top, Di = Bottom
  high: number;
  low: number;
  date: Date | string;
}

export interface ChanLunStroke {
  startIndex: number; // Index in merged K-lines
  endIndex: number;
  startPrice: number;
  endPrice: number;
  type: "up" | "down";
  startDate: Date | string;
  endDate: Date | string;
}

export interface ChanLunResult {
  mergedKLines: MergedKLine[];
  fenXingList: FenXing[];
  strokes: ChanLunStroke[];
  currentStrokeDirection: "up" | "down";
  chanlunDescription: string;
}

/**
 * Resolves K-line inclusions sequentially.
 */
export function resolveInclusions(candles: Candle[]): MergedKLine[] {
  if (candles.length === 0) return [];

  const merged: MergedKLine[] = [{ ...candles[0] }];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = merged[merged.length - 1];

    const hasInclusion =
      (current.high <= prev.high && current.low >= prev.low) ||
      (current.high >= prev.high && current.low <= prev.low);

    if (hasInclusion) {
      // Determine direction of the trend
      // If we have a third candle back, look at prev vs prev-prev. Else default to UP.
      let isUp = true;
      if (merged.length >= 2) {
        const prevPrev = merged[merged.length - 2];
        isUp = prev.high > prevPrev.high;
      }

      if (isUp) {
        // High-high, Low-low (UP direction merging)
        prev.high = Math.max(current.high, prev.high);
        prev.low = Math.max(current.low, prev.low);
      } else {
        // Low-low, High-high (DOWN direction merging)
        prev.high = Math.min(current.high, prev.high);
        prev.low = Math.min(current.low, prev.low);
      }
      // Keep date and close/open of the latest candle in the merge
      prev.date = current.date;
      prev.close = current.close;
      prev.open = current.open;
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Detects Ding (Top) and Di (Bottom) Fen Xing in merged K-lines.
 */
export function detectFenXing(merged: MergedKLine[]): FenXing[] {
  const list: FenXing[] = [];
  const len = merged.length;

  for (let i = 1; i < len - 1; i++) {
    const prev = merged[i - 1];
    const curr = merged[i];
    const next = merged[i + 1];

    // Ding Fen Xing: Middle has highest high and highest low
    const isDing = curr.high > prev.high && curr.high > next.high && curr.low > prev.low && curr.low > next.low;
    // Di Fen Xing: Middle has lowest high and lowest low
    const isDi = curr.high < prev.high && curr.high < next.high && curr.low < prev.low && curr.low < next.low;

    if (isDing) {
      list.push({ index: i, type: "ding", high: curr.high, low: curr.low, date: curr.date });
    } else if (isDi) {
      list.push({ index: i, type: "di", high: curr.high, low: curr.low, date: curr.date });
    }
  }

  return list;
}

/**
 * Generates valid strokes (Bi) connecting alternating Ding and Di Fen Xing.
 * Rule: Between a Ding and a Di, there must be at least 5 candles (inclusive) in the merged series,
 * meaning at least 3 candles between the pivot candles.
 */
export function generateStrokes(merged: MergedKLine[], fenXingList: FenXing[]): ChanLunStroke[] {
  const strokes: ChanLunStroke[] = [];
  if (fenXingList.length < 2) return strokes;

  let activePivot: FenXing = fenXingList[0];

  for (let i = 1; i < fenXingList.length; i++) {
    const nextPivot = fenXingList[i];

    // They must be of different types (Ding -> Di or Di -> Ding)
    if (activePivot.type !== nextPivot.type) {
      // Distance check in merged K-lines: index difference must be >= 4 (meaning at least 5 K-lines total)
      const distance = nextPivot.index - activePivot.index;

      if (distance >= 4) {
        // Check if the price direction makes sense
        const isUp = activePivot.type === "di" && nextPivot.type === "ding" && nextPivot.high > activePivot.low;
        const isDown = activePivot.type === "ding" && nextPivot.type === "di" && nextPivot.low < activePivot.high;

        if (isUp || isDown) {
          strokes.push({
            startIndex: activePivot.index,
            endIndex: nextPivot.index,
            startPrice: activePivot.type === "di" ? activePivot.low : activePivot.high,
            endPrice: nextPivot.type === "ding" ? nextPivot.high : nextPivot.low,
            type: isUp ? "up" : "down",
            startDate: activePivot.date,
            endDate: nextPivot.date
          });
          activePivot = nextPivot;
        }
      } else {
        // If distance is too short but it is same direction trend, we might update the pivot to a better extreme
        if (activePivot.type === "ding" && nextPivot.high > activePivot.high) {
          activePivot = nextPivot; // Higher top
        } else if (activePivot.type === "di" && nextPivot.low < activePivot.low) {
          activePivot = nextPivot; // Lower bottom
        }
      }
    } else {
      // Same type: update to the more extreme pivot to find better stroke boundaries
      if (activePivot.type === "ding") {
        if (nextPivot.high > activePivot.high) {
          activePivot = nextPivot;
        }
      } else {
        if (nextPivot.low < activePivot.low) {
          activePivot = nextPivot;
        }
      }
    }
  }

  return strokes;
}

/**
 * Main Chan Lun analysis engine.
 */
export function analyzeChanLun(candles: Candle[]): ChanLunResult {
  const mergedKLines = resolveInclusions(candles);
  const fenXingList = detectFenXing(mergedKLines);
  const strokes = generateStrokes(mergedKLines, fenXingList);

  let currentStrokeDirection: "up" | "down" = "up";
  let desc = "";

  if (strokes.length === 0) {
    desc = "缠论分析：历史K线包含合并后较为平缓，暂未生成标准的缠论「画笔」段落。";
    return {
      mergedKLines,
      fenXingList,
      strokes,
      currentStrokeDirection,
      chanlunDescription: desc
    };
  }

  const latestStroke = strokes[strokes.length - 1];
  currentStrokeDirection = latestStroke.type;

  // Let's analyze the latest stroke and any potential forming fenxing
  const latestMergedIdx = mergedKLines.length - 1;
  const priceSinceStroke = mergedKLines[latestMergedIdx].close;

  desc = `缠论结构：最近已确立一笔「${latestStroke.type === "up" ? "向上笔" : "向下笔"}」，自 ${new Date(latestStroke.startDate).toLocaleDateString()} 的 $${latestStroke.startPrice} 运行至 ${new Date(latestStroke.endDate).toLocaleDateString()} 的 $${latestStroke.endPrice}。`;

  // Check if we are forming a counter-fenxing since the last stroke
  const candlesSinceStroke = latestMergedIdx - latestStroke.endIndex;
  
  if (latestStroke.type === "up") {
    if (candlesSinceStroke >= 3) {
      desc += ` 当前在该笔冲高后，右侧已整理 ${candlesSinceStroke} 根K线，正在形成潜在的「顶分型」结构。若确立，将转入新的向下笔。`;
    } else {
      desc += ` 当前多头延续，尚未形成有效的顶分型，向上笔依然在延伸中。`;
    }
  } else {
    if (candlesSinceStroke >= 3) {
      desc += ` 当前在该笔探底后，右侧已反弹 ${candlesSinceStroke} 根K线，正在形成潜在的「底分型」结构。若确立，将转入新的向上笔启动。`;
    } else {
      desc += ` 当前下行趋势延续，尚未形成有效的底分型，向下笔依然在延伸探底。`;
    }
  }

  // Check for Middle Central Pivot (中枢)
  // If we have at least 3 strokes, we can calculate if there is an overlapping zone (中枢)
  if (strokes.length >= 3) {
    const s1 = strokes[strokes.length - 3];
    const s2 = strokes[strokes.length - 2];
    const s3 = strokes[strokes.length - 1];

    // Find the overlap range of the three strokes
    const zsHigh = Math.min(Math.max(s1.startPrice, s1.endPrice), Math.max(s2.startPrice, s2.endPrice), Math.max(s3.startPrice, s3.endPrice));
    const zsLow = Math.max(Math.min(s1.startPrice, s1.endPrice), Math.min(s2.startPrice, s2.endPrice), Math.min(s3.startPrice, s3.endPrice));

    if (zsHigh > zsLow) {
      desc += ` 当前中枢价格区间为 $${zsLow.toFixed(2)} - $${zsHigh.toFixed(2)}。当前价格位于该中枢${priceSinceStroke > zsHigh ? "上方（脱离中枢，强势偏多）" : priceSinceStroke < zsLow ? "下方（中枢压制，弱势偏空）" : "内部（中枢震荡盘整中）"}。`;
    }
  }

  return {
    mergedKLines,
    fenXingList,
    strokes,
    currentStrokeDirection,
    chanlunDescription: desc
  };
}
