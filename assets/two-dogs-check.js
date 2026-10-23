'use strict';
/* 初めて犬と泊まる 宿泊前チェック(2026-10-22、同夜に「2頭限定」から「頭数を質問に」へ広げた)。回答は sessionStorage にだけ置き、結果ページで読む。送信はしない
   2026-10-23: 回答は選ぶたびに保存(戻る・再読み込みで消えない)、進捗と未回答の案内、確認文の書き込みも保存、コピーの結果を role=status で表示。
   data-track は将来のクリック計測用の目印だけで、このファイルからどこにも送らない */
(() => {
  const KEY = 'wk-first-stay-check';
  const ASK_KEY = KEY + '-ask';
  const load = k => { try { return JSON.parse(sessionStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
  const save = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できなくても先へ進める */ } };
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const form = document.getElementById('tdc-form');
  if (form) {
    const qs = [...form.querySelectorAll('.tdc-q')];
    const saved = load(KEY);
    Object.keys(saved).forEach(k => { const el = form.querySelector(`input[name="${k}"][value="${saved[k]}"]`); if (el) el.checked = true; });
    const progText = document.getElementById('tdc-progress-text'); const meter = document.getElementById('tdc-meter'); const missing = document.getElementById('tdc-missing');
    const current = () => { const ans = {}; qs.forEach(q => { const v = form.querySelector(`input[name="${q.dataset.key}"]:checked`); if (v) ans[q.dataset.key] = v.value; }); return ans; };
    const update = () => {
      const ans = current(); const done = Object.keys(ans).length;
      if (progText) progText.textContent = done === qs.length ? `回答 ${done} / ${qs.length}(そろいました)` : `回答 ${done} / ${qs.length}`;
      if (meter) meter.style.width = (done / qs.length * 100) + '%';
      qs.forEach(q => { if (ans[q.dataset.key]) q.classList.remove('is-missing'); });
      if (missing && missing.textContent && done === qs.length) missing.textContent = '';
      const c = ans.count; const two = c && c !== '1'; form.querySelectorAll('.tdc-two').forEach(el => { el.style.display = two ? '' : 'none'; });
      return ans;
    };
    form.addEventListener('change', () => save(KEY, update()));
    update();
    form.addEventListener('submit', ev => {
      ev.preventDefault();
      const ans = update(); const left = qs.filter(q => !ans[q.dataset.key]);
      qs.forEach(q => q.classList.toggle('is-missing', !ans[q.dataset.key]));
      if (left.length) {
        if (missing) missing.textContent = `あと ${left.length} 問です。分からないときは「まだ確認していない／分からない」を選べば進めます。`;
        const first = left[0].querySelector('input');
        left[0].scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' });
        if (first) first.focus({ preventScroll: true });
        return;
      }
      save(KEY, ans);
      location.href = 'first-stay-check-result.html';
    });
    return;
  }
  const res = document.getElementById('tdr-list');
  if (!res) return;
  const ans = load(KEY);
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
  res.replaceChildren(frag); // HTML の 4 行(読み込み中の枠)を置き換える
  const head = document.getElementById('tdr-head');
  if (head) head.textContent = answered
    ? (asks.length ? `${count ? n + '頭で' : ''}未確認・要相談が ${asks.length} 件あります。下の確認文に記入して、宿に送れます。` : '4つとも確認済みです。あとは候補の空室と、持ち物の準備です。')
    : 'まだ答えていないので、4つとも「未確認」として確認文のひな形を作りました。';
  const ta = document.getElementById('tdr-ask-text');
  if (ta) {
    const body = asks.length ? asks.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(確認事項はすべて確認済みです。空室とチェックイン時刻を確認してください)';
    const intro = multi ? `犬${n}頭(犬種 ○○、体重 ○kg と ○kg)と` : count === 1 ? '犬1頭(犬種 ○○、体重 ○kg)と' : '犬○頭(犬種 ○○、体重 ○kg)と';
    const made = `○○(宿名)ご担当者様\n\n${intro}、○月○日から○泊の宿泊を検討しています。予約前に、次の点を教えてください。\n\n${body}\n\nお手数ですが、よろしくお願いいたします。\n○○(名前)`;
    // 書き込んだ確認文は、同じ回答から作った文のときだけ戻す(回答を直したら作り直す)
    const kept = load(ASK_KEY);
    ta.value = kept.src === made && typeof kept.text === 'string' ? kept.text : made;
    ta.addEventListener('input', () => save(ASK_KEY, { src: made, text: ta.value }));
  }
  // 次に押すものは 1 つ: 未確認があれば「確認文をコピー」、4つとも確認済みなら「旅行準備 5 項目」
  const copy = document.getElementById('tdr-copy'); const prep = document.getElementById('tdr-prep');
  if (!asks.length && copy && prep) { copy.removeAttribute('data-primary'); copy.classList.add('is-sub'); prep.setAttribute('data-primary', ''); }
  const status = document.getElementById('tdr-copy-status');
  const tell = (msg, ok) => { if (status) { status.textContent = msg; status.classList.toggle('is-ok', ok); } };
  if (copy && ta) copy.addEventListener('click', async () => {
    let done = false;
    try { await navigator.clipboard.writeText(ta.value); done = true; }
    catch (e) { ta.focus(); ta.select(); try { done = document.execCommand('copy'); } catch (e2) { done = false; } }
    if (done) {
      tell('✓ コピーしました。宿のメールや予約サイトの質問欄に貼り付けて、○○ を書き換えて送れます。', true);
      copy.classList.add('is-done'); copy.textContent = 'コピーしました(もう一度コピー)';
    } else tell('文字を選択しました。選んだ文字を長押しして「コピー」を選んでください。', false);
  });
  const thanks = document.getElementById('tdr-thanks');
  if (thanks && location.hash === '#thanks') thanks.classList.add('show');
  const sv = document.getElementById('tdr-survey-form');
  if (sv) {
    const h = sv.querySelector('input[name="dogs"]'); if (h && count) h.value = count === 3 ? '3頭以上' : count + '頭';
    sv.addEventListener('submit', () => { const b = sv.querySelector('button'); if (b) b.disabled = true; });
  }
})();
