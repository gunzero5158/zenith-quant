import type { EffectiveLanguage } from "@/lib/i18n/translations";
import type { ValidationOutlook, ValidationTrack } from "./records";

export interface ValidationLabels {
  open: string;
  title: string;
  intro: string;
  smallSample: string;
  empty: string;
  refresh: string;
  refreshing: (done: number, total: number) => string;
  refreshFailed: (count: number) => string;
  exportData: string;
  importData: string;
  importFailed: string;
  clear: string;
  clearConfirm: string;
  storageFailed: string;
  close: string;
  summaryTitle: string;
  summaryNote: string;
  track: string;
  tracks: Record<ValidationTrack, string>;
  records: string;
  evaluated: string;
  hitRate: string;
  allAverage: string;
  afterBullish: string;
  afterBearish: string;
  highScore: string;
  lowScore: string;
  plans: string;
  planValue: (target: number, stop: number) => string;
  calibrationTitle: string;
  calibrationNote: string;
  statedBucket: string;
  statedAverage: string;
  actualUp: string;
  samples: string;
  recentTitle: string;
  date: string;
  stock: string;
  outlook: string;
  outlooks: Record<ValidationOutlook, string>;
  score: string;
  days: (count: number) => string;
  plan: string;
  planResults: Record<"target" | "stop" | "open" | "timeout", string>;
  pending: string;
}

