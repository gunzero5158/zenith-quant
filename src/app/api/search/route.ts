import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    if (!q || q.trim().length === 0) {
      return NextResponse.json({ quotes: [] });
    }

    const cleanQuery = q.trim();
    
    // Call yahoo-finance2 search method
    const searchResult: any = await yahooFinance.search(cleanQuery, {
      newsCount: 0, // We only need quotes, not news
    });

    // Map result to a simplified format for autocomplete
    const quotes = (searchResult.quotes || [])
      .filter((item: any) => item.symbol && (item.quoteType === "EQUITY" || item.quoteType === "ETF" || item.quoteType === "INDEX"))
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchDisp: item.exchDisp || "GLOBAL",
        typeDisp: item.typeDisp || "Stock",
      }))
      .slice(0, 8); // Limit to top 8 suggestions

    return NextResponse.json({ quotes });
  } catch (error: any) {
    console.error("Yahoo search API error:", error);
    return NextResponse.json({ quotes: [] }); // Return empty array on failure
  }
}
