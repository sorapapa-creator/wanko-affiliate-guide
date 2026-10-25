// 空室逆算プランの犬可否 3 段階(施設 / 客室・プラン / 空室)の純粋関数テスト。依存なし。実行: node tests/vacancy-logic.test.js
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../route-planner/vacancy-rules.js");

let n = 0, failed = 0;
const test = (name, fn) => { n++; try { fn(); console.log(`ok ${n} - ${name}`); } catch (e) { failed++; console.log(`not ok ${n} - ${name}\n  ${String(e.message || e).split("\n").join("\n  ")}`); } };

// ---- 2) 客室・プラン: 否定語は API の pet フラグより優先
test("「ペット同伴無し」は pet フラグがあっても no", () => {
  assert.equal(R.petClass({ plan: "【露天風呂付】ペット同伴無し", room: "和洋室", pet: true }), "no");
});
test("「ペット不可」(客室名)は no", () => {
  assert.equal(R.petClass({ plan: "朝食付プラン", room: "スーペリアツイン(ペット不可)", pet: true }), "no");
});
test("「犬NG」は no", () => {
  assert.equal(R.petClass({ plan: "愛犬同伴OK棟は満室のため 犬NG のお部屋のみ", room: "", pet: true }), "no");
});
test("「ペット無料」は否定ではない(pet フラグどおり pet)", () => {
  assert.equal(R.petClass({ plan: "【ペット無料】わんこと泊まるプラン", room: "ドッグラン付コテージ", pet: true }), "pet");
});
test("「ペット無料」で pet フラグなしなら unknown", () => {
  assert.equal(R.petClass({ plan: "ペット無料キャンペーン", room: "", pet: false }), "unknown");
});
test("否定語なし・pet フラグなしは unknown(一般客室)", () => {
  assert.equal(R.petClass({ plan: "素泊まり", room: "ツイン", pet: false }), "unknown");
  assert.equal(R.petClass({ plan: "素泊まり", room: "ツイン" }), "unknown");
});

// ---- 2) 宿単位の集計
const plans = [
  { plan: "わんこ歓迎プラン", room: "ペットルーム", pet: true, total: 30000 },
  { plan: "わんこ歓迎プラン", room: "ペットルーム(無し)", pet: true, total: 28000 },
  { plan: "スタンダード", room: "和室", pet: false, total: 20000 },
  { plan: "スタンダード", room: "洋室", pet: false, total: 21000 },
];
test("planCounts: pet / unknown / no の件数と表示対象", () => {
  const c = R.planCounts(plans);
  assert.equal(c.pet, 1); assert.equal(c.unknown, 2); assert.equal(c.no, 1);
  assert.equal(c.shown.length, 3); assert.equal(c.petPlans.length, 1); assert.equal(c.unknownPlans.length, 2);
  assert.equal(c.onlyUnknown, false);
});
test("planCounts: 一般客室だけなら onlyUnknown", () => {
  const c = R.planCounts(plans.slice(2));
  assert.equal(c.pet, 0); assert.equal(c.unknown, 2); assert.equal(c.onlyUnknown, true);
});
test("planCounts: ペット不可だけ・空・undefined", () => {
  assert.equal(R.planCounts([plans[1]]).onlyUnknown, false);
  assert.equal(R.planCounts([plans[1]]).shown.length, 0);
  assert.deepEqual(R.planCounts(undefined).shown, []);
  assert.equal(R.planCounts([]).onlyUnknown, false);
});

