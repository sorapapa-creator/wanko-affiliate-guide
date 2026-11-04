/* split-20261104: 分けたページの入口で、旧リンク(#カード id・?pick=・?problem= など)を新しいページへ送る。対応表は assets/split-map.json(tools/site_split_build.py が作る) */
(() => {
  const me = document.currentScript, page = me && me.dataset.page;
  if (!page) return;
  const u = new URL(location.href), q = u.searchParams;
  let frag = ""; try { frag = decodeURIComponent(u.hash.slice(1)); } catch (_) {}
  const needs = frag || [...q.keys()].length;
  let mapP = null;
  const load = () => (mapP ||= fetch(new URL("split-map.json", me.src)).then((r) => (r.ok ? r.json() : {})).then((m) => m[page] || null).catch(() => null));
  const target = (info, frag, pairs) => {
    if (frag && info.ids[frag]) return info.ids[frag];
    if (frag && info.route[frag]) return info.route[frag];
    for (const [k, v] of pairs) if (k === "pick" && info.ids["pick:" + v]) return info.ids["pick:" + v];
    for (const p of info.params) for (const [k, v] of pairs) if (k === p && v && v !== "all" && info.route[k + "=" + v]) return info.route[k + "=" + v];
    if (pairs.some(([k, v]) => (info.params.includes(k) || k === "pick") && v && v !== "all")) return info.all;
    return "";
  };
  if (needs) load().then((info) => {
    if (!info) return;
    // この画面にある id(代表カードなど)は移らない。ただし #stay-query のように行き先が決まっているものは送る
    const t = target(info, document.getElementById(frag) && !info.route[frag] ? "" : frag, [...q.entries()]);
    if (t) location.replace(t + u.search + u.hash);
  });
  // 入口の用途ボタン: この画面の代表カードで絞らず、その用途のページ(なければ全件のページ)へ移る
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".filters button[data-problem]");
    if (!b || b.dataset.problem === "all") return;
    e.preventDefault(); e.stopImmediatePropagation();
    load().then((info) => {
      if (!info) return;
      const v = b.dataset.problem, t = info.route["problem=" + v] || info.all;
      location.href = t + "?problem=" + encodeURIComponent(v) + "#shop";
    });
  }, true);
})();
