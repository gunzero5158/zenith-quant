# Zenith-Analysis <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00f5d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;"><path d="M3 3v18h18" /><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" /></svg>

[简体中文](./README.zh-CN.md) | [日本語](./README.ja.md)

Zenith-Analysis is a professional **multi-dimensional, multi-indicator, and multi-pattern deep technical analysis system** for stock investors. It integrates traditional technical indicators, advanced trend theories (Elliott Wave & Chanlun), volume profile-based support/resistance nodes, and Large Language Model (LLM) intelligence to generate institutional-grade technical analysis reports.

---

## 🌟 Key Features

### 1. Multi-Dimensional Algorithmic Analysis Matrix
Instead of relying on a single indicator, Zenith-Analysis analyzes stocks from 5 main dimensions:
* **Core Technical Indicators**: EMA system, Bollinger Bands, MACD, KDJ, RSI, and ATR.
* **Volume & Capital Flow**: Integrates OBV (On-Balance Volume) and CMF (Chaikin Money Flow) with Volume 20SMA to detect capital movement and price-volume divergence.
* **Trend & Chart Patterns**:
  * **TD Sequential**: Captures trend exhaustion and critical reversal points.
  * **Pattern Recognition**: Automatically identifies Double Bottoms, Head and Shoulders, Cup and Handles, Rounding Tops, etc.
  * **Fibonacci Retracement**: Automatically plots key Fibonacci support/resistance levels based on historical bands.
* **Elliott Wave Theory**: Detects impulse waves (e.g., Wave 3/5) or ABC corrective waves by analyzing swing highs/lows.
* **Chanlun (缠论) Analysis**: Implements Chanlun algorithms, resolves K-line inclusions, detects Ding/Di FenXing pivots, and constructs strokes.
* **Volume Profile Support/Resistance**: Clusters historical peaks and troughs to calculate the Volume POC (Point of Control) and dynamic support/resistance zones.

### 2. AI-Generated Deep Technical Reports
* Synthesizes dozens of objective metrics into a comprehensive quantitative rating.
* Feeds structured technical data directly into LLM APIs to generate professional reports containing an "Overview," "Trading Strategy Suggestions," and "Technical Breakdown."
* Supports multilingual outputs (English, Simplified Chinese, Traditional Chinese, Japanese).

### 3. Intelligent Local Caching
* **Market Status Detection**: Built-in support for **A-Share, HK Stock, US Stock, and JP Stock** trading hours (including weekends, lunch breaks, and market closures, converted to local time).
* **0.1s Cache Recall**: Skips network fetches and loads previous reports instantly from `localStorage` if the market is currently closed and cached data for the day exists, saving API tokens.
* **Force Refresh**: Provides a reload button to bypass cache and query live, instantaneous data.

### 4. Premium Visual Experience
* **Global Color Mode Toggle**: Switch between "Red-Up/Green-Down" (JP/CN) and "Green-Up/Red-Down" (US/Global) color palettes. Chart candles, price tags, and watchlist items sync instantly.
* **Modern Developer UI**: Beautiful dark-mode interface styled with glassmorphism, glowing SVG icons, smooth loading transitions, and a developer console output logs simulation.

---

## 🚀 Getting Started

### Prerequisites
* Node.js >= 18.0.0
* NPM or PNPM package manager recommended

### Installation & Launch
1. Clone or download the repository to your local directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Run unit tests:
   ```bash
   npm run test:run
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📄 License

This project is licensed under the **MIT License**.
