(() => {
  const cards = [...document.querySelectorAll('#tripGrid .trip')];
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const query = document.querySelector('#outing-query');
  const kind = document.querySelector('#outing-kind');
  let region = 'all';
  function update() {
    let count = 0;
    cards.forEach(card => {
      const kinds = card.dataset.kind ? card.dataset.kind.split(' ') : ['travel'];
      card.hidden = !(region === 'all' || region === card.dataset.region) ||
        !(kind.value === 'all' || kinds.includes(kind.value)) ||
        !card.textContent.toLowerCase().includes(query.value.trim().toLowerCase());
      if (!card.hidden) count++;
    });
    buttons.forEach(b => {b.classList.toggle('active', b.dataset.filter === region); b.setAttribute('aria-pressed', String(b.dataset.filter === region));});
    document.querySelector('#outing-count').textContent = count ? `${count}件の行き先` : '該当する行き先がありません。条件を減らしてお試しください。';
  }
  buttons.forEach(b => b.addEventListener('click', () => {region = b.dataset.filter; update();}));
  query.addEventListener('input', update);
  kind.addEventListener('change', update);
  document.querySelector('#outing-reset').addEventListener('click', () => {region = 'all'; query.value = ''; kind.value = 'all'; update();});
  update();
})();
