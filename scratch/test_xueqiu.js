async function getXueqiuCookie() {
  try {
    const res = await fetch('https://xueqiu.com/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const cookie = res.headers.get('set-cookie');
    return cookie;
  } catch (e) {
    console.error("Failed to get Xueqiu cookie:", e.message);
    return null;
  }
}

async function testXueqiuKlines(symbol, cookie) {
  // period can be 'day' or 'week'
  // count is the number of candles
  const url = `https://stock.xueqiu.com/v5/stock/chart/kline.json?symbol=${symbol}&begin=${Date.now()}&period=day&type=before&count=10&indicator=kline`;
  try {
    const res = await fetch(url, {
      headers: {
        'Cookie': cookie || '',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://xueqiu.com/'
      }
    });
    if (res.ok) {
      const json = await res.json();
      console.log(`Xueqiu ${symbol} success!`);
      console.log("Keys:", Object.keys(json));
      if (json.data && json.data.item) {
        console.log("Candles count:", json.data.item.length);
        console.log("Sample candle (timestamp, volume, open, high, low, close...):", json.data.item[0]);
      } else {
        console.log("Data format check failed:", JSON.stringify(json).substring(0, 300));
      }
    } else {
      console.log(`Xueqiu ${symbol} failed:`, res.status, await res.text());
    }
  } catch (e) {
    console.error(`Xueqiu ${symbol} error:`, e.message);
  }
}

async function run() {
  console.log("Getting cookie...");
  const cookie = await getXueqiuCookie();
  console.log("Got cookie:", cookie ? cookie.substring(0, 100) + '...' : 'none');
  if (cookie) {
    await testXueqiuKlines('AAPL', cookie);
    await testXueqiuKlines('00700', cookie);
    await testXueqiuKlines('SH600519', cookie);
  }
}

run();
