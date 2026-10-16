const labels = {
  "zh-CN": {
    title: "交易方案模拟", costs: "往返成本（基点）", slippage: "单边滑点（基点）",
    note: "日线模拟，非实盘成交。每笔假设独立、资金已结算；A股及境内基金统一次日才可卖出（基金采用保守口径）。不模拟账户资金周转或组合回撤。零成交、无价格区间等无法确认成交的样本单列。1基点=0.01%。",
    updated: "修改假设后点击更新走势结果；零成本与双倍成本作为敏感性对照，可能改变可入场样本。",
    status: { not_triggered: "未触发", unverifiable: "无法验证", skipped: "入场跳过", open: "进行中", target: "止盈", stop: "止损", timeout: "到期退出", ambiguous: "日内顺序不明" },
    netR: "平均净R", sensitivity: "零/双倍成本R", triggerRate: "确认率", count: "已结束", netReturn: "平均净收益", detail: "执行说明",
  },
  "zh-TW": {
    title: "交易方案模擬", costs: "往返成本（基點）", slippage: "單邊滑點（基點）",
    note: "日線模擬，非實際成交。每筆假設獨立且資金已交收；A股及境內基金統一次日才可賣出（基金採保守口徑）。不模擬帳戶資金周轉或組合回撤。無成交或無價格區間等樣本單列。1基點=0.01%。",
    updated: "修改假設後更新結果；零成本與雙倍成本用於敏感性比較，可能改變入場樣本。",
    status: { not_triggered: "未觸發", unverifiable: "無法驗證", skipped: "跳過入場", open: "進行中", target: "止盈", stop: "止損", timeout: "到期退出", ambiguous: "日內順序不明" },
    netR: "平均淨R", sensitivity: "零/雙倍成本R", triggerRate: "確認率", count: "已結束", netReturn: "平均淨收益", detail: "執行說明",
  },
  en: {
    title: "Trade-plan simulation", costs: "Round-trip cost (bps)", slippage: "Slippage per side (bps)",
    note: "Daily-bar simulation, not actual fills. Each position is independent and fully funded with settled cash. Mainland stocks and funds use next-day resale (conservative for funds). No account cash recycling or portfolio drawdown model. Zero-volume/flat bars are treated as unverifiable. 1bp=0.01%.",
    updated: "After changing assumptions, update outcomes. Zero/double costs are sensitivity scenarios and may change which entries qualify.",
    status: { not_triggered: "Not triggered", unverifiable: "Unverifiable", skipped: "Skipped entry", open: "Open", target: "Target", stop: "Stop", timeout: "Horizon exit", ambiguous: "Unknown intraday order" },
    netR: "Mean net R", sensitivity: "Zero/double-cost R", triggerRate: "Confirmed", count: "Resolved", netReturn: "Mean net return", detail: "Execution notes",
  },
  ja: {
    title: "取引計画シミュレーション", costs: "往復費用（bp）", slippage: "片道スリッページ（bp）",
    note: "日足シミュレーションであり、実約定ではありません。独立した取引・決済済み資金を仮定。中国本土株とファンドは翌日以降の売却（ファンドは保守的仮定）。口座資金の再利用やポートフォリオ損失はモデル化しません。出来高ゼロ・値幅なし等は検証不能。1bp=0.01%。",
    updated: "仮定を変更したら結果を更新してください。費用ゼロ・2倍の比較では、エントリー可能な標本も変わり得ます。",
    status: { not_triggered: "未発動", unverifiable: "検証不能", skipped: "見送り", open: "進行中", target: "利確", stop: "損切り", timeout: "期限決済", ambiguous: "日中順序不明" },
    netR: "平均純R", sensitivity: "費用ゼロ/2倍R", triggerRate: "確認率", count: "終了", netReturn: "平均純収益", detail: "執行条件",
  },
};
export function executionLabels(language: string) {
  return labels[language === "en" || language === "ja" || language === "zh-TW" ? language : "zh-CN"];
}
