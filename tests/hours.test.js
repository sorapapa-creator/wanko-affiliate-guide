// 営業時間の構造化(route-planner/hours.js)の純粋関数テスト。依存なし。実行: node tests/hours.test.js
// 文章は route-planner/data/places.json の facts の実例(2026-10-03 時点。施設 id を添える)。
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const H = require("../route-planner/hours.js");

let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); console.log(`ok ${n} - ${name}`); } catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").join("\n  ")}`); } };
const root = path.join(__dirname, "..");
// 日本時間の到着 { mo, d, h, mi, wd }(planner.js の jst() と同じ形)。2026-10-05 は月曜
const at = (mo, d, wd, hm) => { const [h, mi] = hm.split(":").map(Number); return { mo, d, h, mi, wd }; };

// ---- 明確な表記は high で構造化
test("c4-hakone-tenku-terrace: 営業10:00〜17:00(LO16:30)、水曜定休", () => {
  const h = H.parse("出発前に確認: 営業10:00〜17:00(LO16:30)、水曜定休。店舗前駐車場14台。");
  assert.equal(h.confidence, "high");
  assert.deepEqual([h.open, h.close, h.lastEntry], ["10:00", "17:00", "16:30"]);
  assert.deepEqual(h.closedDays, [3]);
  assert.equal(H.describe(h), "10:00〜17:00・最終受付16:30・水曜定休");
});
test("sodegaura-fureai-dobutsu-en: 最終入縁・木曜休縁(祝日を除く)", () => {
  const h = H.parse("営業情報: 10:00〜16:00（最終入縁15:30）、木曜休縁（祝日を除く）。約100台の駐車場を案内。");
  assert.equal(h.confidence, "high");
  assert.deepEqual([h.open, h.close, h.lastEntry], ["10:00", "16:00", "15:30"]);
  assert.deepEqual(h.closedDays, [4]);
});
test("c3-dog-park-inage: 「月曜定休(祝日なら翌日)」の祝は定休日にしない", () => {
  const h = H.parse("出発前に確認: 営業10:00〜17:00(最終入場16:30)、月曜定休(祝日なら翌日)。受付は稲毛記念館。");
  assert.deepEqual(h.closedDays, [1]);
  assert.equal(h.holidayClosed, undefined);
  assert.equal(h.lastEntry, "16:30");
});
test("fuefukigawa-fruit-park-dogrun: 月ごとの時間(4〜9月/10〜3月)と年中無休", () => {
  const h = H.parse("料金・利用時間: ドッグランは無料。4～9月は9:00～19:00、10～3月は9:00～18:00。年中無休案内ですが、整備等による休止があります。");
  assert.equal(h.confidence, "high");
  assert.deepEqual(h.closedDays, []);
  assert.deepEqual(h.seasonal.periods.map((p) => [p.from, p.to, p.open, p.close]), [[401, 931, "09:00", "19:00"], [1001, 331, "09:00", "18:00"]]);
  assert.equal(H.status(h, at(1, 10, 6, "18:30")).reason, "閉店後");   // 冬は 18 時まで
  assert.equal(H.status(h, at(7, 10, 5, "18:30")).ok, true);           // 夏は 19 時まで
});
test("mitsui-kisarazu-dogrun: 月日の範囲ごとの時間(料金の文と同じ項目)", () => {
  const h = H.parse("料金・営業時間: 1日券900円(土日祝1,100円)、時間券30分550円(土日祝660円)。季節で営業時間が変わります：3/1〜7/31・9/1〜11/30は10:00〜19:00、8/1〜8/31は14:00〜20:00、12/1〜2/28は10:00〜18:00。");
  assert.equal(h.confidence, "high");
  assert.equal(h.seasonal.periods.length, 4);
  assert.deepEqual(H.status(h, at(8, 10, 1, "11:00")), { ok: false, reason: "開店前", text: "14:00〜20:00" });
  assert.equal(H.status(h, at(12, 24, 4, "18:10")).reason, "閉店後");
});
test("fujimi-panorama-dog-trekking: 営業期間の外は季節外、「下り最終」は最終受付にしない", () => {
  const h = H.parse("2026年営業: 4月25日〜11月15日。4〜10月は8:30〜16:00（下り最終16:30）、11月は8:30〜15:30（下り最終16:00）。");
  assert.deepEqual(h.seasonal.season, [{ from: 425, to: 1115 }]);
  assert.equal(h.lastEntry, null);
  assert.equal(H.status(h, at(12, 5, 6, "10:00")).reason, "季節外");
  assert.equal(H.status(h, at(11, 5, 4, "15:45")).reason, "閉店後");
  assert.equal(H.status(h, at(10, 5, 1, "15:45")).ok, true);
});
test("c3-metsa-reija-nasu: 平日と土日祝で時間が違う", () => {
  const h = H.parse("出発前に確認: 営業 土日祝10:00〜20:00(LO19:30)、平日10:00〜18:00(LO17:30)。犬OKの席の数。");
  assert.equal(h.confidence, "high");
  assert.deepEqual(h.byDay.map((w) => [w.days.join(""), w.holiday, w.close, w.lastEntry]), [["06", true, "20:00", "19:30"], ["12345", false, "18:00", "17:30"]]);
  assert.equal(H.status(h, at(10, 3, 6, "19:00")).ok, true);   // 土曜 19:00
  // 平日 19:00: 祝日かもしれないので「祝」つきの時間(〜LO19:30)も合わせて見る(外しすぎない)
  assert.equal(H.status(h, at(10, 7, 3, "19:00")).ok, true);
  assert.equal(H.status(h, at(10, 7, 3, "19:45")).reason, "最終受付後");
});
test("c5-fetch-cafe-kawagoe: 「定休日 水曜・木曜(祝日は営業)」", () => {
  const h = H.parse("出発前に確認: 営業時間 10:00〜18:00、定休日 水曜・木曜(祝日は営業)。プールは金〜火曜(木曜休み)。");
  assert.deepEqual(h.closedDays, [3, 4]);
  assert.equal(h.holidayClosed, undefined);
});
test("tsukuba-mo-cafe: 「／」区切りの中の「10〜17時、日・月・祝休み」", () => {
  const h = H.parse("公式で確認したこと: 犬同伴は中庭スペース／中型犬以下／狂犬病・5種以上混合ワクチン接種が1年以内／店内移動はキャリーまたは抱っこ、着席後リード／椅子・テーブルに犬を直接乗せない／10〜17時、日・月・祝休み、駐車場ありの案内");
  assert.deepEqual([h.open, h.close], ["10:00", "17:00"]);
  assert.deepEqual(h.closedDays, [0, 1]);
  assert.equal(h.holidayClosed, true);
  assert.equal(H.describe(h), "10:00〜17:00・日・月・祝 定休");
});
test("dear-wan-terrace-chiba: ランチの L.O. は最終受付にしない", () => {
  const h = H.parse("営業時間・メニュー: カフェは10:00～16:00、ランチは11:00～14:00（L.O.13:30）。愛犬用メニューの案内があります。休業日・価格・当日営業は公式情報で確認してください。");
  assert.equal(h.confidence, "high");
  assert.deepEqual([h.open, h.close, h.lastEntry], ["10:00", "16:00", null]);
});
test("c7-re-fujita…torusca: 「月〜金は定休日」→ 平日定休", () => {
  const h = H.parse("出発前に確認: 営業は土日のみ（11:00〜17:00）。月〜金は定休日。");
  assert.deepEqual(h.closedDays, [1, 2, 3, 4, 5]);
  assert.equal(H.describe(h), "11:00〜17:00・平日定休");
  assert.equal(H.status(h, at(10, 5, 1, "12:00")).reason, "定休日");
});
test("c5-inu-no-ie-relair: 「受付は16:00まで」は最終受付", () => {
  const h = H.parse("出発前に確認: 営業時間 10:00〜18:00(受付は16:00まで)。平日は曜日によってランを休むことがあるので電話で確認。");
  assert.equal(h.lastEntry, "16:00");
});
test("c3-tokorozawa-kokuu-dogrun: 括弧の月日だけ時間が違う", () => {
  const h = H.parse("出発前に確認: 開場時間7:00〜19:00(6/1〜9/30は6:00〜19:00)。休場は施設点検日・12/31・1/1。");
  assert.equal(h.confidence, "high");
  assert.equal(H.status(h, at(7, 1, 3, "06:30")).ok, true);
  assert.equal(H.status(h, at(10, 1, 4, "06:30")).reason, "開店前");
});
test("c8-play-mon-jp: 「10:30～16:30（月～金）」は平日だけの時間。土曜は判定しない", () => {
  const h = H.parse("出発前に確認: 営業時間10:30～16:30（月～金）、年末年始休み、土日以外の祝日営業。ケーキ注文は公式Instagram DM、その他は店頭・お電話（1週間以上前）。");
  assert.deepEqual(h.byDay.map((w) => w.days.join("")), ["12345"]);
  assert.equal(H.status(h, at(10, 3, 6, "12:00")), null);
  assert.equal(H.status(h, at(10, 5, 1, "16:40")).reason, "閉店後");
});
test("c5-kukuru-cafe-dog-garden: 月曜 15:10 着は閉店後、14:45 着は最終受付後", () => {
  const h = H.parse("出発前に確認: 営業時間 10:30〜15:00(L.O.14:30)、定休日 日曜。");
  assert.equal(H.status(h, at(10, 5, 1, "15:10")).reason, "閉店後");
  assert.equal(H.status(h, at(10, 5, 1, "14:45")).reason, "最終受付後");
  assert.equal(H.status(h, at(10, 4, 0, "12:00")).reason, "定休日");
  assert.equal(H.status(h, at(10, 6, 2, "01:46")).reason, "開店前");  // 深夜着はおすすめから外さない(待てる)が、滞在先なら planner が営業時間外にする
  assert.ok(H.DEMOTE_REASONS.includes("閉店後") && !H.DEMOTE_REASONS.includes("開店前"));
});

