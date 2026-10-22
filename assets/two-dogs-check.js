'use strict';
/* 初めて犬と泊まる 宿泊前チェック(2026-10-22、同夜に「2頭限定」から「頭数を質問に」へ広げた)。回答は sessionStorage にだけ置き、結果ページで読む。送信はしない */
(() => {
  const KEY = 'wk-first-stay-check';
  const form = document.getElementById('tdc-form');
  if (form) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
      Object.keys(saved).forEach(k => { const el = form.querySelector(`input[name="${k}"][value="${saved[k]}"]`); if (el) el.checked = true; });
    } catch (e) { /* 保存なし */ }
    const twoNotes = () => { const c = form.querySelector('input[name="count"]:checked'); const two = c && c.value !== '1'; form.querySelectorAll('.tdc-two').forEach(el => { el.style.display = two ? '' : 'none'; }); };
    form.querySelectorAll('input[name="count"]').forEach(r => r.addEventListener('change', twoNotes)); twoNotes();
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const ans = {}; let missing = false;
      form.querySelectorAll('.tdc-q').forEach(q => {
        const k = q.dataset.key; const v = form.querySelector(`input[name="${k}"]:checked`);
        q.classList.toggle('is-missing', !v);
        if (v) ans[k] = v.value; else missing = true;
      });
      if (missing) { form.querySelector('.tdc-q.is-missing').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      try { sessionStorage.setItem(KEY, JSON.stringify(ans)); } catch (e) { /* 保存できなくても結果ページは開ける */ }
      location.href = 'first-stay-check-result.html';
    });
    return;
  }
  const res = document.getElementById('tdr-list');
  if (!res) return;
  let ans = {};
  try { ans = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { ans = {}; }
  const count = ans.count === '1' ? 1 : ans.count === '2' ? 2 : ans.count === '3' ? 3 : 0; // 0 = 未回答
  const n = count === 0 ? '○' : count === 3 ? '3' : String(count);
  const multi = count >= 2;
  const ITEMS = {
    heads: { label: '頭数と体重の条件', ok: '全頭、条件に入っている', ng: '条件から外れそうな子がいる', unknown: '未確認',
      ask: multi ? `犬${n}頭(犬種 ○○、体重はそれぞれ ○kg と ○kg)で、1室に${n}頭泊まれますか。体重や犬種の制限があれば教えてください。` : `犬1頭(犬種 ○○、体重 ○kg)で宿泊できますか。体重や犬種の制限があれば教えてください。` },
    room: { label: '部屋での過ごし方(留守番・寝床・食事)', ok: '確認済み', part: '一部だけ確認', unknown: '未確認',
      ask: '部屋に犬だけで残すことはできますか(食事や入浴のあいだ)。ベッドやソファに上げてよいか、ケージの貸し出しがあるかも教えてください。' },
    fee: { label: '犬の追加料金(全泊分の合計)', ok: '合計が分かっている', part: '一部だけ分かる', unknown: '未確認',
      ask: multi ? `犬の宿泊料金は、${n}頭・○泊で合計いくらになりますか。2頭目以降の料金と、予約サイト経由と公式予約での違いがあれば教えてください。` : '犬の宿泊料金は、1頭・○泊で合計いくらになりますか。予約サイト経由と公式予約で違いがあれば教えてください。' },
    manner: { label: '吠え・粗相のときのルール', ok: '確認済み', worry: '未確認(心配あり)', unknown: '未確認',
      ask: 'マナーベルトやマナーパンツは必要ですか。粗相があった場合の清掃費と、夜間に吠えたときのお願い事項があれば教えてください。' }
  };
  const order = ['heads', 'room', 'fee', 'manner'];
  const answered = order.some(k => ans[k]);
  const frag = document.createDocumentFragment(); const asks = [];
  order.forEach(k => {
    const it = ITEMS[k]; const v = ans[k] || 'unknown'; const li = document.createElement('li');
    const st = document.createElement('span'); st.className = 'st ' + (v === 'ok' ? 'ok' : v === 'ng' ? 'ng' : '');
    st.textContent = v === 'ok' ? '確認済み' : v === 'ng' ? '要相談' : v === 'part' ? '一部確認' : '未確認';
    const tx = document.createElement('span'); tx.textContent = it.label + '：' + (it[v] || it.unknown);
    li.append(st, tx); frag.append(li);
    if (v !== 'ok') asks.push(it.ask);
  });
  res.append(frag);
  const head = document.getElementById('tdr-head');
  if (head) head.textContent = answered
    ? (asks.length ? `${count ? n + '頭で' : ''}未確認・要相談が ${asks.length} 件あります。下の確認文に記入して、宿に送れます。` : '4つとも確認済みです。あとは候補の空室と、持ち物の準備です。')
    : 'まだ答えていないので、4つとも「未確認」として確認文のひな形を作りました。';
  const ta = document.getElementById('tdr-ask-text');
  if (ta) {
    const body = asks.length ? asks.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(確認事項はすべて確認済みです。空室とチェックイン時刻を確認してください)';
    const intro = multi ? `犬${n}頭(犬種 ○○、体重 ○kg と ○kg)と` : count === 1 ? '犬1頭(犬種 ○○、体重 ○kg)と' : '犬○頭(犬種 ○○、体重 ○kg)と';
    ta.value = `○○(宿名)ご担当者様\n\n${intro}、○月○日から○泊の宿泊を検討しています。予約前に、次の点を教えてください。\n\n${body}\n\nお手数ですが、よろしくお願いいたします。\n○○(名前)`;
  }
  document.querySelectorAll('.tdr-two').forEach(el => { el.style.display = multi ? '' : 'none'; });
  const copy = document.getElementById('tdr-copy');
  if (copy && ta) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); copy.textContent = 'コピーしました'; }
    catch (e) { ta.select(); copy.textContent = '選択したので、長押しでコピーしてください'; }
  });
  const thanks = document.getElementById('tdr-thanks');
  if (thanks && location.hash === '#thanks') thanks.classList.add('show');
  const sv = document.getElementById('tdr-survey-form');
  if (sv) {
    const h = sv.querySelector('input[name="dogs"]'); if (h && count) h.value = count === 3 ? '3頭以上' : count + '頭';
    sv.addEventListener('submit', () => { const b = sv.querySelector('button'); if (b) b.disabled = true; });
  }
})();
