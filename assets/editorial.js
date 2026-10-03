// Presentation enhancements; existing product filtering and affiliate URLs stay intact.
document.querySelectorAll('button[data-problem]').forEach(button=>{
 const update=()=>document.querySelectorAll('button[data-problem]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))));
 button.addEventListener('click',update);update();
});
const stays=[...document.querySelectorAll('.stay-card')];
if(stays.length){
 /* design-20261004: 文字検索+犬の条件チップ+並べ替え。判定はカード内の文章(answer-grid)と data-sleep / data-cage だけを使う
    design-pass-2: 各条件を 可(yes) / 条件付き(cond) / 不可(no) / 未確認(unk) で判定し、チップは 可+条件付き を数える */
 const secText=(card,re)=>[...card.querySelectorAll('.answer-grid section')].filter(s=>re.test((s.querySelector('b')||{}).textContent||'')).map(s=>(s.querySelector('p')||{}).textContent||'').join(' ');
 const UNK=/^[(（]?(予約前確認|未確認|不明|公式に記載なし|記載なし)/;const bare=t=>!t.trim()||/^[(（]?(予約前確認|未確認|不明|(公式に)?記載なし)[)）。]?$/.test(t.trim());
 const CHIPS=[
  ['large','大型犬OK','大型犬',c=>{const t=secText(c,/対象犬|頭数/);if(bare(t))return'unk';
   if(/大型犬?[^。]{0,10}(不可|できません|NG|お断り|ご遠慮|除く)|小型犬のみ|小型犬に限|中型犬まで|中型犬以下|小型・中型犬まで/.test(t))return'no';
   if(/大型|(大きさ|サイズ|犬種|体重)[^。]{0,10}(制限なし|制限はありません|問わ|不問)/.test(t))return /大型犬?[^。]{0,15}(要相談|相談|要確認|一部|限定|のみ|専用|特定|指定|対応(の)?(客室|部屋|棟))|一部(の)?客室(タイプ)?を除/.test(t)?'cond':'yes';
   if(/\d+\s*(kg|ｋｇ|キロ)\s*(以下|未満|まで)/.test(t))return'no';return'unk'}],
  ['multi','多頭OK','多頭',c=>{const t=secText(c,/対象犬|頭数|料金/);if(bare(t))return'unk';
   if(/(^|[^0-9０-９,，.])([2-9２-９]|[1-9][0-9])\s*(頭|匹)|複数頭|多頭|頭数[^。]{0,8}(制限なし|無制限|問わ)/.test(t))return /要相談|相談|要確認|組み合わせ|事前(に)?(連絡|申告|確認|相談)|サイズによ|(^|[^0-9０-９])[1１]\s*(頭|匹)\s*まで/.test(t)?'cond':'yes';
   if(/(^|[^0-9０-９])[1１]\s*(頭|匹)\s*(のみ|まで|限り|限定)|1室1頭/.test(t))return'no';return'unk'}],
  ['sleep','添い寝可','添い寝',c=>{const s=(c.dataset.sleep||'').trim();if(s==='可')return'yes';if(/^(可|条件付き)|は可|相談/.test(s))return'cond';if(/^不可/.test(s))return'no';return'unk'}],
  ['cage','ケージ貸出','ケージ',c=>{const t=((c.dataset.cage||'')+' '+secText(c,/ケージ/)).trim();if(!t.replace(/[(（]?予約前確認[)）。]?/g,'').trim())return'unk';
   if(/(ケージ|クレート|サークル|ゲージ)[^。]{0,10}の有無|(ケージ|クレート|サークル)[^。]{0,8}(は)?未確認/.test(t))return'unk';
   if(/(ケージ|クレート|サークル)[^。]{0,4}の?(案内|記載)(は)?なし/.test(t))return'no';
   if(/用意なし|ご?用意(は|が)?(ございません|ありません|していません)|貸(し)?出(し)?(は)?(なし|ありません|していません)|ケージ(の)?(貸出|用意)?なし(?!で)|^なし|^持参/.test(t))return'no';
   if(/(ケージ|クレート|サークル|ゲージ)[^。]{0,25}(あり|貸出|貸し出|用意|備付|備え付|常備|常設|完備|設置)|(貸出|貸し出し|用意|備え付け|常備)[^。]{0,10}(ケージ|クレート|サークル)|^あり|客室に(ケージ|クレート|サークル)|^(フロント)?(貸出|貸し出し|用意|備え?付け?|常備|常設)(あり|可)|^備え?付け?/.test(t))return /台数限定|数に限り|限りがあ|事前(の)?(予約|申込|申し込み|連絡)|要予約|予約制|予約推奨|有料|一部|のみ|サイズ(は|を)?(確認|指定)|要問い?合わ?せ|要確認/.test(t)?'cond':'yes';return'unk'}],
  ['run','ドッグラン','ドッグラン',c=>{const t=secText(c,/ドッグラン/).trim();
   if(!t)return /(ドッグラン|ラン)(あり|付|併設|完備)|専用ドッグラン|プライベートドッグラン/.test(secText(c,/./))?'yes':'unk';
   if(UNK.test(t)||/記載なし/.test(t)||(/有無/.test(t)&&!/あり/.test(t)))return'unk';
   if(/^[(（]?(なし|無し)|ではございません|ではありません|近隣|周辺の|近くの/.test(t))return'no';
   return /有料|予約制|要予約|貸切|貸し切り|時間制|利用時間|一部の?客室|客室のみ|付き客室|条件|証明|小型犬(のみ|専用)|冬季|季節|休止|天候/.test(t)?'cond':'yes'}],
  ['meal','食事同伴','食事同伴',c=>{const t=secText(c,/食事/).trim();if(!t||UNK.test(t))return'unk';
   if(/^[(（]?(不可|なし|×)/.test(t))return'no';
   if(/一緒|同伴(可|OK|でき(る|ます))|同席|客室食|部屋食|個室|テラス|ダイニング[^。]{0,8}(可|一緒|同伴)|^可|^条件付き|レストラン[^。]{0,12}(同伴可|一緒|OK)|レストラン(への)?同伴(?!不可|はでき)/.test(t))return /^条件付き|一部|のみ|限定|個室|テラス|ケージ|キャリー|カート|抱っこ|マナー|小型犬|事前|要予約|予約制|リード|不可/.test(t)?'cond':'yes';return'unk'}],
  ['free','犬料金無料','犬料金無料',c=>{const raw=secText(c,/料金/).trim();if(bare(raw))return'unk';const t=raw.replace(/含(む|まれる)か(要)?確認|(ドッグラン|ラン|駐車場|アメニティ|貸出|ケージ|足洗い)[^。、]{0,6}無料|(介護|介助|盲導|補助)犬[^。、）)]{0,8}無料|含まれず|含まれません|(ドッグ)?ラン(利用)?料金込み/g,'');
   if(/無料|(^|[^0-9,])0円|追加料金(は)?(なし|ございません|ありません|不要)|料金に含|に含まれ|かかりません|(料金|代金|パッケージ|プラン)(に)?(含む|込み)/.test(t)&&!/無料ではありません/.test(t))return UNK.test(t)||/公式(サイト|予約|HP|ホームページ)|プラン|[1１一]頭(目)?(まで|のみ)?[^。]{0,4}無料|頭目|以降|条件|限定|会員|期間|キャンペーン|小型犬[^。]{0,6}無料|連泊|経由|予約サイト/.test(t)?'cond':'yes';
   return /\d[\d,]*\s*円/.test(t)?'no':'unk'}]
 ];
 const STATE_LABEL={yes:'可',cond:'条件付き',unk:'未確認'};const NO_LABEL={large:'不可',multi:'1頭まで',sleep:'不可',cage:'なし',run:'なし',meal:'不可',free:'有料'};
 const stateText=(k,v)=>v==='no'?NO_LABEL[k]:STATE_LABEL[v];
 const PREFS=['東京都','神奈川県','千葉県','埼玉県','茨城県','栃木県','群馬県','山梨県','長野県','新潟県','静岡県','福島県','宮城県','山形県'];
 const main=stays[0].closest('main')||document.body;
 const info=stays.map((card,i)=>{const area=((card.querySelector('.stay-head p')||{}).textContent||'').trim();const pref=(area.match(/^(東京都|北海道|(?:京都|大阪)府|[^\s・（(]{2,3}?県)/)||[])[1]||'';const st={};CHIPS.forEach(([k,,,fn])=>{try{st[k]=fn(card)}catch(e){st[k]='unk'}});
  const x={card,i,pref,area,rank:PREFS.indexOf(pref)<0?99:PREFS.indexOf(pref),st,_t:null};Object.defineProperty(x,'text',{get(){return this._t??(this._t=this.card.textContent.toLowerCase())}});return x});
 /* カードごとの条件表示(可・条件付き・不可・未確認)と「比べる」 */
 info.forEach(x=>{const head=x.card.querySelector('.stay-head');if(!head)return;const row=document.createElement('div');row.className='stay-conds-row';
  row.innerHTML='<ul class="stay-conds" aria-label="犬の条件(掲載内容から判定)">'+CHIPS.map(([k,,short])=>'<li class="st-'+x.st[k]+'" data-k="'+k+'">'+short+' <b>'+stateText(k,x.st[k])+'</b></li>').join('')+'</ul><label class="stay-compare"><input type="checkbox" data-compare="'+x.card.id+'"> 比べる</label>';
  head.after(row)});
 const bar=document.createElement('div');bar.className='stay-search';bar.setAttribute('role','search');bar.setAttribute('aria-label','宿を探す');
 bar.innerHTML='<div class="stay-search-row"><label for="stay-query">宿・地域で探す</label><input id="stay-query" type="search" placeholder="例：那須、伊豆、温泉" autocomplete="off"><output id="stay-count" aria-live="polite"></output><span class="stay-sort"><label for="stay-sort">並び順</label><select id="stay-sort"><option value="rec">おすすめ順</option><option value="pref">地域順</option></select></span></div>'
  +'<div class="stay-chips" role="group" aria-label="犬の条件で絞り込む">'+CHIPS.map(([k,l])=>'<button type="button" class="stay-chip" data-chip="'+k+'" aria-pressed="false">'+l+'<span class="chip-n" aria-hidden="true"></span></button>').join('')+'<button type="button" class="stay-reset" hidden>条件をクリア</button></div>';
 const note=document.createElement('p');note.className='stay-chip-note';note.textContent='条件は各宿の掲載内容から判定しています(「可」と「条件付き」を該当として数えます。「未確認」は掲載内容で確かめられないもの)。予約前に宿の案内も確認してください。';
 const marker=document.createComment('stay-list');stays[0].before(marker);marker.before(bar,note);
 const empty=document.createElement('p');empty.className='stay-empty';empty.hidden=true;empty.textContent='条件に合う宿がありません。条件を減らしてください。';marker.before(empty);
 const input=bar.querySelector('#stay-query'),count=bar.querySelector('#stay-count'),sort=bar.querySelector('#stay-sort'),reset=bar.querySelector('.stay-reset'),chipBtns=[...bar.querySelectorAll('.stay-chip')];
 const active=new Set();const hit=(x,k)=>x.st[k]==='yes'||x.st[k]==='cond';
 const filter=()=>{const q=input.value.trim().toLowerCase();const ok=(x,skip)=>(!q||x.text.includes(q))&&[...active].every(k=>k===skip||hit(x,k));let n=0;
  info.forEach(x=>{const show=ok(x);if(x.card.hidden===show)x.card.hidden=!show;if(show)n++});
  chipBtns.forEach(b=>{const k=b.dataset.chip;const m=info.reduce((a,x)=>a+(ok(x,k)&&hit(x,k)?1:0),0);b.querySelector('.chip-n').textContent=m;b.setAttribute('aria-label',b.firstChild.textContent+' '+m+'宿');});
  CHIPS.forEach(([k])=>main.classList.toggle('stays-f-'+k,active.has(k)));
  count.textContent=(q||active.size)?n+'宿 / 全'+stays.length+'宿':'全'+stays.length+'宿';empty.hidden=n>0;reset.hidden=!(q||active.size);
  document.dispatchEvent(new CustomEvent('wanko:filtered',{detail:{shown:n}}))};
 const order=()=>{const list=sort.value==='pref'?[...info].sort((a,b)=>a.rank-b.rank||a.pref.localeCompare(b.pref,'ja')||a.i-b.i):info;const frag=document.createDocumentFragment();list.forEach(x=>frag.append(x.card));marker.after(frag)};
 chipBtns.forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.chip;active.has(k)?active.delete(k):active.add(k);b.setAttribute('aria-pressed',String(active.has(k)));filter()}));
 let t;input.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(filter,120)});
 sort.addEventListener('change',order);
 reset.addEventListener('click',()=>{active.clear();chipBtns.forEach(b=>b.setAttribute('aria-pressed','false'));input.value='';filter();input.focus()});
 filter();
 /* 比べる: 最大3宿。画面下のトレイから並べた表を開く。データは各カードの文章だけ */
 const MAXC=3,picked=[];const byId=new Map(info.map(x=>[x.card.id,x]));
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nameOf=x=>((x.card.querySelector('.stay-head h2')||{}).textContent||'').trim();
 const tray=document.createElement('div');tray.className='compare-tray';tray.hidden=true;tray.setAttribute('role','region');tray.setAttribute('aria-label','比べる宿');
 tray.innerHTML='<p class="compare-status" aria-live="polite"></p><ul class="compare-picked"></ul><div class="compare-actions"><button type="button" class="compare-open">並べて比べる</button><button type="button" class="compare-clear">選び直す</button></div>';
 const dlg=document.createElement('dialog');dlg.className='compare-dialog';dlg.setAttribute('aria-labelledby','compare-title');
 document.body.append(tray,dlg);
 const status=tray.querySelector('.compare-status'),pickedList=tray.querySelector('.compare-picked'),openBtn=tray.querySelector('.compare-open');
 const ROWS=[['添い寝',x=>x.card.dataset.sleep||'予約前確認'],['対象犬・頭数',x=>secText(x.card,/対象犬|頭数/)],['犬の宿泊料金',x=>secText(x.card,/料金/)],['ケージ',x=>secText(x.card,/ケージ/)||x.card.dataset.cage||''],['夜はどこで寝る',x=>secText(x.card,/寝る|添い寝/)],['食事同伴',x=>secText(x.card,/食事/)],['ドッグラン',x=>secText(x.card,/ドッグラン/)]];
 const renderTray=(msg)=>{tray.hidden=!picked.length;document.body.classList.toggle('has-compare-tray',picked.length>0);
  status.innerHTML=msg?esc(msg):'比べる宿 <b>'+picked.length+'</b> / '+MAXC;
  pickedList.innerHTML=picked.map(id=>'<li><a href="#'+esc(id)+'">'+esc(nameOf(byId.get(id)))+'</a><button type="button" data-remove="'+esc(id)+'" aria-label="'+esc(nameOf(byId.get(id)))+'を外す">×</button></li>').join('');
  openBtn.disabled=picked.length<2;openBtn.textContent=picked.length<2?'あと1宿選ぶと比べられます':'並べて比べる('+picked.length+'宿)'};
 const boxOf=id=>main.querySelector('input[data-compare="'+CSS.escape(id)+'"]');
 const setPicked=(id,on)=>{const i=picked.indexOf(id);
  if(on&&i<0){if(picked.length>=MAXC){const cb=boxOf(id);if(cb)cb.checked=false;renderTray('比べられるのは3宿までです。どれかを外してください。');return}picked.push(id)}
  if(!on&&i>=0)picked.splice(i,1);
  const cb=boxOf(id);if(cb)cb.checked=on;renderTray()};
 main.addEventListener('change',e=>{const cb=e.target.closest&&e.target.closest('input[data-compare]');if(cb)setPicked(cb.dataset.compare,cb.checked)});
 pickedList.addEventListener('click',e=>{const b=e.target.closest('button[data-remove]');if(b)setPicked(b.dataset.remove,false)});
 tray.querySelector('.compare-clear').addEventListener('click',()=>{[...picked].forEach(id=>setPicked(id,false))});
 openBtn.addEventListener('click',()=>{const xs=picked.map(id=>byId.get(id));
  dlg.innerHTML='<div class="compare-head"><h2 id="compare-title">宿を並べて比べる</h2><button type="button" class="compare-close">閉じる</button></div><p class="compare-note">各宿の掲載内容を並べています。料金・空室・条件は予約前に宿の案内で確認してください。</p><div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col">項目</th>'+xs.map(x=>'<th scope="col"><a href="#'+esc(x.card.id)+'" data-goto>'+esc(nameOf(x))+'</a><small>'+esc(x.area)+'</small></th>').join('')+'</tr></thead><tbody>'
   +'<tr><th scope="row">条件の判定</th>'+xs.map(x=>'<td><ul class="stay-conds">'+CHIPS.map(([k,,short])=>'<li class="st-'+x.st[k]+'">'+short+' <b>'+stateText(k,x.st[k])+'</b></li>').join('')+'</ul></td>').join('')+'</tr>'
   +ROWS.map(([label,fn])=>'<tr><th scope="row">'+label+'</th>'+xs.map(x=>'<td>'+(esc((fn(x)||'').trim())||'<span class="muted">記載なし</span>')+'</td>').join('')+'</tr>').join('')
   +'<tr><th scope="row">カード</th>'+xs.map(x=>'<td><a href="#'+esc(x.card.id)+'" data-goto>この宿の条件・予約先を見る</a></td>').join('')+'</tr></tbody></table></div>';
  dlg.querySelector('.compare-close').addEventListener('click',()=>dlg.close());
  dlg.querySelectorAll('a[data-goto]').forEach(a=>a.addEventListener('click',()=>dlg.close()));
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');dlg.querySelector('.compare-close').focus()});
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
 renderTray();
 stays.forEach(card=>{
  const head=card.querySelector('.stay-head');if(!head)return;
  const details=document.createElement('details');details.className='stay-details';
  const summary=document.createElement('summary');
  summary.innerHTML='<span class="stay-toggle-copy"><strong class="stay-toggle-label">宿の設備・宿泊条件を見る</strong><small>添い寝・ケージ・犬用アメニティなど</small></span><span class="stay-toggle-symbol" aria-hidden="true">＋</span>';
  details.append(summary);const fold=['amenity','room-note','card-meta','source-date'];/* Yahoo!トラベルの予約枠(secondary-offers)は外に残す */const kids=[...card.children].filter(el=>el!==head&&fold.some(c=>el.classList.contains(c)));if(!kids.length)return;kids[0].before(details);kids.forEach(el=>details.append(el));/* 2026-10-03: 犬条件の答え(answer-grid)・予約リンク(links)・行程ボタン(route-plan-cta)は折り畳まない(Codex 指摘) */
  details.addEventListener('toggle',()=>{
   summary.querySelector('.stay-toggle-label').textContent=details.open?'宿の詳細を閉じる':'宿の設備・宿泊条件を見る';
   summary.querySelector('.stay-toggle-symbol').textContent=details.open?'−':'＋';
  });
 });
}
