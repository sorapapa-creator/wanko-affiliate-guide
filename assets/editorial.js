// Presentation enhancements; existing product filtering and affiliate URLs stay intact.
document.querySelectorAll('button[data-problem]').forEach(button=>{
 const update=()=>document.querySelectorAll('button[data-problem]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));
 button.addEventListener('click',update);update();
});
const stays=[...document.querySelectorAll('.stay-card')];
if(stays.length){
 const bar=document.createElement('div');bar.className='stay-search';
 bar.innerHTML='<label for="stay-query">宿・地域・条件で探す</label><input id="stay-query" type="search" placeholder="例：千葉、クレート、ドッグラン"><output aria-live="polite"></output>';
 stays[0].before(bar);const input=bar.querySelector('input'),count=bar.querySelector('output');
 const filter=()=>{let n=0;stays.forEach(card=>{card.hidden=!card.textContent.toLowerCase().includes(input.value.trim().toLowerCase());if(!card.hidden)n++});count.textContent=n+'宿を表示'};
 input.addEventListener('input',filter);filter();
 stays.forEach(card=>{
  const head=card.querySelector('.stay-head');if(!head)return;
  const details=document.createElement('details');details.className='stay-details';
  const summary=document.createElement('summary');
  summary.innerHTML='<span class="stay-toggle-copy"><strong class="stay-toggle-label">宿の設備・宿泊条件を見る</strong><small>添い寝・ケージ・犬用アメニティなど</small></span><span class="stay-toggle-symbol" aria-hidden="true">＋</span>';
  details.append(summary);while(head.nextSibling)details.append(head.nextSibling);card.append(details);
  details.addEventListener('toggle',()=>{
   summary.querySelector('.stay-toggle-label').textContent=details.open?'宿の詳細を閉じる':'宿の設備・宿泊条件を見る';
   summary.querySelector('.stay-toggle-symbol').textContent=details.open?'−':'＋';
  });
 });
}
