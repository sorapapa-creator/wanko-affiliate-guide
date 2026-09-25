// 公開時は apiBase に Cloudflare Worker のURLを入れる(例: "https://wanko-route-proxy.xxxx.workers.dev")。
// 手元の開発サーバー(dev/dev_server.py)では空のままで同じサーバーの /routes を使う。
window.PLANNER_CONFIG = {
  apiBase: "https://wanko-route-proxy.wanko-guide.workers.dev",
  dataBase: "./data/",
  nearbyKm: 30,
  restMinutes: 20,
  // 天気の表示(段階1)。オーナーの承認と Worker の WEATHER_ENABLED 設定の後に true にする
  weatherEnabled: false,
};
