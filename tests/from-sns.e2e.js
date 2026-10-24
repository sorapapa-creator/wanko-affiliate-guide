// SNS のプロフィールリンクの着地(中継ページ sns/instagram.html・sns/threads.html → from-sns.html → 各リンク先)のスマホ通しテスト。
// 375×812・タッチで、行き止まり・リンク切れ・表示崩れ・押せる大きさ(44px)・コントラスト(AA)・フォーカスの見え方・計測用の目印を確かめる。
// 実行: node tests/from-sns.e2e.js   (Playwright が require できる環境。外部へは通信しない)
// FROM_SNS_SHOTS=<dir> を付けると、最初の画面・ページ全体・中継ページのスクショをそのフォルダに保存する(FROM_SNS_SHOTS_PREFIX で名前の頭を変えられる)。
"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const LANDING = "from-sns.html";
const RELAYS = ["sns/instagram.html", "sns/threads.html"];
const VIEWPORT = { width: 375, height: 812 };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".mp4": "video/mp4" };
const SHOTS = process.env.FROM_SNS_SHOTS ? path.resolve(process.env.FROM_SNS_SHOTS) : "";
const PREFIX = process.env.FROM_SNS_SHOTS_PREFIX || "after";

const serve = () => new Promise(resolve => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  srv.listen(0, "127.0.0.1", () => resolve(srv));
});

let n = 0, failed = 0;
const notes = [];
const test = async (name, fn) => {
  n++;
  try { await fn(); console.log(`ok ${n} - ${name}`); }
  catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").slice(0, 8).join("\n  ")}`); }
};

// 横はみ出し(表示崩れ)
const overflow = page => page.evaluate(() => {
  const w = document.documentElement.clientWidth; const bad = [];
  const hidden = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === "absolute" || e.getAttribute("aria-hidden") === "true") return true; return false; };
  document.querySelectorAll("body *").forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > w + 1 || r.left < -1) && !hidden(el)) bad.push(el.tagName + "." + el.className); });
  return { scroll: document.documentElement.scrollWidth > w, bad: bad.slice(0, 5) };
});

// 押せる部品の大きさ(高さ・幅とも 44px 以上)
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll("a[href], button, summary")]
  .filter(el => el.offsetParent !== null)
  .map(el => { const r = el.getBoundingClientRect(); return { t: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24), h: Math.round(r.height), w: Math.round(r.width) }; })
  .filter(x => x.h < 44 || x.w < 44));

