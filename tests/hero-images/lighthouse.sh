#!/usr/bin/env bash
# Lighthouse モバイル(既定のシミュレート低速回線・375px 相当)を各ページ 3 回ずつ測り、JSON の要点を TSV に書き出す。
# 先に serve-gzip.js でリポジトリ直下を配信しておく。
# 使い方: LIGHTHOUSE="npx lighthouse" bash tests/hero-images/lighthouse.sh before|after 出力フォルダ
set -euo pipefail
label=$1; out=$2; base=${BASE:-http://127.0.0.1:8080}
LIGHTHOUSE=${LIGHTHOUSE:-lighthouse}
export CHROME_PATH=${CHROME_PATH:-/opt/pw-browsers/chromium}
mkdir -p "$out/raw"
pages=(travel-gear autumn-winter-dog-trips goods food wear index dog-trip-checklist)
# 広告・外部画像を止める
blocks=(--blocked-url-patterns='*rakuten*' --blocked-url-patterns='*amazon*' --blocked-url-patterns='*yahoo*'
        --blocked-url-patterns='*valuecommerce*' --blocked-url-patterns='*cloudflareinsights*')
for p in "${pages[@]}"; do
  for i in 1 2 3; do
    f="$out/raw/$label-$p-$i.json"
    $LIGHTHOUSE "$base/$p.html" --quiet --only-categories=performance --form-factor=mobile \
      --chrome-flags='--headless=new --no-sandbox' "${blocks[@]}" --output=json --output-path="$f" >/dev/null 2>&1
    node -e '
      const r=require(process.argv[1]), a=r.audits;
      const img=(a["network-requests"].details.items||[]).filter(x=>/05-outdoor-brothers|play-dog|moment-smile|moment-rest/.test(x.url)).map(x=>x.url.split("/").pop()+":"+x.transferSize).join(",");
      console.log([process.argv[2],process.argv[3],process.argv[4],Math.round(r.categories.performance.score*100),
        Math.round(a["largest-contentful-paint"].numericValue),Math.round(a["total-byte-weight"].numericValue),img].join("\t"));' \
      "$(realpath "$f")" "$label" "$p" "$i" | tee -a "$out/$label.tsv"
  done
done