// ---- 3 段階の表示文(混ぜない)
test("statusLines: 3 行で、施設・客室・プラン・空室が別々", () => {
  const lines = R.statusLines(R.planCounts(plans), "2026-10-02T02:30");
  assert.equal(lines.length, 3);
  assert.equal(lines[0].label, "施設"); assert.equal(lines[0].text, "犬同伴可(掲載条件を確認済み)");
  assert.equal(lines[1].label, "客室・プラン"); assert.match(lines[1].text, /^犬対応プラン 1 件 \/ 一般客室 2 件\(犬同伴の可否は未確認\)/);
  assert.match(lines[1].text, /ペット不可の記載 1 件は非表示/);
  assert.equal(lines[2].label, "空室"); assert.equal(lines[2].text, "楽天トラベル取得 2026-10-02 02:30・取得時点の情報。現在は予約先で確認");
  assert.equal(lines[1].warn, false);
});
test("statusLines: 一般客室だけのときは客室・プラン行が警告", () => {
  const lines = R.statusLines(R.planCounts(plans.slice(2)), "2026-10-02T02:30");
  assert.equal(lines[1].warn, true);
  assert.match(lines[1].text, /犬対応プラン 0 件 \/ 一般客室 2 件/);
  assert.equal(lines[0].text, "犬同伴可(掲載条件を確認済み)");  // 施設は変わらない
});
test("ONLY_UNKNOWN_WARN の文言", () => {
  assert.equal(R.ONLY_UNKNOWN_WARN, "取得時点では犬同伴の可否が未確認の客室のみです。現在の空室と犬同伴の可否は予約先で確認してください");
});

// ---- 3) 空室: 24 時間の境界
const scanned = "2026-10-02T02:30";  // JST
const scannedMs = Date.parse(scanned + "+09:00");
const data = { checkin: "2026-10-03", checkout: "2026-10-04", scanned_at: scanned, adults: 2, hotels: { x: { plans } } };
test("validate: 取得から 24 時間ちょうどまでは有効", () => {
  assert.equal(R.validate(data, { checkin: "2026-10-03", adults: 2 }, scannedMs + R.VALID_MS), "");
  assert.equal(R.validate(data, null, scannedMs + R.VALID_MS - 1), "");
});
test("validate: 24 時間を 1ms でも超えたら無効", () => {
  assert.equal(R.validate(data, null, scannedMs + R.VALID_MS + 1), "空室データが取得から 24 時間を超えたため表示しません");
});
test("validate: 未来の取得時刻(1 時間超)は不正", () => {
  assert.equal(R.validate(data, null, scannedMs - 3600 * 1000 - 1), "空室データの取得時刻が不正です");
  assert.equal(R.validate(data, null, scannedMs - 3600 * 1000), "");
});
test("validate: 日付・人数・泊数の不一致、取得時刻不明、データなし", () => {
  assert.equal(R.validate(data, { checkin: "2026-10-10" }, scannedMs), "空室データの日付が条件と一致しません");
  assert.equal(R.validate(data, { checkin: "2026-10-03", adults: 4 }, scannedMs), "空室データの人数が条件と一致しません");
  assert.equal(R.validate({ ...data, checkout: "2026-10-05" }, null, scannedMs), "空室データは 1 泊の条件のみです");
  assert.equal(R.validate({ ...data, scanned_at: "" }, null, scannedMs), "空室データの取得時刻が不明です");
  assert.equal(R.validate(null, null, scannedMs), "空室データがありません");
  assert.equal(R.validate({ checkin: "2026-10-03" }, null, scannedMs), "空室データがありません");
});
test("validate: now 省略時は Date.now()", () => {
  assert.equal(R.validate(data, null), "空室データが取得から 24 時間を超えたため表示しません");  // 固定日付のデータは実行時点では古い
});

// ---- ブラウザ用スクリプトの構文と配線(最小の window / document で IIFE を走らせる)
const RP = path.join(__dirname, "..", "route-planner");
const src = (f) => fs.readFileSync(path.join(RP, f), "utf8");
test("vacancy.js / planner.js は構文エラーなし", () => {
  new Function(src("vacancy.js")); new Function(src("planner.js"));
});
test("vacancy.js は window.VacancyRules の関数をそのまま VacancyData に載せる", () => {
  const win = { VacancyRules: R, PLANNER_CONFIG: {} };
  const doc = { getElementById: () => null, addEventListener() {} };
  new Function("window", "document", src("vacancy.js"))(win, doc);
  assert.equal(win.VacancyData.petClass, R.petClass);
  assert.equal(win.VacancyData.validate, R.validate);
  assert.equal(win.VacancyData.planCounts, R.planCounts);
});
test("vacancy-rules.js はブラウザでは window.VacancyRules になる", () => {
  const win = {};
  new Function("self", "module", src("vacancy-rules.js")).call(win, win, undefined);
  assert.equal(typeof win.VacancyRules.petClass, "function");
  assert.equal(win.VacancyRules.petClass({ plan: "ペット不可", pet: true }), "no");
});

