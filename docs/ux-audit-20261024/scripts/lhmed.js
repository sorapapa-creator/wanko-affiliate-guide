const fs=require('fs'),S=process.argv[2];
const pages=['index','dog-lodging-guide','east-japan-dog-trips','food','goods','wear','travel-gear','first-stay-check-instagram','first-stay-check-result','travel-prep-5-instagram'];
const med=a=>{a=[...a].sort((x,y)=>x-y);return a[1]};
const get=(lab,p)=>[1,2,3].map(i=>{const j=JSON.parse(fs.readFileSync(`${S}/lh-${lab}${i}/${p}.json`));const v=k=>j.audits[k].numericValue;return {perf:j.categories.performance.score*100,lcp:v('largest-contentful-paint'),tbt:v('total-blocking-time'),cls:v('cumulative-layout-shift'),kb:v('total-byte-weight')/1024,dom:v('dom-size'),err:j.runtimeError}});
const out={};
console.log('| ページ | 性能スコア 前→後 | LCP(秒) 前→後 | TBT(ms) 前→後 | CLS 前→後 | 転送量(KB) 前→後 | DOM 要素数 前→後 |');console.log('|---|---|---|---|---|---|---|');
for(const p of pages){const b=get('before',p),a=get('after',p);const m=(r,k)=>med(r.map(x=>x[k]));
 out[p]={b:Object.fromEntries(['perf','lcp','tbt','cls','kb','dom'].map(k=>[k,m(b,k)])),a:Object.fromEntries(['perf','lcp','tbt','cls','kb','dom'].map(k=>[k,m(a,k)])),raw:{b:b.map(x=>[Math.round(x.lcp),Math.round(x.tbt),x.cls.toFixed(3)]),a:a.map(x=>[Math.round(x.lcp),Math.round(x.tbt),x.cls.toFixed(3)])}};
 const B=out[p].b,A=out[p].a;
 console.log(`| ${p}.html | ${Math.round(B.perf)}→${Math.round(A.perf)} | ${(B.lcp/1000).toFixed(1)}→${(A.lcp/1000).toFixed(1)} | ${Math.round(B.tbt)}→${Math.round(A.tbt)} | ${B.cls.toFixed(3)}→${A.cls.toFixed(3)} | ${Math.round(B.kb)}→${Math.round(A.kb)} | ${B.dom}→${A.dom} |`);}
for(const p of pages)console.log(p,JSON.stringify(out[p].raw));
