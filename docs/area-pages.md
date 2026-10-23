# 地域別ページ(areas/)の作り方

「軽井沢 犬と泊まれる宿」のような地域名の検索から入れるように、県・市町村・観光地ごとに
「犬と泊まれる宿・犬とおでかけ」のページを `areas/` に自動で作ります。

## 使い方

リポジトリの一番上で実行します(Python 3 の標準ライブラリだけで動きます)。

```sh
python3 tools/build_area_pages.py          # areas/*.html と sitemap.xml を作り直す
python3 tools/build_area_pages.py --check  # 書き換えずに、変わるファイルの数だけ表示(変わるものがあると終了コード 1)
```

宿・おでかけのカードを足したあと(places.json と元ページの両方が更新されたあと)に実行し、
`areas/` と `sitemap.xml` の変更をいっしょにコミットしてください。
入力が同じなら何度実行しても同じ結果になります(日時や乱数は使っていません)。

## 何を読んで、何を書くか

| 種類 | ファイル | 使い方 |
| --- | --- | --- |
| 読む | `route-planner/data/places.json` | 名前・所在地(area)・犬の条件(facts)・公式リンク・位置 |
| 読む | `dog-lodging-guide.html` | 宿カードの有無、カード内の広告ボタン(URL と文言をそのまま)、確認日 |
| 読む | `east-japan-dog-trips.html` | おでかけカードの有無、確認日 |
| 書く | `areas/<slug>.html`、`areas/index.html` | 地域ページと一覧ページ(毎回すべて作り直す。不要になったページは消す) |
| 書く | `sitemap.xml` | `/areas/` を含む行だけを入れ替える。ほかの行はそのまま |

元ページ(dog-lodging-guide.html など)は読むだけで、書き換えません。
元ページにカードが無い places.json の項目は、リンク先が無いので載せません(実行時に id を表示します)。

見た目は `assets/editorial.css` と、地域ページ専用の `assets/area-pages.css` を使います。

## 地域の決め方

- 所在地(area)の文字列から、県と市区町村を機械的に取り出します(「北佐久郡」などの郡は外す)。
  市区町村が書かれていないもの(「長野県軽井沢」「静岡県伊豆高原」など)は、スクリプト内の `ALIASES` で読み替え、
  それでも決まらないときは公式ページの住所(`geocode.matched`)を同じ県に限って使います。
- 掲載が 8 件(`MIN_ITEMS`)以上ある県・市区町村にページを作ります。
- 市区町村のページの URL(slug)と見出しの呼び名は `MUNIS` に書いてあります。
  掲載が 8 件を超えたのに `MUNIS` に無い市区町村があると、実行時に
  「slug が無いためページを作れなかった市区町村」と表示されるので、`MUNIS` に 1 行足してください。
  一度公開した slug は変えないでください(URL が変わります)。
- 伊豆・富士五湖・八ヶ岳など、いくつかの市町村にまたがる観光地は `GROUPS` にメンバーの市町村を書いて決めています。

## ページに載せるもの

- 宿: 所在地、名前、添い寝の区分、犬の条件(対象犬・頭数、夜の寝る場所、ケージ、食事同伴)、確認日、
  元カードの広告ボタン(「広告」表示と `rel="sponsored nofollow noopener"` を付ける)、公式リンク、元カードへのリンク。
- おでかけ: 所在地、名前、種類、テーマ、犬の条件(同伴範囲、料金の目安、雨の日)、確認日、公式リンク、元カードへのリンク。
- 宿から直線 5 km 以内に掲載中のおでかけ先があれば、いちばん近いものを宿カードに載せます(位置が施設単位でわかるものだけ)。
- 導入文は件数・添い寝の区分・おでかけの種類の内訳など、データから数えられることだけで作ります。
  口コミ・評価・ランキング・価格は新しく作りません。カードの並びは places.json の順で、広告の有無では変えません。
- 「近くの地域」は、掲載施設の位置の中心が近い順に並べます。
- 各ページに title・meta description・canonical・OG・パンくず、BreadcrumbList と ItemList の JSON-LD を入れます。

## 毎朝のデータ更新のあとに作り直す

地域ページは places.json と元ページ(dog-lodging-guide.html・east-japan-dog-trips.html)から作るので、
朝の更新で宿・おでかけのカードが増えたり直ったりしたら、そのたびに作り直します。
空室データ(`route-planner/data/vacancy/`)だけの更新では地域ページは変わりません(読んでいないため)。

### 手順(手元で行う場合)

朝の更新(places.json と元ページの両方)を main に入れたあとで、リポジトリの一番上で:

```sh
git pull origin main
python3 tools/build_area_pages.py --check   # 「変わるファイル 0 件」ならここで終わり
python3 tools/build_area_pages.py           # 作り直す
python3 tests/area-pages.test.py            # 10 項目すべて ok になるか
git add areas sitemap.xml
git commit -m "地域ページを作り直す($(date +%F) のデータ)"
git push origin main
```

- 実行結果に「slug が無いためページを作れなかった市区町村」が出たら、掲載が 8 件を超えた市区町村があるということです。
  `tools/build_area_pages.py` の `MUNIS` に `("県", "市区町村"): ("ローマ字の slug", "見出しの呼び名"),` を 1 行足して、もう一度実行します。
  一度公開した slug は変えないでください。
- 「元ページにカードが無いため外したもの」は、places.json にはあるが元ページにカードが無い id です。
  片方だけ更新された状態で実行すると増えるので、両方そろってから実行してください(数が急に増えたら更新の途中です)。
- `areas/*.html` を手で直さないでください。次の実行で上書きされます。直したいときは生成器かデータを直します。
- 朝の更新スクリプトの最後に、次の 2 行を足すのがいちばん手間がかかりません(更新と同じコミットに入ります)。

  ```sh
  python3 tools/build_area_pages.py && python3 tests/area-pages.test.py && git add areas sitemap.xml
  ```

### GitHub Actions で自動にする(案・既定では無効)

`.github/workflows/area-pages.yml` に、main に places.json・元ページ・生成器の変更が push されたら
作り直してコミットするワークフローを置いています。**既定では動きません。** 使うときは次のどちらかです。

- 毎回自動で動かす: リポジトリの Settings → Secrets and variables → Actions → Variables に
  `AREA_PAGES_AUTO` = `true` を追加する(消すか `true` 以外にすると止まる)。
- 必要なときだけ動かす: Actions タブ → 「地域ページを作り直す」→ Run workflow(変数がなくても動きます)。

動いたときにすること: 生成器を実行 → `tests/area-pages.test.py` → 差分があれば
「地域ページを作り直す(自動)」というコミットを github-actions のアカウントで main に push。
テストが通らないときはコミットせずに失敗として残ります。

自動にするときの注意:

- 自動のコミットが main に入るので、手元で次に push する前に `git pull` が必要になります(朝の更新スクリプトの最初に `git pull --rebase origin main` を入れておくと安全です)。
- `GITHUB_TOKEN` での push は、ほかのワークフローを起動しません(このワークフロー自身が繰り返し動くことはありません)。
  GitHub Pages の公開がこの push で更新されるかは、最初の 1 回で Actions タブの「pages build and deployment」を見て確かめてください。
  更新されない場合は、手元の朝の更新に上の 2 行を足す方法にしてください。
- 新しい市区町村の slug が必要になったとき(上の「slug が無い」)は、ワークフローは警告を出すだけで、ページは作りません。