// ---- 犬の大きさ・頭数(2026-10-04 dot・Codex の実地テストで見つかった除外漏れ)
const lod = (t) => ({ type: "lodging", facts: { "対象犬・頭数": t } });
test("「1部屋2頭まで」は 3 頭で NG", () => {
  assert.equal(R.dogFit(lod("体重10kg以下の小型犬のみ。1部屋2頭まで(2頭の合計体重10kgまで)。"), "small", 3).ng, true);
  assert.equal(R.dogFit(lod("体重10kg以下の小型犬のみ。1部屋2頭まで(2頭の合計体重10kgまで)。"), "small", 2).ng, false);
});
test("「小型犬(または猫)2匹まで」は 3 頭・中型で NG", () => {
  assert.equal(R.dogFit(lod("小型犬(または猫)2匹まで。中型犬以上は電話で問い合わせ。"), "small", 3).ng, true);
  assert.equal(R.dogFit(lod("小型犬(または猫)2匹まで。中型犬以上は電話で問い合わせ。"), "medium", 1).ng, true);
});
test("大きさ別の頭数: 「小型犬3頭、中型・大型犬2頭まで」", () => {
  const p = lod("小型犬3頭、中型・大型犬2頭までが公式案内の目安。");
  assert.equal(R.dogFit(p, "small", 3).ng, false);
  assert.equal(R.dogFit(p, "large", 3).ng, true);
  assert.equal(R.dogFit(p, "large", 2).ng, false);
});
test("「大型犬・対象外犬種不可」は大型で NG", () => {
  assert.equal(R.dogFit(lod("小型・中型犬対象、大型犬・対象外犬種不可。"), "large", 1).ng, true);
  assert.equal(R.dogFit(lod("小型・中型犬対象、大型犬・対象外犬種不可。"), "medium", 1).ng, false);
});
test("「大型犬歓迎。小型犬のみは事前相談」は大型で OK(自動抽出の目印より本文を優先)", () => {
  const p = { ...lod("大型犬歓迎。小型犬のみは事前相談（繁忙期は不可）。頭数：一律頭数制限なし"), dog_hints: { small_dog_only_mention: true } };
  assert.equal(R.dogFit(p, "large", 3).ng, false);
});
test("料金の「2頭まで無料」「1頭目」は頭数の上限にしない", () => {
  assert.equal(R.dogFit(lod("小型〜中型犬6頭／室、大型犬3頭／室。公式予約は2頭まで無料、3頭目以降1頭あたり2,200円。"), "small", 3).ng, false);
});
test("体重: 「中型犬(10kgまで)」は大型で NG", () => {
  assert.equal(R.dogFit(lod("小型犬(5kgまで)・中型犬(10kgまで)。1棟2頭まで。"), "large", 1).ng, true);
});
test("客室名「小型〜中型のわんちゃんと」は大型犬のとき misfit", () => {
  const c = R.planCounts([{ plan: "素泊まり", room: "小型〜中型のわんちゃんと一緒に", pet: true }, { plan: "ドッグラン付き客室", pet: true }], { size: "large", dogs: 1 });
  assert.equal(c.misfit, 1); assert.equal(c.pet, 1);
  assert.equal(R.planCounts([{ room: "小型〜中型のわんちゃんと一緒に", pet: true }], { size: "small", dogs: 1 }).misfit, 0);
});
test("dog を渡さない planCounts は従来どおり", () => {
  assert.equal(R.planCounts([{ room: "小型犬のみ", pet: true }]).pet, 1);
});

test("料金の文「4匹目から1匹+2,000円」と「超大型犬は不可」を上限にしない(おもちゃばこ)", () => {
  const p = lod("室内犬なら大型犬も可(超大型犬・外飼い犬は不可)。ペット3匹までは料金無料、4匹目から1匹+2,000円(税別)。");
  assert.equal(R.dogFit(p, "small", 3).ng, false);
  assert.equal(R.dogFit(p, "large", 1).ng, false);
});

