// 大きい一覧ページの絞り込み・検索・並べ替え・URL パラメータが、基準(既定 origin/main)と今の作業ツリーで
// 同じ結果になるかを確かめる。Playwright(Chromium)が必要。外部への通信はすべて止める。
// 実行: node tests/filter-parity.test.js            … origin/main と比べる
//       BASE_REF=<ブランチやコミット> node tests/filter-parity.test.js
//       BASE_DIR=<別に取り出したサイトのフォルダ> node tests/filter-parity.test.js
//       ONLY=food.html node tests/filter-parity.test.js  … 1 ページだけ
// 比べるもの: 件数表示の文章・表示中のカード数・表示中のカードの並び(先頭 40 件と全体の指紋)。
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) {
  console.log("1..0 # SKIP playwright がありません(npm i -g playwright など)"); process.exit(0);
}

const ROOT = path.resolve(__dirname, "..");
const TYPE = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "application/javascript", ".json": "application/json",
  ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".xml": "application/xml" };

function serve(dir) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": TYPE[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function baseDir() {
  if (process.env.BASE_DIR) return { dir: path.resolve(process.env.BASE_DIR), cleanup() {} };
  const ref = process.env.BASE_REF || "origin/main";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wanko-base-"));
  const tar = execFileSync("git", ["-C", ROOT, "archive", "--format=tar", ref], { maxBuffer: 1 << 30 });
  execFileSync("tar", ["-x", "-C", dir], { input: tar, maxBuffer: 1 << 30 });
  return { dir, ref, cleanup() { fs.rmSync(dir, { recursive: true, force: true }); } };
}

// ---- 操作の書き方: {click: セレクタ} / {type: 文字列, into: セレクタ}(1 文字ずつキーを押す) / {select: [セレクタ, 値]}
//      {fill: [セレクタ, 値]}(input イベントを送る) / {clear: セレクタ}(全選択して消す)
const problems = list => list.map(p => ({ name: `ボタン ${p}`, steps: [{ click: `.filters button[data-problem="${p}"]` }] }));
const params = (key, list) => list.map(v => ({ name: `?${key}=${v}`, query: `${key}=${encodeURIComponent(v)}` }));
const words = (sel, list) => list.map(w => ({ name: `検索「${w}」`, steps: [{ type: w, into: sel }] }));

const FOOD_PROBLEMS = ["all", "毎日の主食", "食べムラ・お腹", "原材料で選ぶ", "体重管理", "早食い", "しつけ・ごほうび", "噛むおやつ", "一般食・トッピング", "ロイヤルカナン", "用途 要確認"];
const GOODS_PROBLEMS = ["all", "しつけ・ごほうび", "シニア・負担", "体重管理", "安全・迷子", "宿で落ち着く", "寒さ対策", "散歩後ケア", "旅行準備", "早食い", "暑さ対策", "毎日のケア", "水分補給", "臭い・排泄", "車移動", "雨・泥汚れ", "食べムラ・お腹"];
const GEAR_PROBLEMS = ["all", "シニア・負担", "安全・迷子", "宿で落ち着く", "寒さ対策", "散歩後ケア", "旅行準備", "早食い", "暑さ対策", "水分補給", "臭い・排泄", "車移動", "雨・泥汚れ", "食べムラ・お腹"];
const WEAR_PROBLEMS = ["all", "ウェルネス・介護", "オシャレ番長", "マナーウェア", "レインウェア", "暑さ対策ウェア", "水辺・ライフジャケット", "術後・保護ウェア", "防寒ウェア"];