const LABELS: Record<EffectiveLanguage, ValidationLabels> = {
  "zh-CN": {
    open: "验证记录",
    title: "分析结论验证",
    intro: "每次分析的结论都会自动记在这里，之后按 5、10、20 个交易日对照实际走势。每次分析同时免费记一条“纯规则评分”作为基准。记录只保存在当前浏览器，换设备或清理浏览器数据前请先导出。",
    smallSample: "样本少于 30 条时，数字只能当参考，不能下结论。",
    empty: "还没有记录。分析任意一只股票后，这里就会开始积累。",
    refresh: "更新走势结果",
    refreshing: (done, total) => `正在更新 ${done}/${total}…`,
    refreshFailed: (count) => `${count} 只股票的行情获取失败，稍后可重试。`,
    exportData: "导出", importData: "导入", importFailed: "导入失败：文件不是有效的验证记录。",
    clear: "清空", clearConfirm: "确定清空全部验证记录吗？此操作无法撤销，建议先导出。",
    storageFailed: "浏览器存储空间不足，记录未能保存。请导出后清空旧记录。",
    close: "关闭",
    summaryTitle: "各模式战绩（按 10 个交易日后的涨跌统计）",
    summaryNote: "方向命中：看多要求涨幅超过 1.5 倍 ATR，看空要求跌幅超过 1.5 倍 ATR，震荡要求涨跌都在这个幅度内。“全部平均”是该模式所有记录的平均涨跌，用来当对照：看多后的平均涨幅要明显高于它，才说明判断有用。",
    track: "模式",
    tracks: { rule: "纯规则评分", "rule-ai": "规则评分 + LLM", "ai-native": "纯 LLM 分析", "jev-ai": "Jev 决策" },
    records: "记录", evaluated: "已有结果", hitRate: "方向命中", allAverage: "全部平均",
    afterBullish: "看多后", afterBearish: "看空后", highScore: "评分≥3.5", lowScore: "评分<2.5",
    plans: "买入计划", planValue: (target, stop) => `${target} 止盈 / ${stop} 止损`,
    calibrationTitle: "Jev 概率校准",
    calibrationNote: "Jev 说“看多 70%”的那些记录，事后真的有约七成上涨吗？两列越接近，说明它的概率越可信。",
    statedBucket: "Jev 给的看多概率", statedAverage: "平均概率", actualUp: "实际上涨比例", samples: "样本",
    recentTitle: "最近记录",
    date: "日期", stock: "股票", outlook: "方向", outlooks: { bullish: "看多", neutral: "震荡", bearish: "看空" },
    score: "评分", days: (count) => `${count}日`, plan: "计划",
    planResults: { target: "止盈", stop: "止损", open: "进行中", timeout: "到期未触发" },
    pending: "待定",
  },
  "zh-TW": {
    open: "驗證記錄",
    title: "分析結論驗證",
    intro: "每次分析的結論都會自動記在這裡，之後按 5、10、20 個交易日對照實際走勢。每次分析同時免費記一條「純規則評分」作為基準。記錄只保存在目前的瀏覽器，換裝置或清理瀏覽器資料前請先匯出。",
    smallSample: "樣本少於 30 筆時，數字只能當參考，不能下結論。",
    empty: "還沒有記錄。分析任意一檔股票後，這裡就會開始累積。",
    refresh: "更新走勢結果",
    refreshing: (done, total) => `正在更新 ${done}/${total}…`,
    refreshFailed: (count) => `${count} 檔股票的行情取得失敗，稍後可重試。`,
    exportData: "匯出", importData: "匯入", importFailed: "匯入失敗：檔案不是有效的驗證記錄。",
    clear: "清空", clearConfirm: "確定清空全部驗證記錄嗎？此操作無法復原，建議先匯出。",
    storageFailed: "瀏覽器儲存空間不足，記錄未能保存。請匯出後清空舊記錄。",
    close: "關閉",
    summaryTitle: "各模式戰績（按 10 個交易日後的漲跌統計）",
    summaryNote: "方向命中：看多要求漲幅超過 1.5 倍 ATR，看空要求跌幅超過 1.5 倍 ATR，震盪要求漲跌都在這個幅度內。「全部平均」是該模式所有記錄的平均漲跌，用來當對照：看多後的平均漲幅要明顯高於它，才說明判斷有用。",
    track: "模式",
    tracks: { rule: "純規則評分", "rule-ai": "規則評分 + LLM", "ai-native": "純 LLM 分析", "jev-ai": "Jev 決策" },
    records: "記錄", evaluated: "已有結果", hitRate: "方向命中", allAverage: "全部平均",
    afterBullish: "看多後", afterBearish: "看空後", highScore: "評分≥3.5", lowScore: "評分<2.5",
    plans: "買入計畫", planValue: (target, stop) => `${target} 停利 / ${stop} 停損`,
    calibrationTitle: "Jev 機率校準",
    calibrationNote: "Jev 說「看多 70%」的那些記錄，事後真的有約七成上漲嗎？兩欄越接近，說明它的機率越可信。",
    statedBucket: "Jev 給的看多機率", statedAverage: "平均機率", actualUp: "實際上漲比例", samples: "樣本",
    recentTitle: "最近記錄",
    date: "日期", stock: "股票", outlook: "方向", outlooks: { bullish: "看多", neutral: "震盪", bearish: "看空" },
    score: "評分", days: (count) => `${count}日`, plan: "計畫",
    planResults: { target: "停利", stop: "停損", open: "進行中", timeout: "到期未觸發" },
    pending: "待定",
  },
  en: {
    open: "Track record",
    title: "Analysis track record",
    intro: "Every analysis is logged here automatically and later compared with the actual price 5, 10, and 20 trading days on. Each analysis also logs a free rules-only score as a baseline. Records live in this browser only; export them before switching devices or clearing browser data.",
    smallSample: "With fewer than 30 samples the numbers are only indicative.",
    empty: "No records yet. Analyze any stock and the log starts to build.",
    refresh: "Update outcomes",
    refreshing: (done, total) => `Updating ${done}/${total}…`,
    refreshFailed: (count) => `Market data failed for ${count} symbol(s); try again later.`,
    exportData: "Export", importData: "Import", importFailed: "Import failed: not a valid track-record file.",
    clear: "Clear", clearConfirm: "Clear all records? This cannot be undone; consider exporting first.",
    storageFailed: "Browser storage is full; the records were not saved. Export, then clear old records.",
    close: "Close",
    summaryTitle: "Results by mode (price change 10 trading days later)",
    summaryNote: "Outlook hit: bullish needs a gain above 1.5x ATR, bearish a loss beyond 1.5x ATR, neutral a move inside that band. \"All avg\" is the mean change of every record in the mode and serves as the control: the change after bullish calls must clearly exceed it for the calls to be useful.",
    track: "Mode",
    tracks: { rule: "Rules only", "rule-ai": "Rules + LLM", "ai-native": "LLM Native", "jev-ai": "Jev Decision" },
    records: "Records", evaluated: "Evaluated", hitRate: "Outlook hit", allAverage: "All avg",
    afterBullish: "After bullish", afterBearish: "After bearish", highScore: "Score ≥3.5", lowScore: "Score <2.5",
    plans: "Entry plans", planValue: (target, stop) => `${target} target / ${stop} stop`,
    calibrationTitle: "Jev probability calibration",
    calibrationNote: "When Jev says \"bullish 70%\", do about 70% of those records actually rise? The closer the two columns, the more its probabilities can be trusted.",
    statedBucket: "Jev's bullish probability", statedAverage: "Mean stated", actualUp: "Actually rose", samples: "Samples",
    recentTitle: "Recent records",
    date: "Date", stock: "Stock", outlook: "Outlook", outlooks: { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" },
    score: "Score", days: (count) => `${count}d`, plan: "Plan",
    planResults: { target: "Target", stop: "Stop", open: "Open", timeout: "Expired" },
    pending: "pending",
  },
  ja: {
    open: "検証記録",
    title: "分析結論の検証",
    intro: "分析の結論はここに自動で記録され、5・10・20 営業日後の実際の値動きと照合されます。分析のたびに基準として「ルールのみのスコア」も無料で記録します。記録はこのブラウザにのみ保存されるため、端末の変更やブラウザデータの消去前にエクスポートしてください。",
    smallSample: "サンプルが 30 件未満の場合、数値は参考程度です。",
    empty: "まだ記録がありません。銘柄を分析すると蓄積が始まります。",
    refresh: "結果を更新",
    refreshing: (done, total) => `更新中 ${done}/${total}…`,
    refreshFailed: (count) => `${count} 銘柄の株価取得に失敗しました。後でもう一度お試しください。`,
    exportData: "エクスポート", importData: "インポート", importFailed: "インポート失敗：有効な検証記録ファイルではありません。",
    clear: "全消去", clearConfirm: "すべての検証記録を消去しますか？元に戻せません。先にエクスポートをおすすめします。",
    storageFailed: "ブラウザの保存容量が不足し、記録を保存できませんでした。エクスポート後に古い記録を消去してください。",
    close: "閉じる",
    summaryTitle: "モード別の成績（10 営業日後の騰落で集計）",
    summaryNote: "方向的中：強気は ATR の 1.5 倍超の上昇、弱気は 1.5 倍超の下落、中立はその範囲内の値動きが条件です。「全体平均」はそのモードの全記録の平均騰落で、比較対象です。強気判定後の平均がこれを明確に上回って初めて判定が有用と言えます。",
    track: "モード",
    tracks: { rule: "ルールのみ", "rule-ai": "ルール + LLM", "ai-native": "LLM判断", "jev-ai": "Jev 判定" },
    records: "記録", evaluated: "結果あり", hitRate: "方向的中", allAverage: "全体平均",
    afterBullish: "強気の後", afterBearish: "弱気の後", highScore: "スコア≥3.5", lowScore: "スコア<2.5",
    plans: "エントリー計画", planValue: (target, stop) => `利確 ${target} / 損切り ${stop}`,
    calibrationTitle: "Jev 確率の較正",
    calibrationNote: "Jev が「強気 70%」とした記録は、実際に約 7 割が上昇したでしょうか。2 つの列が近いほど、確率は信頼できます。",
    statedBucket: "Jev の強気確率", statedAverage: "平均確率", actualUp: "実際の上昇割合", samples: "サンプル",
    recentTitle: "最近の記録",
    date: "日付", stock: "銘柄", outlook: "見通し", outlooks: { bullish: "強気", neutral: "中立", bearish: "弱気" },
    score: "スコア", days: (count) => `${count}日`, plan: "計画",
    planResults: { target: "利確", stop: "損切り", open: "進行中", timeout: "期限切れ" },
    pending: "未確定",
  },
};

export function validationLabels(language: EffectiveLanguage): ValidationLabels {
  return LABELS[language] ?? LABELS["zh-CN"];
}