// ---- 本文の読み取り(cx-20261013-1 2026-10-13: 大型犬の厳密検索に出た 3 施設の書き方)
test("「15kg程度まで」は体重上限(目安)として読み、大型で NG", () => {
  const L = R.dogLimits(lod("室内飼育の愛犬15kg程度まで、1室2頭まで。愛犬1頭につき3,300円(税込)。"));
  assert.equal(L.maxKg, 15); assert.equal(L.kgSoft, true);
  assert.equal(R.dogFit(lod("室内飼育の愛犬15kg程度まで、1室2頭まで。"), "large", 1).ng, true);
});
test("「大型犬は対応外(姉妹施設…が大型犬対応)」は大型で NG(括弧の姉妹施設の案内は読まない)", () => {
  const p = lod("小型犬・中型犬は3匹まで無料(3匹を超える場合は1匹につき追加料金)。大型犬は対応外(姉妹施設『わんpaina』のレフア棟などが大型犬対応)。");
  assert.equal(R.dogFit(p, "large", 1).ng, true);
  assert.equal(R.dogFit(p, "medium", 1).ng, false);
});
test("「小型犬。」「小型・中型犬。」だけの文は受け入れる大きさの列挙", () => {
  assert.equal(R.dogFit(lod("小型犬。頭数は予約前確認。"), "medium", 1).ng, true);
  assert.equal(R.dogFit(lod("小型・中型犬。頭数：2頭。"), "large", 1).ng, true);
  assert.equal(R.dogFit(lod("小型・中型・大型犬（大型料金は15kg以上）。頭数は予約前確認。"), "large", 1).ng, false);
});
test("客室名「大型犬対応外」は大型犬のとき misfit", () => {
  assert.equal(R.planFits({ plan: "わんこと泊まる", room: "大型犬は対応外のヴィラ" }, { size: "large", dogs: 1 }), false);
});

