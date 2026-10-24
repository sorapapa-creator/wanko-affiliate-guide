(() => {
  const cards = [...document.querySelectorAll('#tripGrid .trip')];
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const query = document.querySelector('#outing-query');
  const kind = document.querySelector('#outing-kind');
  let region = 'all';
  // perf-20261019: 文字検索用の本文(小文字)は、最初に検索したときに1回だけ作って使い回す。
  let texts = null, timer = 0, last = -Infinity;
  function update() {
    clearTimeout(timer); timer = 0;
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
  // perf-20261019: 手入力は、続けて打っている間はまとめて最後に絞り込む(ほかのスクリプトから送られた input はすぐ反映)。
  // perf-20261023: 手を止めていたあとの1文字目はすぐ絞り込む(毎回 150ms 待つと、そのぶん反応が遅くなるため)。
  query.addEventListener('input', e => {
    if (!e.isTrusted || (!timer && performance.now() - last >= 150)) { update(); last = performance.now(); return; }
    clearTimeout(timer); timer = setTimeout(() => { update(); last = performance.now(); }, 150);
  });
  kind.addEventListener('change', update);
  document.querySelector('#outing-reset').addEventListener('click', () => {region = 'all'; query.value = ''; kind.value = 'all'; update();});
  update();
})();
