'use strict';
/* 2頭と初めて泊まる 宿泊前チェック(2026-10-22)。回答は sessionStorage にだけ置き、結果ページで読む。送信はしない */
(() => {
  const KEY = 'wk-two-dogs-check';
  const form = document.getElementById('tdc-form');
  if (form) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
      Object.keys(saved).forEach(k => { const el = form.querySelector(`input[name="${k}"][value="${saved[k]}"]`); if (el) el.checked = true; });
    } catch (e) { /* 保存なし */ }
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
      location.href = 'two-dogs-first-stay-result.html';
    });
    return;
  }
  const res = document.getElementById('tdr-list');
  if (!res) return;
  let ans = {};
  try { ans = JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch (e) { ans = {}; }
  const ITEMS = {
    heads: { label: '頭数と体重の条件', ok: '2頭とも条件に入っている', ng: '1頭が条件から外れそう', unknown: '未確認',
      ask: '犬2頭(体重 ○kg と ○kg、犬種 ○○)で、1室に2頭泊まれますか。体重や犬種の制限があれば教えてください。' },
    room: { label: '部屋での過ごし方(留守番・寝床・食事)', ok: '確認済み', part: '一部だけ確認', unknown: '未確認',
      ask: '部屋に犬だけで残すことはできますか(食事や入浴のあいだ)。ベッドやソファに上げてよいか、ケージの貸し出しがあるかも教えてください。' },
    fee: { label: '2頭分の追加料金', ok: '合計が分かっている', part: '2頭目が不明', unknown: '未確認',
      ask: '犬の宿泊料金は、2頭・○泊で合計いくらになりますか。予約サイト経由と公式予約で違いがあれば教えてください。' },
    manner: { label: '吠え・粗相のときのルール', ok: '確認済み', worry: '未確認(心配あり)', unknown: '未確認',
      ask: 'マナーベルトやマナーパンツは必要ですか。粗相があった場合の清掃費と、夜間に吠えたときのお願い事項があれば教えてください。' }
  };
  const order = ['heads', 'room', 'fee', 'manner'];
  const answered = order.some(k => ans[k]);
  const frag = document.createDocumentFragment(); const asks = [];
  order.forEach(k => {
    const it = ITEMS[k]; const v = ans[k] || 'unknown'; const li = document.createElement('li');
    const st = document.createElement('span'); st.className = 'st ' + (v === 'ok' ? 'ok' : v === 'ng' ? 'ng' : '');
    st.textContent = v === 'ok' ? '確認済み' : v === 'ng' ? '要相談' : '未確認';
    const tx = document.createElement('span'); tx.textContent = it.label + '：' + (it[v] || it.unknown);
    li.append(st, tx); frag.append(li);
    if (v !== 'ok') asks.push(it.ask);
  });
  res.append(frag);
  const head = document.getElementById('tdr-head');
  if (head) head.textContent = answered ? (asks.length ? `未確認・要相談が ${asks.length} 件あります。下の確認文をそのまま宿に送れます。` : '4つとも確認済みです。あとは候補の空室と、持ち物の準備です。') : 'まだ答えていないので、4つとも「未確認」として確認文を作りました。';
  const ta = document.getElementById('tdr-ask-text');
  if (ta) {
    const body = asks.length ? asks.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(確認事項はすべて確認済みです。空室とチェックイン時刻を確認してください)';
    ta.value = `○○(宿名)ご担当者様\n\n犬2頭(ミニチュアダックス 2頭、体重 ○kg と ○kg)と、○月○日から○泊の宿泊を検討しています。予約前に、次の点を教えてください。\n\n${body}\n\nお手数ですが、よろしくお願いいたします。\n○○(名前)`;
  }
  const copy = document.getElementById('tdr-copy');
  if (copy && ta) copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(ta.value); copy.textContent = 'コピーしました'; }
    catch (e) { ta.select(); copy.textContent = '選択したので、長押しでコピーしてください'; }
  });
  const thanks = document.getElementById('tdr-thanks');
  if (thanks && location.hash === '#thanks') thanks.classList.add('show');
  const sv = document.getElementById('tdr-survey-form');
  if (sv) sv.addEventListener('submit', () => { const b = sv.querySelector('button'); if (b) b.disabled = true; });
})();
