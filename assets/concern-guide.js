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
      {name:'旅行の持ち物をそろえたい',problem:'旅行準備',text:'移動、排泄、給水、休息の場面ごとに、手持ちの用品で足りるか確認しながら選びましょう。'}]},
    {name:'犬服・ウェアの困りごと',hint:'犬種・体格・サイズ・用途で探す',clothing:true,items:[
      {name:'サイズが合う服が見つからない',purpose:'all'},
      {name:'犬種・体型に合う服を探したい',purpose:'all'},
      {name:'かわいい普段着を探したい',purpose:'daily'},
      {name:'雨・泥はねを減らしたい',purpose:'rain'},
      {name:'寒い日の外出に必要か知りたい',purpose:'cold'},
      {name:'服を着せるメリット・注意点を知りたい',purpose:'all'}]}
  ];
  let chosen=null;
  const stage=root.querySelector('.cg-stage'), trail=root.querySelector('.cg-progress');
  function button(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',fn);return b;}
  function heading(step,title){stage.replaceChildren();trail.textContent=step;const h=document.createElement('h3');h.tabIndex=-1;h.textContent=title;stage.append(h);return h;}
  function scrollTo(el){if(!el)return;el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}
  function start(focus=false){const h=heading('1 / 3　テーマ → 困りごと → 選び方','どんな場面で困っていますか？');const grid=document.createElement('div');grid.className='cg-choices';groups.forEach(g=>{const b=button(g.name,()=>topics(g));const small=document.createElement('small');small.textContent=g.hint;b.append(small);grid.append(b);});stage.append(grid);if(focus)h.focus({preventScroll:true});}
  function topics(g){const h=heading(g.clothing?'2 / 4　困りごとを選ぶ':'2 / 3　困りごとを選ぶ',g.name);const grid=document.createElement('div');grid.className='cg-choices';g.items.forEach(item=>grid.append(button(item.name,()=>guide(g,item))));stage.append(grid,button('← テーマを選び直す',()=>start(true)));h.focus({preventScroll:true});}
  function fieldLabel(copy,control){const label=document.createElement('label');label.className='cg-dogwear-field';const title=document.createElement('span');title.textContent=copy;label.append(title,control);return label;}
  function selectControl(id,options,value){const select=document.createElement('select');select.id=id;options.forEach(([label,optionValue])=>{const option=document.createElement('option');option.textContent=label;option.value=optionValue;select.append(option);});select.value=value;return select;}
  function numberControl(id,placeholder){const input=document.createElement('input');input.id=id;input.type='number';input.min='0';input.step='0.5';input.inputMode='decimal';input.placeholder=placeholder;return input;}
  function clothingGuide(g,item){
    const h=heading('3 / 4　犬種・サイズ・用途を選ぶ',item.name);const intro=document.createElement('p');intro.textContent='犬種は体型を考える参考にします。犬種名やXS・Sなどの表記だけでサイズを決めず、商品ごとの公式サイズ表と実寸を照らし合わせてください。';stage.append(intro);
    const form=document.createElement('form');form.className='cg-dogwear-form';
    const breed=selectControl('cg-dogwear-breed',[['犬種を選択（任意）',''],...['柴犬','ダックスフンド','トイ・プードル','チワワ','フレンチ・ブルドッグ','ポメラニアン','コーギー','ヨークシャー・テリア','シー・ズー','ミニチュア・シュナウザー','ゴールデン・レトリーバー','ラブラドール・レトリーバー','ミックス・その他'].map(name=>[name,name])],'');
    const size=selectControl('cg-dogwear-size',[['実寸から自動照合','auto'],['サイズ指定なし',''],['26','26'],['30','30'],['34','34'],['38','38'],['42','42'],['46','46'],['50','50'],['55','55'],['60','60'],['65','65'],['70','70']],'auto');
    const purpose=selectControl('cg-dogwear-purpose',[
      ['すべての服候補','all'],['雨・泥はね対策','rain'],['寒い日の外出','cold'],['普段着・デザイン重視','daily'],['旅行・アウトドア','travel'],['暑い日のウェア','cooling']
    ],item.purpose||'all');
    form.append(fieldLabel('犬種（任意）',breed),fieldLabel('サイズ（モンベル表記・任意）',size),fieldLabel('探す用途',purpose));
    const measures=document.createElement('fieldset');measures.className='cg-dogwear-measures';const legend=document.createElement('legend');legend.textContent='実寸（任意・cm / kg）';measures.append(legend);
    const weight=numberControl('cg-dogwear-weight','例：5.2');weight.max='150';const neck=numberControl('cg-dogwear-neck','例：28');neck.max='150';const chest=numberControl('cg-dogwear-chest','例：42');chest.max='200';const back=numberControl('cg-dogwear-back','例：32');back.max='150';
    measures.append(fieldLabel('体重（kg）',weight),fieldLabel('首回り（cm）',neck),fieldLabel('胸囲（前脚の後ろ・cm）',chest),fieldLabel('背丈（首の付け根〜尾の付け根・cm）',back));form.append(measures);
    const note=document.createElement('p');note.className='cg-note';note.textContent='入力内容はこのページ内の候補表示にだけ使い、保存・送信しません。掲載中のモンベルウェアは公式表の26〜70表記を実寸で照合できます。XS・Sなど他ブランドの表記へ換算はしません。ほかのブランドは商品ごとの公式サイズ表をご確認ください。';form.append(note);
    const actions=document.createElement('div');actions.className='cg-actions';const submit=document.createElement('button');submit.type='submit';submit.textContent='条件に合う掲載候補を見る';actions.append(submit,button('← 困りごとを選び直す',()=>topics(g)));form.append(actions);stage.append(form);
    const evidence=document.createElement('section');evidence.className='cg-dogwear-evidence';const title=document.createElement('h4');title.textContent='犬に服を着せるメリットと注意点';evidence.append(title);
    const columns=document.createElement('div');columns.className='cg-dogwear-columns';
    const good=document.createElement('article');const goodTitle=document.createElement('h5');goodTitle.textContent='役立つことがある場面';const goodList=document.createElement('ul');['寒さに弱い犬や気温・被毛・年齢などの条件によっては、屋外で保温の助けになることがあります。','雨具は被毛や体の濡れ・泥はねを減らす目的で選べます。','暗い時間帯の外出では、反射材など安全機能が商品にあるか確認できます。'].forEach(text=>{const li=document.createElement('li');li.textContent=text;goodList.append(li);});good.append(goodTitle,goodList);
    const care=document.createElement('article');const careTitle=document.createElement('h5');careTitle.textContent='デメリット・気をつけること';const careList=document.createElement('ul');['暑くなりすぎる、擦れ・もつれ、動きや排泄の妨げになることがあります。','服を嫌がる・噛む・かく・床にこすりつける、歩き方が変わる、息が荒いなどがあれば外して、無理に着せ続けないでください。','服で犬同士のボディランゲージが見えにくくなる場合があります。慣らすときは短時間から目を離さずに。'].forEach(text=>{const li=document.createElement('li');li.textContent=text;careList.append(li);});care.append(careTitle,careList);columns.append(good,care);evidence.append(columns);
    const sources=document.createElement('p');sources.className='cg-dogwear-sources';sources.append(document.createTextNode('参考：'));
    [['PDSA（寒い日のコート・測り方）','https://www.pdsa.org.uk/what-we-do/blog/vet-qa-does-my-dog-need-to-wear-a-coat-on-winter-walks'],['PDSA（服の有用性と注意点）','https://www.pdsa.org.uk/what-we-do/blog/is-it-ok-to-dress-up-my-pet'],['VCA（犬用ジャケットの選び方）','https://vcahospitals.com/resources/lifestyle-dog/supplies/what-to-consider-when-choosing-a-dog-jacket'],['モンベル（犬用ウェア サイズ表・2025）','https://webshop.montbell.jp/catalog/pdf/dog2025.pdf']].forEach(([label,url],index)=>{if(index)sources.append(document.createTextNode(' ・ '));const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;sources.append(a);});const checked=document.createElement('small');checked.textContent='獣医療・動物福祉情報とメーカーサイズ表を確認：2026年9月24日。体調や皮膚の症状がある場合、術後服など医療目的の服は獣医師に相談してください。';evidence.append(sources,checked);stage.append(evidence);
    const output=document.createElement('section');output.className='cg-dogwear-results';output.setAttribute('aria-live','polite');stage.append(output);
    form.addEventListener('submit',event=>{event.preventDefault();showClothingCandidates({breed:breed.value,size:size.value,montbellSize:size.value,weight:weight.value,neck:neck.value,chest:chest.value,back:back.value,purpose:purpose.value,output});});h.focus({preventScroll:true});
  }
  function showClothingCandidates(selection){
    const {breed,size,montbellSize,weight,neck,chest,back,purpose,output}=selection;output.replaceChildren();const title=document.createElement('h4');title.textContent='選んだ条件';output.append(title);
    const summary=document.createElement('p');const dims=[neck&&`首 ${neck}cm`,chest&&`胸 ${chest}cm`,back&&`背丈 ${back}cm`].filter(Boolean).join('・');summary.textContent=[breed||'犬種未入力',size==='auto'?'サイズは実寸から照合':(size&&`モンベル表記 ${size}`),weight&&`体重 ${weight}kg`,dims,purposeLabel(purpose)].filter(Boolean).join(' / ');output.append(summary);
    const advice=document.createElement('p');advice.className='cg-note';advice.textContent=breedAdvice(breed)+' ここではブランド横断でサイズ適合を判定しません。購入前に各商品の公式サイズ表、対象サイズ、返品条件を確認してください。';output.append(advice);
    const result=clothingCards(purpose,{back,chest,montbellSize});const matches=result.items;const list=document.createElement('div');list.className='cg-dogwear-links';if(result.montbellRelevant&&result.montbellSizes.length){const sizeNote=document.createElement('p');sizeNote.className='cg-note';const dimensions=[back&&'背丈',chest&&'胸囲'].filter(Boolean).join('・');sizeNote.textContent=result.measurementProvided?`モンベルの基本ヌード寸法表で${dimensions}を照合した候補：${result.montbellSizes.join('・')}。首回り・体重はこの表で絞り込んでいません。`:`指定したモンベル掲載モデルのサイズ：${result.montbellSizes.join('・')}。実寸との適合は未照合です。`;output.append(sizeNote);}else if(result.montbellRelevant&&result.measurementProvided&&result.montbellChecked){const sizeNote=document.createElement('p');sizeNote.className='cg-note';sizeNote.textContent='入力した背丈・胸囲に合うモンベル掲載モデルのサイズは見つかりませんでした。採寸位置を確認し、別ブランドはそのメーカーの公式表でご確認ください。';output.append(sizeNote);}
    if(matches.length){const headingText=document.createElement('h4');headingText.textContent='用途に近い掲載候補';list.append(headingText);matches.forEach((entry,index)=>{const card=entry.card;if(!card.id)card.id=`cg-dogwear-item-${index+1}`;const a=document.createElement('a');a.href=`#${card.id}`;a.textContent=`${card.querySelector('h2')?.textContent.trim()||'掲載候補'} — ${entry.sizeNote}`;a.addEventListener('click',()=>{document.querySelector('#ff-reset')?.click();const brand=document.querySelector('#food-brand');if(brand)brand.value='';document.querySelector('button[data-problem="all"]')?.click();});list.append(a);});
      const jump=button('候補カードを表示',()=>{document.querySelector('#ff-reset')?.click();const brand=document.querySelector('#food-brand');if(brand)brand.value='';document.querySelector('button[data-problem="all"]')?.click();scrollTo(matches[0].card);});jump.className='cg-dogwear-jump';list.append(jump);
    }else{const empty=document.createElement('p');empty.textContent='この用途の確認済み服候補は現在掲載されていません。犬種・サイズの条件は残るので、公式サイズ表を見るときの比較メモとして使ってください。';list.append(empty);}
    output.append(list);trail.textContent='4 / 4　掲載候補を比較';scrollTo(output);
  }
  function purposeLabel(value){return ({all:'全用途',rain:'雨・泥はね',cold:'寒い日の外出',daily:'普段着・デザイン',travel:'旅行・アウトドア',cooling:'暑い日のウェア'})[value]||'全用途';}
  function breedAdvice(breed){if(/ダックス|dachshund/i.test(breed))return '胴長の体型では背丈と胸囲の両方を確認しましょう。';if(/フレンチ|ブルドッグ|bulldog/i.test(breed))return '胸囲・首回りに加え、前脚まわりが動きを妨げないか確認しましょう。';return '犬種だけでは体格差を判定できないため、首回り・胸囲・背丈を実測して商品ごとに比べましょう。';}
  function clothingCards(purpose,selection){const clothing=/(犬服|ドッグウェア|ウェア|レイン|雨と泥|雨の日|ベスト|コート|ポンチョ|ジャケット|スーツ|防寒|フリース|クーリング|冷却|ライフジャケット)/i;const ranges=[['26',24,28,33,38],['30',28,32,38,43],['34',32,36,43,48],['38',36,40,48,53],['42',40,44,53,58],['46',44,48,58,63],['50',48,53,63,69],['55',53,58,69,75],['60',58,63,75,81],['65',63,68,81,87],['70',68,73,87,93]];const back=Number(selection.back),chest=Number(selection.chest),hasBack=!!selection.back,hasChest=!!selection.chest,measurementProvided=hasBack||hasChest,montbellChecked=measurementProvided||(/^\d+$/.test(selection.montbellSize||''));let sizes=ranges.filter(([size,minBack,maxBack,minChest,maxChest])=>(!hasBack||(back>=minBack&&back<=maxBack))&&(!hasChest||(chest>=minChest&&chest<=maxChest)));if(/^\d+$/.test(selection.montbellSize||''))sizes=sizes.filter(([size])=>size===selection.montbellSize);const montbellSizes=montbellChecked?sizes.map(row=>row[0]):[];const items=[...document.querySelectorAll('.grid article.card')].flatMap(card=>{const category=card.querySelector('.category')?.textContent||'';const title=card.querySelector('h2')?.textContent||'';const text=`${title} ${card.dataset.search||''} ${card.textContent||''}`;if(!/(雨・汚れ|足汚れ・雨|暑さ・寒さ|暑さ・水分|水辺・安全)/.test(category)||!clothing.test(text))return[];let useMatch=false;switch(purpose){case'rain':useMatch=/(レイン|雨と泥|雨の日|モンスーン)/i.test(text);break;case'cold':useMatch=/(防寒|寒さ|冬|フリース|クリマプラス|ドッグベスト)/i.test(text)&&!/(クーリング|冷却)/i.test(text);break;case'daily':useMatch=/(普段着|ドッグシャツ|洋服|タンクトップ|ワンピース|Tシャツ)/i.test(text)&&!/(レイン|雨|防水|撥水|カッパ|冷却|クーリング|防寒|フリース)/i.test(text);break;case'cooling':useMatch=/(冷却|クーリング|濡らして着る)/i.test(text);break;case'travel':useMatch=clothing.test(text);break;default:useMatch=clothing.test(text);}if(!useMatch)return[];const isMontbell=/モンベル/.test(text);const smallOnlyUnavailable=isMontbell&&/Small/i.test(title)&&montbellChecked&&montbellSizes.length&&!montbellSizes.some(size=>Number(size)<=46);if(smallOnlyUnavailable)return[];const montbellSizeModel=isMontbell&&/(ドッグ クーリングベスト Small|ドッグ レインスーツ Small|ドッグ レインポンチョ Small|クリマプラス100 ドッグベスト Small)/i.test(title);if(montbellSizeModel&&montbellChecked&&!montbellSizes.length)return[];const sizeNote=montbellSizeModel?(montbellChecked?`モンベル表 ${montbellSizes.join('・')||selection.montbellSize}`:'モンベル表で要確認'):'メーカー表で要確認';return[{card,sizeNote,montbellSizeModel}];});return{items,montbellSizes,measurementProvided,montbellChecked,montbellRelevant:true};}
  function guide(g,item){if(g.clothing){chosen=item;clothingGuide(g,item);return;}chosen=item;const h=heading('3 / 3　選び方を確認して候補へ',item.name);const p=document.createElement('p');p.textContent=item.text;stage.append(p);
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
  const directTopic = new URLSearchParams(location.search).get("topic"); const dogwearGroup = groups.find(group => group.clothing); if (directTopic === "dogwear" && dogwearGroup?.items?.length) { guide(dogwearGroup, dogwearGroup.items[0]); requestAnimationFrame(() => scrollTo(root)); } else start();
})();
