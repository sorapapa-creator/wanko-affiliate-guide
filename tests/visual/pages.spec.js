// スクショ比較: 主要ページを スマホ(375×812)と PC(1280×800)で、
//   first … 開いた直後の最初の画面
//   cards … 最初のカード 3 枚が見える位置(1 枚目の上端から 3 枚目の下端まで)
// を撮り、tests/visual/__screenshots__/ の基準画像と比べる。
// 日付・件数・空室など毎日変わる部分は、固定の文字に置き換えてからマスク(塗りつぶし)して比べる。
// 基準画像の作り直し: npm run test:update
"use strict";
const { test, expect } = require("@playwright/test");
const { PAGES, VIEWPORTS } = require("../support/pages");
const { openPage } = require("../support/browser");

// 毎日変わる部分の目印。ここに当たる要素はマスクする。
const MASK_SELECTORS = [
  "input[type=date]", "input[type=datetime-local]", "time", ".source-date",
  "[data-updated]", "[data-asof]",
];
// 縦に長いカード(宿カードはスマホで 1 枚 2,000px を超える)でも 3 枚入るよう、撮る高さの上限は大きめにする
const MAX_CLIP_HEIGHT = 8000;

// region(ページ座標)の中の、毎日変わる文字を固定の文字に置き換えてから塗りつぶす(data-vt-mask)。
// 塗るだけだと、文字の長さが変わったとき(978宿 → 1002宿 など)に塗る幅が変わって差が出るので、先に置き換える。
//   - 日付(2026-10-07・10/24・10月24日)と、件数(978宿・1,067件・276宿 など)… 数字の部分を「00」にして塗る
//   - 空室・満室・残り・在庫・更新・本日 などを含む文 … その中の数字を「00」にして塗る。短い文(20 字以下)は文ごと「＊＊＊＊」にする
//   - 日付入力欄・<time>・.source-date など(MASK_SELECTORS)と、上の文字を選んでいるセレクト … 要素ごと塗る
async function markDynamic(page, region) {
  await page.evaluate(({ region, selectors }) => {
    const DATE = /20\d{2}\s*[-/.年]\s*\d{1,2}(\s*[-/.月]\s*\d{1,2}\s*日?)?|\d{1,2}\s*月\s*\d{1,2}\s*日|(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/])/g;
    const COUNT = /\d[\d,]*\s*(宿|軒|件|か所|ヶ所|品|点|施設|プラン|室)/;
    const DAILY = /空室|満室|空き|残り|在庫|受付終了|更新|本日|今日|明日|今週|週末/;
    const NUM = /\d[\d,.]*/g;
    const inRegion = (el) => {
      for (const r of el.getClientRects()) {
        const top = r.top + scrollY, bottom = r.bottom + scrollY;
        if (bottom > region.y && top < region.y + region.height && r.width > 0) return true;
      }
      return false;
    };
    const dynamic = (t) => { DATE.lastIndex = 0; return DATE.test(t) || COUNT.test(t) || DAILY.test(t); };
    document.querySelectorAll(selectors.join(",")).forEach((el) => { if (inRegion(el)) el.setAttribute("data-vt-mask", ""); });
    // セレクトは選ばれている選択肢の文字で判断する(option 自体は位置を持たない)
    document.querySelectorAll("select").forEach((sel) => {
      const t = sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : "";
      if (dynamic(t) && inRegion(sel)) sel.setAttribute("data-vt-mask", "");
    });
    const hits = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue;
      if (!t || t.trim().length === 0 || !dynamic(t)) continue;
      const el = n.parentElement;
      if (!el || el.closest("script,style,noscript,template,select,[data-vt-mask]")) continue;
      if (inRegion(el)) hits.push(n);
    }
    const masked = (text) => { const s = document.createElement("span"); s.setAttribute("data-vt-mask", ""); s.textContent = text; return s; };
    for (const n of hits) {
      const el = n.parentElement;
      if (el.closest("textarea,title,svg")) { el.closest("textarea,title,svg").setAttribute("data-vt-mask", ""); continue; }
      const t = n.nodeValue;
      if (DAILY.test(t) && t.trim().length <= 20) { n.replaceWith(masked("＊＊＊＊")); continue; }
      // 日付をまとめて 1 つ、それ以外は数字の並びごとに「00」へ置き換える
      const parts = [];
      let last = 0;
      const re = new RegExp(DATE.source + "|" + NUM.source, "g");
      for (const m of t.matchAll(re)) {
        if (m.index > last) parts.push(document.createTextNode(t.slice(last, m.index)));
        parts.push(masked("00"));
        last = m.index + m[0].length;
      }
      if (last < t.length) parts.push(document.createTextNode(t.slice(last)));
      n.replaceWith(...parts);
    }
  }, { region, selectors: MASK_SELECTORS });
}

