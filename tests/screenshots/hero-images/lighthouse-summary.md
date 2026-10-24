# Lighthouse モバイル 前後比較(各 3 回の中央値)

Lighthouse 12.8.2、モバイル(既定のシミュレート低速 4G・CPU 4 倍減速)、Chromium 1243 headless。
ローカル配信(tests/hero-images/serve-gzip.js、gzip あり)。広告・外部画像は blocked-url-patterns で停止: *rakuten* / *amazon* / *yahoo* / *valuecommerce* / *cloudflareinsights*。
生データ: before.tsv / after.tsv(ラベル・ページ・回・性能・LCP ms・転送量 bytes・対象画像の転送量)。

| ページ | 性能 前→後 | LCP 前→後 | 転送量 前→後 | 3 回の LCP(前 / 後) |
|---|---|---|---|---|
| travel-gear.html | 76 → 77 | 6.53 秒 → 6.08 秒 | 555KB → 493KB (-62KB) | 7.2, 5.7, 6.5 / 6.2, 6.0, 6.1 |
| autumn-winter-dog-trips.html | 91 → 93 | 3.46 秒 → 3.15 秒 | 417KB → 355KB (-62KB) | 3.5, 3.5, 3.5 / 3.2, 3.2, 3.2 |
| goods.html | 78 → 79 | 4.58 秒 → 4.58 秒 | 434KB → 426KB (-8KB) | 4.6, 4.6, 4.6 / 4.6, 3.8, 4.7 |
| food.html | 52 → 53 | 4.97 秒 → 4.75 秒 | 565KB → 555KB (-10KB) | 5.0, 5.0, 5.0 / 4.7, 4.7, 4.8 |
| wear.html | 86 → 86 | 3.83 秒 → 3.68 秒 | 314KB → 304KB (-9KB) | 3.8, 3.8, 3.3 / 3.2, 3.7, 3.8 |
| index.html | 98 → 98 | 2.18 秒 → 2.18 秒 | 171KB → 171KB (+0KB) | 2.2, 2.2, 2.2 / 2.2, 2.2, 2.2 |
| dog-trip-checklist.html | 99 → 99 | 1.81 秒 → 1.66 秒 | 109KB → 100KB (-9KB) | 1.8, 1.8, 1.8 / 1.7, 1.7, 1.7 |
