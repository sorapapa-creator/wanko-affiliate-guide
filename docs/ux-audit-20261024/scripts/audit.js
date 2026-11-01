// 使い方: node audit.js <out-dir> <label>   各ページ×各幅で 横スクロール・44px未満タップ領域・12px未満文字・初画面スクショ・検索操作 を記録
const { chromium } = require('playwright');
const fs=require('fs'),path=require('path');
const B='http://localhost:8080/wanko-affiliate-guide/';
const out=process.argv[2], label=process.argv[3]||'before';
const only=process.argv[4]?process.argv[4].split(','):null;
const PAGES=[
 ['top','index.html',async pg=>{await pg.selectOption('#hs-dogs','2');await pg.click('.hs-submit');await pg.waitForTimeout(1500);return {how:'頭数=2頭 を選んで「空室のある宿を探す」',after:pg.url().replace(B,'')};}],
 ['lodging','dog-lodging-guide.html',async pg=>search(pg,'#stay-query','那須','article.stay-card')],
 ['outing','east-japan-dog-trips.html',async pg=>search(pg,'#outing-query','那須','article')],
 ['food','food.html',async pg=>search(pg,'input.search','チキン','article')],
 ['goods','goods.html',async pg=>search(pg,'input.search','車','article')],
 ['wear','wear.html',async pg=>search(pg,'input.search','レイン','article')],
 ['gear','travel-gear.html',async pg=>search(pg,'input.search','キャリー','article')],
 ['check','first-stay-check-instagram.html',async pg=>{
   await pg.check('input[name=count][value="2"]');await pg.check('input[name=heads][value=ok]');await pg.check('input[name=room][value=part]');await pg.check('input[name=fee][value=unknown]');await pg.check('input[name=manner][value=worry]');
   await Promise.all([pg.waitForNavigation({timeout:15000}).catch(()=>{}),pg.click('.tdc-btn')]);await pg.waitForTimeout(800);
   const t=await pg.evaluate(()=>{const l=document.querySelector('#tdr-list');return l?l.innerText.split('\n').filter(Boolean).length:null});
   return {how:'2頭・確認済/一部/未確認/心配 で送信',after:pg.url().replace(B,''),items:t};}],
 ['result','first-stay-check-result.html',null],
 ['prep5','travel-prep-5-instagram.html',null],
];
async function count(pg,sel){return pg.evaluate(s=>[...document.querySelectorAll(s)].filter(e=>e.checkVisibility()).length,sel);}
async function search(pg,inp,q,card){
  const before=await count(pg,card);
  const el=pg.locator(inp).first(); await el.scrollIntoViewIfNeeded(); await el.fill(q); await el.dispatchEvent('input'); await pg.keyboard.press('Enter').catch(()=>{});
  await pg.waitForTimeout(1500);
  const after=await count(pg,card);
  return {how:`検索欄に「${q}」`,before,after,changed:before!==after};
}
const MEASURE=()=>{
  const W=innerWidth,H=innerHeight;
  const sig=e=>{const c=(e.className&&typeof e.className==='string')?'.'+e.className.trim().split(/\s+/).slice(0,2).join('.'):'';const p=e.parentElement;const pc=p&&typeof p.className==='string'&&p.className.trim()?'.'+p.className.trim().split(/\s+/)[0]:'';return (p?p.tagName.toLowerCase()+pc+' > ':'')+e.tagName.toLowerCase()+c;};
  // 横スクロール
  const sw=document.documentElement.scrollWidth;
  const over=[];
  if(sw>W+1){for(const e of document.body.querySelectorAll('*')){const r=e.getBoundingClientRect();if(r.right>W+1&&r.width>0){let s=e.parentElement,clip=false;while(s&&s!==document.body){const o=getComputedStyle(s).overflowX;if(o!=='visible'){clip=true;break;}s=s.parentElement;}if(!clip){over.push(sig(e)+' right='+Math.round(r.right));if(over.length>8)break;}}}}
  // タップ領域
  const Q='a[href],button,select,textarea,summary,input:not([type=hidden]),[role=button],label';
  let small=0,smallFirst=0,inline=0,total=0;const groups={};
  for(const e of document.querySelectorAll(Q)){
    if(e.tagName==='LABEL'&&!e.querySelector('input,select,textarea'))continue;
    if(e.tagName==='INPUT'&&/radio|checkbox/.test(e.type)&&e.closest('label'))continue;
    if(e.closest('[aria-hidden=true],.tdr-trap'))continue;
    if(!e.checkVisibility({checkOpacity:false,checkVisibilityCSS:true}))continue;
    const r=e.getBoundingClientRect(); if(r.width<1||r.height<1)continue;
    total++;
    if(r.width>=44&&r.height>=44)continue;
    const cs=getComputedStyle(e);
    if(e.tagName==='A'&&cs.display==='inline'){const p=e.parentElement;const pt=(p.textContent||'').trim().length,lt=(e.textContent||'').trim().length;if(pt>lt+8){inline++;continue;}}
    small++; if(r.top<H&&r.bottom>0)smallFirst++;
    const k=sig(e);groups[k]=groups[k]||{n:0,w:Math.round(r.width),h:Math.round(r.height)};groups[k].n++;
  }
  // 12px 未満の文字
  let tiny=0,tinyFirst=0;const tg={};const seen=new Set();
  const tw=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue.trim()?1:2});
  let n;while(n=tw.nextNode()){const e=n.parentElement;if(!e||seen.has(e))continue;seen.add(e);
    if(/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(e.tagName))continue;
    const fs=parseFloat(getComputedStyle(e).fontSize);if(fs>=12)continue;
    if(!e.checkVisibility({checkVisibilityCSS:true}))continue;
    if(e.closest('[aria-hidden=true]'))continue;
    tiny++;const r=e.getBoundingClientRect();if(r.top<H&&r.bottom>0&&r.width>0)tinyFirst++;
    const k=sig(e)+' '+fs+'px';tg[k]=(tg[k]||0)+1;}
  const top=(o,m)=>Object.entries(o).sort((a,b)=>(b[1].n||b[1])-(a[1].n||a[1])).slice(0,m);
  return {scrollWidth:sw,hscroll:sw>W+1,over,tapTotal:total,tapSmall:small,tapSmallFirst:smallFirst,inlineLinks:inline,tapGroups:top(groups,14),tiny,tinyFirst,tinyGroups:top(tg,14),dom:document.getElementsByTagName('*').length};
};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const br=await chromium.launch();
 const res={};
 for(const [w,h] of [[375,812],[768,1024]]){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await ctx.route(u=>!u.href.startsWith('http://localhost'),r=>r.abort());
  for(const [key,file,act] of PAGES){
   if(only&&!only.includes(key))continue;
   const pg=await ctx.newPage();
   await pg.goto(B+file,{waitUntil:'load',timeout:120000}); await pg.waitForTimeout(1200);
   await pg.screenshot({path:path.join(out,`${key}-${w}-${label}.jpg`),type:'jpeg',quality:70});
   const m=await pg.evaluate(MEASURE);
   let a=null; if(act){try{a=await act(pg);}catch(e){a={error:String(e).slice(0,200)};}}
   res[`${key}@${w}`]={file,...m,action:a};
   console.log(key,w,JSON.stringify({hs:m.hscroll,sw:m.scrollWidth,tap:m.tapSmall,tapF:m.tapSmallFirst,tiny:m.tiny,tinyF:m.tinyFirst,act:a}));
   await pg.close();
  }
  await ctx.close();
 }
 fs.writeFileSync(path.join(out,`audit-${label}.json`),JSON.stringify(res,null,1));
 await br.close();
})();
