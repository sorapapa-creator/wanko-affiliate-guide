/* 旅行プランの「近くの掲載先」から開いたとき(URL に plan=1)、施設カードに「旅行プランに入れる」を出す(2026-10-04)。
   押すと localStorage で旅行プランのタブに知らせ、そちらの「近くで犬と行ける場所」にチェックが入る。 */
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("plan") !== "1") return;
  var card = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  if (!card) return;
  var name = (card.querySelector("h2") || {}).textContent || "";
  var bar = document.createElement("div");
  bar.className = "plan-add-bar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "旅行プランに入れる");
  bar.innerHTML = '<span class="plan-add-name"></span><button type="button" class="plan-add-go">この場所を旅行プランに入れる</button>';
  bar.querySelector(".plan-add-name").textContent = name;
  document.body.appendChild(bar);
  bar.querySelector(".plan-add-go").addEventListener("click", function () {
    try { localStorage.setItem("wanko:plan-add", JSON.stringify({ id: card.id, name: name, ts: Date.now() })); } catch (e) {}
    bar.innerHTML = '<span>「' + name.replace(/[<>&]/g, "") + '」を旅行プランに入れました。旅行プランのタブに戻ってください。</span><button type="button" class="plan-add-close">このタブを閉じる</button>';
    bar.querySelector(".plan-add-close").addEventListener("click", function () { window.close(); });
  });
})();
