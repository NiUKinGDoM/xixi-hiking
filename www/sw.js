/* XiXiの徒步小记 - Service Worker（★2026-08-27 网页版离线可用）
 * network-first：在线取最新（更新立即可见），断网回退缓存（App 壳可离线打开，数据在本地 IndexedDB）
 * ★2026-08-27 CACHE_NAME v1→v2：强制旧 SW 失效重缓存（用户反馈网页版功能未更新，疑似缓存旧壳）
 */
const CACHE_NAME = 'xixi-hiking-v2';
const CORE_ASSETS = ['./', './index.html', './share-bg.jpg'];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (c) {
            return c.addAll(CORE_ASSETS);
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;
    // 只处理同源页面/资源，API/跨域不动
    var url = new URL(req.url);
    if (url.origin !== location.origin) return;
    e.respondWith(
        fetch(req).then(function (res) {
            var copy = res.clone();
            caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
            return res;
        }).catch(function () {
            return caches.match(req).then(function (hit) { return hit || caches.match('./index.html'); });
        })
    );
});