const PAGES = [
  { page: "dog-lodging-guide.html", cards: ".stay-card", count: "#stay-count", scenarios: [
    { name: "初期表示" },
    ...words("#stay-query", ["那須", "伊豆", "温泉", "軽井沢", "zz該当なし"]),
    ...["large", "multi", "sleep", "cage", "run", "meal", "free"].map(k => ({ name: `条件 ${k}`, steps: [{ click: `.stay-chip[data-chip="${k}"]` }] })),
    { name: "条件 大型犬+添い寝+ドッグラン", steps: [{ click: '.stay-chip[data-chip="large"]' }, { click: '.stay-chip[data-chip="sleep"]' }, { click: '.stay-chip[data-chip="run"]' }] },
    { name: "条件 多頭 → 解除", steps: [{ click: '.stay-chip[data-chip="multi"]' }, { click: '.stay-chip[data-chip="multi"]' }] },
    { name: "並び順 地域順", steps: [{ select: ["#stay-sort", "pref"] }] },
    { name: "並び順 地域順 → おすすめ順", steps: [{ select: ["#stay-sort", "pref"] }, { select: ["#stay-sort", "rec"] }] },
    { name: "検索「那須」+添い寝+地域順", steps: [{ type: "那須", into: "#stay-query" }, { click: '.stay-chip[data-chip="sleep"]' }, { select: ["#stay-sort", "pref"] }] },
    { name: "検索して消す", steps: [{ type: "伊豆", into: "#stay-query" }, { clear: "#stay-query" }] },
    { name: "条件+検索 → 全解除", steps: [{ click: '.stay-chip[data-chip="cage"]' }, { type: "温泉", into: "#stay-query" }, { click: ".stay-reset" }] },
  ] },
  { page: "east-japan-dog-trips.html", cards: "#tripGrid .trip", count: "#outing-count", scenarios: [
    { name: "初期表示" },
    ...["all", "kanto", "chiba", "koshinetsu", "shizuoka-east", "tohoku"].map(r => ({ name: `地域 ${r}`, steps: [{ click: `[data-filter="${r}"]` }] })),
    ...["cafe", "run", "travel", "all"].map(k => ({ name: `種類 ${k}`, steps: [{ select: ["#outing-kind", k] }] })),
    ...words("#outing-query", ["那須", "店内同伴", "ドッグラン", "軽井沢", "zz該当なし"]),
    { name: "関東+カフェ+検索「テラス」", steps: [{ click: '[data-filter="kanto"]' }, { select: ["#outing-kind", "cafe"] }, { type: "テラス", into: "#outing-query" }] },
    { name: "検索中に地域を押す", steps: [{ type: "那須", into: "#outing-query", noWait: true }, { click: '[data-filter="kanto"]' }] },
    { name: "条件 → リセット", steps: [{ click: '[data-filter="tohoku"]' }, { type: "温泉", into: "#outing-query" }, { click: "#outing-reset" }] },
  ] },
  { page: "food.html", cards: ".grid article.card", count: ".result-count", scenarios: [
    { name: "初期表示" },
    ...problems(FOOD_PROBLEMS),
    ...params("problem", [...FOOD_PROBLEMS, "存在しない用途"]),
    ...params("age", ["子犬", "成犬", "シニア", "全年齢"]),
    { name: "?brand=(1 つ目のブランド)", queryFrom: { select: "#food-brand", key: "brand" } },
    { name: "?problem=体重管理&age=シニア", query: "problem=" + encodeURIComponent("体重管理") + "&age=" + encodeURIComponent("シニア") },
    ...words(".search", ["シニア", "グレインフリー", "ウェット", "小型犬", "zz該当なし"]),
    { name: "すべて → 検索「チキン」", steps: [{ click: '.filters button[data-problem="all"]' }, { type: "チキン", into: ".search" }] },
    { name: "年齢 シニア", steps: [{ select: ["#ff-age", "シニア"] }] },
    { name: "穀物 1 つ目の選択肢", steps: [{ selectIndex: ["#ff-grain", 1] }] },
    { name: "犬種 1 つ目の選択肢", steps: [{ selectIndex: ["#ff-breed", 1] }] },
    { name: "並べ替え 2 つ目", steps: [{ selectIndex: ["#ff-sort", 1] }] },
    { name: "並べ替え 3 つ目", steps: [{ selectIndex: ["#ff-sort", 2] }] },
    { name: "年齢 成犬+並べ替え 2 つ目", steps: [{ select: ["#ff-age", "成犬"] }, { selectIndex: ["#ff-sort", 1] }] },
    { name: "並べ替え 2 つ目 → 既定", steps: [{ selectIndex: ["#ff-sort", 1] }, { selectIndex: ["#ff-sort", 0] }] },
    { name: "予算 3000 円", steps: [{ fill: ["#ff-budget", "3000"] }] },
    { name: "体重 5.5kg", steps: [{ fill: ["#ff-weight", "5.5"] }] },
    { name: "ブランド 1 つ目", steps: [{ selectIndex: ["#food-brand", 1] }] },
    { name: "入口 age:シニア", steps: [{ click: '[data-food-entry="age:シニア"]' }] },
    { name: "入口 problem:体重管理", steps: [{ click: '[data-food-entry="problem:体重管理"]' }] },
    { name: "条件 → リセット", steps: [{ select: ["#ff-age", "子犬"] }, { click: "#ff-reset" }] },
  ] },
  { page: "goods.html", cards: ".grid article.card", count: ".result-count", scenarios: [
    { name: "初期表示" },
    ...problems(GOODS_PROBLEMS),
    ...params("problem", [...GOODS_PROBLEMS, "存在しない用途"]),
    ...words(".search", ["臭い", "車", "雨", "早食い", "zz該当なし"]),
    { name: "車移動 → 検索「ケージ」", steps: [{ click: '.filters button[data-problem="車移動"]' }, { type: "ケージ", into: ".search" }] },
    { name: "検索中に用途を押す", steps: [{ type: "雨", into: ".search", noWait: true }, { click: '.filters button[data-problem="旅行準備"]' }] },
  ] },
  { page: "wear.html", cards: ".grid article.card", count: ".result-count", scenarios: [
    { name: "初期表示" },
    ...problems(WEAR_PROBLEMS),
    ...["超小型", "小型", "中型", "大型", "all"].map(s => ({ name: `サイズ ${s}`, steps: [{ click: `button[data-size="${s}"]` }] })),
    ...params("problem", [...WEAR_PROBLEMS, "雨・泥汚れ", "暑さ対策", "臭い・排泄", "安全・迷子", "シニア・負担", "旅行準備", "散歩後ケア", "存在しない用途"]),
    ...params("purpose", ["rain", "cold", "cool", "cooling", "manner", "water", "protect", "care", "daily", "none"]),
    ...params("size", ["超小型", "小型", "中型", "大型"]),
    ...params("entry", ["travel"]),
    { name: "?problem=レインウェア&size=小型", query: "problem=" + encodeURIComponent("レインウェア") + "&size=" + encodeURIComponent("小型") },
    ...words(".search", ["柴犬", "レイン", "裏起毛", "保冷剤", "zz該当なし"]),
    { name: "防寒+中型+検索「フリース」", steps: [{ click: '.filters button[data-problem="防寒ウェア"]' }, { click: 'button[data-size="中型"]' }, { type: "フリース", into: ".search" }] },
    ...["__travel", "all", "オシャレ番長", "レインウェア", "防寒ウェア"].map(v => ({ name: `入口 ${v}`, steps: [{ click: `[data-entry="${v}"]` }] })),
    { name: "検索中にサイズを押す", steps: [{ type: "レイン", into: ".search", noWait: true }, { click: 'button[data-size="大型"]' }] },
  ] },
  { page: "travel-gear.html", cards: ".grid article.card", count: ".result-count", scenarios: [
    { name: "初期表示" },
    ...problems(GEAR_PROBLEMS),
    ...params("problem", [...GEAR_PROBLEMS, "存在しない用途"]),
    ...words(".search", ["臭い", "車", "雨", "キャリー", "zz該当なし"]),
    { name: "旅行準備 → 検索「マット」", steps: [{ click: '.filters button[data-problem="旅行準備"]' }, { type: "マット", into: ".search" }] },
  ] },
];