// 文字のコントラスト(WCAG AA: 4.5、18.66px 以上の太字・24px 以上は 3)
const lowContrast = page => page.evaluate(() => {
  const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.5) return c; } return [255, 255, 255]; };
  const bad = [];
  document.querySelectorAll("body *").forEach(el => {
    if (el.offsetParent === null || el.closest('[aria-hidden="true"]') || /^(SCRIPT|STYLE)$/.test(el.tagName)) return;
    const own = [...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()); if (!own) return;
    const cs = getComputedStyle(el); const fg = rgb(cs.color); const bg = bgOf(el);
    const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(cs.fontSize); const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${el.tagName}.${el.className} 「${el.textContent.trim().slice(0, 14)}」 ${ratio.toFixed(2)}`);
  });
  return bad;
});

// 12px 未満の文字
const tinyText = page => page.evaluate(() => [...document.querySelectorAll("body *")]
  .filter(el => el.offsetParent !== null && [...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
  .map(el => `${el.tagName}.${el.className} 「${el.textContent.trim().slice(0, 12)}」 ${getComputedStyle(el).fontSize}`));

// Tab で順に進めて、フォーカスが見えるか(outline か box-shadow があるか)
const focusInvisible = async (page, max = 40) => {
  const bad = [];
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow && cs.boxShadow !== "none");
      return { t: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24), visible, id: el.dataset.track || el.tagName };
    });
    if (!f) break;
    if (!f.visible) bad.push(f.t);
  }
  return bad;
};

const shot = async (page, name, opts = {}) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${PREFIX}-${name}.png`), ...opts }); } };

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const newCtx = (opts = {}) => browser.newContext({ viewport: VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "ja-JP", ...opts });
  const external = [];
  const offline = async ctx => {
    // 外部(Cloudflare の計測・ValueCommerce など)には出さない。中継ページで計測のスクリプトを読みに行ったかは記録する
    await ctx.route(url => !String(url).startsWith(base), r => { external.push(r.request().url()); return r.abort(); });
  };
  const ctx = await newCtx(); await offline(ctx);
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  // ---- 1) 中継ページ: 計測を残したまま、入口ページへ移る
  for (const relay of RELAYS) {
    await test(`${relay}: 計測のスクリプトを読み、入口ページへ自動で移る(JS あり)`, async () => {
      external.length = 0;
      const t0 = Date.now();
      await page.goto(base + relay, { waitUntil: "commit" });
      if (relay === RELAYS[0]) await shot(page, "relay-instagram");
      const html = fs.readFileSync(path.join(ROOT, relay), "utf8");
      assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/, "Cloudflare Web Analytics のタグがない");
      await page.waitForURL(u => String(u).endsWith(LANDING), { timeout: 4000 });
      const ms = Date.now() - t0;
      assert.ok(external.some(u => u.includes("cloudflareinsights")), "計測のスクリプトを読みに行っていない");
      // 計測が記録される前に移らないよう、待ちは sns-go.js の 700ms を下回らない
      assert.ok(ms >= 650, `${ms}ms で移った(計測が落ちるおそれ)`);
      notes.push(`${relay}: 入口ページまで ${ms}ms(JS あり)`);
    });
    await test(`${relay}: JS が動かなくても meta refresh で移り、手動リンクは押しやすい`, async () => {
      const c2 = await newCtx({ javaScriptEnabled: false }); await offline(c2);
      const p2 = await c2.newPage();
      const t0 = Date.now();
      await p2.goto(base + relay);
      assert.deepEqual(await smallTargets(p2), [], "44px 未満のリンク");
      assert.deepEqual(await lowContrast(p2), [], "コントラスト不足");
      const fb = await focusInvisible(p2, 3);
      assert.deepEqual(fb, [], "フォーカスが見えない");
      await p2.waitForURL(u => String(u).endsWith(LANDING), { timeout: 5000 });
      notes.push(`${relay}: 入口ページまで ${Date.now() - t0}ms(JS なし、meta refresh)`);
      await c2.close();
    });
  }

  // ---- 2) 入口ページの最初の画面
  await page.goto(base + LANDING);
  await page.waitForLoadState("load");
  await shot(page, "landing-first-view");
  await shot(page, "landing-full", { fullPage: true });

  await test("最初の画面に、見出し・広告の明示・動画の話題・宿泊前チェックが入る", async () => {
    const fold = await page.evaluate(() => {
      const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
      const ad = document.querySelector("[data-ad-notice]");
      const topics = [...document.querySelectorAll("[data-track^='sns-topic-']")];
      return {
        h1: vis(document.querySelector("h1")),
        ad: vis(ad) && /広告/.test(ad.textContent), adH: ad ? Math.round(ad.getBoundingClientRect().height) : 0,
        topics: topics.length, topicsVisible: topics.filter(vis).length,
        check: vis(document.querySelector("[data-track='sns-stay-check']")),
      };
    });
    assert.ok(fold.h1, "見出しが最初の画面にない");
    assert.ok(fold.ad, "広告の明示が最初の画面にない");
    assert.ok(fold.adH <= 64, `広告の明示が ${fold.adH}px の高さを取っている`);
    assert.ok(fold.topics >= 4 && fold.topicsVisible === fold.topics, `動画の話題 ${fold.topicsVisible}/${fold.topics} 個しか最初の画面にない`);
    assert.ok(fold.check, "宿泊前チェックへのボタンが最初の画面にない");
  });

  await test("広告の明示は 1 か所にまとまり、LinkSwitch の説明が残る", async () => {
    const r = await page.evaluate(() => ({
      notices: document.querySelectorAll(".pr-notice, .ad").length,
      text: document.body.innerText,
      html: document.body.innerHTML,
    }));
    assert.equal(r.notices, 0, "古い広告表示(.pr-notice / .ad)が残っている");
    assert.match(r.text, /プロモーション|広告/);
    assert.match(r.html, /LinkSwitch/);
    // 説明は開くと読める
    await page.tap("[data-ad-notice] summary");
    assert.ok(await page.isVisible("[data-ad-notice] >> text=LinkSwitch"), "開いても LinkSwitch の説明が見えない");
    await shot(page, "landing-ad-open");
    await page.tap("[data-ad-notice] summary");
  });

  await test("主要なリンクに data-track(接頭辞 sns-、重複なし)", async () => {
    const r = await page.$$eval("main a[href]", as => as.map(a => ({ t: a.textContent.trim().slice(0, 16), track: a.dataset.track || "" })));
    const missing = r.filter(x => !x.track).map(x => x.t);
    assert.deepEqual(missing, [], "data-track がないリンク");
    const tracks = r.map(x => x.track);
    assert.ok(tracks.every(t => /^sns-[a-z0-9-]+$/.test(t)), `形が違う: ${tracks.filter(t => !/^sns-[a-z0-9-]+$/.test(t))}`);
    assert.equal(new Set(tracks).size, tracks.length, `重複: ${tracks.filter((t, i) => tracks.indexOf(t) !== i)}`);
  });

  await test("押せる大きさ 44px 以上・コントラスト AA・12px 以上・横はみ出しなし", async () => {
    assert.deepEqual(await smallTargets(page), [], "44px 未満");
    assert.deepEqual(await lowContrast(page), [], "コントラスト不足");
    assert.deepEqual(await tinyText(page), [], "12px 未満の文字");
    const of = await overflow(page);
    assert.ok(!of.scroll && !of.bad.length, `横はみ出し ${of.bad}`);
  });

  await test("Tab で進むと、すべてのリンクでフォーカスが見える", async () => {
    await page.goto(base + LANDING);
    assert.deepEqual(await focusInvisible(page, 60), []);
  });

  // ---- 3) 各リンク先: タップで移り、行き止まり・リンク切れがない
  const links = await page.$$eval("main a[href], footer a[href]", as => as.map(a => ({ href: a.getAttribute("href"), track: a.dataset.track || a.textContent.trim().slice(0, 12), abs: a.href })));
  for (const l of links) {
    await test(`リンク先 ${l.track} → ${l.href}`, async () => {
      assert.ok(l.abs.startsWith(base), `外部リンク ${l.abs}`);
      await page.goto(base + LANDING);
      const sel = `a[href="${l.href.replace(/"/g, '\\"')}"]` + (l.track.startsWith("sns-") ? `[data-track="${l.track}"]` : "");
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      await page.tap(sel);
      const target = new URL(l.abs);
      await page.waitForURL(u => { const x = new URL(String(u)); return x.pathname === target.pathname && x.search === target.search; }, { timeout: 5000 });
      await page.waitForLoadState("domcontentloaded");
      const info = await page.evaluate(() => ({ h1: !!document.querySelector("h1"), links: document.querySelectorAll("a[href]").length, title: document.title }));
      assert.ok(info.h1 && info.links >= 2, `行き止まり(h1 ${info.h1}・リンク ${info.links})`);
      if (target.hash) assert.ok(await page.$(`[id="${decodeURIComponent(target.hash.slice(1))}"]`), `${target.hash} がページにない`);
      const problem = target.searchParams.get("problem");
      if (problem) {
        await page.waitForTimeout(300);
        const active = await page.$$eval("button[data-problem].active", bs => bs.map(b => b.dataset.problem));
        assert.ok(active.includes(problem), `「${problem}」の絞り込みが選ばれていない(${active})`);
      }
      // リンク先(このページの担当外)の横はみ出しは記録だけ
      const of = await overflow(page);
      if (of.scroll) notes.push(`記録: ${l.href} は横にはみ出す(${of.bad.join(",")})`);
    });
  }

  await test("ページの JS エラーなし", async () => { assert.deepEqual(errors, []); });

  await browser.close(); srv.close();
  notes.forEach(x => console.log(`# ${x}`));
  console.log(`# ${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
