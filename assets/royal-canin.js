(function () {
  'use strict';
  function matches(product, filters) {
    return (filters.group === 'all' || product.group === filters.group)
      && (!filters.age || product.age.split('|').some(age => age === filters.age || (filters.age === 'puppy' && ['baby', 'junior'].includes(age))))
      && (!filters.form || product.form === filters.form)
      && (!filters.range || product.range === filters.range)
      && (!filters.term || product.search.toLowerCase().includes(filters.term.toLowerCase()));
  }
  if (typeof module !== 'undefined') module.exports = { matches };
  if (typeof document === 'undefined') return;
  const cards = Array.from(document.querySelectorAll('[data-rc-group]'));
  const controls = ['group', 'age', 'form', 'range', 'term'].map(id => document.getElementById('rc-' + id));
  const count = document.getElementById('rc-count');
  function render() {
    const filters = Object.fromEntries(controls.map(el => [el.id.slice(3), el.value.trim()]));
    let n = 0;
    for (const card of cards) {
      const show = matches({ group: card.dataset.rcGroup, age: card.dataset.rcAge, form: card.dataset.rcForm, range: card.dataset.rcRange, search: card.dataset.search }, filters);
      card.hidden = !show; if (show) n++;
    }
    count.textContent = n + '件の候補';
    document.getElementById('rc-empty').hidden = n > 0;
    document.getElementById('rc-vet-note').hidden = filters.group === 'daily';
  }
  controls.forEach(el => el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', render));
  document.querySelectorAll('a[data-product]').forEach(link => link.addEventListener('click', () => {
    try {
      const key = 'wanko_affiliate_clicks';
      const events = JSON.parse(localStorage.getItem(key) || '[]');
      events.push({product: link.dataset.product, source: 'royal-canin-guide', problem: document.getElementById('rc-group').value, at: new Date().toISOString()});
      localStorage.setItem(key, JSON.stringify(events.slice(-100)));
    } catch (_) { /* Local measurement must not prevent navigation. */ }
  }));
  document.getElementById('rc-reset').addEventListener('click', () => { controls.forEach(el => { el.value = el.id === 'rc-group' ? 'daily' : ''; }); render(); });
  render();
}());
