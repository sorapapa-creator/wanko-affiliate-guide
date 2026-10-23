// サイト内検索(search.html)の操作テスト。スマホ 375×812 で実際に操作して確かめる。
// 実行: node tests/search-ui.test.js            (Playwright の chromium を使う。サーバーはこのスクリプトが立てる)
//       SHOT_DIR=/path node tests/search-ui.test.js  … スクリーンショットも保存する
//       WORDS=1 node tests/search-ui.test.js         … よく検索されそうな語の件数表も出す
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const TYPES = { "0": "宿", "1": "おでかけ", "2": "主食", "3": "用品", "4": "服", "5": "旅行用品" };
const OWN_PAGES = ["dog-lodging-guide.html", "east-japan-dog-trips.html", "food.html", "goods.html", "wear.html", "travel-gear.html"];
const SHOT_DIR = process.env.SHOT_DIR || "";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png" };

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, "127.0.0.1", () => r(server)));
}

let n = 0, failed = 0;
async function test(name, fn) {
  n++;
  try { await fn(); console.log(`ok ${n} - ${name}`); }
  catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").join("\n  ")}`); }
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ja-JP" });
  // 外部(解析ビーコン・広告・画像 CDN)には出さない
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const shot = async name => { if (SHOT_DIR) { fs.mkdirSync(SHOT_DIR, { recursive: true }); await page.screenshot({ path: path.join(SHOT_DIR, name + ".png") }); } };
  const status = () => page.locator("#sx-status").textContent();
  const waitCount = () => page.waitForFunction(() => /件/.test(document.getElementById("sx-status").textContent));
  const search = async q => { await page.fill("#sx-q", q); await page.waitForFunction(q => document.getElementById("sx-status").textContent.includes("「" + q + "」"), q); };
  const total = async () => Number(((await status()).match(/([\d,]+) 件/) || [, "0"])[1].replace(/,/g, ""));
  const hits = () => page.$$eval(".sx-hit", as => as.map(a => ({ href: a.getAttribute("href"), kind: a.querySelector(".sx-kind").textContent, name: a.querySelector(".sx-name").textContent, rel: a.getAttribute("rel"), target: a.getAttribute("target") })));

  let indexRequests = 0;
  page.on("request", r => { if (r.url().includes("search-index.json")) indexRequests++; });

  await test("開いただけでは索引を読み込まない", async () => {
    await page.goto(base + "search.html");
    await page.waitForLoadState("networkidle");
    assert.equal(indexRequests, 0);
    await shot("01-initial");
  });

  await test("検索欄に触れると索引を読み込む", async () => {
    await page.tap("#sx-q");
    await waitCount();
    assert.equal(indexRequests, 1);
    assert.match(await status(), /全 [\d,]+ 件から探せます/);
  });

  await test("横スクロールが出ない(375px)", async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 375, "scrollWidth " + w);
  });

  await test("入力に合わせて結果が出る(軽井沢 大型犬 は宿・おでかけだけ、すべて軽井沢を含む)", async () => {
    await page.type("#sx-q", "軽井沢 大型犬", { delay: 30 });
    await page.waitForFunction(() => document.getElementById("sx-status").textContent.includes("「軽井沢 大型犬」"));
    const h = await hits();
    assert.ok(h.length > 5, "件数 " + h.length);
    for (const x of h) assert.ok(x.kind === "宿" || x.kind === "おでかけ", x.kind + " " + x.name);
    const subs = await page.$$eval(".sx-hit", as => as.map(a => a.textContent));
    for (const t of subs) assert.match(t, /軽井沢/);  // 名前・地域に無いときは「軽井沢」の地域/説明文を出す
    await page.evaluate(() => document.activeElement.blur());
    await shot("02-karuizawa-large");
  });

  await test("ひらがな・カタカナ・半角の揺れを吸収する", async () => {
    await search("ドッグラン"); const a = await total();
    await search("どっぐらん"); const b = await total();
    await search("ﾄﾞｯｸﾞﾗﾝ"); const c = await total();
    await search("ＤＯＧ"); const d = await total();
    await search("dog"); const e = await total();
    assert.ok(a > 0); assert.equal(a, b); assert.equal(a, c); assert.equal(d, e);
    await search("軽井沢"); const k1 = await total();
    await search("かるいざわ"); const k2 = await total();
    assert.ok(k2 > 0 && Math.abs(k1 - k2) <= 5, `軽井沢 ${k1} / かるいざわ ${k2}`);
  });

  await test("住所に地名が無くても観光地名で当たる(伊東市 → 伊豆)", async () => {
    await search("伊豆");
    const names = (await page.$$eval(".sx-hit", as => as.map(a => a.textContent))).join("\n");
    assert.match(names, /伊東市/);
  });

  await test("否定の条件では当たらない(大型犬不可の宿は「大型犬」で出ない)", async () => {
    // THE HIRAMATSU 軽井沢 御代田 は「大型犬・対象外犬種不可」
    await search("御代田 大型犬");
    const names = (await hits()).map(h => h.name);
    assert.ok(!names.some(x => /HIRAMATSU/.test(x)), names.join(", "));
    await search("御代田");
    assert.ok((await hits()).some(h => /HIRAMATSU/.test(h.name)));
  });

  await test("種類で絞り込める(件数の合計が「すべて」と一致)", async () => {
    await search("大型犬");
    const all = await total();
    const counts = await page.$$eval("#sx-types button", bs => bs.map(b => Number((b.querySelector(".sx-n").textContent || "0").replace(/,/g, ""))));
    assert.equal(counts[0], all);
    assert.equal(counts.slice(1).reduce((s, x) => s + x, 0), all);
    await page.tap('#sx-types button[data-type="4"]');
    await page.waitForFunction(() => document.getElementById("sx-status").textContent.includes("服で"));
    const h = await hits();
    assert.ok(h.length > 0);
    for (const x of h) assert.equal(x.kind, "服");
    assert.equal(await total(), counts[5]);
    assert.match(page.url(), /type=4/);
    await shot("03-type-wear");
    await page.tap('#sx-types button[data-type=""]');
  });

  await test("結果を出しても横にはみ出さない(長い商品名・住所)", async () => {
    for (const [q, t] of [["大型犬", "4"], ["レインコート", ""], ["ドッグラン", ""], ["シニア", "2"]]) {
      await page.goto(base + "search.html?type=" + t + "&q=" + encodeURIComponent(q));
      await waitCount();
      const over = await page.evaluate(() => [document.documentElement.scrollWidth, ...[...document.querySelectorAll(".sx-hit")].map(a => Math.ceil(a.getBoundingClientRect().right))].filter(x => x > innerWidth));
      assert.deepEqual(over, [], q);
    }
    await page.goto(base + "search.html");  // 種類の絞り込みを戻す
    await page.tap("#sx-q");
    await waitCount();
  });

  await test("「さらに表示」で 40 件ずつ増える", async () => {
    await search("ドッグラン");
    assert.equal((await hits()).length, 40);
    await page.tap("#sx-more");
    assert.equal((await hits()).length, 80);
  });

  await test("結果は自サイトのカードへのリンクだけ(広告リンクを出さない)", async () => {
    for (const q of ["ドッグラン", "レインコート", "シニア", "キャリー"]) {
      await search(q);
      for (const x of await hits()) {
        const u = new URL(x.href, base);
        assert.equal(u.origin + "/", base, x.href);
        assert.ok(OWN_PAGES.includes(u.pathname.slice(1)), x.href);
        assert.ok(u.hash || u.searchParams.get("pick"), x.href);
        assert.equal(x.rel, null); assert.equal(x.target, null);
      }
    }
    const bad = await page.$$eval("a", as => as.filter(a => /sponsored|nofollow/.test(a.rel) || /rakuten|valuecommerce|amazon|yahoo|a8\.net/.test(a.href)).length);
    assert.equal(bad, 0);
  });

  await test("0 件のときは地域ページ・旅行プランへの案内を出す", async () => {
    await search("ぴよぴよぴよ");
    assert.match(await status(), /0 件/);
    assert.ok(await page.isVisible("#sx-empty"));
    const links = await page.$$eval("#sx-empty a", as => as.map(a => a.getAttribute("href")));
    for (const h of ["dog-lodging-guide.html", "east-japan-dog-trips.html", "route-planner/"]) assert.ok(links.includes(h), h);
    await page.evaluate(() => { document.activeElement.blur(); scrollTo({ top: 0, behavior: "instant" }); });
    await shot("04-empty");
  });

  await test("種類で 0 件のときは「すべて」に戻す案内を出す", async () => {
    await search("添い寝");
    await page.tap('#sx-types button[data-type="2"]');
    await page.waitForFunction(() => !document.getElementById("sx-empty").hidden);
    assert.match(await page.locator("#sx-empty-other").textContent(), /すべて.*件/);
    await page.tap("#sx-empty-other a");
    assert.ok((await hits()).length > 0);
  });

  await test("言い換えだけで当たったときは、そう書く(車酔い → 車移動)", async () => {
    await search("車酔い");
    assert.match(await status(), /言い換え/);
    assert.ok((await hits()).length > 0);
  });

  await test("?q= つきで開くと、その語で検索した状態になる", async () => {
    await page.goto(base + "search.html?q=" + encodeURIComponent("那須 ドッグラン"));
    await waitCount();
    assert.equal(await page.inputValue("#sx-q"), "那須 ドッグラン");
    assert.ok((await hits()).length > 0);
  });

  // 種類ごとに 1 件ずつ、結果から元ページのカードへ移動できるか
  const samples = [["那須 添い寝", "0"], ["伊豆 カフェ", "1"], ["シニア", "2"], ["ハーネス", "3"], ["レインコート", "4"], ["キャリー", "5"]];
  for (const [q, t] of samples) {
    await test(`結果から元ページのカードへ移動する(${TYPES[t]}・「${q}」)`, async () => {
      await page.goto(base + "search.html?type=" + t + "&q=" + encodeURIComponent(q));
      await waitCount();
      const first = (await hits())[0];
      assert.ok(first, "結果なし");
      await Promise.all([page.waitForNavigation(), page.tap(".sx-hit >> nth=0")]);
      await page.waitForTimeout(2600);  // assets/anchor-fix.js が位置を直し終わるまで
      const ok = await page.evaluate(name => {
        const norm = s => s.replace(/\s+/g, "");
        const cards = [...document.querySelectorAll("article")].filter(a => { const r = a.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
        return cards.some(a => norm(a.textContent).includes(norm(name)));
      }, first.name);
      assert.ok(ok, `${first.href} で「${first.name}」のカードが画面内にない`);
      if (t === "0") await shot("05-jump-lodging");
    });
  }

  await test("各ページのナビに「検索」がある", async () => {
    for (const p of ["index.html", ...OWN_PAGES]) {
      await page.goto(base + p, { waitUntil: "domcontentloaded" });
      assert.equal(await page.locator('.site-nav .nav-links a[href="search.html"]').count(), 1, p);
    }
  });

  if (process.env.WORDS) {
    const words = ["軽井沢", "那須", "伊豆", "箱根", "富士五湖", "房総", "日光", "八ヶ岳", "温泉", "カフェ", "大型犬", "多頭", "添い寝", "ドッグラン", "レインコート", "車酔い", "キャリー", "マナーウェア", "シニア", "暑さ対策",
      "軽井沢 大型犬", "那須 ドッグラン", "伊豆 添い寝", "かるいざわ"];
    console.log("\n| 語 | 件数 | 宿 | おでかけ | 主食 | 用品 | 服 | 旅行用品 | 上位 3 件 |\n|---|---:|---:|---:|---:|---:|---:|---:|---|");
    for (const w of words) {
      await page.goto(base + "search.html?q=" + encodeURIComponent(w));
      await waitCount();
      const c = await page.$$eval("#sx-types button", bs => bs.map(b => b.querySelector(".sx-n").textContent || "0"));
      const top = (await hits()).slice(0, 3).map(h => `${h.kind}:${h.name}`.slice(0, 28)).join(" / ");
      console.log(`| ${w} | ${c[0]} | ${c.slice(1).join(" | ")} | ${top} |`);
    }
  }

  await browser.close();
  server.close();
  console.log(`\n${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
})();