// ---- 構造化条件(dog_rules.json)からの 3 区分: fit / check(要確認) / ng
const V = (rule, dog, place) => R.dogVerdict(rule, place || null, dog);
test("体重の上限: 未満・ちょうど・超過・未入力(大型)", () => {
  const rule = { mode: "uniform", max_kg: 25, kg_inclusive: true, source_url: "https://example.jp/", checked_at: "2026-10-01" };
  assert.equal(V(rule, { size: "large", dogs: 1, kg: 24.9 }).status, "fit");
  assert.equal(V(rule, { size: "large", dogs: 1, kg: 25 }).status, "fit");     // 「25kg以下」のちょうど
  assert.equal(V(rule, { size: "large", dogs: 1, kg: 25.1 }).status, "ng");
  assert.equal(V(rule, { size: "large", dogs: 1 }).status, "check");            // 大型(25kg〜)は体重しだい → 要確認
  const lt = { ...rule, kg_inclusive: false };                                  // 「25kg未満」のちょうどは超過
  assert.equal(V(lt, { size: "large", dogs: 1, kg: 25 }).status, "ng");
  assert.equal(V(lt, { size: "large", dogs: 1 }).status, "ng");
  assert.equal(V(rule, { size: "small", dogs: 1 }).status, "fit");              // 小型(〜10kg)は 25kg 以下に必ず収まる
});
test("目安の上限(soft)は超えても NG にせず要確認", () => {
  const rule = { mode: "uniform", max_kg: 15, kg_inclusive: true, soft: true, max_dogs: 2 };
  assert.equal(V(rule, { size: "large", dogs: 1 }).status, "check");
  assert.equal(V(rule, { size: "medium", dogs: 1, kg: 15 }).status, "fit");
  assert.equal(V(rule, { size: "medium", dogs: 1, kg: 18 }).status, "check");
});
test("頭数の上限: 未満・ちょうど・超過・記載なし", () => {
  const rule = { mode: "uniform", max_dogs: 2, sizes: ["small", "medium", "large"] };
  assert.equal(V(rule, { size: "large", dogs: 1 }).status, "fit");
  assert.equal(V(rule, { size: "large", dogs: 2 }).status, "fit");
  assert.equal(V(rule, { size: "large", dogs: 3 }).status, "ng");
  assert.equal(V({ mode: "uniform", sizes: ["small"] }, { size: "small", dogs: 2 }).status, "check");
  assert.equal(V({ mode: "uniform", sizes: ["small"], unlimited: ["max_dogs"] }, { size: "small", dogs: 3 }).status, "fit");
});
test("大きさの条件なし・manual・unknown・ルールなしは fit にしない", () => {
  assert.equal(V({ mode: "uniform", max_dogs: 3 }, { size: "small", dogs: 1 }).status, "check");
  assert.equal(V({ mode: "uniform", unlimited: ["max_kg"] }, { size: "large", dogs: 1 }).status, "fit");
  assert.equal(V({ mode: "manual" }, { size: "small", dogs: 1 }, lod("大型犬歓迎。")).status, "check");
  assert.equal(V({ mode: "unknown" }, { size: "small", dogs: 1 }).status, "check");
  assert.equal(V(undefined, { size: "small", dogs: 1 }).status, "check");
});
test("保留中の人手見直し値(reviewed.proposed)は NG にだけ使う", () => {
  const rule = { mode: "manual", reviewed: { proposed: { mode: "uniform", sizes: ["small", "medium"] } } };
  assert.equal(V(rule, { size: "large", dogs: 1 }).status, "ng");
  assert.equal(V(rule, { size: "small", dogs: 1 }).status, "check");
});
test("実データ: 別邸 山風木・コトマル。わんship・フォレスト(つくば)は大型犬で fit にならない", () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, "../route-planner/data/dog_rules.json"), "utf8")).rules;
  const places = JSON.parse(fs.readFileSync(path.join(__dirname, "../route-planner/data/places.json"), "utf8")).places;
  for (const id of ["c5-bettei-yamabuki", "c5-cotomaru-wanship-kanaya", "c9-rk134811"]) {
    const v = R.dogVerdict(rules[id], places.find((p) => p.id === id), { size: "large", dogs: 1 });
    assert.notEqual(v.status, "fit", id);
  }
  assert.equal(R.dogVerdict(rules["c5-cotomaru-wanship-kanaya"], places.find((p) => p.id === "c5-cotomaru-wanship-kanaya"), { size: "large", dogs: 1 }).status, "ng");
  assert.equal(R.dogVerdict(rules["c9-rk134811"], null, { size: "large", dogs: 1 }).status, "ng");
  assert.equal(R.dogVerdict(rules["c5-bettei-yamabuki"], null, { size: "medium", dogs: 1, kg: 12 }).status, "fit");
});

// ---- 多頭連れ(2026-10-25、Codex A16): 1 頭が対象でも全員とは限らない
test("小型犬と大型犬の 2 頭で、対象が小型・中型の宿は ng(1 頭目が小型でも合格にしない)", () => {
  const rule = { mode: "uniform", sizes: ["small", "medium"], max_dogs: 2 };
  assert.equal(R.dogVerdict(rule, null, { size: "small", dogs: 2 }).status, "fit");
  const v = R.dogVerdict(rule, null, { size: "large", sizes: ["small", "large"], dogs: 2 });
  assert.equal(v.status, "ng");
  assert.ok(v.reasons.some((s) => s.includes("大型犬")));
});
test("全員が対象なら多頭でも fit、頭数の上限は全体で見る", () => {
  const rule = { mode: "uniform", sizes: ["small", "medium"], max_dogs: 2 };
  assert.equal(R.dogVerdict(rule, null, { size: "medium", sizes: ["small", "medium"], dogs: 2 }).status, "fit");
  assert.equal(R.dogVerdict(rule, null, { size: "medium", sizes: ["small", "medium", "small"], dogs: 3 }).status, "ng");
});
test("プラン名の「小型犬のみ」は、中型の子が 1 頭でもいれば合わない", () => {
  assert.equal(R.planFits({ plan: "小型犬のみ 1 室 2 頭まで", room: "" }, { size: "small", sizes: ["small", "small"], dogs: 2 }), true);
  assert.equal(R.planFits({ plan: "小型犬のみ 1 室 2 頭まで", room: "" }, { size: "medium", sizes: ["small", "medium"], dogs: 2 }), false);
});

console.log(`\n${n - failed}/${n} passed`);
if (failed) process.exit(1);
