#!/usr/bin/env node
/**
 * ioscheck.js — iOS 网页版同步适配体检
 *
 * 背景：pages.dev 是 iOS 唯一入口，但 iOS Safari 与安卓/原生 App 能力不同
 *       （无 navigator.vibrate、a[download] 无效、无系统通知栏、无原生桥）。
 *       每次新增功能都必须做配套降级，否则 iOS 用户会「点了没反应」。
 *
 * 三项检查：
 *   ① 版本对齐 — iOS 网页版与 APK 是否同一版本（同时看线上 pages.dev / Release）
 *   ② 能力守卫 — 已知平台差异 API 是否都有降级守卫（静态，防新增功能漏适配）
 *   ③ 模拟实测 — 无桥 + 无 vibrate 环境下跑一遍所有差异能力（需浏览器）
 *
 * 用法：
 *   node tools/ioscheck.js              # 全跑
 *   node tools/ioscheck.js --no-sim     # 跳过浏览器实测（快）
 *   node tools/ioscheck.js --no-net     # 跳过远程查询（离线）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const PROJ = path.resolve(ROOT, '..');
const GH = path.join(PROJ, 'backups', 'github-同步目录', 'xixi-hiking');
const WWW_FILES = ['app-core.js', 'app-data.js', 'app-init.js', 'app-sync.js'];
const INDEX = path.join(WWW, 'index.html');

const ARGS = process.argv.slice(2);
const NO_SIM = ARGS.includes('--no-sim');
const NO_NET = ARGS.includes('--no-net');

const fails = [];
let passCount = 0;
function ok(msg) { console.log('  \u2705 ' + msg); passCount++; }
function warn(msg) { console.log('  \u26a0\ufe0f  ' + msg); }
function bad(msg) { console.log('  \u274c ' + msg); fails.push(msg); }
function head(t) { console.log('\n\u3010' + t + '\u3011'); }

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }
// 版本号比较（四段数字）
function cmpVer(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}
const GIT_BINS = [
    'git',
    'C:/Users/NIU-XC/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe'
];
// \u2605\u6ce8\u610f\uff1a\u4e0d\u80fd\u7528\u300c\u6700\u5927\u7248\u672c\u53f7 tag\u300d\u5224\u6700\u65b0\u53d1\u5e03 \u2014\u2014 \u672c\u9879\u76ee\u65e9\u671f\uff082026-08-09/10\uff09
//   \u7528\u8fc7 1.4.x \u7248\u672c\u53f7\u4f53\u7cfb\uff0c\u90a3\u4e9b tag \u81f3\u4eca\u7559\u5728\u4ed3\u5e93\u91cc\uff0c\u7248\u672c\u53f7\u9ad8\u4e8e\u5f53\u524d 1.2.x\u3002
//   App \u5185\u300c\u68c0\u67e5\u66f4\u65b0\u300d\u8bfb\u7684\u662f GitHub Release latest\uff08\u6309\u53d1\u5e03\u65f6\u95f4\uff09\uff0c\u4e0d\u53d7\u5f71\u54cd\u3002
// API \u53d6\u4e0d\u5230\u65f6\u7684\u515c\u5e95\uff1a\u6bd4\u8f83\u8fdc\u7a0b HEAD \u4e0e\u672c\u5730 HEAD\uff08\u786e\u8ba4\u63a8\u9001\u72b6\u6001\uff09\uff0c\u4e0d\u731c\u7248\u672c\u53f7\u3002
function remoteHeadState() {
    if (!fs.existsSync(GH)) return null;
    for (const bin of GIT_BINS) {
        const lr = spawnSync(bin, ['rev-parse', 'HEAD'], { cwd: GH, encoding: 'utf8' });
        if (lr.error && lr.error.code === 'ENOENT') continue;
        const local = String(lr.stdout || '').trim();
        if (!local) return null;
        const ips = ['140.82.112.3', '140.82.113.3', '140.82.114.3', ''];
        for (const ip of ips) {
            const args = ['-c', 'credential.helper=', '-c', 'http.proxy=', '-c', 'https.proxy='];
            if (ip) args.push('-c', 'http.curloptResolve=github.com:443:' + ip);
            args.push('ls-remote', 'origin', 'HEAD');
            const r = spawnSync(bin, args, { cwd: GH, encoding: 'utf8', timeout: 25000 });
            const h = String(r.stdout || '').split(/\s+/)[0];
            if (h) return h === local ? 'equal' : 'diff';
        }
        return null;
    }
    return null;
}
// \u4ed3\u5e93\u91cc\u662f\u5426\u5b58\u5728\u300c\u7248\u672c\u53f7\u9ad8\u4e8e\u5f53\u524d\u300d\u7684 tag\uff08\u9632\u62a4\uff1a\u5c06\u6765\u82e5\u6539\u6210\u626b tag \u53d6\u6700\u5927\u4f1a\u8bef\u5224\uff09
function tagsAbove(ver) {
    if (!fs.existsSync(GH)) return [];
    for (const bin of GIT_BINS) {
        const r = spawnSync(bin, ['tag'], { cwd: GH, encoding: 'utf8' });
        if (r.error && r.error.code === 'ENOENT') continue;
        return String(r.stdout || '').split('\n')
            .map(function (s) { return s.trim().replace(/^v/, ''); })
            .filter(function (t) { return /^\d+\.\d+\.\d+\.\d+$/.test(t) && cmpVer(t, ver) > 0; })
            .sort(cmpVer);
    }
    return [];
}
function get(url, timeout) {
    return new Promise(function (resolve) {
        const req = https.get(url, { timeout: timeout || 12000, headers: { 'User-Agent': 'ioscheck' } }, function (res) {
            let d = '';
            res.on('data', function (c) { d += c; });
            res.on('end', function () { resolve(res.statusCode === 200 ? d : null); });
        });
        req.on('error', function () { resolve(null); });
        req.on('timeout', function () { req.destroy(); resolve(null); });
    });
}

(async function main() {
    console.log('\n\u2554\u2550\u2550 iOS \u7f51\u9875\u7248\u540c\u6b65\u9002\u914d\u4f53\u68c0 \u2550\u2550');
    console.log('\u2551 pages.dev = iOS \u552f\u4e00\u5165\u53e3\uff0c\u9700\u4e0e APK \u540c\u6b65\u9002\u914d');

    // ─────────── ① 版本对齐 ───────────
    head('① 版本对齐（iOS 网页版 vs APK）');
    const gradle = read(path.join(ROOT, 'android/app/build.gradle'));
    const mName = gradle.match(/versionName\s+"([^"]+)"/);
    const mCode = gradle.match(/versionCode\s+(\d+)/);
    const core = read(path.join(WWW, 'app-core.js'));
    const mApp = core.match(/APP_VERSION\s*=\s*'([^']+)'/);
    const idx = read(INDEX);
    const mAbout = idx.match(/about-version[^>]*>\s*\u7248\u672c\s*([0-9.]+)/);
    const localVer = mApp ? mApp[1] : null;

    console.log('  build.gradle  versionName : ' + (mName ? mName[1] : '\u672a\u627e\u5230') + '  (vc' + (mCode ? mCode[1] : '?') + ')');
    console.log('  app-core.js   APP_VERSION : ' + (mApp ? mApp[1] : '\u672a\u627e\u5230'));
    console.log('  index.html    \u5173\u4e8e\u9875\u7248\u672c  : ' + (mAbout ? mAbout[1] : '\u672a\u627e\u5230'));

    const localThree = [mName && mName[1], mApp && mApp[1], mAbout && mAbout[1]];
    if (localThree.every(function (v) { return v === localVer; })) {
        ok('\u672c\u5730\u4e09\u5904\u4e00\u81f4 \u2192 v' + localVer);
    } else {
        bad('\u672c\u5730\u4e09\u5904\u4e0d\u4e00\u81f4\uff1a' + JSON.stringify(localThree));
    }

    if (NO_NET) {
        warn('\u5df2\u8df3\u8fc7\u8fdc\u7a0b\u67e5\u8be2\uff08--no-net\uff09');
    } else {
        const online = await get('https://xixi-hiking.pages.dev/app-core.js');
        const mOn = online && online.match(/APP_VERSION\s*=\s*'([^']+)'/);
        if (!mOn) {
            warn('\u7ebf\u4e0a pages.dev \u67e5\u8be2\u5931\u8d25\uff08\u7f51\u7edc\u95ee\u9898\uff0c\u975e\u4ee3\u7801\u95ee\u9898\uff09');
        } else if (mOn[1] === localVer) {
            ok('\u7ebf\u4e0a pages.dev \u5df2\u662f v' + mOn[1] + '\uff08iOS \u7528\u6237\u770b\u5230\u7684\u5c31\u662f\u8fd9\u4e2a\uff09');
        } else {
            bad('\u7ebf\u4e0a pages.dev = v' + mOn[1] + '\uff0c\u672c\u5730 = v' + localVer + ' \u2192 iOS \u7528\u6237\u8fd8\u5728\u65e7\u7248\uff01\u53d1\u7248\u672a\u5b8c\u6210\u6216\u90e8\u7f72\u672a\u751f\u6548');
        }
        const rel = await get('https://api.github.com/repos/NiUKinGDoM/xixi-hiking/releases/latest');
        let tag = null;
        try { tag = JSON.parse(rel).tag_name; } catch (e) { }
        if (tag && tag.replace(/^v/, '') === localVer) {
            ok('\u8fdc\u7a0b Release latest = ' + tag + '\uff08iOS \u7528\u6237\u53ef\u4e0b\u5230\u7684\u7248\u672c\uff09');
        } else if (tag) {
            bad('\u8fdc\u7a0b Release latest = ' + tag + '\uff0c\u672c\u5730 = v' + localVer);
        } else {
            const st = remoteHeadState();
            if (st === 'equal') ok('\u8fdc\u7a0b HEAD \u4e0e\u672c\u5730\u4e00\u81f4\uff08Release \u672a\u6821\u9a8c\uff1aAPI \u4e0d\u53ef\u7528\uff09');
            else if (st === 'diff') bad('\u8fdc\u7a0b HEAD \u4e0e\u672c\u5730\u4e0d\u4e00\u81f4 \u2192 \u4ee3\u7801\u53ef\u80fd\u672a\u63a8\u9001\u5b8c');
            else warn('\u8fdc\u7a0b\u67e5\u8be2\u5931\u8d25\uff08\u7f51\u7edc\uff0c\u975e\u4ee3\u7801\u95ee\u9898\uff09');
        }
        const above = tagsAbove(localVer);
        if (above.length) {
            console.log('  \u00b7  \u5386\u53f2 tag \u63d0\u793a\uff1a\u4ed3\u5e93\u91cc\u6709 ' + above.length + ' \u4e2a\u7248\u672c\u53f7\u9ad8\u4e8e\u5f53\u524d\u7684 tag\uff08'
                + above.slice(-2).map(function (v) { return 'v' + v; }).join(' / ') + ' \u7b49\uff09\u2014\u2014\u65e9\u671f 1.4.x \u4f53\u7cfb\u9057\u7559\uff0c'
                + 'App \u53d6 Release latest \u5224\u65ad\uff0c\u4e0d\u53d7\u5f71\u54cd');
        }
    }

    // ─────────── ② 能力守卫 ───────────
    head('② 能力守卫（新增功能漏适配会在这里暴露）');
    const src = {};
    WWW_FILES.forEach(function (f) {
        const t = read(path.join(WWW, f));
        if (t) src[f] = t.replace(/\r\n/g, '\n');
    });
    const allJs = Object.keys(src).map(function (k) { return src[k]; }).join('\n');
    const idxText = idx.replace(/\r\n/g, '\n');

    // 危险 API → 必备守卫。used 表示代码里用了该 API，guard 表示降级守卫是否在位
    const CAPS = [
        {
            name: '\u9707\u52a8 navigator.vibrate\uff08iOS Safari \u4e0d\u652f\u6301\uff09',
            used: /navigator\.vibrate/,
            // 守卫写法可有多种：typeof 判断 / 真值判断 if (navigator.vibrate) / && 短路
            guard: /typeof\s+navigator\.vibrate|typeof\s+vibrate|if\s*\(\s*navigator\.vibrate\s*\)|navigator\.vibrate\s*&&|navigator\.vibrate\s*\?/,
            where: 'js'
        },
        {
            name: '\u4e0b\u8f7d a[download]\uff08iOS Safari \u65e0\u6548\uff09',
            used: /\.download\s*=/,
            guard: /isIOSWeb|isIOSWebview/,
            where: 'js'
        },
        {
            name: '\u539f\u751f\u6865 XixiFileBridge\uff08\u7f51\u9875\u7248\u65e0\u6865\uff09',
            used: /XixiFileBridge\.[a-zA-Z]/,
            guard: /typeof\s+(window\.)?XixiFileBridge|hasBridge/,
            where: 'js'
        },
        {
            name: '\u7cfb\u7edf\u901a\u77e5 Notification\uff08\u7f51\u9875\u7248\u65e0\u901a\u77e5\u680f\uff09',
            used: /new Notification|Notification\.requestPermission/,
            guard: /'Notification' in window|typeof\s+Notification|typeof\s+window\.Notification/,
            where: 'js'
        },
        {
            name: '\u7cfb\u7edf\u5206\u4eab navigator.share\uff08\u9700\u80fd\u529b\u68c0\u6d4b\uff09',
            used: /navigator\.share/,
            guard: /navigator\.share\s*&&|typeof\s+navigator\.share/,
            where: 'js'
        },
        {
            name: '\u5b58\u50a8 IndexedDB\uff08\u9700\u5b58\u5728\u6027\u5224\u65ad\uff09',
            used: /indexedDB\.open|window\.indexedDB/,
            guard: /!?\s*window\.indexedDB|typeof\s+(window\.)?indexedDB|'indexedDB'\s+in\s+window/,
            where: 'js'
        }
    ];
    CAPS.forEach(function (c) {
        const target = c.where === 'js' ? allJs : idxText;
        if (!c.used.test(target)) { console.log('  \u00b7  ' + c.name + ' \u2014 \u672a\u4f7f\u7528\uff0c\u8df3\u8fc7'); return; }
        if (c.guard.test(target)) ok(c.name + ' \u2014 \u5b88\u536b\u5728\u4f4d');
        else bad(c.name + ' \u2014 \u7528\u4e86\u4f46\u6ca1\u6709\u964d\u7ea7\u5b88\u536b\uff01');
    });

    // iOS 必备 CSS 适配
    head('③ iOS 界面适配（CSS）');
    const CSS_NEED = [
        { re: /safe-area-inset/, desc: '\u5b89\u5168\u533a\uff08\u907f\u5f00\u6ecb\u5c4f\u624b\u52bf\u6761\uff09' },
        { re: /-webkit-text-size-adjust/, desc: '\u7981\u6b62\u5b57\u4f53\u81ea\u52a8\u653e\u5927' },
        { re: /100dvh|100vh/, desc: '\u89c6\u53e3\u9ad8\u5ea6\uff08iOS \u5730\u5740\u680f\u6536\u653e\uff09' },
        { re: /-webkit-overflow-scrolling/, desc: '\u6eda\u52a8\u987a\u6ed1' }
    ];
    CSS_NEED.forEach(function (c) {
        const n = (idxText.match(new RegExp(c.re.source, 'g')) || []).length;
        if (n > 0) ok(c.desc + ' \u2014 ' + n + ' \u5904');
        else warn(c.desc + ' \u2014 \u672a\u68c0\u6d4b\u5230');
    });

    // ─────────── ④ 模拟实测 ───────────
    if (NO_SIM) {
        head('④ 模拟实测');
        warn('\u5df2\u8df3\u8fc7\uff08--no-sim\uff09');
    } else {
        head('④ 模拟实测（无桥 + 无 vibrate）');
        const snip = path.join(ROOT, 'e2e', 'inspect.js');
        const file = path.join(ROOT, 'tools', 'snippets', 'ios-sim.js');
        const env = Object.assign({}, process.env, {
            NODE_PATH: process.env.NODE_PATH || 'C:/Users/NIU-XC/.workbuddy/binaries/node/workspace/node_modules'
        });
        const r = spawnSync(process.execPath, [snip, '--file', file], {
            cwd: ROOT, encoding: 'utf8', timeout: 120000, env: env
        });
        const outTxt = String(r.stdout || '');
        // inspect.js 把返回值以 JSON 字符串形式打印（形如 "{\"k\":\"v\"}"），需双层解析
        let data = null;
        const lines = outTxt.replace(/\r/g, '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        for (let i = 0; i < lines.length && !data; i++) {
            const ln = lines[i];
            if (ln.charAt(0) === '"') {
                try { const inner = JSON.parse(ln); const obj = JSON.parse(inner); if (obj && typeof obj === 'object') data = obj; } catch (e) { }
            }
        }
        if (!data) {
            for (let i = 0; i < lines.length && !data; i++) {
                if (lines[i].charAt(0) !== '{') continue;
                try { const obj = JSON.parse(lines[i]); if (obj && obj['\u672a\u6355\u83b7\u9519\u8bef\u6570'] !== undefined) data = obj; } catch (e) { }
            }
        }
        if (!data) {
            warn('\u6a21\u62df\u5b9e\u6d4b\u672a\u53d6\u5230\u7ed3\u679c\uff08\u6d4f\u89c8\u5668\u4e0d\u53ef\u7528\uff1f\uff09');
            console.log('    ' + outTxt.trim().split('\n').slice(-2).join(' | ').slice(0, 160));
        } else {
            console.log('  \u73af\u5883\uff1a\u539f\u751f\u6865=' + data['\u6709\u539f\u751f\u6865'] + '\u3001navigator.vibrate=' + data['navigator.vibrate']);
            const keys = Object.keys(data).filter(function (k) { return /^\u2460|^\u2461|^\u2462|^\u2463|^\u2464|^\u2465|^\u2466|^\u2467|^\u2468|^\u2469/.test(k); });
            let errN = 0;
            keys.forEach(function (k) {
                const v = String(data[k]);
                if (v.indexOf('ERR:') === 0) { bad(k + ' \u2192 ' + v); errN++; }
                else if (v === 'ok') ok(k);
            });
            if (data['\u2462\u5224\u5b9a\u7ed3\u679c']) {
                if (String(data['\u2462\u5224\u5b9a\u7ed3\u679c']).indexOf('\u6b63\u786e') >= 0) ok('\u68c0\u67e5\u66f4\u65b0 \u2192 ' + data['\u2462\u5224\u5b9a\u7ed3\u679c']);
                else bad('\u68c0\u67e5\u66f4\u65b0 \u2192 ' + data['\u2462\u5224\u5b9a\u7ed3\u679c']);
            }
            if (Number(data['\u672a\u6355\u83b7\u9519\u8bef\u6570']) === 0) ok('\u672a\u6355\u83b7\u9519\u8bef 0 \u6761');
            else bad('\u672a\u6355\u83b7\u9519\u8bef ' + data['\u672a\u6355\u83b7\u9519\u8bef\u6570'] + ' \u6761\uff1a' + JSON.stringify(data['\u672a\u6355\u83b7\u9519\u8bef']));
        }
    }

    // ─────────── 汇总 ───────────
    console.log('\n' + '\u2500'.repeat(46));
    if (fails.length === 0) {
        console.log('\u2705 iOS \u7f51\u9875\u7248\u9002\u914d\u4f53\u68c0\u5168\u90e8\u901a\u8fc7');
    } else {
        console.log('\u274c \u5171 ' + fails.length + ' \u9879\u9700\u5904\u7406\uff1a');
        fails.forEach(function (f, i) { console.log('   ' + (i + 1) + '. ' + f); });
    }
    // checkall 门禁格式
    console.log('\n===== \u7ed3\u679c: ' + passCount + ' \u901a\u8fc7 / ' + fails.length + ' \u5931\u8d25 =====\n');
    process.exit(fails.length === 0 ? 0 : 1);
})().catch(function (e) {
    console.error('\u274c ioscheck \u5f02\u5e38\uff1a' + e.message);
    process.exit(2);
});
