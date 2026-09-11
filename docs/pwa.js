/* Service Worker 登録（オフライン起動 / 電波なしでも遊べる） */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