// region の中の画像を読み込み終えるまで待つ(loading="lazy" は画面外だと読まれないので eager に切り替える)
async function waitImages(page, region) {
  await page.evaluate(async (region) => {
    const imgs = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.bottom + scrollY > region.y && r.top + scrollY < region.y + region.height;
    });
    await Promise.all(imgs.map((img) => {
      if (img.loading === "lazy") img.loading = "eager";
      if (img.complete) return img.decode().catch(() => {});
      return new Promise((ok) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ok, { once: true }); setTimeout(ok, 8000); });
    }));
  }, region);
}

// 1 枚目のカードを、上部に固定されたナビ・検索欄のすぐ下に来るようスクロールし、3 枚分の範囲を返す
async function scrollToCards(page, selector, vp) {
  let box = null;
  for (let i = 0; i < 6; i++) {
    const next = await page.evaluate((selector) => {
      const cards = [...document.querySelectorAll(selector)].filter((e) => e.getClientRects().length > 0).slice(0, 3);
      if (cards.length === 0) return null;
      // content-visibility:auto のカードは画面外だと描画されず白く写るので、撮る 3 枚だけ描画させる
      cards.forEach((c) => { c.style.contentVisibility = "visible"; });
      const go = (y) => window.scrollTo({ top: Math.max(0, y), left: 0, behavior: "instant" });
      const top = cards[0].getBoundingClientRect().top + scrollY;
      go(top - 8);
      // 画面上端に貼り付いている(sticky / fixed)ナビ・検索欄の下端を、上から順に重なりをたどって求める
      const pinned = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === "sticky" || p === "fixed") return e; } return null; };
      let y = 1;
      for (let guard = 0; guard < 10 && y < innerHeight * 0.5; guard++) {
        const hit = document.elementsFromPoint(innerWidth / 2, y).map(pinned).find(Boolean);
        if (!hit) break;
        y = Math.ceil(hit.getBoundingClientRect().bottom) + 1;
      }
      go(top - (y - 1) - 8);
      const bottom = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom + scrollY));
      return { y: Math.round(scrollY), bottom: Math.round(bottom), count: cards.length };
    }, selector);
    if (!next) return null;
    // 画像の読み込みや content-visibility の解除で高さが変わるので、位置が 2 回続けて同じになるまで繰り返す
    await waitImages(page, { y: next.y - vp.height, height: next.bottom - next.y + vp.height * 2 });
    await page.waitForTimeout(200);
    if (box && box.y === next.y && box.bottom === next.bottom) break;
    box = next;
  }
  return box;
}

for (const def of PAGES) {
  for (const vp of VIEWPORTS) {
    test.describe(`${def.id} ${vp.id} ${vp.width}x${vp.height}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test(`スクショ: 最初の画面 ${def.path}`, async ({ page }) => {
        await openPage(page, def);
        await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
        const region = { y: 0, height: vp.height };
        await waitImages(page, region);
        await markDynamic(page, region);
        await expect(page).toHaveScreenshot(`${def.id}-${vp.id}-first.png`, {
          mask: [page.locator("[data-vt-mask]")],
        });
      });

      test(`スクショ: 最初のカード 3 枚 ${def.path}`, async ({ page }) => {
        await openPage(page, def);
        let box = await scrollToCards(page, def.cards, vp);
        expect(box, `カード(${def.cards})が見つからない`).not.toBeNull();
        // 毎日変わる文字を置き換えると高さが少し変わることがあるので、置き換えてから位置を測り直す
        await markDynamic(page, { y: box.y - vp.height, height: box.bottom - box.y + vp.height * 2 });
        box = await scrollToCards(page, def.cards, vp);
        const clip = { x: 0, y: box.y, width: vp.width, height: Math.min(Math.max(box.bottom - box.y + 8, vp.height), MAX_CLIP_HEIGHT) };
        await waitImages(page, clip);
        await expect(page).toHaveScreenshot(`${def.id}-${vp.id}-cards.png`, {
          fullPage: true,
          clip,
          mask: [page.locator("[data-vt-mask]")],
        });
      });
    });
  }
}
