// 回答ありで結果ページを開いたときの CLS(CPU 6 倍遅延・JS 600ms 遅延)
const { chromium } = require('playwright');
(async()=>{const br=await chromium.launch();
for(const port of [8081,8080]){for(const w of [375,412]){const ctx=await br.newContext({viewport:{width:w,height:812},isMobile:true});await ctx.route(u=>!u.href.startsWith('http://localhost'),r=>r.abort());
 const pg=await ctx.newPage();const B=`http://localhost:${port}/wanko-affiliate-guide/`;
 await pg.goto(B+'first-stay-check-instagram.html');const ks=['count','heads','room','fee','manner'],v=['2','unknown','part','unknown','worry'];for(let i=0;i<5;i++)await pg.check(`input[name=${ks[i]}][value="${v[i]}"]`);
 await Promise.all([pg.waitForNavigation(),pg.click('.tdc-btn')]);
 await pg.addInitScript(()=>{window.__c=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__c+=e.value}).observe({type:'layout-shift',buffered:true});});
 const c=await ctx.newCDPSession(pg);await c.send('Emulation.setCPUThrottlingRate',{rate:6});await pg.route('**/*.js*',async r=>{await new Promise(z=>setTimeout(z,600));r.continue()});
 await pg.reload({waitUntil:'load'});await pg.waitForTimeout(2000);console.log(port===8081?'修正前':'修正後',w,(await pg.evaluate(()=>window.__c)).toFixed(3));await ctx.close();}}
await br.close();})();