// ---- 曖昧なら null か medium(推測しない)
const nullCases = [
  ["c8-matsushima-ribtour-com-pet(「2～3時間前」は時刻ではない)", "出発前に確認: ペット同伴の場合はできるだけ前日までにご予約。大型犬は事前に要予約。乗船の2～3時間前までに食事をすませ、トイレも乗船前にすませておく。"],
  ["c7-tohokudaiken…(開園は終日。8〜17時は勤務員の配置)", "出発前に確認: ドッグラン利用には事前の利用者登録が必要。中学生以下は保護者同伴必須。開園時間は終日だが、8:00〜17:00に勤務員配置。休園日はなし。"],
  ["c8-zushi-beach-jp-faq(遊泳時間帯は散歩禁止の時間)", "出発前に確認: 遊泳時間帯（9:00～17:00）は散歩禁止。公共の交通機関の利用がおすすめ。"],
  ["c8-sadokisen…(予約センターの受付時間と休業日)", "出発前に確認: ウィズドッグルームは予約制（空きがあれば当日可）。予約センター営業時間10:00～13:00、14:00～17:00、日・祝・年末年始休業。大型ペットは受付できない場合がございます。"],
  ["c8-nikko-daiyagawapark-jp(管理事務所の電話受付)", "出発前に確認: 管理事務所（0288-23-0111 9:00～17:00）へお問い合わせください。"],
  ["駐車場の料金(「2〜6時間200円」)", "料金の目安/犬料金: 入園無料(乗り物は有料)。駐車場は2時間まで無料、2〜6時間200円、6時間以上300円。"],
  ["営業日カレンダーだけ", "出発前に確認: 営業日カレンダー(公式サイト・Instagram)、所在地。"],
];
for (const [name, text] of nullCases) test(`null: ${name}`, () => assert.equal(H.parse(text), null));

