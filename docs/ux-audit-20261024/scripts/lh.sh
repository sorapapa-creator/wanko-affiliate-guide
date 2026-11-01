#!/bin/bash
# 使い方: lh.sh <label>  各ページを Lighthouse モバイル(既定のシミュレート低速 4G)で 1 回ずつ計測
S=$(dirname "$0"); L=$1; PORT=$2; mkdir -p $S/lh-$L
CH=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome | head -1)
for p in index.html dog-lodging-guide.html east-japan-dog-trips.html food.html goods.html wear.html travel-gear.html first-stay-check-instagram.html first-stay-check-result.html travel-prep-5-instagram.html; do
  CHROME_PATH=$CH $S/lh/node_modules/.bin/lighthouse "http://localhost:$PORT/wanko-affiliate-guide/$p" --only-categories=performance --output=json --output-path=$S/lh-$L/${p%.html}.json --chrome-flags="--headless=new --no-sandbox" --blocked-url-patterns='*valuecommerce*' --blocked-url-patterns='*instagram.com*' --blocked-url-patterns='*cloudflareinsights*' --blocked-url-patterns='*twitter.com*' --max-wait-for-load=90000 --quiet || echo FAIL $p
done
echo done
