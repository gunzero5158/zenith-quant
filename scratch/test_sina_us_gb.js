async function request(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    return res;
  } catch (e) {
    console.error("Fetch error:", e.message);
    return null;
  }
}

async function testSinaUS(symbol, scale) {
  // New test using gb_ prefix
  const url = `https://stock.finance.sina.com.cn/usstock/api/jsonp.php/IO.Success/US_MinKLine.getKLine?symbol=${symbol}&scale=${scale}&datalen=10`;
  const headers = {
    'Referer': 'https://finance.sina.com.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  const res = await request(url, headers);
  if (res && res.ok) {
    const text = await res.text();
    console.log(`Sina US (${symbol}, scale=${scale}) response length:`, text.length);
    console.log("Sample:", text.substring(0, 300));
  } else {
    console.log(`Sina US (${symbol}) failed:`, res ? res.status : 'no res');
  }
}

async function run() {
  await testSinaUS('gb_aapl', '240');
  await testSinaUS('gb_aapl', 'd');
  await testSinaUS('aapl', 'd');
  await testSinaUS('AAPL', '240');
}

run();
