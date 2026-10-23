// 旅行プラン画面をスマホ幅のブラウザで動かすテスト(Playwright)。経路 API はモック、外部ドメインは遮断。
// 確かめること: 既存の URL パラメータ(?dest= ・旧 ID の読み替え・?checkin=&from=&size=&dogs=)とブックマーク(#vacancy-card・#form・要素の id)が
// 壊れていない / 経路 API の呼び出し回数が増えていない / 空室データの状態(W01)ごとの案内とフォーカス順。
// 実行: node tests/planner-browser.test.js(Playwright が無ければスキップ)。SCREENSHOTS=1 で W01 の状態ごとのスクショを docs/planner-ux-20261024/w01/ に保存
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const H = require("./helpers/planner-harness.js");

const pw = H.loadPlaywright();
if (!pw) { console.log("# skip: playwright が見つからないため、ブラウザのテストを飛ばします"); process.exit(0); }

const DEST = "kitsuregawa";  // 亀の井ホテル 喜連川(位置は施設まで登録・楽天の空室データあり)
const SHOTS = process.env.SCREENSHOTS === "1" ? path.join(H.ROOT, "docs", "planner-ux-20261024", "w01") : null;
// 変更前の route-planner/index.html にあった id(外部のリンク・ブックマーク・他のスクリプトが使う)。消さない
const OLD_IDS = "add-wp adults age brachy carsick cert-hint check-card checklist checkout compare compare-card compare-head compare-note compare-title count date dest-card dest-details-link dest-hint dest-q dog-kg dogs error find-wp-route form go guide heat heat-cycle itinerary itinerary-actions itinerary-card itinerary-title itinerary-warn make-itinerary map map-apply map-cand-note map-card map-clear map-detail map-filters map-key map-key-body map-note map-pick-note map-picks map-picks-count map-picks-wrap map-show meal-time med-time mock nearby nearby-actions nearby-card nearby-detail nearby-pick nearby-select nearby-select-hint origin origin-hint origin-q origin-sug plan plan-actions plan-card plan-diff plan-stale plan-summary plan-title plan-warn rest-card rest-intro rest-pick results ret-day ret-go ret-plan ret-rest-intro ret-rest-pick ret-rest-title ret-start ret-status ret-via ret-warn return-card site-tokens-20261004 size start step steps toilet trip-check trip-extra vacancy-card vaccine vc-adults vc-budget vc-credit vc-date vc-dogs vc-go vc-origin vc-origin-q vc-origin-sug vc-petonly vc-results vc-size vc-sleep vc-status vc-strict wp-route-status wps".split(" ");

// 空室データを「いま取得した」ことにする(実データの取得時刻に左右されないように)。mode で状態を作る
const indexDates = () => Object.keys(JSON.parse(fs.readFileSync(path.join(H.ROOT, "route-planner/data/vacancy/index.json"), "utf8")).dates).sort();
const vacancy = (mode = "fresh") => {
  const now = H.jstStamp(Date.now() - 3600 * 1000), old = H.jstStamp(Date.now() - 30 * 3600 * 1000);
  return (file, json) => {
    if (!json) return null;
    const stamp = mode === "expired" ? old : mode === "unknown" ? "不明" : now;
    if (file === "index.json") {
      if (mode === "index-error") return undefined;  // ↓ で network 扱い
      for (const e of Object.values(json.dates)) { e.scanned_at = stamp; if (e.a4) e.a4.scanned_at = stamp; }
      return json;
    }
    if (mode === "missing") return null;
    const out = { ...json, scanned_at: stamp };
    if (mode === "empty") out.hotels = {};
    return out;
  };
};

let n = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

