async function request(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    return res;
  } catch (e) {
    console.error("Fetch error:", e.message);
    return null;
  }
}

async function testSinaHK() {
  // Try HK market data service
  const symbols = ['00700', 'hk00700', 'HK00700'];
  for (const sym of symbols) {
    const url = `https://quotes.sina.cn/hk/api/json_v2.php/HK_MarketDataService.getKLineData?symbol=${sym}&scale=240&ma=no&datalen=10`;
    const headers = {
      'Referer': 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const res = await request(url, headers);
    if (res && res.ok) {
      const text = await res.text();
      console.log(`Sina HK ${sym} length:`, text.length);
      console.log("Sample:", text.substring(0, 300));
    } else {
      console.log(`Sina HK ${sym} failed:`, res ? res.status : 'no res');
    }
  }
}

async function testSinaUS() {
  // Try US market data service
  const symbols = ['AAPL', 'aapl', 'gb_aapl', 'gb_AAPL'];
  for (const sym of symbols) {
    const url = `https://quotes.sina.cn/us/api/json_v2.php/US_MarketDataService.getKLineData?symbol=${sym}&scale=240&ma=no&datalen=10`;
    const headers = {
      'Referer': 'https://finance.sina.com.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    const res = await request(url, headers);
    if (res && res.ok) {
      const text = await res.text();
      console.log(`Sina US ${sym} length:`, text.length);
      console.log("Sample:", text.substring(0, 300));
    } else {
      console.log(`Sina US ${sym} failed:`, res ? res.status : 'no res');
    }
  }
}

async function run() {
  await testSinaHK();
  await testSinaUS();
}

run();
