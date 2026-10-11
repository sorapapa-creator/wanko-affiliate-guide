(() => {
  const texts = {
    "goods": {
      "all": ["寸法・サイズ表", "素材", "お手入れ方法"],
      "臭い・排泄": ["シーツ・袋の寸法", "素材", "枚数"],
      "散歩後ケア": ["使用できる部位", "成分・材質", "使用方法"],
      "車移動": ["キャリーの内寸", "体重上限", "固定方法"],
      "旅行準備": ["収納時寸法", "本体重量", "容量"],
      "宿で落ち着く": ["マットの寸法", "素材", "洗濯表示"],
      "雨・泥汚れ": ["本体寸法", "素材", "洗い方"],
      "暑さ対策": ["使用方法", "電源の要否", "洗い方"],
      "寒さ対策": ["素材", "本体寸法", "電源の要否"],
      "水分補給": ["容量", "材質", "洗い方"],
      "食べムラ・お腹": ["食品の原材料", "対象年齢", "給与量"],
      "早食い": ["食器の内寸", "材質", "洗い方"],
      "体重管理": ["食品のカロリー表示", "対象年齢", "給与量"],
      "安全・迷子": ["ハーネスの胸囲", "対象体重", "調節範囲"],
      "しつけ・ごほうび": ["おやつの原材料", "対象年齢", "給与量"],
      "シニア・負担": ["補助具の対応寸法", "体重上限", "装着方法"],
      "毎日のケア": ["使用できる部位", "成分・材質", "使用方法"]
    },
    "wear": {
      "all": ["首回り", "胴回り", "着丈"],
      "オシャレ番長": ["首回り", "胴回り", "着丈"],
      "レインウェア": ["首回り", "胴回り", "着丈"],
      "防寒ウェア": ["首回り", "胴回り", "着丈"],
      "暑さ対策ウェア": ["首回り", "胴回り", "着丈"],
      "マナーウェア": ["胴回り", "対象体重", "装着方法"],
      "水辺・ライフジャケット": ["胴回り", "着丈", "体重上限"],
      "術後・保護ウェア": ["首回り", "胴回り", "着丈"],
      "ウェルネス・介護": ["対応寸法", "対象体重", "装着方法"],
      "__travel": ["首回り", "胴回り", "着丈"]
    }
  };
  const page = location.pathname.split('/').pop().replace(/\.html$/, '');
  const copy = page === 'travel-gear' ? texts.goods : Object.hasOwn(texts, page) ? texts[page] : null;
  const count = document.querySelector('.result-count');
  const box = document.querySelector('.howto-choose');
  const body = box?.querySelector('span');
  if (!copy || !count || !body || box.dataset.howtoReady) return;
  box.dataset.howtoReady = 'true';
  function sync() {
    const selected = document.querySelector('.filters button[data-problem].active');
    const key = selected?.dataset.problem ?? document.querySelector('[data-entry].active')?.dataset.entry;
    const items = Object.hasOwn(copy, key) ? copy[key] : null;
    const text = items ? items.join('・') : '';
    if (body.textContent !== text) body.textContent = text;
    box.hidden = !items;
  }
  new MutationObserver(sync).observe(count, { childList: true, subtree: true, characterData: true });
  sync();
})();
