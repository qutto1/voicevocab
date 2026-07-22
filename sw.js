// オフラインキャッシュ（音声認識自体はオンライン必須）
const CACHE = "voicevocab-v18";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js", "./words.js", "./manifest.json", "./icon.svg",
  "./lib/kuromoji/kuromoji.js",
];
// 同音異義語判定用の辞書データ(約17MB)。初回インストールを遅くしないよう
// installでは事前キャッシュせず、実際に使われたタイミングでキャッシュに保存する（下のfetchハンドラ参照）
const DICT_PATH = "/lib/kuromoji/dict/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes(DICT_PATH)) {
    // 辞書データは中身が変わらないので、一度取得したらキャッシュに保存して次回以降オフラインでも使えるようにする
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
