async function run() {
  const url = 'http://localhost:3000/api/analyze';
  const body = JSON.stringify({
    symbol: 'AAPL',
    language: 'zh-CN'
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body
    });

    if (res.ok) {
      const data = await res.json();
      console.log("=== API Response Success ===");
      console.log("Symbol:", data.symbol);
      console.log("Company Name:", data.companyName);
      console.log("Price:", data.price);
      console.log("Data Source:", data.dataSource);
      console.log("Is Mock:", data.isMock);
      console.log("Candles Count:", data.dailyCandles ? data.dailyCandles.length : 0);
    } else {
      console.error("API Response Error:", res.status, await res.text());
    }
  } catch (e) {
    console.error("Fetch local server error:", e.message);
  }
}

run();
