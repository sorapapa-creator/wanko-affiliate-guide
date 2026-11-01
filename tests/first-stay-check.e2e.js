// 初めて犬と泊まる 宿泊前チェック(入口 → 結果 → 旅行準備 5 項目)のスマホ通しテスト。375×812・タッチで、
// 頭数 1/2/3+ × 4 問(「分からない」を含む)の全 243 通りを実際にタップして進め、行き止まり・表示崩れ・コピー・戻る操作・計測用の目印を確かめる。
// 実行: node tests/first-stay-check.e2e.js   (Playwright が require できる環境。外部へは通信しない。FSC_QUICK=1 で組み合わせを 27 通りに減らす)
"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const ENTRY = "first-stay-check-instagram.html";
const RESULT = "first-stay-check-result.html";
const PREP = "travel-prep-5-instagram.html";
const VIEWPORT = { width: 375, height: 812 };
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const COUNTS = ["1", "2", "3"];
const QS = { heads: ["ok", "ng", "unknown"], room: ["ok", "part", "unknown"], fee: ["ok", "part", "unknown"], manner: ["ok", "worry", "unknown"] };
const ORDER = ["heads", "room", "fee", "manner"];
const STATUS = { ok: "確認済み", ng: "要相談", part: "一部確認", worry: "未確認", unknown: "未確認" };

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

const combos = () => {
  const out = [];
  const quick = process.env.FSC_QUICK === "1";
  for (const count of COUNTS) for (const heads of QS.heads) for (const room of QS.room) for (const fee of QS.fee) for (const manner of QS.manner) {
    if (quick && !(room === fee && fee === manner.replace("worry", "part"))) continue;
    out.push({ count, heads, room, fee, manner });
  }
  return out;
};

let n = 0, failed = 0;
const results = [];
const test = async (name, fn) => {
  n++;
  try { await fn(); console.log(`ok ${n} - ${name}`); results.push({ name, ok: true }); }
  catch (e) { failed++; const msg = String(e.message || e).split("\n").slice(0, 6).join("\n  "); console.log(`not ok ${n} - ${name}\n  ${msg}`); results.push({ name, ok: false, msg }); }
};

// 横はみ出し(表示崩れ)と、画面外にはみ出した要素
const overflow = page => page.evaluate(() => {
  const w = document.documentElement.clientWidth; const bad = [];
  const hidden = el => { for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).position === "absolute" || e.getAttribute("aria-hidden") === "true") return true; return false; };
  document.querySelectorAll("main *").forEach(el => { const r = el.getBoundingClientRect(); if (r.width && (r.right > w + 1 || r.left < -1) && !hidden(el)) bad.push(el.tagName + "." + el.className); });
  return { scroll: document.documentElement.scrollWidth > w, bad: bad.slice(0, 5) };
});

// 押せる部品の高さ(文中のリンクは除く)
const smallTargets = (page, sel) => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null).map(el => ({ t: (el.textContent || "").trim().slice(0, 20), h: Math.round(el.getBoundingClientRect().height) })).filter(x => x.h < 44), sel);

