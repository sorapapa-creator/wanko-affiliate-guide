// (1) カードの並び順が読み込みごとに同じか (2) 検索欄の位置 (3) 修正箇所の切り抜きスクショ
const { chromium } = require('playwright');const crypto=require('crypto');
const out=process.argv[2];
(async()=>{const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
await ctx.route(u=>!u.href.startsWith('http://localhost'),r=>r.abort());const pg=await ctx.newPage();
const P={lodging:['dog-lodging-guide.html','#stay-query'],outing:['east-japan-dog-trips.html','#outing-query'],food:['food.html','input.search'],goods:['goods.html','input.search'],wear:['wear.html','input.search'],gear:['travel-gear.html','input.search']};
for(const [k,[f,sel]] of Object.entries(P)){const hs=[];let pos;
 for(let i=0;i<2;i++){await pg.goto('http://localhost:8080/wanko-affiliate-guide/'+f,{waitUntil:'load',timeout:120000});await pg.waitForTimeout(1200);
  const r=await pg.evaluate(s=>({order:[...document.querySelectorAll('article')].map(a=>(a.id||a.dataset.lodgingId||'')+':'+((a.querySelector('h2,h3')||{}).textContent||'').trim()).join('|'),pos:Math.round(document.querySelector(s).getBoundingClientRect().top)}),sel);
  hs.push(crypto.createHash('sha1').update(r.order).digest('hex').slice(0,10));pos=r.pos;}
 console.log(k,'順序ハッシュ',hs.join(' '),hs[0]===hs[1]?'同じ':'違う','| 検索欄の位置',pos,'px');}
for(const [port,lab] of [[8081,'before'],[8080,'after']]){
 await pg.goto(`http://localhost:${port}/wanko-affiliate-guide/dog-lodging-guide.html#risonare-nasu`,{waitUntil:'load',timeout:120000});await pg.waitForTimeout(3000);
 const el=await pg.$('#risonare-nasu .links');await el.scrollIntoViewIfNeeded();await pg.evaluate(()=>scrollBy(0,-120));await pg.waitForTimeout(300);
 await pg.screenshot({path:`${out}/crop-lodging-links-${lab}.jpg`,type:'jpeg',quality:70});
 await pg.goto(`http://localhost:${port}/wanko-affiliate-guide/goods.html`,{waitUntil:'load',timeout:120000});await pg.waitForTimeout(1500);
 const c=await pg.$('article.card');await c.scrollIntoViewIfNeeded();await pg.waitForTimeout(300);await c.screenshot({path:`${out}/crop-goods-card-${lab}.jpg`,type:'jpeg',quality:70});
 await pg.goto(`http://localhost:${port}/wanko-affiliate-guide/index.html`);await pg.screenshot({path:`${out}/crop-nav-${lab}.jpg`,type:'jpeg',quality:70,clip:{x:0,y:0,width:375,height:170}});
}
await br.close();})();
