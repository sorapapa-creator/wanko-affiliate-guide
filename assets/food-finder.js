/* Offline, evidence-based AND filtering. No account or network access. */
let wankoFoodState = {};
let wankoFoodControls = [];
let wankoFoodSort = 'default';
let wankoFoodReady = false;
const wankoFoodFacts = typeof window === 'undefined' ? {} : (window.WANKO_FOOD_FACTS || {});
function wankoFoodRecord(card) {
  const link=card.querySelector('a[data-product]');
  return link ? wankoFoodFacts[link.dataset.product] : undefined;
}
function wankoFoodMatches(p,s) {
  if(!Object.values(s).some(v=>v!=='' && v!=null))return true;
  if(!p)return false;
  if(s.additives && !(s.additives==='いずれかの不使用表示あり' ? (p.additives||[]).length>0 : (p.additives||[]).includes(s.additives)))return false;
  for(const key of ['age','ingredients','texture','concern']) {
    if(s[key] && !(p[key]||[]).includes(s[key]))return false;
  }
  for(const key of ['form','grain'])if(s[key] && p[key]!==s[key])return false;
  if(s.years!==undefined && s.years!==''){
    const months=Number(s.years)*12;
    if(!Number.isFinite(months)||months<0||months>360||!p.age_range)return false;
    if(months<p.age_range[0]||(p.age_range[1]!==null&&months>=p.age_range[1]))return false;
  }
  if(s.breed && !(s.breed==='全犬種' ? p.all_breeds : p.all_breeds || p.breed.includes(s.breed)))return false;
  if(s.weight) {
    const w=Number(s.weight);
    if(!Number.isFinite(w)||w<=0||w>150)return false;
    if(!p.weight.some(([lo,hi])=>w>=lo && (hi===null||w<=hi)))return false;
    if(p.limited_puppy && w>31 && (!s.age||s.age==='子犬'||s.age==='全年齢'))return false;
  }
  if(s.budget && (!(p.price>0)||p.price>Number(s.budget)||Number(s.budget)<=0))return false;
  return true;
}
function wankoFoodMatch(card){
  if(!wankoFoodReady)return true;
  return wankoFoodMatches(wankoFoodRecord(card),wankoFoodState);
}
function wankoFoodPriceCompare(a,b,direction=1){
  const ap=a && a.price>0?a.price:null,bp=b && b.price>0?b.price:null;
  if(ap===null)return bp===null?0:1;
  if(bp===null)return -1;
  return direction*(ap-bp);
}
function wankoFoodCost(price,grams,daily,meals=2){
  if(![price,grams,daily].every(x=>Number.isFinite(x)&&x>0))return null;
  if(!Number.isInteger(meals)||meals<1||meals>12)return null;
  return {meal:price/grams*daily/meals,day:price/grams*daily,month:price/grams*daily*30,days:grams/daily};
}
function wankoFoodAfterRender(cards,shown,active){
  if(!wankoFoodReady)return;
  const panel=document.querySelector('#food-finder');
  panel.classList.toggle('ff-engaged',active==='毎日の主食');
  const status=document.querySelector('#ff-status');
  const has=Object.values(wankoFoodState).some(Boolean);
  status.textContent=active==='毎日の主食'||has
    ? (shown?`${shown}件が見つかりました。対象年齢・容量・原材料も商品欄で比べてください。`:'一致する商品がありません。条件を1つずつ外すか、リセットして探し直せます。')
    : '条件を選ぶと、毎日の主食に切り替わります。';
  const chips=document.querySelector('#ff-selected');chips.replaceChildren();
  wankoFoodControls.forEach(el=>{
    if(!el.value)return;
    const b=document.createElement('button');b.type='button';
    const title=el.closest('label').querySelector('span').textContent;
    b.textContent=`${title}：${el.value} ×`;
    b.setAttribute('aria-label',`${title}の条件を外す`);
    b.addEventListener('click',()=>{el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});chips.append(b);
  });
  const sorted=[...cards];
  if(active==='毎日の主食' && wankoFoodSort!=='default')sorted.sort((a,b)=>wankoFoodPriceCompare(wankoFoodRecord(a),wankoFoodRecord(b),wankoFoodSort==='price'?1:-1));
  // Move the actual nodes: keyboard and screen-reader order matches visual order.
  const parent=cards[0] && cards[0].parentElement;
  if(parent)sorted.forEach(c=>parent.append(c));
  cards.forEach(c=>{
    const p=wankoFoodRecord(c);if(!p)return;
    let info=c.querySelector('.ff-card-info');
    if(!info){info=document.createElement('div');info.className='ff-card-info';c.querySelector('.card-body').append(info);}
    info.hidden=active!=='毎日の主食'&&!has;
    if(info.childNodes.length)return;
    const title=document.createElement('strong');title.textContent='ごはんの選び方メモ';info.append(title);
    const lines=[['対象',p.target||'商品表示で確認'],['形状・粒', [p.form,p.grain,...p.texture].filter(Boolean).join(' / ')||'商品表示で確認'],['原材料（抜粋）',p.ingredient_text||'全原材料は公式の商品情報で確認'],['価格確認日',p.price_date||'価格は販売先で確認']];
    lines.forEach(([label,value])=>{const line=document.createElement('p');line.textContent=`${label}：${value}`;info.append(line);});
    const additiveLine=document.createElement('p');
    additiveLine.textContent='無添加・不使用：'+((p.additives||[]).length?p.additives.join(' / '):'不使用の対象は商品表示で確認');
    info.append(additiveLine);
    if(p.additive_evidence && p.additive_evidence.source){
      const note=document.createElement('p');note.textContent=p.additive_evidence.note;info.append(note);
      const evidence=document.createElement('a');evidence.href=p.additive_evidence.source;evidence.textContent=`不使用表示の公式根拠（${p.additive_evidence.checked}確認）`;evidence.target='_blank';evidence.rel='noopener noreferrer';info.append(evidence);
    }
    if(p.source){const note=document.createElement('small');note.textContent=`用途・原材料の確認：${p.checked||'既存の商品情報'}。根拠はカード内の公式・正規取扱情報をご覧ください。`;info.append(note);}
  });
}
function wankoFoodInit(onChange,onReset){
  if(!document.querySelector('#food-finder'))return;
  wankoFoodReady=true;
  wankoFoodControls=[...document.querySelectorAll('[data-food-filter]')];
  // Catalogue-wide counts make sparse/unknown traits visible before choosing them.
  wankoFoodControls.filter(el=>el.tagName==='SELECT').forEach(el=>{
    [...el.options].filter(o=>o.value).forEach(o=>{
      const total=Object.values(wankoFoodFacts).filter(p=>wankoFoodMatches(p,{[el.dataset.foodFilter]:o.value})).length;
      o.textContent+=`（${total}件）`;o.disabled=total===0;
    });
  });
  const update=()=>{wankoFoodState=Object.fromEntries(wankoFoodControls.map(el=>[el.dataset.foodFilter,el.value]));onChange();};
  wankoFoodControls.forEach(el=>el.addEventListener('input',update));
  document.querySelector('#ff-sort').addEventListener('change',e=>{wankoFoodSort=e.target.value;onChange();});
  document.querySelector('#ff-reset').addEventListener('click',()=>{
    wankoFoodControls.forEach(el=>el.value='');wankoFoodState={};wankoFoodSort='default';document.querySelector('#ff-sort').value='default';onReset();
  });
  // Choosing another product problem must not leave invisible food-only constraints.
  document.querySelectorAll('button[data-problem]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.problem!=='毎日の主食'){
      wankoFoodControls.forEach(el=>el.value='');wankoFoodState={};wankoFoodSort='default';document.querySelector('#ff-sort').value='default';render();
    }
  }));
  ['price','grams','daily','meals'].forEach(key=>document.querySelector('#ff-calc-'+key).addEventListener('input',()=>{
    const values=['price','grams','daily','meals'].map(k=>Number(document.querySelector('#ff-calc-'+k).value));
    const result=wankoFoodCost(...values),out=document.querySelector('#ff-cost-result');
    out.textContent=result?`1食あたり 約${result.meal.toLocaleString('ja-JP',{maximumFractionDigits:1})}円 ／ 1日 約${result.day.toLocaleString('ja-JP',{maximumFractionDigits:1})}円 ／ 月あたり（30日分）約${Math.round(result.month).toLocaleString()}円 ／ 約${result.days.toFixed(1)}日分`:'価格・内容量・1日量は0より大きい数値、食事回数は1〜12の整数を入力してください。';
  }));
}
