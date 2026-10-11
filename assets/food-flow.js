(() => {
  const $ = s => document.querySelector(s), result = $('#food-results');
  if (!result) return;
  const reveal = el => { for (let p = el; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true; };
  const revealHash = () => { try { reveal(document.getElementById(decodeURIComponent(location.hash.slice(1)))); } catch (_) {} };
  // concern-guideのdeferより先に開く。topicの解釈・適用自体は既存JSに任せる。
  if (new URLSearchParams(location.search).get('topic')) $('#food-concern-fold').open = true;
  revealHash(); window.addEventListener('hashchange', revealHash);
  const sync = () => {
    const problem = $('.filters button.active')?.dataset.problem || 'all';
    const query = $('.search').value.trim(), brand = $('#food-brand');
    $('#food-flow-context').textContent = [problem === 'all' ? '用途：すべて（主食・おやつなど）' : '用途：' + problem, query && '検索：' + query, brand?.value && 'ブランド：' + brand.value].filter(Boolean).join(' ／ ');
    document.querySelectorAll('[data-food-entry]').forEach(a => {
      const [kind, value] = a.dataset.foodEntry.split(':'), on = kind === 'age' ? problem === '毎日の主食' && $('#ff-age').value === value : problem === value;
      a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  new MutationObserver(sync).observe(result, {childList:true}); sync();
  // 動的生成される「詳細条件を見直す／困りごとから選び直す」の既存scrollToより先に開く。
  document.addEventListener('click', e => {
    const b = e.target.closest('.cg-result-actions button'); if (!b) return;
    if (b === b.parentElement.firstElementChild) $('#food-finder .ff-options').open = true;
    else $('#food-concern-fold').open = true;
  }, true);
  // 年齢入口の既存スクロールはそのまま。結果へのフォーカスだけを追加する。
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-food-entry]')) return;
    $('#concern-guide .cg-selection').textContent = ''; result.focus({preventScroll:true});
  });
  $('#food-clear-all').addEventListener('click', () => {
    $('#ff-reset').click(); // 既存wankoFoodInitのリセット→onReset→renderを再利用
    $('.filters button[data-problem="all"]').click(); // 用途も解除して既存renderで再集計
    $('#concern-guide .cg-selection').textContent = '';
    const url = new URL(location.href), pick = url.searchParams.get('pick');
    if (pick) { const card = document.querySelector(`[data-product="${CSS.escape(pick)}"]`)?.closest('.card'); if (card) { card.style.removeProperty('outline'); card.style.removeProperty('outline-offset'); } }
    ['age','brand','pick','topic'].forEach(k => url.searchParams.delete(k));
    url.searchParams.set('problem', 'all'); url.hash = 'food-results'; history.replaceState(null, '', url);
    sync(); result.focus({preventScroll:true}); result.scrollIntoView({behavior:'auto',block:'start'});
  });
})();
