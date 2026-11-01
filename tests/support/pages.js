// テスト対象のページと、各ページの「カード」の定義。ページを足すときはここに 1 行足す。
// cards: そのページで数える・スクショを撮るカードのセレクター(null = カードなし。カード数の比較をしない)
"use strict";

const PAGES = [
  { id: "index", path: "index.html", cards: ".pathways > a" },
  { id: "dog-lodging-guide", path: "dog-lodging-guide.html", cards: "article.stay-card" },
  { id: "east-japan-dog-trips", path: "east-japan-dog-trips.html", cards: "article.trip" },
  { id: "food", path: "food.html", cards: "article.card" },
  { id: "goods", path: "goods.html", cards: "article.card" },
  { id: "wear", path: "wear.html", cards: "article.card" },
  { id: "travel-gear", path: "travel-gear.html", cards: "article.card" },
  { id: "first-stay-check-instagram", path: "first-stay-check-instagram.html", cards: ".tdc-q" },
  { id: "first-stay-check-result", path: "first-stay-check-result.html", cards: "#tdr-list > li" },
  { id: "travel-prep-5-instagram", path: "travel-prep-5-instagram.html", cards: ".tp5 > li" },
  { id: "route-planner", path: "route-planner/", cards: ".card:not(.hidden)" },
  // お問い合わせはカードがないので、フォームを「カード」の位置として撮る(数の比較はしない)
  { id: "contact", path: "contact.html", cards: "#partner-inquiry", countCards: false },
];

const VIEWPORTS = [
  { id: "sp", width: 375, height: 812 },
  { id: "pc", width: 1280, height: 800 },
];

// 撮影・計測の基準日。空室・日付の表示を毎回同じにするため、ブラウザの時計をこの時刻に止める。
const FIXED_NOW = "2026-10-24T09:00:00+09:00";

module.exports = { PAGES, VIEWPORTS, FIXED_NOW };
