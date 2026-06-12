# 量化红绿涨跌切换器与现价及自选股配色同步方案

本项目上一阶段已成功将 `StockChart` 内部的 `isRedUp` 状态提取至 Props，并且移除了 Chart 内部的切换器。本阶段我们将：
1. 在 `page.tsx` 顶层维护并持久化 `isRedUp` 状态；
2. 将红绿涨跌模式切换器重新设计为高质感、极具交互性的按钮，并移动至 `chartSelector` 工具栏右侧；
3. 将主页面股票现价右侧的涨跌幅配色、以及左侧“分析历史” (Watchlist) 列表中的涨跌幅配色，与该状态完全同步。

## User Review Required

> [!IMPORTANT]
> **配色同步规则**
> - 当 `isRedUp === true` (红涨绿跌模式/大陆港股习惯)：
>   - 涨幅 (>= 0) 显示为红色 (`#f23645`)
>   - 跌幅 (< 0) 显示为绿色 (`#089981`)
> - 当 `isRedUp === false` (绿涨红跌模式/美股国际习惯)：
>   - 涨幅 (>= 0) 显示为绿色 (`#089981`)
>   - 跌幅 (< 0) 显示为红色 (`#f23645`)

> [!TIP]
> **按钮交互设计**
> - 设计为 pill (胶囊) 形状按钮，带有细致的发光边框和渐变背景。
> - 内部包含一个呼吸灯脉冲点指示器 (`indicator-pulse` 关键帧动画)，随所选状态显示对应的呼吸红光或呼吸绿光。
> - 按钮默认使用 `marginLeft: "auto"`，推至 `chartSelector` 的最右侧，避免与左侧的时间轴切换按钮冲突。

---

## Proposed Changes

### 主前端页面

#### [MODIFY] [page.tsx](file:///D:/projects/zenith-quant/src/app/page.tsx)
- **定义状态**：
  - 在 `Home` 组件内定义 `isRedUp` 状态，默认值为 `true`。
  - 在已有的挂载 `useEffect` (约第 407 行起) 中，从 `localStorage` 读取 `"zenith_chart_color_mode"` 的值，如果是 `"green-up"` 则设置 `isRedUp` 为 `false`。
  - 声明 `toggleColorMode` 切换函数，并在切换时将 `"red-up"` 或 `"green-up"` 保存至 `localStorage`。
- **引入动画**：
  - 在 Loading 的 `<style>` 标签(约第 950 行起)中注入 `indicator-pulse` 关键帧和 `.color-mode-btn:hover` 等 CSS 过渡与阴影效果。
- **重构控制栏**：
  - 在 `<div style={styles.chartSelector}>` (约第 1297 行起) 的最右侧挂载重新设计的 Toggle 按钮。
- **同步图表 Props**：
  - 在调用 `<StockChart>` 时，传入 `isRedUp={isRedUp}`，确保 Lightweight Charts 的蜡烛图红绿配色随之切换。
- **现价与分析历史配色同步**：
  - 计算 `upColor` 和 `downColor`：
    ```typescript
    const upColor = isRedUp ? "#f23645" : "#089981";
    const downColor = isRedUp ? "#089981" : "#f23645";
    ```
  - 将现价旁边的 `stockData.changePercent` 文本的 `color` 修改为根据 `stockData.changePercent >= 0 ? upColor : downColor` 动态赋值。
  - 将左侧分析历史列表中 `quote.change` 文本的 `color` 修改为根据 `isUp ? upColor : downColor` 动态赋值。

---

## Verification Plan

### Automated Tests
- 执行 `npm run build`，确保整个项目的 React/Next.js 构建没有编译或类型错误。
- 运行 Vitest 检查 indicators, waveTheory, scoring 等模块是否依然通过测试：
  ```bash
  npm run test:run
  ```

### Manual Verification
1. **控制栏位置验证**：
   - 载入个股分析页面，确认红绿切换按钮成功推至 K 线控制栏最右侧。
2. **按钮视觉质感验证**：
   - 确认按钮呈现 pill 形状，内部小灯在红涨绿跌模式下呈现红色微发光呼吸，在绿涨红跌下呈现绿色微发光呼吸。
3. **颜色切换同步验证**：
   - 点击切换按钮，蜡烛图的阳线/阴线随之翻转颜色。
   - 现价涨跌幅的百分比颜色（如为正，原来是绿色，切换后变为红色）即时刷新。
   - 左侧“分析历史”里的个股涨跌幅颜色也随之同步翻转。
   - 刷新页面，确认选择的状态能从 `localStorage` 中被正确读取和恢复。