async function run(ctx, site, page, s, queryFromBase) {
  const tab = await ctx.newPage();
  const errors = [];
  tab.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    const query = s.query || queryFromBase || "";
    await tab.goto(`${site}/${page.page}${query ? "?" + query : ""}`, { waitUntil: "load", timeout: 120000 });
    await tab.waitForTimeout(300);
    for (const st of s.steps || []) {
      if (st.click) {
        const el = tab.locator(st.click).first();
        await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await el.click({ timeout: 10000 });
      } else if (st.type) {
        const el = tab.locator(st.into).first();
        await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
        await el.click();
        // 本物のキー入力(isTrusted)。IME は通さず 1 文字ずつ入れる
        for (const ch of st.type) { await tab.keyboard.insertText(ch); await tab.waitForTimeout(40); }
      } else if (st.clear) {
        const el = tab.locator(st.clear).first();
        await el.click(); await tab.keyboard.press("Control+A"); await tab.keyboard.press("Backspace");
      } else if (st.select) {
        await tab.locator(st.select[0]).first().selectOption(st.select[1]);
      } else if (st.selectIndex) {
        await tab.locator(st.selectIndex[0]).first().selectOption({ index: st.selectIndex[1] });
      } else if (st.fill) {
        await tab.locator(st.fill[0]).first().fill(st.fill[1]);
      }
      if (!st.noWait) await tab.waitForTimeout(450); // 入力の待ち(120〜150ms)より十分長く
    }
    await tab.waitForTimeout(400);
    const snap = await tab.evaluate(({ cardSel, countSel }) => {
      const key = c => c.id || (c.querySelector("[data-product]") || {}).dataset?.product || ((c.querySelector("h2,h3") || {}).textContent || "").trim();
      const cards = [...document.querySelectorAll(cardSel)];
      const vis = cards.filter(c => !c.hidden && c.checkVisibility());
      const el = document.querySelector(countSel);
      return { total: cards.length, shown: vis.length, count: el ? el.textContent.trim() : null, keys: vis.map(key) };
    }, { cardSel: page.cards, countSel: page.count });
    snap.order = crypto.createHash("sha1").update(snap.keys.join("\n")).digest("hex").slice(0, 12);
    snap.head = snap.keys.slice(0, 40);
    delete snap.keys;
    snap.errors = errors;
    return snap;
  } finally { await tab.close(); }
}

