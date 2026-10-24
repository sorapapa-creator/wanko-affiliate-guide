// トップの困りごとリンク・準備5項目のリンクの着地点: 最初に見えるカードの画面上の位置(375px)
const { chromium } = require('playwright');
const port=process.argv[2];const B=`http://localhost:${port}/wanko-affiliate-guide/`;
(async()=>{const br=await chromium.launch();const ctx=await br.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
await ctx.route(u=>!u.href.startsWith('http://localhost'),r=>r.abort());const pg=await ctx.newPage();
const urls=[];
for(const src of ['index.html','travel-prep-5-instagram.html']){await pg.goto(B+src);const hs=await pg.evaluate(s=>[...document.querySelectorAll(s)].map(a=>a.getAttribute('href')),src==='index.html'?'nav.filters a':'.tp5 a.main');hs.forEach(h=>urls.push([src,h]));}
const rows=[];
for(const [src,h] of urls){await pg.goto(B+h,{waitUntil:'load',timeout:120000});await pg.waitForTimeout(2800);
 const r=await pg.evaluate(()=>{const c=[...document.querySelectorAll('article')].find(e=>e.checkVisibility());const act=document.querySelector('button.active[data-problem]');return {cardTop:c?Math.round(c.getBoundingClientRect().top):null,activeTop:act?Math.round(act.getBoundingClientRect().top):null,active:act&&act.textContent.trim(),y:Math.round(scrollY),n:[...document.querySelectorAll('article')].filter(e=>e.checkVisibility()).length}});
 rows.push({src,h:decodeURIComponent(h),...r});console.log(src,decodeURIComponent(h),JSON.stringify(r));}
require('fs').writeFileSync(process.argv[3],JSON.stringify(rows,null,1));await br.close();})();