// 文字のコントラスト(WCAG AA: 4.5、18.66px 以上の太字・24px 以上は 3)
const lowContrast = page => page.evaluate(() => {
  const rgb = s => { const m = s.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const lum = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const bgOf = el => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.5) return c; } return [255, 255, 255]; };
  const bad = [];
  document.querySelectorAll("main *").forEach(el => {
    if (el.offsetParent === null || el.closest('[aria-hidden="true"]')) return;
    const own = [...el.childNodes].some(t => t.nodeType === 3 && t.textContent.trim()); if (!own) return;
    const cs = getComputedStyle(el); const fg = rgb(cs.color); const bg = bgOf(el);
    const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(cs.fontSize); const large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${el.tagName}.${el.className} 「${el.textContent.trim().slice(0, 14)}」 ${ratio.toFixed(2)}`);
  });
  return bad;
});

const answer = async (page, a) => {
  for (const k of ["count", ...ORDER]) await page.tap(`input[name="${k}"][value="${a[k]}"]`);
};
const checked = page => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#tdc-form input:checked")].map(i => [i.name, i.value])));

(async () => {
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const newCtx = (opts = {}) => browser.newContext({ viewport: VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale: "ja-JP", ...opts });
  const ctx = await newCtx();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base.slice(0, -1) });
  // 外部(Cloudflare の計測など)には出さない
  await ctx.route(url => !String(url).startsWith(base), r => r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  // ---- 1) 全パターン: 答える → 結果 → 状態一覧・確認文・コピー・次の一歩
  const all = combos();
  const fails = {}; // 種類ごとの失敗(1 通りの中で複数を数える)
  const fail = (kind, a, msg) => { (fails[kind] = fails[kind] || []).push(`${JSON.stringify(a)}: ${msg}`); };
  for (const a of all) {
    try {
      await page.goto(base + ENTRY);
      await page.evaluate(() => sessionStorage.clear());
      await page.reload();
      await answer(page, a);
      await page.tap("#tdc-form button[type=submit]");
      await page.waitForURL(u => String(u).includes(RESULT), { timeout: 3000 });
    } catch (e) { fail("結果まで進めない", a, String(e.message).split("\n")[0]); continue; }
    const items = await page.$$eval("#tdr-list li", lis => lis.map(li => li.textContent));
    const wrong = ORDER.filter((k, i) => !(items[i] || "").startsWith(STATUS[a[k]]));
    if (items.length !== 4 || wrong.length) fail("状態一覧", a, `${items.length} 行、合わない: ${wrong}`);
    const text = await page.inputValue("#tdr-ask-text");
    const open = ORDER.filter(k => a[k] !== "ok").length;
    const lines = text.split("\n").filter(l => /^\d+\. /.test(l)).length;
    if (lines !== open) fail("確認文の項目数", a, `${lines} ≠ 未確認 ${open}`);
    if (!text.includes(`犬${a.count}頭`)) fail("確認文の頭数", a, text.split("\n")[2]);
    const head = await page.textContent("#tdr-head");
    if (!(open ? head.includes(`${open} 件`) : head.includes("確認済み"))) fail("見出しの件数", a, head);
    if (open) {
      try {
        await page.tap("#tdr-copy");
        await page.waitForFunction(() => /コピーしました/.test((document.getElementById("tdr-copy-status") || document.getElementById("tdr-copy")).textContent), null, { timeout: 2000 });
        const clip = await page.evaluate(() => navigator.clipboard.readText());
        if (clip !== text) fail("コピー", a, "クリップボードの中身が確認文と違う");
        if (!(await page.$("#tdr-copy-status[role=status]"))) fail("コピーの成功表示(読み上げ)", a, "role=status の表示がない");
      } catch (e) { fail("コピー", a, String(e.message).split("\n")[0]); }
    }
    // 次に押すもの: 目立つ主ボタンは 1 つだけ
    const primaries = await page.$$eval("[data-primary]", els => els.filter(e => e.offsetParent !== null).map(e => e.textContent.trim()));
    if (primaries.length !== 1) fail("主ボタンが 1 つ", a, `${primaries.length} 個`);
    const of = await overflow(page);
    if (of.scroll || of.bad.length) fail("横はみ出し", a, of.bad.join(","));
  }
  await test(`全 ${all.length} 通りで結果まで進め、状態・確認文・コピー・主ボタンが合う`, () => {
    const kinds = Object.keys(fails);
    assert.equal(kinds.length, 0, kinds.map(k => `${k}: ${fails[k].length} 通りで失敗(例 ${fails[k][0]})`).join("\n"));
  });

  // ---- 2) 入口ページ: 最初の画面・進捗・未回答の案内
  await test("最初の画面(375×812)に、できることと所要時間と最初の質問が入る", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    const fold = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; };
      const lead = document.querySelector(".sns-lead");
      const q1 = document.querySelector('input[name="count"]')?.closest("label");
      return { lead: lead && vis(lead) ? lead.textContent : "", q1: !!q1 && vis(q1) };
    });
    assert.match(fold.lead, /確認文/, "何ができるか");
    assert.match(fold.lead, /\d+分/, "何分かかるか");
    assert.ok(fold.q1, "最初の質問の選択肢が画面内");
  });
  await test("進捗が回答ごとに進む(0/5 → 5/5)", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    const prog = () => page.textContent("#tdc-progress-text");
    assert.match(await prog(), /0\s*\/\s*5/);
    await page.tap('input[name="count"][value="2"]'); await page.tap('input[name="heads"][value="unknown"]');
    assert.match(await prog(), /2\s*\/\s*5/);
    await answer(page, { count: "2", heads: "unknown", room: "ok", fee: "part", manner: "worry" });
    assert.match(await prog(), /5\s*\/\s*5/);
  });
  await test("未回答のまま送ると、残りの数を知らせて最初の未回答の質問へフォーカス", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    await page.tap('input[name="count"][value="1"]'); await page.tap('input[name="fee"][value="ok"]');
    await page.tap("#tdc-form button[type=submit]");
    assert.ok(page.url().includes(ENTRY), "入口に残る");
    const msg = await page.textContent("#tdc-missing");
    assert.match(msg, /3/, `残り 3 問: ${msg}`);
    assert.equal(await page.getAttribute("#tdc-missing", "role"), "alert");
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".tdc-q")?.dataset.key), "heads");
  });
  await test("選択肢・ボタンの押せる高さが 44px 以上", async () => {
    await page.goto(base + ENTRY);
    const s = await smallTargets(page, ".tdc-q label, .tdc-btn, .tdc-skip a");
    assert.deepEqual(s, []);
  });

  // ---- 3) 戻る操作・再読み込みで回答が残る
  await test("途中まで答えて別ページへ行き、戻ると回答が残る", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    await page.tap('input[name="count"][value="3"]'); await page.tap('input[name="heads"][value="ng"]');
    await page.tap(".tdc-skip a"); await page.waitForURL(u => String(u).includes(RESULT));
    await page.goBack();
    assert.deepEqual(await checked(page), { count: "3", heads: "ng" });
  });
  await test("途中まで答えて再読み込みしても回答が残る(アプリ内ブラウザが戻るで読み直す場合)", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    await page.tap('input[name="count"][value="2"]'); await page.tap('input[name="room"][value="part"]');
    await page.reload();
    assert.deepEqual(await checked(page), { count: "2", room: "part" });
  });
  await test("結果から戻ると全回答が残り、もう一度結果へ進める", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear()); await page.reload();
    const a = { count: "2", heads: "unknown", room: "part", fee: "unknown", manner: "ok" };
    await answer(page, a); await page.tap("#tdc-form button[type=submit]"); await page.waitForURL(u => String(u).includes(RESULT));
    await page.goBack(); await page.waitForURL(u => String(u).includes(ENTRY));
    assert.deepEqual(await checked(page), a);
    await page.tap("#tdc-form button[type=submit]"); await page.waitForURL(u => String(u).includes(RESULT));
  });
  await test("結果ページで書き込んだ確認文は、旅行準備へ行って戻っても残る", async () => {
    await page.fill("#tdr-ask-text", "宿名 テスト旅館 で書き換えた");
    await page.tap('a[href="travel-prep-5-instagram.html"]'); await page.waitForURL(u => String(u).includes(PREP));
    await page.goBack(); await page.waitForURL(u => String(u).includes(RESULT));
    assert.equal(await page.inputValue("#tdr-ask-text"), "宿名 テスト旅館 で書き換えた");
    await page.reload();
    assert.equal(await page.inputValue("#tdr-ask-text"), "宿名 テスト旅館 で書き換えた", "再読み込み後も残る");
  });

  // ---- 4) 結果ページ
  await test("答えずに結果を開いても、ひな形と次の一歩がある(行き止まりなし)", async () => {
    await page.goto(base + ENTRY); await page.evaluate(() => sessionStorage.clear());
    await page.goto(base + RESULT);
    assert.match(await page.textContent("#tdr-head"), /まだ答えていない/);
    assert.equal((await page.inputValue("#tdr-ask-text")).split("\n").filter(l => /^\d+\. /.test(l)).length, 4);
    assert.equal(await page.$$eval("[data-primary]", e => e.length), 1);
  });
  await test("クリップボードが使えないブラウザでも、コピーの結果を表示する", async () => {
    const c2 = await newCtx(); await c2.route(url => !String(url).startsWith(base), r => r.abort());
    const p2 = await c2.newPage();
    await p2.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("denied")) } }); });
    await p2.goto(base + RESULT);
    await p2.tap("#tdr-copy");
    const st = await p2.textContent("#tdr-copy-status");
    assert.match(st, /コピーしました|長押し/, `表示: ${st}`);
    assert.equal(await p2.getAttribute("#tdr-copy-status", "role"), "status");
    await c2.close();
  });
  await test("任意アンケートは閉じた状態で始まり、開くと 3 問ある", async () => {
    await page.goto(base + RESULT);
    assert.equal(await page.$eval("#tdr-survey", d => d.tagName === "DETAILS" && !d.open), true);
    await page.tap("#tdr-survey summary");
    assert.equal(await page.$$eval("#tdr-survey select", s => s.filter(x => x.offsetParent !== null).length), 3);
  });
  await test("アンケート送信後(#thanks)にお礼が出る", async () => {
    await page.goto("about:blank"); await page.goto(base + RESULT + "#thanks");
    assert.ok(await page.isVisible("#tdr-thanks"));
  });
  await test("結果ページの押せる部品の高さが 44px 以上", async () => {
    await page.goto(base + RESULT);
    assert.deepEqual(await smallTargets(page, "#tdr-copy, [data-primary], .tdr-cand a, .sns-list a, #tdr-survey summary"), []);
  });

  // ---- 5) 3 ページ共通: リンク切れ・はみ出し・コントラスト・ラベル・フォーカス・計測の目印・動きを抑える設定
  for (const p of [ENTRY, RESULT, PREP]) {
    await test(`${p}: 内部リンクがすべて開ける`, async () => {
      await page.goto(base + p);
      const hrefs = await page.$$eval("a[href]", as => [...new Set(as.map(a => a.href))].filter(h => h.startsWith(location.origin)));
      const bad = [];
      for (const h of hrefs) { const r = await ctx.request.get(h.split("#")[0]); if (r.status() !== 200) bad.push(`${h} ${r.status()}`); }
      assert.deepEqual(bad, []);
    });
    await test(`${p}: 横にはみ出さない`, async () => {
      await page.goto(base + p);
      const of = await overflow(page); assert.ok(!of.scroll && !of.bad.length, of.bad.join(","));
    });
    await test(`${p}: 文字のコントラストが AA 以上`, async () => {
      await page.goto(base + p);
      if (p === RESULT) await page.tap("#tdr-survey summary").catch(() => {});
      assert.deepEqual(await lowContrast(page), []);
    });
    await test(`${p}: 入力部品にラベルがあり、フォーカスが 2px 以上の枠ではっきり見える`, async () => {
      await page.goto(base + p);
      const unlabeled = await page.$$eval("input:not([type=hidden]):not([tabindex='-1']), select, textarea, button", els => els.filter(e => !(e.labels?.length || e.getAttribute("aria-label") || e.textContent.trim())).map(e => e.outerHTML.slice(0, 60)));
      assert.deepEqual(unlabeled, []);
      const k = await newCtx(); const kp = await k.newPage(); await k.route(url => !String(url).startsWith(base), r => r.abort());
      await kp.goto(base + p);
      const seen = [];
      for (let i = 0; i < 6; i++) {
        await kp.keyboard.press("Tab");
        seen.push(await kp.evaluate(() => { const el = document.activeElement; const t = el.closest("label") || el; const cs = getComputedStyle(t); const ci = getComputedStyle(el); return (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || (ci.outlineStyle !== "none" && parseFloat(ci.outlineWidth) >= 2) || cs.boxShadow !== "none"; }));
      }
      await k.close();
      assert.ok(seen.every(Boolean), `フォーカスが見えない部品がある: ${seen}`);
    });
    await test(`${p}: 主要ボタンに data-track(重複なし)`, async () => {
      await page.goto(base + p);
      const tracks = await page.$$eval("[data-track]", els => els.map(e => e.dataset.track));
      assert.ok(tracks.length >= 3, `data-track ${tracks.length} 個`);
      assert.equal(new Set(tracks).size, tracks.length, `重複: ${tracks}`);
      const need = { [ENTRY]: ["check-submit", "check-skip"], [RESULT]: ["result-copy", "result-prep5", "result-lodging-guide", "result-edit"], [PREP]: ["prep5-back-result"] }[p];
      need.forEach(t => assert.ok(tracks.includes(t), `${t} がない`));
    });
    await test(`${p}: 動きを減らす設定(prefers-reduced-motion)ではボタンが動かない`, async () => {
      const r = await newCtx({ reducedMotion: "reduce" }); const rp = await r.newPage(); await r.route(url => !String(url).startsWith(base), x => x.abort());
      await rp.goto(base + p);
      const moving = await rp.$$eval(".tdc-btn, .sns-list a, .tp5 .links a, .tdc-q label", els => els.filter(e => { const cs = getComputedStyle(e); return cs.transitionDuration.split(",").some(d => parseFloat(d) > 0) || cs.animationName !== "none"; }).length);
      await r.close();
      assert.equal(moving, 0);
    });
  }
  await test("どのページでもスクリプトのエラーが出ない", () => { assert.deepEqual(errors, []); });

  await browser.close(); srv.close();
  if (process.env.FSC_REPORT) fs.writeFileSync(process.env.FSC_REPORT, JSON.stringify(results, null, 1));
  console.log(`\n${n - failed}/${n} passed`);
  process.exit(failed ? 1 : 0);
})();
