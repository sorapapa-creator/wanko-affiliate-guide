// 公開時は apiBase に Cloudflare Worker のURLを入れる(例: "https://wanko-route-proxy.xxxx.workers.dev")。
// dataBase は相対パス("./data/")にしておく。開発サーバーでもサイトの /route-planner/ 配下でも同じ設定で動く。
window.PLANNER_CONFIG = {
  apiBase: "https://wanko-route-proxy.wanko-guide.workers.dev",
  dataBase: "./data/",
  nearbyKm: 30,
  restMinutes: 20,
};
