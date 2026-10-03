# 旅行プラン(route-planner)が使う外部データの表記(開発者向け)

## OpenPOI API(https://openpoiapi.com/、2026-10-03 から利用)
- 用途: 最終行程表の「もしものときの近くの施設」(行き先周辺の動物病院・薬局)。キー不要・無料。結果は利用者のブラウザに 24 時間だけ記憶し、サーバーには保存しない
- 画面の表記: 「出典: OpenPOI API」(https://openpoiapi.com/attribution.html へのリンク)+ Overture Maps Foundation / Japan Food Facilities の出典
- ライセンス: Overture Maps Places = CDLA-Permissive-2.0(Meta・Microsoft 等)、Apache-2.0(Foursquare)、CC0-1.0(AllThePlaces)。Japan Food Facilities = CC BY / PDL1.0 / CC0(出典ごと)。住所コード表 = Geolonia 住所データ(CC BY 4.0)
- Foursquare 由来のデータを API 経由で使うため、以下の NOTICE を開発者向け文書(このファイル)に転記する

## Foursquare OS Places NOTICE(https://opensource.foursquare.com/places-notice-txt/ より転記、2026-10-03)

```
Foursquare OS Places Notice

© 2026 Foursquare Labs, Inc. All rights reserved. 

The Foursquare OS Places dataset (the “Data”) is licensed under the Apache License, Version 2.0 (the “License”). You may not use, modify, or distribute the Data except in compliance with the License. 

As set forth more fully in the License, if you use, modify, or distribute the Data, you must: 
– provide recipients with a copy of the License. 
– if applicable, include prominent notices to the extent you’ve changed the Data. 
– preserve attribution to Foursquare, including preserving the full content of this NOTICE.txt file. 

To ensure appropriate attribution to Foursquare, we recommend the following:
– if using/distributing the Data in flat file form as-is or after making changes/modifications: include this NOTICE.txt file, which may be modified to include an additional notice of your changes/modifications, if any. 
– if using/distributing the Data in API form as-is or after making changes/modifications: include a copy of the content from this NOTICE.txt file prominently in your developer documentation for such API, which may be modified to include an additional notice of your changes/modifications, if any. 

You may obtain a copy of the License at: http://www.apache.org/licenses/LICENSE-2.0. Unless required by applicable law or agreed to in writing, the Data distributed under the License is distributed on an “AS IS” BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 

See the License for the specific language governing permissions and limitations under the License. 

We also encourage you to join our Placemaker community where you can contribute and provide suggestions to improve the accuracy of the Data for future releases for yourself and others.```

## 国土数値情報 鉄道データ(N02-24)(2026-10-03 から利用)
- 用途: 出発地の「駅名で探す」(route-planner/data/stations.json)。国土交通省 国土数値情報ダウンロードサイトの鉄道データ(N02-24)から、掲載範囲 14 都県の駅を抜き出し、同じ駅名で近いものをまとめ、都道府県を国土地理院の逆ジオコーダで判定して作成(tools/build_stations.py)
- 表記: 「国土数値情報(鉄道データ N02-24、国土交通省)を加工して作成」(画面の脚注に記載)。利用規約: https://nlftp.mlit.go.jp/ksj/other/agreement.html
