// Instagram 入口からの導線を 375px で実際に操作する
const { chromium } = require('playwright');
const B='http://localhost:8080/wanko-affiliate-guide/';
const out=process.argv[2], label=process.argv[3]||'before';
(async()=>{
 const br=await chromium.launch();
 const ctx=await br.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 await ctx.route(u=>!u.href.startsWith('http://localhost'),r=>r.abort());
 const pg=await ctx.newPage(); const log=(...a)=>console.log(...a);
 const shot=n=>pg.screenshot({path:`${out}/flow-${n}-${label}.jpg`,type:'jpeg',quality:70});
 const vis=async s=>pg.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.checkVisibility()).length,s);
 await pg.goto(B+'first-stay-check-instagram.html');
 // 未回答で送信
 await pg.click('.tdc-btn'); await pg.waitForTimeout(800);
 log('1 未回答送信 →',pg.url().replace(B,''), await pg.evaluate(()=>{const e=document.querySelector('.tdc-error,[role=alert],.is-missing,.tdc-q.missing');return e?e.className+':'+e.textContent.trim().slice(0,80):'(エラー表示なし)'}), 'scrollY',await pg.evaluate(()=>scrollY));
 await shot('1-empty-submit');
 await pg.check('input[name=count][value="2"]');await pg.check('input[name=heads][value=unknown]');await pg.check('input[name=room][value=part]');await pg.check('input[name=fee][value=unknown]');await pg.check('input[name=manner][value=worry]');
 await Promise.all([pg.waitForNavigation({timeout:10000}).catch(()=>{}),pg.click('.tdc-btn')]); await pg.waitForTimeout(800);
 log('2 結果',pg.url().replace(B,''), JSON.stringify(await pg.evaluate(()=>({head:document.querySelector('#tdr-head').textContent.trim().slice(0,80),list:document.querySelector('#tdr-list').innerText.slice(0,200),ask:document.querySelector('#tdr-ask-text').value.length}))));
 await shot('2-result');
 // コピー
 await ctx.grantPermissions(['clipboard-read','clipboard-write']).catch(()=>{});
 await pg.click('#tdr-copy'); await pg.waitForTimeout(400); log('2b コピー後のボタン表示:',await pg.textContent('#tdr-copy'));
 // 宿の例へ
 await Promise.all([pg.waitForNavigation({timeout:60000}),pg.click('.tdr-cand a >> nth=0')]); await pg.waitForLoadState('load'); await pg.waitForTimeout(3000);
 const land=await pg.evaluate(()=>{const t=document.getElementById(location.hash.slice(1));const r=t.getBoundingClientRect();const book=t.querySelector('.stay-book-btn');return {hash:location.hash,cardTop:Math.round(r.top),h1:document.querySelector('h1').textContent.trim().slice(0,30),bookText:book&&book.textContent.trim(),bookTop:book&&Math.round(book.getBoundingClientRect().top),back:!!document.querySelector('a[href*="first-stay-check"]')}});
 log('3 宿の例に着地',JSON.stringify(land)); await shot('3-lodging-anchor');
 await pg.goBack({waitUntil:'load'}); await pg.waitForTimeout(800);
 log('4 戻る →',pg.url().replace(B,''),'結果は保持:',await pg.evaluate(()=>document.querySelector('#tdr-list').innerText.slice(0,40)));
 // 旅行準備へ
 await Promise.all([pg.waitForNavigation(),pg.click('a[href="travel-prep-5-instagram.html"]')]); await pg.waitForTimeout(500);
 log('5 準備5項目',pg.url().replace(B,''), '最初の画面にPR表示:',await pg.evaluate(()=>{const e=document.querySelector('.pr-notice');return e&&e.getBoundingClientRect().top<innerHeight}));
 const t0=Date.now(); await Promise.all([pg.waitForNavigation({timeout:60000}),pg.click('a.main >> nth=0')]); await pg.waitForLoadState('load'); await pg.waitForTimeout(2000);
 const g=await pg.evaluate(()=>{const cards=[...document.querySelectorAll('article')].filter(e=>e.checkVisibility());const first=cards[0];const r=first&&first.getBoundingClientRect();const buy=first&&first.querySelector('a[rel*=sponsored],a.buy,a.buy-ad');
   const act=[...document.querySelectorAll('button.active,[aria-pressed=true]')].map(b=>b.textContent.trim()).slice(0,3);
   return {url:location.search,visible:cards.length,total:document.querySelectorAll('article').length,active:act,firstCardTop:r&&Math.round(r.top),firstTitle:first&&(first.querySelector('h2,h3')||{}).textContent,buyText:buy&&buy.textContent.trim().slice(0,40),buyTop:buy&&Math.round(buy.getBoundingClientRect().top+scrollY)}});
 log('6 旅行用品(処理袋)',Date.now()-t0,'ms',JSON.stringify(g)); await shot('6-gear-problem');
 await pg.goBack({waitUntil:'load'}); log('7 戻る →',pg.url().replace(B,''));
 // 宿ページの検索に結果0件
 await pg.goto(B+'dog-lodging-guide.html'); await pg.fill('#stay-query','ほげほげ'); await pg.waitForTimeout(1200);
 log('8 宿 0件時',JSON.stringify(await pg.evaluate(()=>{const z=[...document.querySelectorAll('.stay-empty,.empty,[data-empty],.no-result')].filter(e=>e.checkVisibility()).map(e=>e.textContent.trim().slice(0,80));return {visible:[...document.querySelectorAll('article.stay-card')].filter(e=>e.checkVisibility()).length,empty:z}})));
 await shot('8-lodging-zero');
 await br.close();
})();
