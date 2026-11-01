# サイト健全性テストの基準と既存の問題(2026-10-24)

`npm test`(tests/)を、2026-10-24 時点の main(`4e7346e` … 毎朝の空室データ更新と宿 1 件追加のあと)で実行した結果です。
ここに挙げた問題は **記録のみ** で、このブランチでは直していません。テストは `tests/health/baseline.json` の `known` に入れたこれらを「既知」として扱い、**新しく増えたものだけで失敗** します。直したら `npm run test:update` で既知の一覧からも外してください。

使い方は `tests/README.md` を見てください。

## 実行結果

| 項目 | 値 |
|---|---|
| テストの数 | 158 件(スクショ比較 48・健全性 109・単体 1) |
| 結果 | 158 件すべて合格(既存の問題は既知として記録) |
| 実行時間 | 1 分 53 秒(4 コアのクラウド環境、`npm test` 1 回。健全性と単体だけなら 約 25 秒) |
| 見つかった既存の問題 | **41 件**(横スクロール 0・44px 未満のボタン 28 種類・12px 未満の文字 4・リンク切れ 1・rel="sponsored" なし 8) |
| 基準画像 | 48 枚(12 ページ × スマホ/PC × 最初の画面/カード 3 枚)、計 約 11MB |

健全性テスト 109 件の内訳: 主要 12 ページ × (横スクロール スマホ・PC、ボタン、12px 文字、内部リンク、広告 rel、カード数、HTML の大きさ)= 95 件(お問い合わせはカード数なし)+ 主要ページ以外の HTML 14 ファイルのリンク・広告 rel 確認 14 件。

## 基準値(前回の値)

| ページ | カード | カードの数え方 | HTML | 12px 未満の文字 |
|---|---:|---|---:|---:|
| index | 8 | `.pathways > a`(入口) | 27.8 KB | 0 |
| dog-lodging-guide | 979 | `article.stay-card` | 4,282 KB | 0 |
| east-japan-dog-trips | 878 | `article.trip` | 1,691 KB | 0 |
| food | 969 | `article.card` | 4,495 KB | 1 |
| goods | 773 | `article.card` | 2,678 KB | 0 |
| wear | 641 | `article.card` | 2,517 KB | 0 |
| travel-gear | 336 | `article.card` | 1,225 KB | 0 |
| first-stay-check-instagram | 5 | `.tdc-q`(質問) | 7.4 KB | 1 |
| first-stay-check-result | 4 | `#tdr-list > li` | 8.7 KB | 1 |
| travel-prep-5-instagram | 5 | `.tp5 > li` | 7.8 KB | 1 |
| route-planner | 5 | `.card:not(.hidden)` | 62.6 KB | 0 |
| contact | — | (フォームを撮るだけ。数えない) | 9.3 KB | 0 |

カードが 10% 以上減る、HTML が 20% 以上増える、12px 未満の文字が 1 つでも増えると失敗します。

## 見つかった既存の問題(41 件)

「対象」は同じ種類の要素をまとめた名前です(例: `a.official-link` はそのクラスのリンク全部)。ボタンはスマホ 375px で、ボタン類とボタンの見た目のリンクを 44×44px と比べています(個数の合計 6,926 個、28 種類)。

### 横スクロール(0 件)

なし

### ボタン 44px 未満(28 件)

