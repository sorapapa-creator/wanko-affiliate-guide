(() => {
  const cards = [...document.querySelectorAll('#tripGrid .trip')];
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const query = document.querySelector('#outing-query');
  const kind = document.querySelector('#outing-kind');
  let region = 'all';
  // perf-20261019: 文字検索用の本文(小文字)は、最初に検索したときに1回だけ作って使い回す。
  let texts = null, timer;
  function update() {
    clearTimeout(timer);
    let count = 0;
    const q = query.value.trim().toLowerCase();
    if (q && !texts) texts = cards.map(card => card.textContent.toLowerCase());
    cards.forEach((card, i) => {
      const kinds = card.dataset.kind ? card.dataset.kind.split(' ') : ['travel'];
      const hide = !(region === 'all' || region === card.dataset.region) ||
        !(kind.value === 'all' || kinds.includes(kind.value)) ||
        (q !== '' && !texts[i].includes(q));
      if (card.hidden !== hide) card.hidden = hide;
      if (!card.hidden) count++;
    });
    buttons.forEach(b => {b.classList.toggle('active', b.dataset.filter === region); b.setAttribute('aria-pressed', String(b.dataset.filter === region));});
    document.querySelector('#outing-count').textContent = count ? `${count}件の行き先` : '該当する行き先がありません。条件を減らしてお試しください。';
    document.dispatchEvent(new CustomEvent('wanko:filtered', {detail: {shown: count}}));
  }
  buttons.forEach(b => b.addEventListener('click', () => {region = b.dataset.filter; update();}));
  // perf-20261019: 手入力は打ち終わるまで少し待ってまとめて絞り込む(ほかのスクリプトから送られた input はすぐ反映)。
  query.addEventListener('input', e => { clearTimeout(timer); if (e.isTrusted) timer = setTimeout(update, 150); else update(); });
  kind.addEventListener('change', update);
  document.querySelector('#outing-reset').addEventListener('click', () => {region = 'all'; query.value = ''; kind.value = 'all'; update();});
  update();
})();
