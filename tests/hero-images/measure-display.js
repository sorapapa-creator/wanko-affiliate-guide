// 対象写真が各ページ・各画面幅で何 px で表示されるかを測る。
// 使い方: (リポジトリ直下で配信中に) node tests/hero-images/measure-display.js http://127.0.0.1:8080
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8080';
const IMAGES = ['05-outdoor-brothers.webp', 'play-dog.webp', 'moment-smile.webp', 'moment-rest.webp'];
const PAGES = ['travel-gear.html', 'autumn-winter-dog-trips.html', 'goods.html', 'food.html', 'wear.html', 'index.html',
  'dog-trip-checklist.html', 'from-sns.html', 'first-stay-check-result.html', 'first-stay-check-instagram.html',
  'a8-partners.html', 'mandarine-brothers.html', 'travel-prep-5-instagram.html'];
const VIEWPORTS = [{ w: 375, h: 812, dpr: 3 }, { w: 390, h: 844, dpr: 3 }, { w: 430, h: 932, dpr: 3 }, { w: 1280, h: 800, dpr: 2 }];
const BLOCK = /rakuten|amazon|yahoo|valuecommerce|cloudflareinsights|a8\.net|moshimo|googlesyndication|google-analytics|googletagmanager/;

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: vp.w < 800, hasTouch: vp.w < 800 });
    await ctx.route('**/*', r => (BLOCK.test(r.request().url()) && !r.request().url().startsWith(base)) ? r.abort() : r.continue());
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${base}/${p}`, { waitUntil: 'load' });
      const found = await page.evaluate((imgs) => [...document.images].filter(i => imgs.some(n => i.currentSrc.includes(n) || i.src.includes(n))).map(i => {
        const r = i.getBoundingClientRect(); const cs = getComputedStyle(i);
        let rw = r.width; // object-fit: cover なら拡大後の画像幅を必要画素とする
        if (cs.objectFit === 'cover' && i.naturalWidth) rw = i.naturalWidth * Math.max(r.width / i.naturalWidth, r.height / i.naturalHeight);
        return { file: i.src.split('/').pop(), boxW: Math.round(r.width * 10) / 10, boxH: Math.round(r.height * 10) / 10, fit: cs.objectFit, renderW: Math.round(rw * 10) / 10, top: Math.round(r.top + scrollY) };
      }), IMAGES);
      for (const f of found) rows.push({ page: p, vp: `${vp.w}@${vp.dpr}x`, dpr: vp.dpr, ...f, needPx: Math.ceil(f.renderW * vp.dpr) });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(JSON.stringify(rows, null, 1));
})();