| ページ | 対象 | 内容 |
|---|---|---|
| dog-lodging-guide | `button.near-help-btn` | 979 個(最小 156.6×40px)「近くの動物病院・薬局」 |
| dog-lodging-guide | `details.stay-review-latest summary` | 347 個(最小 267×43.1px)「最新のクチコミを読む(楽天トラベル・2026-10-05 投稿)」 |
| east-japan-dog-trips | `article.outing-card.trip a` | 63 個(最小 281×43.4px)「公式の利用案内を見る ↗」 |
| east-japan-dog-trips | `article.trip a` | 837 個(最小 122.6×43.4px)「施設公式・カフェ／ドッグラン案内 ↗」 |
| east-japan-dog-trips | `blockquote.twitter-tweet a` | 1 個(最小 267.8×43.4px)「施設の公式 X の投稿を見る (@f_petpark)」 |
| east-japan-dog-trips | `details.outing-details summary` | 37 個(最小 281×24.3px)「雨天・利用ルール・出発前の確認事項 ＋」 |
| east-japan-dog-trips | `div.outing-search select` | 1 個(最小 291×40px)「すべて カフェ ドッグラン 旅行アイデア」 |
| east-japan-dog-trips | `p.facility-location a` | 418 個(最小 80×43.4px)「公式情報」 |
| east-japan-dog-trips | `p.route-plan-cta a` | 878 個(最小 187×43.4px)「ここへのわんこ旅行プラン」 |
| first-stay-check-result | `#tdr-survey-form select` | 3 個(最小 309×43px)「選んでください いつか行きたい 検討中 予約済み 経験あり」 |
| food | `a.official-link` | 151 個(最小 299×23.4px)「メーカー公式サイトで仕様を確認 ↗」 |
| food | `details.review-fold summary` | 1 個(最小 299×20.4px)「購入者レビューを読む」 |
| food | `div.card-body summary` | 925 個(最小 194×20.4px)「特徴・種類の違い・購入前の確認事項」 |
| food | `div.entry-links a` | 2 個(最小 146.5×43.6px)「体重が気になる」 |
| food | `section.k9-guide button` | 1 個(最小 188×40px)「食べムラ・お腹の候補を見る」 |
| goods | `a.official-link` | 60 個(最小 299×23.4px)「メーカー公式サイトで仕様を確認 ↗」 |
| goods | `div.card-body summary` | 773 個(最小 194×20.4px)「商品名と確認事項」 |
| index | `nav.filters a` | 17 個(最小 72×43.2px)「毎日の主食」 |
| route-planner | `div.actions.entry2 a` | 1 個(最小 205×41.8px)「決まった宿への行程を作る」 |
| route-planner | `div.four.row select` | 4 個(最小 309×40px)「10/24(土) 〜 10/25(日)(空室 276宿・犬対応プラン 90宿・新」 |
| route-planner | `div.row.three select` | 2 個(最小 309×40px)「小型(〜10kg) 中型(〜25kg) 大型(25kg〜)」 |
| travel-gear | `a.official-link` | 5 個(最小 299×23.4px)「メーカー公式サイトで仕様を確認 ↗」 |
| travel-gear | `details.review-fold summary` | 1 個(最小 299×20.4px)「購入者レビューを読む」 |
| travel-gear | `div.card-body summary` | 336 個(最小 194×20.4px)「商品名と確認事項」 |
| travel-prep-5-instagram | `a.main` | 5 個(最小 149.9×41.9px)「処理袋を見る(旅行用品)」 |
| travel-prep-5-instagram | `p.links a` | 4 個(最小 168.8×41.9px)「持ち物チェックリスト」 |
| wear | `a.official-link` | 433 個(最小 299×23.4px)「ペットパラダイスの公式サイトで仕様を確認 ↗」 |
| wear | `div.card-body summary` | 641 個(最小 194×20.4px)「商品名と確認事項」 |

### 12px 未満の文字(4 件)

| ページ | 対象 | 内容 |
|---|---|---|
| first-stay-check-instagram | `p.sns-kicker 11.52px` | 1 か所「INSTAGRAM から来た方へ」 |
| first-stay-check-result | `p.sns-kicker 11.52px` | 1 か所「初めて犬と泊まる」 |
| food | `section.daily-food-feature p 11px` | 1 か所「原材料も、食べやすさも、続けやすい価格も。」 |
| travel-prep-5-instagram | `p.sns-kicker 11.52px` | 1 か所「初めて犬と泊まる → 準備」 |

### リンク切れ(1 件)

| ページ | 対象 | 内容 |
|---|---|---|
| static:new-additions-20260923.html | `dog-lodging-guide.html#add60-japari` | dog-lodging-guide.html に id="add60-japari" がない |

### rel=sponsored なし(8 件)

| ページ | 対象 | 内容 |
|---|---|---|
| food | `https://px.a8.net/svt/ejp?a8mat=4BCGFN+ENI2R6+3J8+ZRIB5` | アフィリエイト rel="nofollow"「広告｜ネルソンズ公式サイトで価格・在庫を確認」 |
| food | `https://px.a8.net/svt/ejp?a8mat=4BCGFN+F467OY+46DW+I2I7L` | アフィリエイト rel="nofollow"「広告｜WOLF INSIGHT公式サイトで価格・在庫を確認」 |
| goods | `//ck.jp.ap.valuecommerce.com/servlet/referral?sid=3782203&pid=892712141&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fchanet%2F185609.html` | アフィリエイト rel="nofollow"「広告｜Yahoo!ショッピングで価格・在庫を確認」 |
| goods | `//ck.jp.ap.valuecommerce.com/servlet/referral?sid=3782203&pid=892712141&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fchanet%2F185610.html` | アフィリエイト rel="nofollow"「広告｜Yahoo!ショッピングで価格・在庫を確認」 |
| goods | `//ck.jp.ap.valuecommerce.com/servlet/referral?sid=3782203&pid=892712141&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fjoshin%2F4945680561273-73-30002856.html` | アフィリエイト rel="nofollow"「広告｜Yahoo!ショッピングで価格・在庫を確認」 |
| goods | `//ck.jp.ap.valuecommerce.com/servlet/referral?sid=3782203&pid=892712141&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fjoshin%2F4945680561280-73-30002856.html` | アフィリエイト rel="nofollow"「広告｜Yahoo!ショッピングで価格・在庫を確認」 |
| goods | `//ck.jp.ap.valuecommerce.com/servlet/referral?sid=3782203&pid=892712141&vc_url=https%3A%2F%2Fstore.shopping.yahoo.co.jp%2Fjoshin%2F4974926012187-73-30002855.html` | アフィリエイト rel="nofollow"「広告｜Yahoo!ショッピングで価格・在庫を確認」 |
| travel-gear | `https://px.a8.net/svt/ejp?a8mat=4BCGFN+F2ZCHE+3FF2+HXKQP` | アフィリエイト rel="nofollow"「広告｜ONEKOSAMA公式通販で価格・在庫を確認」 |


### 補足

- 44px 未満のボタンのうち、件数が多いのはカード内の折りたたみ(`summary` 約 20px、food・goods・wear・travel-gear で計 2,675 個)、「公式サイトで確認」リンク(`a.official-link` 約 23px、計 649 個)、宿カードの「近くの動物病院・薬局」(`button.near-help-btn` 40px、979 個)。カードの CSS を 1 か所直せばまとめて解消する種類です。
- 43px 台(`article.trip a`、`p.route-plan-cta a` など)は 44px にわずかに足りないものです。
- rel="sponsored" なしの 8 件は、どれも `rel="nofollow"` だけになっています(A8 の 3 件は HTML に直接、バリューコマースの 5 件は goods.html の `.vc-ad` ブロック)。
- リンク切れの `dog-lodging-guide.html#add60-japari` は、宿ページに該当する id がありません(宿ページを実際に開いて、JS が付ける id も確認したうえでの判定)。
- 参考(テストの対象外): contact.html は CSP(`script-src 'self' …`)で外部スクリプトを止めているため、ページ末尾の LinkSwitch(`vcdal.js`)は読み込まれていません。広告リンクのないページなので実害はありません。

## しきい値の決め方(スクショ比較)

1. **揺れの実測**: 同じ main を差の許容 0(`VT_MAX_DIFF_PIXELS=0`)で繰り返し撮影。最終版の手順で、基準作成後の 2 回の繰り返し(96 枚)と通常実行 1 回(48 枚)が **すべて差 0 画素**。数字の置き換えを入れる前の版でも、健全性テストと同時に動かした 3 回の繰り返し(144 枚)で差 0 画素でした。
   - 作り始めは「カード 3 枚」で毎回 1〜16% の差が出ていました。原因はサイトの `scroll-behavior: smooth` でスクロール途中に撮っていたことと、画面外のカード(`content-visibility: auto`)が描画されていなかったこと。即時スクロール・撮る 3 枚だけ描画・画像の読み込み後に位置を測り直す、で 0 になりました。
2. **毎日の更新での誤検知の確認**: 2026-10-23 の main(`2e1ddcb`)で基準画像を作り、10-24 の自動更新(空室データ・宿 1 件追加)後の main でテスト → **48 件すべて合格**。
   - 最初の版では、見出しの「978宿 → 979宿」と、空室の文の長さが変わってマスクの幅が変わったことで 5 件が失敗しました。日付・件数の数字を固定の「00」に置き換えてから塗る方式に変えて解消。
3. **検出できる大きさの実測**(わざと壊して確認):

| 変更 | 差の画素数 |
|---|---:|
| 食品カードの見出しを 1 文字変える(トレイ → トレー) | 29〜37 |
| トップの入口カードの番号の色を変える | 113〜122 |
| 1 枚目のカードを消す | 16,000 以上(画像の高さも変わる) |

→ 揺れ 0 と 1 文字の変更 29 画素の間で、**`maxDiffPixels: 20`(色の違う画素が 20 個を超えたら失敗)**、1 画素の色の差の許容 `threshold: 0.2`(Playwright の既定値)にしました。縦に長い画像(宿カード 3 枚はスマホで高さ 約 7,700px)でも許容量が変わらないよう、割合ではなく画素数で決めています。

### 毎日変わる部分の扱い

- 外部への通信(広告・SNS 埋め込み・地図タイル)は止め、外部の画像(楽天トラベルの施設写真など)は灰色の画像に差し替え
- ブラウザの時計を 2026-10-24 09:00(日本時間)に固定
- 日付・件数(〜宿・〜件・〜か所 など)の数字は「00」に、空室・満室・残り・在庫・更新・本日 などを含む短い文は「＊＊＊＊」に置き換えてからピンクで塗る
- 日付入力欄・`<time>`・`.source-date`・空室を表示しているセレクトは要素ごと塗る

数字以外の文言やカードの中身が変わったとき(宿カードの説明文の更新など)は差として出ます。意図した変更なら `npm run test:update` で基準画像を作り直してコミットします。

## 健全性テストの検出力の確認

上のスクショに加え、わざと次の変更を入れて、該当するテストが失敗することを確認しました(確認後は元に戻しています)。

| 変更 | 失敗したテスト |
|---|---|
| 幅 600px の要素を足す(travel-prep-5) | 横スクロール(はみ出した要素 `div.wide-test` 右端 616px を表示) |
| 10px の文字を足す(travel-prep-5) | 12px 未満の文字(1 → 2 か所) |
| 5 枚のうち 1 枚を消す(travel-prep-5) | カード数(20% 減) |
| 小さな広告ボタン・`rel="nofollow"` だけの A8 リンク・存在しないページと #id へのリンク・HTML を 3KB 増やす(contact) | ボタン 44px・広告 rel・内部リンク・HTML の大きさ |

contact.html は CSP でインライン style が効かないため、横スクロールと文字サイズの確認は travel-prep-5 で行いました。

## 注意

- 基準画像はこのクラウド環境(Ubuntu 24.04、Playwright 1.63.0 の Chromium、フォントは Inter・WenQuanYi Zen Hei・IPA ゴシック)で撮っています。GitHub Actions ではワークフローで同じフォントを入れますが、ランナーのフォント構成が違うとスクショが一致しないことがあります。そのときは Actions の「Run workflow」で `update_baseline` にチェックを入れて実行し、artifact の `site-health-baseline` を基準として取り込んでください。
- ワークフロー(`.github/workflows/site-health.yml`)は手動実行だけです。毎日の自動実行は、ファイル内の `schedule` のコメントを外すと有効になります(案: 日本時間 9:17)。手動実行のボタンは、ワークフローのファイルが main に入ってから表示されます。
- 「主要ボタン」は、ボタン・セレクト・`summary`・`role=button` と、ボタンの見た目のリンク(クラス名に btn・buy・cta・primary などを含む、または背景色や枠線のあるブロック表示のリンク)です。文中のテキストリンクは対象外です。
- 12px 未満の文字は、スマホ 375px で表示されている要素(画面外を含む)の数です。
