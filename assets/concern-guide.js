/* Guided selection reuses verified catalogue filters; no network or diagnosis. */
(() => {
  const root=document.querySelector('#concern-guide');
  if(!root)return;
  const groups=[
    {name:'食・毎日のごはん',hint:'食べムラ、原材料、食感、費用',items:[
      {name:'毎日の主食を選びたい',problem:'毎日の主食',text:'まず主食としての用途と対象年齢を確認。原材料、粒・食感、続けやすい費用の順に比べましょう。',food:true},
      {name:'食べムラが気になる',problem:'毎日の主食',text:'主食とトッピング・おやつを分けて確認。形状や食感、原材料、対象年齢を比べられます。食べムラ向け表示のある候補に絞ります。',food:true,filter:['concern','食べムラ']},
      {name:'体重に配慮して選びたい',problem:'毎日の主食',text:'体重管理の表示、対象年齢、給与量を確認。袋の価格だけでなく、1日の量から費用も比べましょう。',food:true,filter:['concern','体重管理']},
      {name:'原材料・無添加にこだわりたい',problem:'毎日の主食',text:'「何が不使用か」を確認して選びましょう。原材料欄は含まれる食材の検索で、アレルゲン除外の判定ではありません。',food:true,focus:'ff-additives'},
      {name:'粒・硬さ・ペーストで選びたい',problem:'毎日の主食',text:'粒の大きさと食感は別々に確認。ドライ、ウェット、ペースト・ムースなど、公式表示がある条件で絞り込めます。',food:true,focus:'ff-texture'},
      {name:'毎日の費用から考えたい',problem:'毎日の主食',text:'購入価格の上限と、1食・30日分の費用は別の指標です。容量と公式給与表の1日量をそろえて比較しましょう。',food:true,focus:'ff-cost'},
      {name:'早食いが気になる',problem:'早食い',text:'食器・給餌用品のサイズ、使えるフード、洗いやすさを比べましょう。商品ごとの注意事項も確認できます。'},
      {name:'おやつ・ごほうびを選びたい',problem:'しつけ・ごほうび',text:'主食とは分けて、原材料、サイズ、与え方と量を確認。持ち歩きやすさなど使う場面も比べましょう。'}]},
    {name:'散歩・おうちの困りごと',hint:'排泄、汚れ、暑さ、安全',items:[
      {name:'臭い・排泄',problem:'臭い・排泄',text:'袋、シート、トイレ用品など、必要な用途から比較。容量、サイズ、交換や処理のしやすさを確認しましょう。'},
      {name:'雨・泥汚れ',problem:'雨・泥汚れ',text:'犬のサイズと使用場所に合わせて比較。洗い方、乾かしやすさ、素材の注意点を確認しましょう。'},
      {name:'散歩後のお手入れ',problem:'散歩後ケア',text:'足・体など使える部位、素材、使用方法を商品欄で確認しましょう。'},
      {name:'暑い日の準備',problem:'暑さ対策',text:'使用場面、サイズ、冷却方法や使用上の注意を比較する候補です。'},
      {name:'安全・迷子への備え',problem:'安全・迷子',text:'適合サイズ、装着方法、使用場所を確認。今使っている用品との組み合わせも比べましょう。'}]},
    {name:'旅行・車移動の準備',hint:'移動、給水、宿での過ごし方',items:[
      {name:'車での移動',problem:'車移動',text:'車内寸法と犬の体格、固定方法、清掃のしやすさを確認して選びましょう。'},
      {name:'外出中の水分補給',problem:'水分補給',text:'容量、持ち運びやすさ、洗いやすさ、飲み口の形を比べましょう。'},
      {name:'宿で落ち着ける準備',problem:'宿で落ち着く',text:'宿にある設備と持参するものを分け、ケージ・マットなどのサイズや使い方を確認しましょう。'},
      {name:'旅行の持ち物をそろえたい',problem:'旅行準備',text:'移動、排泄、給水、休息の場面ごとに、手持ちの用品で足りるか確認しながら選びましょう。'}]}
  ];
  let chosen=null;
  const stage=root.querySelector('.cg-stage'), trail=root.querySelector('.cg-progress');
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);return b;}
  function heading(step,title){stage.replaceChildren();trail.textContent=step;const h=document.createElement('h3');h.tabIndex=-1;h.textContent=title;stage.append(h);return h;}
  function scrollTo(el){if(!el)return;el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  function start(focus=false){const h=heading('1 / 3　テーマ → 困りごと → 選び方','どんな場面で困っていますか？');const grid=document.createElement('div');grid.className='cg-choices';groups.forEach(g=>{const b=button(g.name,()=>topics(g));const small=document.createElement('small');small.textContent=g.hint;b.append(small);grid.append(b);});stage.append(grid);if(focus)h.focus({preventScroll:true});}
  function topics(g){const h=heading('2 / 3　困りごとを選ぶ',g.name);const grid=document.createElement('div');grid.className='cg-choices';g.items.forEach(item=>grid.append(button(item.name,()=>guide(g,item))));stage.append(grid,button('← テーマを選び直す',()=>start(true)));h.focus({preventScroll:true});}
  function guide(g,item){chosen=item;const h=heading('3 / 3　選び方を確認して候補へ',item.name);const p=document.createElement('p');p.textContent=item.text;stage.append(p);
    if(item.food){const note=document.createElement('p');note.className='cg-note';note.textContent='主食候補の比較です。おやつ・トッピングは主食と分けて選びます。治療中の食事や体調に不安がある場合は獣医師に相談してください。';stage.append(note);}
    const actions=document.createElement('div');actions.className='cg-actions';
    if(item.food)actions.append(button('こだわり・詳細条件を選ぶ',()=>apply(true)));
    actions.append(button(item.food?'この条件の商品候補を見る':'困りごとに合う商品候補を見る',()=>apply(false)));
    stage.append(actions,button('← 困りごとを選び直す',()=>topics(g)));h.focus({preventScroll:true});
  }
  function apply(details){
    const item=chosen;if(!item)return;
    const target=[...document.querySelectorAll('button[data-problem]')].find(b=>b.dataset.problem===item.problem);if(!target)return;
    // Clear previous food, brand and text constraints before starting a new route.
    document.querySelector('#ff-reset')?.click();
    const brand=document.querySelector('#food-brand');if(brand)brand.value='';
    target.click();
    if(item.filter){const field=document.querySelector(`[data-food-filter="${item.filter[0]}"]`);if(field&&[...field.options].some(o=>o.value===item.filter[1]&&!o.disabled)){field.value=item.filter[1];field.dispatchEvent(new Event('input',{bubbles:true}));}}
    root.querySelector('.cg-selection').textContent=`選択中：${item.name}。条件は下の絞り込みで変更できます。`;
    if(details){const panel=document.querySelector('#food-finder');panel.querySelector('details').open=true;const dest=document.getElementById(item.focus)||panel;if(dest.tagName==='DETAILS')dest.open=true;scrollTo(dest);if(dest.matches('select,input'))dest.focus({preventScroll:true});}
    else {const result=document.querySelector('.result-count');scrollTo(result);result.tabIndex=-1;result.focus({preventScroll:true});}
  }
  const results=document.querySelector('.result-count');
  const foodPanel=document.querySelector('#food-finder');
  if(foodPanel&&results){const next=button('選んだ条件の商品候補を見る',()=>{scrollTo(results);results.tabIndex=-1;results.focus({preventScroll:true});});next.className='cg-food-next';foodPanel.append(next);}
  if(results){const links=document.createElement('div');links.className='cg-result-actions';const refine=button('主食の詳細条件を見直す',()=>scrollTo(document.querySelector('#food-finder')));const back=button('困りごとから選び直す',()=>{start(true);scrollTo(root);});links.append(refine,back);results.after(links);const refresh=()=>{refine.hidden=!document.querySelector('button[data-problem="毎日の主食"].active');};new MutationObserver(refresh).observe(results,{childList:true});refresh();}
  start();
})();
