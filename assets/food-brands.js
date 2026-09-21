/* Brand matching is independent of problem filtering; both must match. */
function wankoFoodBrandMatch(card, brand) {
  if (!brand) return true;
  if (!card.dataset.problems.split('|').includes('毎日の主食')) return false;
  const normalize = value => value.normalize('NFKC').replace(/[\s・･]/g, '').toLowerCase();
  return normalize(card.dataset.search).includes(normalize(brand));
}