(async () => {
  const srv = await H.startServer();
  const browser = await pw.chromium.launch();
  const open = async (query = "", opts = {}, ctxOpts = {}) => {
    const ctx = await browser.newContext({ ...H.MOBILE, ...ctxOpts });
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
    let vac = opts.vacancy;
    if (opts.vacancyMode === "index-error") vac = (file, json) => (file === "index.json" ? "ABORT" : vacancy("fresh")(file, json));
    else if (opts.vacancyMode) vac = vacancy(opts.vacancyMode);
    const { calls } = await H.preparePage(page, srv.url, { ...opts, vacancy: vac });
    if (opts.vacancyMode === "index-error") await page.route("**/data/vacancy/index.json", (r) => r.abort("failed"));
    await page.goto(`${srv.url}/route-planner/${query}`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelectorAll("#dest-q option").length > 50, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    return { ctx, page, calls, errors };
  };
  const submitAndWait = async (page) => {
    await page.locator("#go").click();
    await page.waitForFunction(() => !document.getElementById("results").classList.contains("hidden"), null, { timeout: 20000 });
    await page.waitForTimeout(500);
  };
  const date = indexDates().find((d) => d > H.jstStamp(Date.now()).slice(0, 10)) || indexDates().slice(-1)[0];

  // ------------------------------------------------ URL パラメータ・ブックマーク
  test("?dest=<id> で行き先が選ばれ、行程のフォームが空室検索より上に出る", async () => {
    const { ctx, page, errors } = await open(`?dest=${DEST}`, { vacancyMode: "fresh" });
    assert.equal(await page.locator("#dest-q").inputValue(), DEST);
    const formFirst = await page.evaluate(() => Boolean(document.getElementById("form").compareDocumentPosition(document.getElementById("vacancy-card")) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.ok(formFirst, "form が vacancy-card より前");
    assert.match(await page.locator("#form-title").textContent(), /亀の井ホテル 喜連川/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  test("?dest=<旧 ID> は残したカードの ID に読み替える(c6-00002930 → c2-kizuna-kinugawa)", async () => {
    const { ctx, page } = await open("?dest=c6-00002930");
    assert.equal(await page.locator("#dest-q").inputValue(), "c2-kizuna-kinugawa");
    await ctx.close();
  });
  test("?dest=<存在しない ID> は何も選ばず、並びも変えない(エラーなし)", async () => {
    const { ctx, page, errors } = await open("?dest=no-such-place");
    assert.equal(await page.locator("#dest-q").inputValue(), "");
    const formFirst = await page.evaluate(() => Boolean(document.getElementById("form").compareDocumentPosition(document.getElementById("vacancy-card")) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.equal(formFirst, false);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  test("?checkin=&from=&size=&dogs= は空室検索の欄(ボタンの選択肢も)と出発日に入り、そのまま検索する", async () => {
    const { ctx, page, errors } = await open(`?checkin=${date}&from=新宿&size=medium&dogs=2`, { vacancyMode: "fresh" });
    await page.waitForSelector(".vc-make, .vc-state", { timeout: 15000 });
    assert.equal(await page.locator("#vc-size").inputValue(), "medium");
    assert.equal(await page.locator('[data-seg-for="vc-size"] input:checked').getAttribute("value"), "medium");
    assert.equal(await page.locator("#vc-dogs").inputValue(), "2");
    assert.equal(await page.locator('[data-seg-for="vc-dogs"] input:checked').getAttribute("value"), "2");
    assert.equal((await page.locator("#vc-origin option:checked").textContent()).trim(), "新宿駅");
    assert.equal(await page.locator("#vc-date").inputValue(), date);
    assert.equal(await page.locator("#date").inputValue(), date);
    assert.ok(await page.locator(".vc-make").count() > 0, "空室のある宿が出る");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  test("ブックマーク: #vacancy-card・#form が開け、変更前の id はすべて残っている", async () => {
    const { ctx, page } = await open("#vacancy-card");
    const missing = await page.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), OLD_IDS);
    assert.deepEqual(missing, []);
    for (const hash of ["#vacancy-card", "#form"]) {
      await page.goto(`${srv.url}/route-planner/${hash}`, { waitUntil: "load" }); await page.waitForTimeout(1500);
      const top = await page.evaluate((h) => document.querySelector(h).getBoundingClientRect().top, hash);
      assert.ok(top > -5 && top < 200, `${hash} が画面の上に来る(top=${Math.round(top)})`);
    }
    await ctx.close();
  });
  test("犬の大きさのボタンと元の select が同期し、form.reset() でも戻る", async () => {
    const { ctx, page } = await open();
    await page.locator('[data-seg-for="size"] label:has(input[value="large"])').click();
    assert.equal(await page.locator("#size").inputValue(), "large");
    await page.evaluate(() => { document.getElementById("size").value = "medium"; });
    assert.equal(await page.locator('[data-seg-for="size"] input:checked').getAttribute("value"), "medium");
    await page.evaluate(() => document.getElementById("form").reset()); await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-seg-for="size"] input:checked').getAttribute("value"), "small");
    await ctx.close();
  });

  // ------------------------------------------------ 経路 API の呼び出し回数
  test("経路 API: 1 回の「プランを作る」で 1 回(出発時刻 6 通りを 1 回にまとめる)。結果の主ボタンは 1 つ", async () => {
    const { ctx, page, calls, errors } = await open(`?dest=${DEST}`, { vacancyMode: "fresh" });
    await page.fill("#date", date);
    await submitAndWait(page);
    assert.equal(calls.length, 1); assert.equal(calls[0].departures, 6);
    // ボタンの選択肢・任意の条件を変えても、自動では計算し直さない
    await page.locator('[data-seg-for="size"] label:has(input[value="medium"])').click();
    await page.evaluate(() => { document.getElementById("more-options").open = true; document.getElementById("trip-extra").open = true; });
    await page.locator('[data-seg-for="age"] label:has(input[value="senior"])').click();
    await page.locator('[data-seg-for="dogs"] label:has(input[value="2"])').click();
    await page.waitForTimeout(500);
    assert.equal(calls.length, 1, "条件の変更だけでは呼ばない");
    const filled = await page.evaluate(() => [...document.querySelectorAll("#results button.primary")].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.id));
    assert.deepEqual(filled, ["next-cta"]);
    await page.locator("#next-cta").click(); await page.waitForTimeout(1200);
    const inView = await page.evaluate(() => { const r = document.getElementById("dest-card").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    assert.ok(inView, "主ボタンで宿のカードへ");
    assert.equal(calls.length, 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  test("経路 API: 空室から「この宿で旅行プランを作る」も 1 回", async () => {
    const { ctx, page, calls } = await open(`?checkin=${date}&from=東京&size=small&dogs=1`, { vacancyMode: "fresh" });
    await page.waitForSelector(".vc-make", { timeout: 15000 });
    await page.locator(".vc-make").first().click();
    await page.waitForFunction(() => !document.getElementById("results").classList.contains("hidden"), null, { timeout: 20000 });
    await page.waitForTimeout(500);
    assert.equal(calls.length, 1); assert.equal(calls[0].departures, 6);
    await ctx.close();
  });
  test("経路 API: 行き先が未選択なら呼ばず、欄のそばに理由を出してフォーカスを移す", async () => {
    const { ctx, page, calls } = await open();
    await page.locator("#go").click(); await page.waitForTimeout(400);
    assert.equal(calls.length, 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), "dest-q");
    assert.match(await page.locator("#dest-q-error").textContent(), /行き先/);
    await ctx.close();
  });
  test("通信の失敗は日本語で次の行動まで出す(Failed to fetch を出さない)", async () => {
    const { ctx, page } = await open(`?dest=${DEST}`, { routes: "network" });
    await page.fill("#date", date); await page.locator("#go").click();
    await page.waitForFunction(() => !document.getElementById("error").classList.contains("hidden"));
    const t = await page.locator("#error").textContent();
    assert.doesNotMatch(t, /Failed to fetch/); assert.match(t, /通信できませんでした/);
    assert.equal(await page.locator("#go").textContent(), "プランを作る");
    await ctx.close();
  });

  // ------------------------------------------------ W01: 空室データの状態ごとの案内(390px 幅)
  const W01 = { viewport: { width: 390, height: 844 } };
  const stateCase = (name, mode, expectState, check) => test(`W01 ${name}: ${expectState}`, async () => {
    const { ctx, page, errors } = await open(`?checkin=${date}&from=東京&size=medium&dogs=2`, { vacancyMode: mode }, W01);
    await page.waitForSelector(`.vc-state[data-state="${expectState}"]`, { timeout: 15000 });
    const panel = page.locator(".vc-state");
    const text = await panel.textContent();
    assert.match(text, /探した条件/); assert.match(text, /大人 2名/); assert.match(text, /東京駅/); assert.match(text, /中型犬・2頭/);
    if (mode !== "index-error") assert.equal(await page.locator("#vc-date").inputValue(), date, "希望日を勝手に変えない");
    assert.equal(await page.locator(".vc-card").count(), 0, "古い空室・料金を出さない");
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await panel.scrollIntoViewIfNeeded(); await page.evaluate(() => scrollBy(0, -80)); await page.screenshot({ path: path.join(SHOTS, `${expectState}.jpg`), type: "jpeg", quality: 70 }); }
    if (check) await check(page, text);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
  stateCase("取得から 24 時間超", "expired", "expired", async (page, text) => {
    assert.match(text, /この日程の空室を、いま確認できません/);
    assert.match(text, /空室情報の更新が必要なため、古い空室・料金は表示していません。犬の同伴条件から宿を比較し、空室は予約先で確認できます。/);
    assert.doesNotMatch(text.replace(/満室(という意味ではありません|とは限りません)/g, ""), /満室/);
    const main = page.locator(".vc-state a.vc-state-main");
    assert.equal(await main.textContent(), "宿一覧を見る(空室は未確認)");
    assert.equal(await main.getAttribute("href"), "../dog-lodging-guide.html");
    // フォーカス順: 説明(見出し) → 主ボタン → 再読み込み
    assert.equal(await page.evaluate(() => document.activeElement.id), "vc-state-title");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.className), "vc-state-main");
    await page.keyboard.press("Tab");
    assert.match(await page.evaluate(() => document.activeElement.className), /vc-reload/);
    // 日付の一覧にも古い空室数を出さない
    assert.match(await page.locator("#vc-date option:checked").textContent(), /空室情報の更新待ち/);
  });
  stateCase("その日のファイルがない", "missing", "missing_date", async (page, text) => { assert.match(text, /この日の空室データはありません/); assert.match(text, /満室という意味ではありません/); });
  stateCase("取得時刻が不明", "unknown", "unknown_timestamp", async (page, text) => { assert.match(text, /いつ取得したか確かめられない/); });
  stateCase("新しいデータで 0 件", "empty", "no_match", async (page, text) => { assert.match(text, /0 件/); assert.match(text, /満室とは限りません/); });
  stateCase("日付の一覧を読み込めない", "index-error", "fetch_error", async (page, text) => {
    assert.match(text, /空室データを読み込めませんでした/); assert.doesNotMatch(text, /準備中/);
    assert.match(await page.locator(".vc-state .primary").textContent(), /空室情報を再読み込み/);
  });
  test("W01 再読み込み: 期限切れ → 新しいデータになったら、同じ希望日のまま一覧を出す", async () => {
    let mode = "expired";
    const { ctx, page } = await open(`?checkin=${date}&from=東京&size=small&dogs=1`, { vacancy: (f, j) => vacancy(mode)(f, j) }, W01);
    await page.waitForSelector('.vc-state[data-state="expired"]', { timeout: 15000 });
    mode = "fresh";
    await page.locator(".vc-reload").click();
    await page.waitForSelector(".vc-make", { timeout: 15000 });
    assert.equal(await page.locator("#vc-date").inputValue(), date);
    await ctx.close();
  });

  for (const [name, fn] of tests) {
    n++;
    try { await fn(); console.log(`ok ${n} - ${name}`); } catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.stack || e).split("\n").slice(0, 4).join("\n  ")}`); }
  }
  await browser.close(); await srv.close();
  console.log(`\n${n - failed}/${n} passed`);
  if (failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
