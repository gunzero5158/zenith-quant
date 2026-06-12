import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Antigravity Stock Analyzer | Professional Multi-Market Technical Analysis",
  description: "Analyze US, HK, A-Share, and Japan stocks using advanced technical indicators (EMA, BOLL, MACD, KDJ, RSI) and classic theories (TD Sequential, Chan Lun, Fibonacci, Wave Theory, Support/Resistance).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
