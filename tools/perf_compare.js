// 2 つのサイト(例: main とブランチ)を Playwright で同じ条件で開き、表示の速さと検索欄の反応を比べる。
// 使い方: node tools/perf_compare.js <基準のURL> <比べるURL> [回数=3] > 結果.json
//   例: node tools/perf_compare.js http://127.0.0.1:8001 http://127.0.0.1:8002 3
// 条件: 画面 412x823(スマホ)、CPU 4 倍遅く(CDP)、外部への通信はすべて止める(手元のファイルだけ)。
// 取るもの: LCP・CLS・TBT(長いタスクの 50ms 超え分の合計、読み込み後 3 秒まで)・転送量・JS 実行時間(ScriptDuration)、
//   検索欄に 1 文字ずつ入れたときの「入力 → 件数表示が変わって次の描画まで」の時間と、入力イベントの処理時間(Event Timing)。
"use strict";
const { chromium } = require("playwright");

const PAGES = [
  { page: "dog-lodging-guide.html", search: "#stay-query", count: "#stay-count", word: "那須温泉" },
  { page: "east-japan-dog-trips.html", search: "#outing-query", count: "#outing-count", word: "那須高原" },
  { page: "food.html", search: ".search", count: ".result-count", word: "シニア" },
  { page: "goods.html", search: ".search", count: ".result-count", word: "早食い" },
  { page: "wear.html", search: ".search", count: ".result-count", word: "レイン" },
  { page: "travel-gear.html", search: ".search", count: ".result-count", word: "キャリー" },
];
const [baseUrl, headUrl, runsArg] = process.argv.slice(2);
const RUNS = Number(runsArg || 3);
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, long: [], fcp: 0, events: [] };
  new PerformanceObserver(l => l.getEntries().forEach(e => { window.__perf.lcp = e.startTime; })).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__perf.cls += e.value; })).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.long.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime; })).observe({ type: "paint", buffered: true });
  new PerformanceObserver(l => l.getEntries().forEach(e => window.__perf.events.push([e.name, e.startTime, e.duration, e.processingEnd - e.processingStart]))).observe({ type: "event", buffered: true, durationThreshold: 16 });
};

async function measure(browser, site, p) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: "ja-JP" });
  await ctx.route(u => !u.href.startsWith("http://127.0.0.1"), r => r.abort());
  await ctx.addInitScript(OBSERVE);
  const tab = await ctx.newPage();
  const cdp = await ctx.newCDPSession(tab);
  await cdp.send("Performance.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await tab.goto(`${site}/${p.page}`, { waitUntil: "load", timeout: 180000 });
  await tab.waitForTimeout(3000);
  const load = await tab.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const res = performance.getEntriesByType("resource");
    const end = nav.loadEventEnd + 3000, f = window.__perf;
    const tbt = f.long.filter(([s]) => s >= f.fcp && s <= end).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);
    return { lcp: f.lcp, cls: f.cls, tbt, fcp: f.fcp, load: nav.loadEventEnd, bytes: nav.transferSize + res.reduce((a, r) => a + (r.transferSize || 0), 0), requests: res.length + 1 };
  });
  const m = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(x => [x.name, x.value]));
  load.script = m.ScriptDuration * 1000; load.task = m.TaskDuration * 1000;

  // 検索欄: 1 文字入れて、件数表示が書き換わり次の描画が済むまで待つ(最大 3 秒)。これを 1 文字ずつ
  const box = tab.locator(p.search).first();
  await box.scrollIntoViewIfNeeded(); await box.click();
  await tab.evaluate(() => { window.__perf.events = []; });
  const keys = [];
  for (const ch of p.word) {
    await tab.evaluate(sel => {
      const el = document.querySelector(sel);
      window.__key = { t0: 0, done: null };
      document.addEventListener("beforeinput", e => { window.__key.t0 = e.timeStamp; }, { capture: true, once: true });
      const mo = new MutationObserver(() => { mo.disconnect(); requestAnimationFrame(() => setTimeout(() => { window.__key.done = performance.now(); }, 0)); });
      mo.observe(el, { childList: true, characterData: true, subtree: true });
    }, p.count);
    await tab.keyboard.insertText(ch);
    await tab.waitForFunction(() => window.__key.done !== null, null, { timeout: 3000 }).catch(() => {});
    keys.push(await tab.evaluate(() => window.__key.done === null ? null : window.__key.done - window.__key.t0));
    await tab.waitForTimeout(300);
  }
  // 速く打った場合(1 文字 120ms 間隔)の、最後の文字から結果が出るまでと、打っている間の長いタスク
  await tab.evaluate(sel => { const el = document.querySelector(sel); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); }, p.search);
  await tab.waitForTimeout(800);
  await tab.evaluate(() => { window.__perf.long = []; });
  const tFast0 = await tab.evaluate(() => performance.now());
  for (const ch of p.word) { await tab.keyboard.insertText(ch); await tab.waitForTimeout(120); }
  await tab.waitForTimeout(1500);
  const fast = await tab.evaluate(t0 => window.__perf.long.filter(([s]) => s >= t0).reduce((a, [, d]) => a + Math.max(0, d - 50), 0), tFast0);
  const ev = await tab.evaluate(() => window.__perf.events.filter(([n]) => /input|key/.test(n)).map(([, , d]) => d));
  await ctx.close();
  return { ...load, keys, keyMedian: median(keys.filter(x => x != null)), keyMax: Math.max(...keys.filter(x => x != null)), eventMax: ev.length ? Math.max(...ev) : 0, fastTypingTbt: fast };
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = {};
  for (const p of PAGES) {
    out[p.page] = { base: [], head: [] };
    for (let i = 0; i < RUNS; i++) {
      // 交互に測って、時間による揺れを両方に同じだけ乗せる
      out[p.page].base.push(await measure(browser, baseUrl, p));
      out[p.page].head.push(await measure(browser, headUrl, p));
      process.stderr.write(`${p.page} ${i + 1}/${RUNS}\n`);
    }
    const keysOf = ["lcp", "cls", "tbt", "bytes", "script", "keyMedian", "keyMax", "eventMax", "fastTypingTbt"];
    out[p.page].median = Object.fromEntries(["base", "head"].map(side => [side, Object.fromEntries(keysOf.map(k => [k, median(out[p.page][side].map(r => r[k]))]))]));
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