test("fromFacts: 料金・犬の条件の項目の時刻は営業時間として読まない(c5-pet-park-one-takasaki)", () => {
  const facts = {
    "犬の条件・同伴範囲": "ワクチン・狂犬病ワクチン未接種、ヒート中、伝染性の病気、凶暴性のある犬は入場不可。犬と一緒に入退場し行動を監視。食べ物(犬用含む)の持ち込み不可。大型犬(20kg以上)は水曜・日曜13:00〜18:00限定(他の曜日は貸切予約のみ)。",
    "料金の目安/犬料金": "公式サイトの『営業日/ご利用料金』で確認。貸切はキャンセル料あり(3日前〜前日50%、当日100%、悪天候は無料)。",
    "出発前に確認": "営業日カレンダー(公式サイト・Instagram)、所在地。",
  };
  assert.equal(H.fromFacts(facts), null);
});
test("fromFacts: 営業時間の見出しを優先し、factKey を付ける", () => {
  const h = H.fromFacts({ "持ち物": "リード", "出発前に確認": "営業時間 11:00〜18:00(L.O.17:30)。定休日は公式で確認。" });
  assert.equal(h.factKey, "出発前に確認");
  assert.equal(h.lastEntry, "17:30");
});

const mediumCases = [
  ["c5-mothers-cafe-kamakura(ランチ・ディナーが営業時間の外にはみ出す)", "出発前に確認: 営業時間 ランチ11:00〜15:00(L.O.14:00)、カフェ15:00〜17:00、ディナー17:00〜21:00(L.O.20:00)。定休日 月・火曜。"],
  ["c5-dog-cafe-aloha-ilio(「土日は20時まで」)", "出発前に確認: カフェ営業時間 11:00〜17:00(土日は20時まで。L.O.フード16:00・ドリンク16:30)。定休日 木曜。平日は保護犬譲渡の都合で早じまいすることがある。"],
  ["c5-wonderrun-niigata(不定休)", "出発前に確認: 営業時間 9:00〜19:00、定休日 不定休。"],
  ["c5-k9cosmic-kashiwa(夏のナイトラン期間)", "出発前に確認: 通常の営業時間 平日12:00〜17:00、土日祝11:00〜18:00。夏のナイトラン期間は平日16:00〜21:00、土曜12:00〜21:00、日祝12:00〜20:00。定休日 火曜(第3火・水は連休)。"],
  ["c-osasa-bokujo(冬季は別の時間)", "出発前に確認: 営業時間 8:45〜16:45(4〜11月)、冬季は9:30〜16:00。1月4日〜2月末の水・木は定休。"],
];
for (const [name, text] of mediumCases) test(`medium: ${name}`, () => assert.equal(H.parse(text).confidence, "medium"));

