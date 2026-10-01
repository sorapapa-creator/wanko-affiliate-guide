// 公開時は apiBase に Cloudflare Worker のURLを入れる(例: "https://wanko-route-proxy.xxxx.workers.dev")。
// 手元の開発サーバー(dev/dev_server.py)では空のままで同じサーバーの /routes を使う。
window.PLANNER_CONFIG = {
  apiBase: "https://wanko-route-proxy.wanko-guide.workers.dev",
  dataBase: "./data/",
  nearbyKm: 30,
  restMinutes: 20,
  // 天気の表示(段階1)。オーナーの承認と Worker の WEATHER_ENABLED 設定の後に true にする
  weatherEnabled: false,
  // 地図(段階2)。ブラウザ用の Maps JavaScript API キー(公開前提: HTTP リファラを本サイトに限定、API も Maps JavaScript API のみ)と Map ID。
  // 経路計算に使う Worker 側のキーとは別物。手元の開発サーバー(localhost)はリファラ制限の対象外なので地図は出ない
  mapEnabled: true,
  mapsApiKey: "AIzaSyDERhoNop8SWYhTu-Tup6Gcc-7RSPh24kY",
  mapId: "942286c10ca55215fab943b6",
};
