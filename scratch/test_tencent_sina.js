// Use native global fetch

async function testTencent() {
  const symbols = ['usAAPL', 'sh600519', 'hk00700'];
  for (const sym of symbols) {
    const url = `https://web.ifzq.gtimg.cn/appnew/tech/historykline/get?symbol=${sym}&type=day&limit=10`;
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        console.log(`\n=== Tencent ${sym} ===`);
        console.log("Status Code:", res.status);
        console.log("Response structure keys:", Object.keys(json));
        if (json.data && json.data[sym]) {
          console.log("Data count:", json.data[sym].day ? json.data[sym].day.length : 'no day data');
          console.log("Sample candle:", json.data[sym].day ? json.data[sym].day[0] : null);
        } else {
          console.log("Data check failed:", JSON.stringify(json).substring(0, 300));
        }
      } else {
        console.log(`Tencent ${sym} failed status:`, res.status);
      }
    } catch (e) {
      console.log(`Tencent ${sym} error:`, e.message);
    }
  }
}

async function testSina() {
  // Sina API often returns JSON-like or JSONP. Let's test a simple Sina A-share JSON API
  // e.g. http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketHistory.getKLine?symbol=sh600519&scale=240&ma=no&datalen=10
  const url = `http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketHistory.getKLine?symbol=sh600519&scale=240&ma=no&datalen=10`;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const text = await res.text();
      console.log(`\n=== Sina A-share ===`);
      console.log("Response length:", text.length);
      console.log("Sample:", text.substring(0, 300));
    } else {
      console.log("Sina failed status:", res.status);
    }
  } catch (e) {
    console.log("Sina error:", e.message);
  }
}

async function run() {
  await testTencent();
  await testSina();
}

run();