// ---- 全データで例外が出ないこと
const places = JSON.parse(fs.readFileSync(path.join(root, "route-planner/data/places.json"), "utf8")).places;
test("places.json の全 facts を parse / fromFacts しても例外が出ない", () => {
  let texts = 0;
  for (const p of places) {
    for (const [k, v] of Object.entries(p.facts || {})) { if (typeof v === "string") { const h = H.parse(`${k}: ${v}`); if (h) H.describe(h); texts++; } }
    const h = H.fromFacts(p.facts);
    if (h) { assert.ok(["high", "medium"].includes(h.confidence)); H.status(h, at(10, 5, 1, "12:00")); H.describe(h); }
  }
  assert.ok(texts > 1000, `facts が少なすぎます(${texts})`);
});
test("掲載ページ(east-japan-dog-trips.html)の dl.facts も例外が出ない", () => {
  const html = fs.readFileSync(path.join(root, "east-japan-dog-trips.html"), "utf8");
  const pairs = [...html.matchAll(/<dt>([^<]*)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)];
  assert.ok(pairs.length > 500);
  for (const [, dt, dd] of pairs) H.parse(`${dt}: ${dd.replace(/<[^>]+>/g, "")}`);
});
test("high の結果は open<close・lastEntry<=close・曜日 0〜6 の範囲", () => {
  for (const p of places) {
    const h = H.fromFacts(p.facts);
    if (!h || h.confidence !== "high") continue;
    for (const w of [h.default, ...(h.byDay || []), ...((h.seasonal && h.seasonal.periods) || [])].filter(Boolean)) {
      assert.ok(w.open < w.close, `${p.id}: ${w.open}〜${w.close}`);
      if (w.lastEntry) assert.ok(w.lastEntry <= w.close, `${p.id}: lastEntry ${w.lastEntry}`);
    }
    for (const d of h.closedDays || []) assert.ok(d >= 0 && d <= 6, p.id);
  }
});

// ---- ブラウザでの読み込みと planner.js
test("hours.js はブラウザでは window.WankoHours になる", () => {
  const ctx = {}; ctx.self = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(root, "route-planner/hours.js"), "utf8"), ctx);
  assert.equal(typeof ctx.WankoHours.parse, "function");
});
test("planner.js の構文チェック", () => {
  new vm.Script(fs.readFileSync(path.join(root, "route-planner/planner.js"), "utf8"), { filename: "planner.js" });
});
test("index.html は hours.js を planner.js の前で読み込む", () => {
  const html = fs.readFileSync(path.join(root, "route-planner/index.html"), "utf8");
  const a = html.indexOf('src="hours.js'), b = html.indexOf('src="planner.js');
  assert.ok(a > 0 && b > a);
});

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
