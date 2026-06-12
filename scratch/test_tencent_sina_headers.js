async function request(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    return res;
  } catch (e) {
    console.error("Fetch error:", e.message);
    return null;
  }
}

async function testTencent() {
  const sym = 'sh600519';
  const url = `https://web.ifzq.gtimg.cn/appnew/tech/historykline/get?symbol=${sym}&type=day&limit=10`;
  const headers = {
    'Referer': 'https://stock.qq.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const res = await request(url, headers);
  if (res && res.ok) {
    const json = await res.json();
    console.log("Tencent sh600519 success:", JSON.stringify(json).substring(0, 500));
  } else {
    console.log("Tencent sh600519 failed:", res ? res.status : 'no res');
  }
}

async function testSina() {
  const sym = 'sh600519';
  // Standard Sina A-share daily K-line URL from search results:
  // https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=sh600519&scale=240&ma=no&datalen=10
  const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${sym}&scale=240&ma=no&datalen=10`;
  const headers = {
    'Referer': 'https://finance.sina.com.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const res = await request(url, headers);
  if (res && res.ok) {
    const json = await res.json();
    console.log("Sina sh600519 success:", JSON.stringify(json).substring(0, 500));
  } else {
    console.log("Sina sh600519 failed:", res ? res.status : 'no res');
  }
}

async function testSinaUS() {
  const sym = 'aapl';
  // Sina US stock daily K-line URL:
  // http://stock.finance.sina.com.cn/usstock/api/jsonp.php/IO.Success/US_MinKLine.getKLine?symbol=aapl&scale=240&datalen=10
  const url = `http://stock.finance.sina.com.cn/usstock/api/jsonp.php/IO.Success/US_MinKLine.getKLine?symbol=${sym}&scale=240&datalen=10`;
  const headers = {
    'Referer': 'http://finance.sina.com.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const res = await request(url, headers);
  if (res && res.ok) {
    const text = await res.text();
    console.log("Sina US aapl success:", text.substring(0, 500));
  } else {
    console.log("Sina US aapl failed:", res ? res.status : 'no res');
  }
}

async function run() {
  await testTencent();
  await testSina();
  await testSinaUS();
}

run();
