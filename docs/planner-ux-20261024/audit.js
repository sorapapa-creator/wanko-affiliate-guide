// 旅行プラン画面(route-planner/)をスマホ(375×812)で操作して、迷いやすい点を数える計測スクリプト。
// 実行: node docs/planner-ux-20261024/audit.js before|after
// 出力: docs/planner-ux-20261024/<label>/*.jpg(スクショ)と <label>.json(数値)。経路 API はモック(無料枠を使わない)。
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const H = require("../../tests/helpers/planner-harness.js");

const LABEL = process.argv[2] || "before";
const OUT = path.join(__dirname, LABEL);
const DEST = "kitsuregawa";          // 亀の井ホテル 喜連川(楽天の空室データあり・位置は施設まで登録済み)
const DATE = process.env.AUDIT_DATE || "2026-10-31";
const KEYBOARD_PX = 336;             // iPhone の日本語キーボード(候補バー込み)のおよその高さ

(async () => {
  const pw = H.loadPlaywright(); if (!pw) throw new Error("playwright が見つかりません");
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await H.startServer();
  const browser = await pw.chromium.launch();
  const result = { label: LABEL, viewport: "375x812", date: DATE, generated: new Date().toISOString() };
  const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: "jpeg", quality: 70, fullPage: full });
  const open = async (query = "", opts = {}) => {
    const ctx = await browser.newContext(H.MOBILE);
    const page = await ctx.newPage();
    const { calls } = await H.preparePage(page, srv.url, opts);
    await page.goto(`${srv.url}/route-planner/${query}`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#dest-q option").length > 50);
    await page.waitForTimeout(300);
    return { ctx, page, calls };
  };

  // ---- 計測の部品(ページ内で実行)
  const controls = (page, sel) => page.evaluate((sel) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && !el.closest("[aria-hidden=true]"); };
    const labelOf = (el) => (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute("aria-label") || el.closest("label")?.textContent || el.textContent || el.value || "";
    return [...document.querySelectorAll(`${sel} input:not([type=hidden]), ${sel} select, ${sel} textarea, ${sel} button`)].filter(vis)
      .map((el) => ({ tag: el.tagName.toLowerCase(), type: el.type || "", id: el.id || "", name: el.name || "", label: labelOf(el).replace(/\s+/g, " ").trim().slice(0, 40),
        required: el.required || el.getAttribute("aria-required") === "true", marked: /必須|任意/.test(labelOf(el) + (el.closest("fieldset")?.querySelector("legend,label")?.textContent || "")), y: Math.round(el.getBoundingClientRect().top + scrollY) }));
  }, sel);
  const tapTargets = (page, sel = "body") => page.evaluate((sel) => {
    const out = [];
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ visibilityProperty: true })) && !el.closest("#map, .hidden, [hidden], [aria-hidden=true]"); };
    for (const el of document.querySelectorAll(`${sel} a[href], ${sel} button, ${sel} input:not([type=hidden]), ${sel} select, ${sel} summary`)) {
      if (!vis(el)) continue;
      let t = el;
      if ((el.type === "checkbox" || el.type === "radio") && el.closest("label")) t = el.closest("label");  // ラベルごと押せるのでラベルの大きさ
      const r = t.getBoundingClientRect();
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline" && /^(P|LI|SPAN|SMALL|DD|TD)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > el.textContent.trim().length + 8;
      if (r.height < 44 || r.width < 44) out.push({ el: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : el.className ? "." + String(el.className).split(" ")[0] : ""}`, text: (el.textContent || el.value || el.getAttribute("aria-label") || "").trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height), inline });
    }
    return { count: out.length, nonInline: out.filter((x) => !x.inline).length, samples: out.filter((x) => !x.inline).slice(0, 25) };
  }, sel);
  const smallText = (page, sel = "body") => page.evaluate((sel) => {
    const out = [];
    for (const el of document.querySelectorAll(`${sel} *`)) {
      if (el.closest("#map, script, style, .hidden, [hidden]")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (!own) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) out.push({ el: `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`, px: Math.round(fs * 10) / 10, text: el.textContent.trim().slice(0, 20) });
    }
    return { count: out.length, samples: out.slice(0, 15) };
  }, sel);
  const hScroll = (page) => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, overflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  const inView = (page, sel) => page.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }, sel);
  const filledButtons = (page, sel) => page.evaluate((sel) => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility()) && !el.closest(".hidden, [hidden]"); };
    const isFilled = (el) => { const bg = getComputedStyle(el).backgroundColor; const m = bg.match(/\d+(\.\d+)?/g); if (!m) return false; const [r, g, b, a = 1] = m.map(Number); return a > 0.5 && (r + g + b) / 3 < 200 && Math.max(r, g, b) - Math.min(r, g, b) > 40; };
    return [...document.querySelectorAll(`${sel} button, ${sel} a`)].filter((el) => vis(el) && isFilled(el)).map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30));
  }, sel);

  // タップ・スクロールを数えながら操作する
  const runner = (page) => {
    const log = { taps: 0, steps: 0, scrollPx: 0, actions: [] };
    const bring = async (loc) => { const y0 = await page.evaluate(() => scrollY); await loc.scrollIntoViewIfNeeded(); const y1 = await page.evaluate(() => scrollY); log.scrollPx += Math.abs(y1 - y0); };
    return {
      log,
      async tap(sel, what) { const loc = page.locator(sel).first(); await bring(loc); await loc.tap(); log.taps += 1; log.steps += 1; log.actions.push(`tap ${what || sel}`); },
      async select(sel, value, what) { const loc = page.locator(sel).first(); await bring(loc); await loc.selectOption(value); log.taps += 2; log.steps += 1; log.actions.push(`select ${what || sel}`); },
      async date(sel, value) { const loc = page.locator(sel).first(); await bring(loc); await loc.fill(value); await loc.dispatchEvent("change"); log.taps += 2; log.steps += 1; log.actions.push("date"); },
      async scrollTo(sel, what) { const loc = page.locator(sel).first(); await bring(loc); log.actions.push(`scroll to ${what || sel}`); },
    };
  };
  const chooseSize = async (r, page, v) => {
    const seg = page.locator(`[data-seg-for="size"] input[value="${v}"]`);
    if (await seg.count()) { const lab = page.locator(`[data-seg-for="size"] label:has(input[value="${v}"])`); await r.tap(`[data-seg-for="size"] label:has(input[value="${v}"])`, "犬の大きさ(ボタン)"); return lab; }
    return r.select("#size", v, "犬の大きさ(プルダウン)");
  };
  const waitResults = (page) => page.waitForFunction(() => !document.getElementById("results").classList.contains("hidden") && document.querySelector("#dest-booking .book-src, #dest-booking p"), null, { timeout: 20000 }).then(() => page.waitForTimeout(800));
  const toBooking = async (r, page) => {
    if (await page.locator("#next-cta").count()) await r.tap("#next-cta", "結果の主ボタン");
    else await r.scrollTo("#dest-booking a.book-main, #dest-booking a", "予約ボタン");
    await page.waitForTimeout(1500);
    return inView(page, "#dest-booking a.book-main, #dest-booking a");
  };

  // ---- 1) 初期表示(パラメータなし)
  {
    const { ctx, page } = await open();
    await shot(page, "01-first-view");
    const vc = await controls(page, "#vacancy-card"); const fm = await controls(page, "#form");
    const fields = (list) => { const seen = new Set(); return list.filter((c) => c.tag !== "button").filter((c) => { const k = c.type === "radio" ? `radio:${c.name}` : `${c.tag}#${c.id}:${c.y}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
    const submitY0 = await page.evaluate(() => Math.round(document.getElementById("go").getBoundingClientRect().top + scrollY));
    result.initial = {
      vacancyFields: fields(vc).length, formFieldsVisible: fields(fm).length, formButtonsVisible: fm.filter((c) => c.tag === "button").length,
      formFieldsTotal: await page.evaluate(() => { const seen = new Set(); return [...document.querySelectorAll("#form input:not([type=hidden]), #form select, #form textarea")].filter((el) => !el.closest("[aria-hidden=true]") && !el.classList.contains("seg-src")).filter((el) => { const k = el.type === "radio" ? "r:" + el.name : el; if (seen.has(k)) return false; seen.add(k); return true; }).length; }),
      fieldsAboveSubmit: fields(fm).filter((c) => c.y < submitY0).length,
      formFieldsOrder: fields(fm).map((c) => `${c.label || c.id}${c.required ? "(required)" : ""}`),
      fieldsWithRequiredOrOptionalMark: fields(fm).filter((c) => c.marked).length,
      submitY: await page.evaluate(() => Math.round(document.getElementById("go").getBoundingClientRect().top + scrollY)),
      pageHeight: await page.evaluate(() => document.documentElement.scrollHeight),
      firstViewFilledButtons: await page.evaluate(() => { const vis = []; for (const el of document.querySelectorAll("a, button")) { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && r.width) vis.push(el.textContent.trim().slice(0, 20)); } return vis.length; }),
      tapTargets: await tapTargets(page, ".wrap > :not(footer)"), smallText: await smallText(page, ".wrap"), hScroll: await hScroll(page),
    };
    // キーボード: 画面の下 336px が隠れた状態で、駅名の検索欄に入力したときの候補の見え方
    await page.setViewportSize({ width: 375, height: 812 - KEYBOARD_PX });
    const kb = {};
    for (const id of ["origin-q", "vc-origin-q"]) {
      const loc = page.locator(`#${id}`);
      if (!(await loc.isVisible())) { await page.evaluate((id) => { const d = document.getElementById(id).closest("details"); if (d) d.open = true; }, id); }
      await loc.scrollIntoViewIfNeeded(); await loc.tap(); await loc.fill("うつのみや"); await page.waitForTimeout(500);
      kb[id] = await page.evaluate((id) => {
        const q = document.getElementById(id), box = document.getElementById(id.replace("-q", "-sug"));
        const btns = [...box.querySelectorAll("button")]; const vh = innerHeight;
        return { inputTop: Math.round(q.getBoundingClientRect().top), suggestions: btns.length, suggestionsVisible: btns.filter((b) => { const r = b.getBoundingClientRect(); return r.top >= 0 && r.bottom <= vh; }).length, firstSuggestionVisible: btns[0] ? btns[0].getBoundingClientRect().bottom <= vh : false };
      }, id);
      await shot(page, `02-keyboard-${id}`);
      await loc.fill(""); await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(250);
    }
    result.keyboard = kb;
    await ctx.close();
  }

  // ---- 2) 初めての人: パラメータなしで、宿・日付・犬の大きさを入れて予約ボタンまで
  {
    const { ctx, page, calls } = await open("", { routeDelayMs: 2500 });
    const r = runner(page);
    await r.select("#dest-q", DEST, "行き先");
    await r.date("#date", DATE);
    await chooseSize(r, page, "medium");
    const inputTaps = r.log.taps;
    await r.tap("#go", "送信");
    await page.waitForTimeout(700);
    await shot(page, "03-waiting");
    result.waiting = {
      goText: await page.locator("#go").textContent(),
      statusText: await page.evaluate(() => [...document.querySelectorAll("#form [role=status], #go-status")].filter((e) => !e.checkVisibility || e.checkVisibility()).map((e) => e.innerText.trim()).filter(Boolean).join(" / ")),
      statusInView: await inView(page, "#go-status") || false,
    };
    await waitResults(page);
    await shot(page, "04-results-first-view");
    result.results = {
      filledButtonsInResults: await filledButtons(page, "#results"),
      filledButtonsFirstView: await page.evaluate(() => { const out = []; for (const el of document.querySelectorAll("#results a, #results button")) { const r = el.getBoundingClientRect(); if (r.top >= 0 && r.top < innerHeight && r.width) { const bg = getComputedStyle(el).backgroundColor.match(/\d+/g) || []; const [R, G, B, A = 1] = bg.map(Number); if (A > 0.5 && (R + G + B) / 3 < 200 && Math.max(R, G, B) - Math.min(R, G, B) > 40) out.push(el.textContent.trim().slice(0, 30)); } } return out; }),
      bookingY: await page.evaluate(() => { const a = document.querySelector("#dest-booking a.book-main, #dest-booking a"); const res = document.getElementById("results"); return a ? Math.round(a.getBoundingClientRect().top - res.getBoundingClientRect().top) : null; }),
      cardsBeforeBooking: await page.evaluate(() => { const cards = [...document.querySelectorAll("#results > .card, #results > nav, #results > div")].filter((c) => c.getBoundingClientRect().height > 0); const i = cards.findIndex((c) => c.contains(document.querySelector("#dest-booking"))); return i; }),
      tapTargets: await tapTargets(page, "#results"), smallText: await smallText(page, "#results"), hScroll: await hScroll(page),
    };
    const ok = await toBooking(r, page);
    await shot(page, "05-booking");
    result.flowNoParams = { inputTaps, totalTaps: r.log.taps, steps: r.log.steps, scrollPx: r.log.scrollPx, bookingInView: ok, actions: r.log.actions, routeCalls: calls.length, departuresPerCall: calls.map((c) => c.departures) };
    await ctx.close();
  }

  // ---- 3) 宿のカードから ?dest= 付きで来た人
  {
    const { ctx, page, calls } = await open(`?dest=${DEST}`);
    await shot(page, "06-dest-param-first-view");
    const r = runner(page);
    await r.date("#date", DATE);
    await r.tap("#go", "送信");
    await waitResults(page);
    const ok = await toBooking(r, page);
    result.flowDestParam = { destSelected: await page.locator("#dest-q").inputValue(), totalTaps: r.log.taps, steps: r.log.steps, scrollPx: r.log.scrollPx, bookingInView: ok, actions: r.log.actions, routeCalls: calls.length };
    await ctx.close();
  }

  // ---- 4) 空室から逆算(?checkin=&from=&size=&dogs=)→「この宿で旅行プランを作る」
  {
    const { ctx, page, calls } = await open(`?checkin=${DATE}&from=東京&size=small&dogs=1`);
    await page.waitForSelector(".vc-make", { timeout: 15000 });
    await shot(page, "07-vacancy-results");
    const r = runner(page);
    await r.tap(".vc-make", "この宿で旅行プランを作る");
    await waitResults(page);
    const ok = await toBooking(r, page);
    result.flowVacancy = { totalTaps: r.log.taps, steps: r.log.steps, scrollPx: r.log.scrollPx, bookingInView: ok, routeCalls: calls.length };
    await ctx.close();
  }

  // ---- 5) エラー時の文言
  result.errors = {};
  const errorCase = async (name, opts, prep) => {
    const { ctx, page } = await open(opts.query || "", opts);
    await prep(page);
    await page.locator("#go").scrollIntoViewIfNeeded(); await page.locator("#go").tap();
    await page.waitForFunction(() => !document.getElementById("error").classList.contains("hidden"), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);
    result.errors[name] = { text: (await page.locator("#error").textContent()).trim(), inView: await inView(page, "#error"), fieldErrorInView: Boolean(await inView(page, ".field-error")), focus: await page.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.tagName)) };
    await shot(page, `08-error-${name}`);
    await ctx.close();
  };
  await errorCase("no-destination", {}, async () => {});
  await errorCase("api-500", { query: `?dest=${DEST}`, routes: "500" }, async (p) => { await p.fill("#date", DATE); });
  await errorCase("api-429", { query: `?dest=${DEST}`, routes: "429" }, async (p) => { await p.fill("#date", DATE); });
  await errorCase("network", { query: `?dest=${DEST}`, routes: "network" }, async (p) => { await p.fill("#date", DATE); });
  await errorCase("past-time", { query: `?dest=${DEST}` }, async (p) => {
    const today = await p.evaluate(() => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10));
    await p.evaluate((t) => { document.getElementById("date").value = t; document.getElementById("start").value = "00:00"; for (const id of ["date", "start"]) document.getElementById(id).dispatchEvent(new Event("change", { bubbles: true })); }, today);
  });

  fs.writeFileSync(path.join(__dirname, `${LABEL}.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  await browser.close(); await srv.close();
})().catch((e) => { console.error(e); process.exit(1); });
