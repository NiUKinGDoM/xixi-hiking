/* XiXiの徒步小记 - Service Worker（★2026-08-27 网页版离线可用）
 * network-first：在线取最新（更新立即可见），断网回退缓存（App 壳可离线打开，数据在本地 IndexedDB）
 * ★2026-08-27 CACHE_NAME v1→v2：强制旧 SW 失效重缓存（用户反馈网页版功能未更新，疑似缓存旧壳）
 * ★2026-08-30 v2→v3：方案A 主 JS 拆外部文件，缓存清单加 app-*.js
 * ★2026-08-31 v3→v4：计划日历视图 + 计划完成补记录
 * ★2026-09-03 v4→v5：v1.1.8.4 大版本（年度回顾/我的山册/过期提醒）+ iOS 网页适配
 * ★2026-09-03 v5→v6：＋添加弹窗(从历史复制/直接新建) + 年回和去年比 + 弹窗设计统一
 * ★2026-09-03 v6→v7：v1.1.8.6（小结文案活泼化 + XSS 转义加固）
 * ★2026-09-03 v7→v8：山册照片回忆横排带 + 同步健康行（v1.1.8.6 后积累，未 bump）
 * ★2026-09-03 v8→v9：v1.1.8.7（山册照片回忆/健康行融合/滚动条玻璃）
 */
const CACHE_NAME = 'xixi-hiking-v9';
const CORE_ASSETS = ['./', './index.html', './share-bg.jpg', './app-core.js', './app-data.js', './app-sync.js', './app-init.js'];

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