(async () => {
  const base = baseDir();
  const [a, b] = await Promise.all([serve(base.dir), serve(ROOT)]);
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: "ja-JP", serviceWorkers: "block" };
  const blockExternal = async ctx => ctx.route(u => !u.href.startsWith("http://127.0.0.1"), r => r.abort());
  const ctxA = await browser.newContext(opts), ctxB = await browser.newContext(opts);
  await blockExternal(ctxA); await blockExternal(ctxB);

  console.log(`# 基準: ${base.ref || base.dir} / 比べる側: 作業ツリー (${ROOT})`);
  const only = process.env.ONLY;
  const jobs = [];
  for (const page of PAGES) if (!only || only.split(",").includes(page.page)) for (const s of page.scenarios) jobs.push({ page, s });
  let n = 0, failed = 0, i = 0;
  const results = new Array(jobs.length);
  const worker = async () => {
    while (i < jobs.length) {
      const k = i++, { page, s } = jobs[k];
      let q = "";
      if (s.queryFrom) {
        const tab = await ctxA.newPage();
        await tab.goto(`${a.url}/${page.page}`, { waitUntil: "load", timeout: 120000 });
        const v = await tab.evaluate(sel => { const o = [...(document.querySelector(sel)?.options || [])].find(o => o.value); return o ? o.value : ""; }, s.queryFrom.select);
        await tab.close();
        q = `${s.queryFrom.key}=${encodeURIComponent(v)}`;
      }
      try {
        const [ra, rb] = await Promise.all([run(ctxA, a.url, page, s, q), run(ctxB, b.url, page, s, q)]);
        results[k] = { ra, rb };
      } catch (e) { results[k] = { error: String(e.message || e).split("\n")[0] }; }
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.WORKERS || 2) }, worker));

  jobs.forEach(({ page, s }, k) => {
    n++;
    const { ra, rb, error } = results[k];
    const name = `${page.page} ${s.name}`;
    if (error) { failed++; console.log(`not ok ${n} - ${name}\n  # 操作できませんでした: ${error}`); return; }
    const diffs = [];
    for (const f of ["total", "shown", "count", "order"]) if (ra[f] !== rb[f]) diffs.push(`${f}: 基準=${JSON.stringify(ra[f])} 今=${JSON.stringify(rb[f])}`);
    if (ra.order !== rb.order) {
      const j = ra.head.findIndex((x, m) => x !== rb.head[m]);
      if (j >= 0) diffs.push(`並びが ${j + 1} 件目から違う: 基準=${ra.head[j]} 今=${rb.head[j]}`);
    }
    if (rb.errors.length && !ra.errors.length) diffs.push(`今の側だけで JS エラー: ${rb.errors[0]}`);
    if (diffs.length) { failed++; console.log(`not ok ${n} - ${name}\n  # ${diffs.join("\n  # ")}`); }
    else console.log(`ok ${n} - ${name} (${rb.shown}/${rb.total} 件)`);
  });
  console.log(`1..${n}\n# ${n - failed}/${n} 一致`);
  await browser.close(); a.server.close(); b.server.close(); base.cleanup();
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
