// ==UserScript==
// @name         Cookie Manager
// @name:zh-CN   Cookie 管理器
// @namespace    https://github.com/ssfun/userscripts
// @version      0.2.1
// @description  A modern cookie manager userscript: dual-engine read/write, batch CRUD, multi-select, paste-to-import, JSON export/import, multiple copy formats, undo delete, hideable floating icon, bilingual UI.
// @description:zh-CN  现代化 Cookie 管理油猴脚本：双核引擎读写、批量增删改查、多选、粘贴解析、JSON 导入导出、多种复制格式、撤销删除、可隐藏悬浮按钮、中英双语 UI
// @author       Minis
// @license      MIT
// @homepageURL  https://github.com/ssfun/userscripts
// @supportURL   https://github.com/ssfun/userscripts/issues
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @noframes
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/cookie-manager.user.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/cookie-manager.user.js
// ==/UserScript==

(function () {
    'use strict';

    const POS_KEY = 'cm_iconPos_v1';
    const SHOW_FAB_KEY = 'cm_showFab_v1';
    const HAS_CS = typeof window.cookieStore !== 'undefined';

    /* ---------- 通用工具 ---------- */
    const safeDecode = s => { try { return decodeURIComponent(s == null ? '' : s); } catch { return String(s == null ? '' : s); } };
    // 跨脚本管理器兼容：Tampermonkey/Violentmonkey 提供 sync GM_*；Greasemonkey 4 只有 async GM.*；
    // 都不支持时退化为 localStorage（功能不丢失，但跨域不共享，对本脚本场景无影响）
    const _GM_get = typeof GM_getValue === 'function' ? GM_getValue : null;
    const _GM_set = typeof GM_setValue === 'function' ? GM_setValue : null;
    const gmGet = (k, d) => {
        try {
            let v;
            if (_GM_get) v = _GM_get(k);
            else if (typeof localStorage !== 'undefined') v = localStorage.getItem(k);
            if (v == null) return d;
            return typeof v === 'string' && (v[0] === '{' || v[0] === '[') ? JSON.parse(v) : v;
        } catch { return d; }
    };
    const gmSet = (k, v) => {
        try {
            const s = typeof v === 'string' ? v : JSON.stringify(v);
            if (_GM_set) _GM_set(k, s);
            else if (typeof localStorage !== 'undefined') localStorage.setItem(k, s);
        } catch {}
    };
    const getShowFab = () => {
        const v = gmGet(SHOW_FAB_KEY, '1');
        return v !== '0' && v !== 0 && v !== false && v !== 'false';
    };
    const setShowFab = v => gmSet(SHOW_FAB_KEY, v ? '1' : '0');
    const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    /* ---------- i18n ---------- */
    const LANG_KEY = 'cm_lang_v1';
    const I18N = {
        zh: {
            title: 'Cookie 管理器', titleCompat: ' (兼容模式)',
            badd: '批量添加', sadd: '单个添加', copyall: '复制所有', delall: '一键删除',
            phKey: '按 key 搜索', phVal: '按 value 搜索',
            empty: '没有匹配的 Cookie',
            modify: '修改', copyKey: '复制 Key', copyVal: '复制值', copyKv: '复制 KV', del: '删除',
            details: '详情', expand: '展开', collapse: '收起',
            sel: '多选', selExit: '退出多选', selAll: '全选', selAllPlus: n => `全选(+${n})`, selNone: '取消全选',
            cancel: '取消', ok: '确定', save: '保存',
            copyN: n => `复制(${n})`, delN: n => `删除(${n})`,
            confirmDelOne: k => `删除 "${k}"？`, confirmDelN: n => `删除选中的 ${n} 条 Cookie？`,
            confirmDelAllTitle: '一键删除', confirmDelAll: n => `删除当前网站全部 ${n} 条 Cookie？此操作不可逆。`,
            tNoCookie: '当前没有 Cookie', tCopiedN: n => `已复制 ${n} 条`, tCopyFail: '复制失败', tCopied: '已复制',
            tDeleted: '已删除', tNotSelected: '未选中', tEmptyList: '当前列表为空',
            tAdded: '已新增', tModified: '已修改', tNeedKey: 'Key 不能为空', tNeedRow: '请至少填一条',
            tBatchOk: (ok, total) => `成功 ${ok} / ${total}`,
            tDomainMismatch: h => `设置失败：domain 与当前网站不匹配 (${h})`,
            tSetFail: msg => `设置失败：${msg}`,
            tInvalidJson: '无效的 JSON 格式',
            tImportedN: n => `已导入 ${n} 条`,
            tUndo: '撤销', tRestoredN: n => `已撤销 ${n} 条删除`,
            addNew: '新增 Cookie', edit: '修改 Cookie', batch: '批量添加 Cookie',
            lblKey: 'Key', lblValue: 'Value', lblDomain: 'Domain', lblPath: 'Path', lblDays: '有效期 (天)',
            phEmptyDomain: '留空使用当前域名',
            lblParse: '粘贴解析（支持 a=b; c=d 或多行 key=value）',
            phParse: 'key1=value1; key2=value2\nkey3=value3',
            addRow: '+ 添加一行', batchSave: '全部添加',
            delConfirm: '删除',
            menu: '更多', exp: '导出 JSON', expSel: '导出选中', impJson: '导入 JSON',
            copyAs: '复制为...', cfHeader: 'Cookie Header', cfCurl: 'cURL --cookie', cfJson: 'JSON', cfKv: 'KV (key=value)',
            impTitle: '导入 Cookie',
            impHint: '支持以下格式：\n• JSON 数组（本工具或 EditThisCookie 导出）\n• 每行 key=value\n• Cookie header 字符串',
            secure: 'Secure', http: 'HttpOnly', sameSite: 'SameSite',
            sizeBytes: n => `${n} B`,
            sizeWarn: '体积过大（>4KB 可能被截断）',
            hideFab: '隐藏悬浮按钮', showFab: '显示悬浮按钮',
            tFabHidden: '悬浮按钮已隐藏，可从油猴菜单打开面板后重新显示',
            tFabShown: '悬浮按钮已显示',
        },
        en: {
            title: 'Cookie Manager', titleCompat: ' (Compat)',
            badd: 'Batch Add', sadd: 'Add One', copyall: 'Copy All', delall: 'Delete All',
            phKey: 'Search by key', phVal: 'Search by value',
            empty: 'No matching cookies',
            modify: 'Edit', copyKey: 'Copy Key', copyVal: 'Copy Value', copyKv: 'Copy KV', del: 'Delete',
            details: 'Details', expand: 'Expand', collapse: 'Collapse',
            sel: 'Select', selExit: 'Exit Select', selAll: 'Select All', selAllPlus: n => `Select All (+${n})`, selNone: 'Deselect All',
            cancel: 'Cancel', ok: 'OK', save: 'Save',
            copyN: n => `Copy (${n})`, delN: n => `Delete (${n})`,
            confirmDelOne: k => `Delete "${k}"?`, confirmDelN: n => `Delete ${n} selected cookies?`,
            confirmDelAllTitle: 'Delete All', confirmDelAll: n => `Delete all ${n} cookies for this site? This cannot be undone.`,
            tNoCookie: 'No cookies on this site', tCopiedN: n => `Copied ${n} item${n === 1 ? '' : 's'}`, tCopyFail: 'Copy failed', tCopied: 'Copied',
            tDeleted: 'Deleted', tNotSelected: 'Nothing selected', tEmptyList: 'List is empty',
            tAdded: 'Added', tModified: 'Updated', tNeedKey: 'Key is required', tNeedRow: 'Add at least one row',
            tBatchOk: (ok, total) => `Done ${ok} / ${total}`,
            tDomainMismatch: h => `Failed: domain mismatch (current: ${h})`,
            tSetFail: msg => `Failed: ${msg}`,
            tInvalidJson: 'Invalid JSON',
            tImportedN: n => `Imported ${n} item${n === 1 ? '' : 's'}`,
            tUndo: 'Undo', tRestoredN: n => `Restored ${n} cookie${n === 1 ? '' : 's'}`,
            addNew: 'Add Cookie', edit: 'Edit Cookie', batch: 'Batch Add Cookies',
            lblKey: 'Key', lblValue: 'Value', lblDomain: 'Domain', lblPath: 'Path', lblDays: 'Max Age (days)',
            phEmptyDomain: 'Leave blank to use current host',
            lblParse: 'Paste to parse (supports a=b; c=d or multi-line key=value)',
            phParse: 'key1=value1; key2=value2\nkey3=value3',
            addRow: '+ Add Row', batchSave: 'Add All',
            delConfirm: 'Delete',
            menu: 'More', exp: 'Export JSON', expSel: 'Export Selected', impJson: 'Import JSON',
            copyAs: 'Copy As...', cfHeader: 'Cookie Header', cfCurl: 'cURL --cookie', cfJson: 'JSON', cfKv: 'KV (key=value)',
            impTitle: 'Import Cookies',
            impHint: 'Supported formats:\n• JSON array (from this tool or EditThisCookie)\n• key=value per line\n• Cookie header string',
            secure: 'Secure', http: 'HttpOnly', sameSite: 'SameSite',
            sizeBytes: n => `${n} B`,
            sizeWarn: 'Too large (>4KB may be truncated)',
            hideFab: 'Hide floating icon', showFab: 'Show floating icon',
            tFabHidden: 'Floating icon hidden. Re-enable from the panel (open via userscript menu).',
            tFabShown: 'Floating icon shown',
        }
    };
    const detectLang = () => {
        const saved = gmGet(LANG_KEY, null);
        if (saved && I18N[saved]) return saved;
        const nav = (navigator.language || 'en').toLowerCase();
        return nav.startsWith('zh') ? 'zh' : 'en';
    };
    let lang = detectLang();
    const t = (key, ...args) => {
        const v = I18N[lang][key];
        return typeof v === 'function' ? v(...args) : (v == null ? key : v);
    };
    const setLang = (l) => { lang = l; gmSet(LANG_KEY, l); };

    /* ---------- 样式 ---------- */
    const STYLE = `
:host{all:initial}
*{box-sizing:border-box}
button{font-family:inherit}
#fab{position:fixed;width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4f8cff,#3358c4);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.28);z-index:2147483646;cursor:grab;user-select:none;touch-action:none}
#fab.hidden{display:none}
#fab:active{cursor:grabbing}
#fab .fab-hide{position:absolute;top:-4px;right:-4px;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:#1e3a7a;color:#fff;font-size:13px;line-height:18px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-family:inherit;opacity:0}
#fab:hover .fab-hide,#fab:focus-within .fab-hide{opacity:1}
@media (hover:none){#fab .fab-hide{opacity:1}}
#fab .fab-hide:active{transform:scale(.9)}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2147483647;display:none;align-items:center;justify-content:center;padding:12px;-webkit-tap-highlight-color:transparent}
.ov.show{display:flex}
.panel{background:#fff;color:#222;border-radius:12px;width:100%;max-width:460px;max-height:86vh;display:flex;flex-direction:column;font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);overflow:hidden}
.head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#2f6ce6;color:#fff;flex-shrink:0}
.head h3{margin:0;font-size:15px;font-weight:600}
.x{cursor:pointer;font-size:22px;line-height:1;padding:0 4px}
.body{flex:1;overflow-y:auto;padding:12px 14px}
.foot{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #ececec;background:#fafbfc;flex-shrink:0;flex-wrap:wrap}
.row{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.row label{font-size:12px;color:#666;font-weight:600}
.row input[type=text],.row input[type=number],.row textarea,.row input[type=search]{width:100%;padding:8px 10px;border:1px solid #d4d8de;border-radius:6px;font-size:14px;background:#fff;color:#222;font-family:inherit}
.row textarea{min-height:80px;resize:vertical}
.row input:focus,.row textarea:focus{outline:none;border-color:#2f6ce6;box-shadow:0 0 0 2px rgba(47,108,230,.15)}
.btn{padding:7px 12px;border-radius:6px;border:1px solid #d4d8de;background:#fff;color:#333;cursor:pointer;font-size:13px}
.btn:active{transform:scale(.97)}
.btn.pri{background:#2f6ce6;color:#fff;border-color:#2f6ce6}
.btn.warn{background:#dc3545;color:#fff;border-color:#dc3545}
.btn.sm{padding:4px 8px;font-size:12px}
.search{display:flex;gap:6px;margin-bottom:10px}
.search input{flex:1}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.grid .btn{width:100%}
.ck{border:1px solid #ececec;border-radius:8px;padding:10px;margin-bottom:8px;background:#fff}
.ck-h{display:flex;align-items:center;gap:8px}
.ck-k{font-weight:600;color:#1a1a1a;word-break:break-all;flex:1}
.ck-v{margin:6px 0;color:#444;word-break:break-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.ck-p{font-size:11px;color:#777;background:#f3f5f8;padding:3px 6px;border-radius:4px;display:inline-block}
.ck-a{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.cb{display:none;width:18px;height:18px;border:1.5px solid #999;border-radius:4px;align-items:center;justify-content:center;color:#fff;font-size:12px;cursor:pointer;flex-shrink:0}
.sel .cb{display:inline-flex}
.cb.on{background:#2f6ce6;border-color:#2f6ce6}
.empty{text-align:center;color:#888;padding:24px 0}
.br{display:flex;gap:6px;align-items:center;margin-bottom:6px}
.br input{flex:1;padding:6px 8px;border:1px solid #d4d8de;border-radius:4px;font-size:13px}
.br .rm{width:28px;height:28px;border-radius:50%;border:none;background:#dc3545;color:#fff;font-weight:700;cursor:pointer;flex-shrink:0}
#toast{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483647;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.t{background:rgba(20,20,20,.92);color:#fff;padding:8px 14px;border-radius:18px;font-size:13px;max-width:80vw;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.t.ok{background:rgba(40,140,80,.95)}
.t.err{background:rgba(190,40,40,.95)}
.dlg{background:#fff;border-radius:10px;padding:16px;width:100%;max-width:360px;color:#222}
.dlg .m{margin-bottom:12px;line-height:1.5;word-break:break-word}
.dlg .a{display:flex;justify-content:flex-end;gap:8px}
.dlg input{width:100%;padding:8px 10px;border:1px solid #d4d8de;border-radius:6px;font-size:14px;margin-bottom:12px}
.dlg textarea{width:100%;min-height:140px;padding:8px 10px;border:1px solid #d4d8de;border-radius:6px;font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;margin-bottom:12px;resize:vertical}
.ck-detail{margin-top:8px;padding:8px;background:#f6f8fb;border-radius:6px;font-size:12px;display:none}
.ck.open .ck-detail{display:block}
.ck.open .ck-v{-webkit-line-clamp:initial;display:block}
.ck-detail .row-d{display:flex;gap:8px;margin-bottom:4px;word-break:break-all}
.ck-detail .k-d{color:#666;flex:0 0 70px;font-weight:600}
.ck-detail .v-d{color:#222;flex:1}
.ck-size{font-size:10px;color:#888;background:#eef0f3;padding:1px 5px;border-radius:3px;margin-left:6px}
.ck-size.warn{background:#fde0e0;color:#a02020}
.ck-flag{display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;margin-left:4px;background:#dfe9fa;color:#1a4baf}
.popm{position:fixed;background:#fff;border:1px solid #e0e3e8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;z-index:2147483647;min-width:160px}
.popm .it{padding:8px 12px;cursor:pointer;border-radius:4px;font-size:13px;color:#222;white-space:nowrap}
.popm .it:hover,.popm .it:active{background:#eef2f7}
.popm .it.dv{height:1px;background:#ececec;padding:0;margin:4px 0}
.t .undo{background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;cursor:pointer;margin-left:10px;pointer-events:auto}
`;

    /* ---------- Shadow DOM 容器 ---------- */
    let host, sr, toastBox, fab, mainOv;

    function ensureHost() {
        if (host && document.documentElement.contains(host)) return;
        if (!document.body) return;
        host = document.createElement('div');
        host.id = 'cm-host';
        host.style.cssText = 'all:initial;position:fixed;width:0;height:0;z-index:2147483646';
        document.documentElement.appendChild(host);
        sr = host.attachShadow({ mode: 'open' });
        const st = document.createElement('style'); st.textContent = STYLE; sr.appendChild(st);
        toastBox = document.createElement('div'); toastBox.id = 'toast'; sr.appendChild(toastBox);
        buildFab();
        buildPanel();
    }

    function startGuardian() {
        try {
            new MutationObserver(() => {
                if (document.body && (!host || !document.documentElement.contains(host))) ensureHost();
            }).observe(document.documentElement, { childList: true });
        } catch {}
    }

    /* ---------- toast / dialog（替换 alert/confirm，Via 中更稳） ---------- */
    function toast(msg, type, action) {
        if (!toastBox) return;
        const el = document.createElement('div');
        el.className = 't' + (type ? ' ' + type : '');
        el.textContent = msg;
        let timer1 = null, timer2 = null;
        if (action) {
            const btn = document.createElement('button');
            btn.className = 'undo';
            btn.textContent = action.label;
            btn.addEventListener('click', () => {
                clearTimeout(timer1); clearTimeout(timer2);
                el.remove();
                action.fn();
            });
            el.appendChild(btn);
        }
        toastBox.appendChild(el);
        const ttl = action ? 5000 : 1800;
        timer1 = setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; }, ttl);
        timer2 = setTimeout(() => el.remove(), ttl + 400);
    }

    function dialog({ title = '', message = '', input = null, ok, cancel, danger = false } = {}) {
        if (ok == null) ok = t('ok');
        if (cancel == null) cancel = t('cancel');
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.className = 'ov show';
            const html = (title ? `<h3 style="margin:0 0 8px;font-size:15px">${escHtml(title)}</h3>` : '')
                + `<div class="m">${escHtml(message).replace(/\n/g, '<br>')}</div>`
                + (input != null ? `<input type="text" value="${escHtml(input)}">` : '')
                + `<div class="a"><button class="btn cancel">${escHtml(cancel)}</button><button class="btn ${danger ? 'warn' : 'pri'} ok">${escHtml(ok)}</button></div>`;
            const box = document.createElement('div');
            box.className = 'dlg';
            box.innerHTML = html;
            ov.appendChild(box);
            sr.appendChild(ov);
            const inp = box.querySelector('input');
            if (inp) setTimeout(() => inp.focus(), 30);
            const close = v => { ov.remove(); resolve(v); };
            box.querySelector('.cancel').addEventListener('click', () => close(null));
            box.querySelector('.ok').addEventListener('click', () => close(input != null ? (inp.value || '') : true));
        });
    }

    /* ---------- Cookie 双核引擎 ---------- */
    const ckMgr = {
        async get() {
            if (HAS_CS) {
                try {
                    const list = await window.cookieStore.getAll();
                    return list.map(c => ({
                        key: c.name, value: c.value || '',
                        domain: c.domain || location.hostname,
                        path: c.path || '/',
                        secure: !!c.secure,
                        httpOnly: !!c.httpOnly,
                        sameSite: c.sameSite || '',
                        expires: c.expires || null
                    }));
                } catch {}
            }
            if (!document.cookie) return [];
            return document.cookie.split(';').map(s => {
                const i = s.indexOf('=');
                if (i < 0) return null;
                return { key: s.slice(0, i).trim(), value: s.slice(i + 1).trim(), domain: location.hostname, path: '/', _legacy: true };
            }).filter(Boolean);
        },
        async set(key, value, opt = {}) {
            const days = typeof opt.days === 'number' && !isNaN(opt.days) ? opt.days : 365;
            const path = opt.path || '/';
            const domain = (opt.domain && opt.domain !== 'N/A') ? opt.domain : '';
            try {
                if (HAS_CS) {
                    const p = { name: key, value: value || '', path, expires: Date.now() + days * 86400000 };
                    if (domain) p.domain = domain;
                    await window.cookieStore.set(p);
                    return true;
                }
                let c = `${encodeURIComponent(key)}=${encodeURIComponent(value || '')}`;
                if (days > 0) c += `; expires=${new Date(Date.now() + days * 86400000).toUTCString()}`;
                c += `; path=${path}`;
                if (domain) c += `; domain=${domain}`;
                document.cookie = c;
                return true;
            } catch (e) {
                if (e && /domain/i.test(e.message || '')) toast(t('tDomainMismatch', location.hostname), 'err');
                else toast(t('tSetFail', e.message || e), 'err');
                return false;
            }
        },
        async del(c) {
            try {
                if (HAS_CS && !c._legacy) {
                    const p = { name: c.key };
                    if (c.domain && c.domain !== 'N/A') p.domain = c.domain;
                    if (c.path) p.path = c.path;
                    await window.cookieStore.delete(p);
                }
                // 兜底：扫各种 path/domain 组合（旧 document.cookie 路径）
                const h = location.hostname, dh = '.' + h;
                const exp = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
                for (const p of ['/', location.pathname || '/']) {
                    for (const d of ['', h, dh, c.domain || '']) {
                        let s = `${encodeURIComponent(c.key)}=; ${exp}; path=${p}`;
                        if (d) s += `; domain=${d}`;
                        document.cookie = s;
                    }
                }
                return true;
            } catch { return false; }
        }
    };

    async function copy(text) {
        try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
        try {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            const ok = document.execCommand('copy'); ta.remove();
            return ok;
        } catch { return false; }
    }

    /* ---------- Popup menu ---------- */
    function popMenu(anchor, items) {
        const old = sr.querySelector('.popm');
        if (old) {
            const same = old.__a === anchor;
            old.__close && old.__close();
            if (same) return null;
        }
        const m = document.createElement('div');
        m.className = 'popm'; m.__a = anchor;
        for (const it of items) {
            const el = document.createElement('div');
            el.className = it.divider ? 'it dv' : 'it';
            if (!it.divider) {
                el.textContent = it.label;
                el.addEventListener('click', () => { m.__close(); it.fn?.(); });
            }
            m.appendChild(el);
        }
        sr.appendChild(m);
        const r = anchor.getBoundingClientRect();
        m.style.left = Math.max(8, Math.min(window.innerWidth - 180, r.right - 160)) + 'px';
        const mh = m.offsetHeight;
        m.style.top = (r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + 'px';
        const onDoc = e => {
            const path = e.composedPath?.() || [e.target];
            if (path.includes(m) || path.includes(anchor)) return;
            m.__close();
        };
        m.__close = () => { document.removeEventListener('click', onDoc, true); m.remove(); };
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
        return m;
    }

    /* ---------- 复制为多种格式 ---------- */
    const FMT = {
        header: cs => cs.map(c => `${c.key}=${c.value}`).join('; '),
        curl: cs => `--cookie '${FMT.header(cs).replace(/'/g, "'\\''")}'`,
        json: cs => JSON.stringify(cs.map(c => ({ name: c.key, value: c.value, domain: c.domain || location.hostname, path: c.path || '/', secure: !!c.secure, sameSite: c.sameSite || '' })), null, 2),
        kv: cs => cs.map(c => `${c.key}=${c.value}`).join('\n')
    };

    async function copyAs(cookies, fmt) {
        if (!cookies?.length) return toast(t('tNotSelected'), 'err');
        const ok = await copy(FMT[fmt](cookies));
        toast(ok ? t('tCopiedN', cookies.length) : t('tCopyFail'), ok ? 'ok' : 'err');
    }

    function showCopyAsMenu(anchor, cookies) {
        popMenu(anchor, [['cfHeader','header'],['cfCurl','curl'],['cfJson','json'],['cfKv','kv']]
            .map(([k, f]) => ({ label: t(k), fn: () => copyAs(cookies, f) })));
    }

    /* ---------- 导出 / 导入 JSON ---------- */
    async function exportJson(cookies) {
        if (!cookies?.length) return toast(t('tNoCookie'), 'err');
        const ok = await copy(FMT.json(cookies));
        toast(ok ? t('tCopiedN', cookies.length) : t('tCopyFail'), ok ? 'ok' : 'err');
    }

    async function restoreCookies(snapshot) {
        if (!snapshot?.length) return;
        await Promise.all(snapshot.map(c => {
            const days = c.expires ? Math.max(1, Math.round((c.expires - Date.now()) / 86400000)) : 365;
            return ckMgr.set(c.key, c.value, { domain: c.domain, path: c.path, days });
        }));
        toast(t('tRestoredN', snapshot.length), 'ok');
        render();
    }

    function parseImport(text) {
        text = (text || '').trim();
        if (!text) return [];
        if (text[0] === '[') {
            try {
                const arr = JSON.parse(text);
                if (Array.isArray(arr)) return arr.map(o => ({
                    key: o.name || o.key, value: o.value == null ? '' : String(o.value),
                    domain: o.domain || '', path: o.path || '/'
                })).filter(x => x.key);
            } catch {}
            throw new Error('json');
        }
        const out = [];
        for (const line of text.split(/\r?\n/)) {
            const segs = (line.indexOf(';') >= 0 && line.split('=').length > 2) ? line.split(';') : [line];
            for (const seg of segs) {
                const tt = seg.trim(); if (!tt) continue;
                const i = tt.indexOf('=');
                if (i < 1) continue;
                out.push({ key: tt.slice(0, i).trim(), value: tt.slice(i + 1).trim(), domain: '', path: '/' });
            }
        }
        return out;
    }

    async function showImport() {
        const { p, close } = makeOv();
        p.innerHTML = `
            <div class="head"><h3>${escHtml(t('impTitle'))}</h3><span class="x">×</span></div>
            <div class="body">
                <div style="font-size:12px;color:#666;margin-bottom:8px;white-space:pre-line">${escHtml(t('impHint'))}</div>
                <textarea id="imp-text" style="width:100%;min-height:180px;padding:8px 10px;border:1px solid #d4d8de;border-radius:6px;font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;resize:vertical"></textarea>
            </div>
            <div class="foot">
                <button class="btn cancel">${escHtml(t('cancel'))}</button>
                <button class="btn pri save" style="margin-left:auto">${escHtml(t('batchSave'))}</button>
            </div>`;
        p.querySelector('.x').addEventListener('click', close);
        p.querySelector('.cancel').addEventListener('click', close);
        p.querySelector('.save').addEventListener('click', async () => {
            let items;
            try { items = parseImport(p.querySelector('#imp-text').value); }
            catch { return toast(t('tInvalidJson'), 'err'); }
            if (!items.length) return toast(t('tNeedRow'), 'err');
            const results = await Promise.all(items.map(it => ckMgr.set(it.key, it.value, { domain: it.domain, path: it.path })));
            const ok = results.filter(Boolean).length;
            toast(t('tImportedN', ok), ok ? 'ok' : 'err');
            if (ok > 0) { close(); render(); }
        });
    }

    /* ---------- 主面板 ---------- */
    let state = { all: [], filtered: [], sel: false, pool: new Map() };

    function buildPanel() {
        mainOv = document.createElement('div');
        mainOv.className = 'ov';
        const p = document.createElement('div');
        p.className = 'panel';
        p.innerHTML = `
            <div class="head">
                <h3 class="title"></h3>
                <span style="display:flex;align-items:center;gap:10px;">
                    <span class="lang" style="cursor:pointer;font-size:12px;font-weight:600;padding:3px 8px;border:1px solid rgba(255,255,255,.55);border-radius:10px;line-height:1;letter-spacing:.5px"></span>
                    <span class="x">×</span>
                </span>
            </div>
            <div class="body"></div>
            <div class="foot"></div>`;
        mainOv.appendChild(p);
        sr.appendChild(mainOv);
        p.querySelector('.x').addEventListener('click', closePanel);
        mainOv.addEventListener('click', e => { if (e.target === mainOv) closePanel(); });
        p.querySelector('.lang').addEventListener('click', () => {
            setLang(lang === 'zh' ? 'en' : 'zh');
            applyTitleAndLangBtn();
            render();
        });
        applyTitleAndLangBtn();
    }

    function applyTitleAndLangBtn() {
        if (!mainOv) return;
        const titleEl = mainOv.querySelector('.title');
        const langEl = mainOv.querySelector('.lang');
        if (titleEl) titleEl.textContent = t('title') + (HAS_CS ? '' : t('titleCompat'));
        if (langEl) langEl.textContent = lang === 'zh' ? 'EN' : '中';
        if (fab) {
            fab.title = t('title');
            const hb = fab.querySelector('.fab-hide');
            if (hb) {
                hb.title = t('hideFab');
                hb.setAttribute('aria-label', t('hideFab'));
            }
        }
    }

    function openPanel() { mainOv.classList.add('show'); render(); }
    function closePanel() { mainOv.classList.remove('show'); }

    function mkBtn(text, cls, fn) {
        const b = document.createElement('button');
        b.className = 'btn ' + (cls || '');
        b.textContent = text;
        b.addEventListener('click', fn);
        return b;
    }

    async function render() {
        const body = mainOv.querySelector('.body');
        const foot = mainOv.querySelector('.foot');
        body.innerHTML = `
            <div class="grid">
                <button class="btn pri" data-a="badd"></button>
                <button class="btn pri" data-a="sadd"></button>
                <button class="btn" data-a="copyall"></button>
                <button class="btn" data-a="more"></button>
                <button class="btn warn" data-a="delall" style="grid-column:1 / span 2"></button>
            </div>
            <div class="search">
                <input type="search" id="qk">
                <input type="search" id="qv">
            </div>
            <div id="list"></div>`;
        body.querySelector('[data-a=badd]').textContent = t('badd');
        body.querySelector('[data-a=sadd]').textContent = t('sadd');
        body.querySelector('[data-a=copyall]').textContent = t('copyall');
        body.querySelector('[data-a=more]').textContent = t('menu') + ' ▾';
        body.querySelector('[data-a=delall]').textContent = t('delall');
        body.querySelector('#qk').placeholder = t('phKey');
        body.querySelector('#qv').placeholder = t('phVal');
        foot.innerHTML = '';

        state.all = await ckMgr.get();
        state.filtered = state.all;
        state.sel = false;
        state.pool.clear();
        renderList();

        body.querySelector('[data-a=badd]').addEventListener('click', showBatch);
        body.querySelector('[data-a=sadd]').addEventListener('click', () => showEdit({ mode: 'add' }));
        body.querySelector('[data-a=copyall]').addEventListener('click', e => {
            if (!state.all.length) return toast(t('tNoCookie'), 'err');
            showCopyAsMenu(e.currentTarget, state.all);
        });
        body.querySelector('[data-a=more]').addEventListener('click', e => {
            popMenu(e.currentTarget, [
                { label: t('exp'), fn: () => exportJson(state.all) },
                { label: t('impJson'), fn: () => showImport() },
                { divider: true },
                { label: getShowFab() ? t('hideFab') : t('showFab'), fn: toggleFab },
            ]);
        });
        body.querySelector('[data-a=delall]').addEventListener('click', async () => {
            if (!state.all.length) return toast(t('tNoCookie'), 'err');
            const yes = await dialog({ title: t('confirmDelAllTitle'), message: t('confirmDelAll', state.all.length), ok: t('delConfirm'), danger: true });
            if (!yes) return;
            const snapshot = state.all.slice();
            await Promise.all(snapshot.map(c => ckMgr.del(c)));
            await render();
            toast(t('tDeleted'), 'ok', { label: t('tUndo'), fn: () => restoreCookies(snapshot) });
        });
        const qk = body.querySelector('#qk'), qv = body.querySelector('#qv');
        const onSearch = () => {
            const k = qk.value.trim().toLowerCase(), v = qv.value.trim().toLowerCase();
            state.filtered = state.all.filter(c => safeDecode(c.key).toLowerCase().includes(k) && safeDecode(c.value).toLowerCase().includes(v));
            renderList();
        };
        qk.addEventListener('input', onSearch);
        qv.addEventListener('input', onSearch);
    }

    function ckId(c) { return `${c.key}||${c.domain}||${c.path}`; }

    function renderList() {
        const list = mainOv.querySelector('#list');
        list.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = state.sel ? 'sel' : '';
        list.appendChild(wrap);
        if (!state.filtered.length) {
            wrap.innerHTML = '';
            const e = document.createElement('div');
            e.className = 'empty';
            e.textContent = t('empty');
            wrap.appendChild(e);
        } else {
            for (const c of state.filtered) wrap.appendChild(renderItem(c));
        }
        renderFoot();
    }

    function cookieSize(c) {
        // 估算 cookie 在 header 中的字节数：name=value + flags
        return new Blob([`${c.key}=${c.value}`]).size;
    }

    // 通用：创建 <tag class textContent>
    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }

    function renderItem(c) {
        const w = el('div', 'ck'), id = ckId(c);
        const head = el('div', 'ck-h');
        const cb = el('span', 'cb');
        if (state.pool.has(id)) { cb.classList.add('on'); cb.textContent = '✓'; }
        cb.addEventListener('click', e => {
            e.stopPropagation();
            if (cb.classList.toggle('on')) { cb.textContent = '✓'; state.pool.set(id, c); }
            else { cb.textContent = ''; state.pool.delete(id); }
            renderFoot();
        });
        head.append(cb, el('span', 'ck-k', safeDecode(c.key)));
        const sz = cookieSize(c);
        const sizeEl = el('span', 'ck-size' + (sz > 4096 ? ' warn' : ''), t('sizeBytes', sz));
        if (sz > 4096) sizeEl.title = t('sizeWarn');
        head.appendChild(sizeEl);
        if (c.secure) head.appendChild(el('span', 'ck-flag', t('secure')));
        if (c.httpOnly) head.appendChild(el('span', 'ck-flag', t('http')));
        if (c.sameSite) head.appendChild(el('span', 'ck-flag', `${t('sameSite')}=${c.sameSite}`));
        w.append(head, el('div', 'ck-v', safeDecode(c.value)));

        // 详情区
        const detail = el('div', 'ck-detail');
        const dRow = (k, v) => {
            const r = el('div', 'row-d');
            r.append(el('span', 'k-d', k), el('span', 'v-d', String(v)));
            detail.appendChild(r);
        };
        dRow('Domain', c.domain || location.hostname);
        dRow('Path', c.path || '/');
        if (c.expires) dRow('Expires', new Date(c.expires).toLocaleString());
        dRow('Secure', !!c.secure);
        if (c.httpOnly !== undefined) dRow('HttpOnly', !!c.httpOnly);
        if (c.sameSite) dRow('SameSite', c.sameSite);
        dRow('Size', t('sizeBytes', sz));
        w.appendChild(detail);

        // 操作区
        const a = el('div', 'ck-a');
        const doCopy = async (text) => { const ok = await copy(text); toast(ok ? t('tCopied') : t('tCopyFail'), ok ? 'ok' : 'err'); };
        a.append(
            mkBtn(t('modify'), 'pri sm', () => showEdit({ mode: 'modify', cookie: c })),
            mkBtn(t('copyKey'), 'sm', () => doCopy(safeDecode(c.key))),
            mkBtn(t('copyVal'), 'sm', () => doCopy(safeDecode(c.value))),
            mkBtn(t('copyAs'), 'sm', e => showCopyAsMenu(e.currentTarget, [c])),
            mkBtn(t('del'), 'warn sm', async () => {
                if (!await dialog({ message: t('confirmDelOne', safeDecode(c.key)), ok: t('delConfirm'), danger: true })) return;
                await ckMgr.del(c); await render();
                toast(t('tDeleted'), 'ok', { label: t('tUndo'), fn: () => restoreCookies([c]) });
            })
        );
        w.appendChild(a);

        head.style.cursor = 'pointer';
        head.addEventListener('click', e => {
            if (cb.contains(e.target)) return;
            w.classList.toggle('open');
        });
        return w;
    }

    function renderFoot() {
        const foot = mainOv.querySelector('.foot');
        foot.innerHTML = '';
        foot.appendChild(mkBtn(state.sel ? t('selExit') : t('sel'), '', () => {
            state.sel = !state.sel;
            if (!state.sel) state.pool.clear();
            renderList();
        }));
        if (state.sel) {
            const n = state.pool.size;
            // 全选状态：基于当前 filtered 列表
            const fIds = state.filtered.map(ckId);
            const fInPool = fIds.filter(id => state.pool.has(id)).length;
            const allFiltered = fIds.length > 0 && fInPool === fIds.length;
            const someFiltered = fInPool > 0 && !allFiltered;
            const selAllLabel = allFiltered ? t('selNone') : (someFiltered ? t('selAllPlus', fIds.length - fInPool) : t('selAll'));
            const selAllBtn = mkBtn(selAllLabel, '', () => {
                if (!fIds.length) return toast(t('tEmptyList'), 'err');
                if (allFiltered) {
                    for (const id of fIds) state.pool.delete(id);
                } else {
                    for (const c of state.filtered) state.pool.set(ckId(c), c);
                }
                renderList();
            });
            if (!fIds.length) selAllBtn.disabled = true;
            foot.appendChild(selAllBtn);

            foot.appendChild(mkBtn(t('copyN', n), 'pri', e => {
                if (!n) return toast(t('tNotSelected'), 'err');
                showCopyAsMenu(e.currentTarget, [...state.pool.values()]);
            }));
            foot.appendChild(mkBtn(t('expSel'), '', () => {
                if (!n) return toast(t('tNotSelected'), 'err');
                exportJson([...state.pool.values()]);
            }));
            foot.appendChild(mkBtn(t('delN', n), 'warn', async () => {
                if (!n) return toast(t('tNotSelected'), 'err');
                const yes = await dialog({ message: t('confirmDelN', n), ok: t('delConfirm'), danger: true });
                if (!yes) return;
                const snapshot = [...state.pool.values()];
                await Promise.all(snapshot.map(c => ckMgr.del(c)));
                state.pool.clear();
                await render();
                toast(t('tDeleted'), 'ok', { label: t('tUndo'), fn: () => restoreCookies(snapshot) });
            }));
        }
    }

    /* ---------- 编辑 / 批量添加 弹窗 ---------- */
    function makeOv() {
        const ov = document.createElement('div'); ov.className = 'ov show';
        const p = document.createElement('div'); p.className = 'panel';
        ov.appendChild(p); sr.appendChild(ov);
        return { ov, p, close: () => ov.remove() };
    }

    function showEdit({ mode, cookie }) {
        const { p, close } = makeOv();
        const isAdd = mode === 'add', c = cookie || {};
        p.innerHTML = `
            <div class="head"><h3></h3><span class="x">×</span></div>
            <div class="body">
                <div class="row"><label></label><input type="text" id="ek"></div>
                <div class="row"><label></label><textarea id="ev"></textarea></div>
                <div class="row"><label></label><input type="text" id="ed"></div>
                <div class="row"><label></label><input type="text" id="ep"></div>
                <div class="row"><label></label><input type="number" id="eday" value="365"></div>
            </div>
            <div class="foot">
                <button class="btn cancel"></button>
                <button class="btn pri save" style="margin-left:auto"></button>
            </div>`;
        const $ = s => p.querySelector(s);
        p.querySelector('.head h3').textContent = isAdd ? t('addNew') : t('edit');
        const labels = p.querySelectorAll('.row label');
        labels[0].textContent = t('lblKey');
        labels[1].textContent = t('lblValue');
        labels[2].textContent = t('lblDomain');
        labels[3].textContent = t('lblPath');
        labels[4].textContent = t('lblDays');
        $('#ed').placeholder = t('phEmptyDomain');
        p.querySelector('.cancel').textContent = t('cancel');
        p.querySelector('.save').textContent = t('save');
        $('#ek').value = isAdd ? '' : safeDecode(c.key);
        $('#ev').value = isAdd ? '' : safeDecode(c.value);
        $('#ed').value = (!isAdd && c.domain && c.domain !== 'N/A') ? c.domain : (HAS_CS ? location.hostname : '');
        $('#ep').value = (!isAdd && c.path) ? c.path : '/';
        p.querySelector('.x').addEventListener('click', close);
        p.querySelector('.cancel').addEventListener('click', close);
        p.querySelector('.save').addEventListener('click', async () => {
            const key = $('#ek').value.trim();
            if (!key) return toast(t('tNeedKey'), 'err');
            const value = $('#ev').value;
            const domain = $('#ed').value.trim();
            const path = $('#ep').value.trim() || '/';
            const days = parseInt($('#eday').value, 10);
            // 修改模式：先删旧（同 key+domain+path），再写新；如果 key 改了，旧的也会被一并清理
            if (!isAdd) await ckMgr.del(c);
            const ok = await ckMgr.set(key, value, { domain, path, days: isNaN(days) ? 365 : days });
            if (ok) { toast(isAdd ? t('tAdded') : t('tModified'), 'ok'); close(); render(); }
        });
    }

    function showBatch() {
        const { p, close } = makeOv();
        p.innerHTML = `
            <div class="head"><h3></h3><span class="x">×</span></div>
            <div class="body">
                <div class="row"><label></label><input type="text" id="bd"></div>
                <div class="row"><label></label><input type="text" id="bp" value="/"></div>
                <div class="row">
                    <label></label>
                    <textarea id="bparse"></textarea>
                </div>
                <div id="brows"></div>
                <button class="btn sm" id="brow" style="width:100%"></button>
            </div>
            <div class="foot">
                <button class="btn cancel"></button>
                <button class="btn pri save" style="margin-left:auto"></button>
            </div>`;
        const $ = s => p.querySelector(s);
        p.querySelector('.head h3').textContent = t('batch');
        const lbls = p.querySelectorAll('.row label');
        lbls[0].textContent = t('lblDomain');
        lbls[1].textContent = t('lblPath');
        lbls[2].textContent = t('lblParse');
        $('#bd').placeholder = t('phEmptyDomain');
        $('#bparse').placeholder = t('phParse');
        $('#brow').textContent = t('addRow');
        p.querySelector('.cancel').textContent = t('cancel');
        p.querySelector('.save').textContent = t('batchSave');
        $('#bd').value = HAS_CS ? location.hostname : '';
        const rows = $('#brows');
        const addRow = (k = '', v = '') => {
            const r = document.createElement('div'); r.className = 'br';
            const ki = document.createElement('input'); ki.type = 'text'; ki.placeholder = t('lblKey'); ki.className = 'k'; ki.value = k;
            const vi = document.createElement('input'); vi.type = 'text'; vi.placeholder = t('lblValue'); vi.className = 'v'; vi.value = v;
            const x = document.createElement('button'); x.className = 'rm'; x.textContent = '×';
            x.addEventListener('click', () => r.remove());
            r.appendChild(ki); r.appendChild(vi); r.appendChild(x);
            rows.appendChild(r);
        };
        addRow();
        $('#brow').addEventListener('click', () => addRow());

        // 行优先 + 启发式：仅当一行有多个 = 才按 ; 切，避免 value 内含分号被截断
        const parsePairs = text => {
            const out = [];
            for (const line of text.split(/\r?\n/)) {
                const segs = (line.indexOf(';') >= 0 && line.split('=').length > 2) ? line.split(';') : [line];
                for (const seg of segs) {
                    const tt = seg.trim(); if (!tt) continue;
                    let i = tt.indexOf('='); if (i < 0) i = tt.indexOf(':');
                    if (i < 1) continue;
                    out.push([tt.slice(0, i).trim(), tt.slice(i + 1).trim()]);
                }
            }
            return out;
        };
        $('#bparse').addEventListener('input', e => {
            const pairs = parsePairs(e.target.value);
            if (!pairs.length) return;
            rows.innerHTML = '';
            for (const [k, v] of pairs) addRow(k, v);
        });

        p.querySelector('.x').addEventListener('click', close);
        p.querySelector('.cancel').addEventListener('click', close);
        p.querySelector('.save').addEventListener('click', async () => {
            const domain = $('#bd').value.trim();
            const path = $('#bp').value.trim() || '/';
            const items = [...rows.querySelectorAll('.br')]
                .map(r => ({ key: r.querySelector('.k').value.trim(), value: r.querySelector('.v').value }))
                .filter(x => x.key);
            if (!items.length) return toast(t('tNeedRow'), 'err');
            const results = await Promise.all(items.map(it => ckMgr.set(it.key, it.value, { domain, path })));
            const ok = results.filter(Boolean).length;
            toast(t('tBatchOk', ok, items.length), ok ? 'ok' : 'err');
            if (ok > 0) { close(); render(); }
        });
    }

    /* ---------- 浮标 + 拖拽 / 隐藏 ---------- */
    function applyFabVisibility() {
        if (!fab) return;
        fab.classList.toggle('hidden', !getShowFab());
    }

    function toggleFab() {
        const next = !getShowFab();
        setShowFab(next);
        applyFabVisibility();
        if (next) toast(t('tFabShown'), 'ok');
        else toast(t('tFabHidden'), 'ok', { label: t('tUndo'), fn: () => { setShowFab(true); applyFabVisibility(); } });
    }

    function buildFab() {
        fab = document.createElement('div');
        fab.id = 'fab'; fab.title = t('title');
        fab.appendChild(document.createTextNode('C'));
        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'fab-hide';
        hideBtn.title = t('hideFab');
        hideBtn.setAttribute('aria-label', t('hideFab'));
        hideBtn.textContent = '×';
        hideBtn.addEventListener('click', e => {
            e.stopPropagation();
            e.preventDefault();
            if (getShowFab()) toggleFab();
        });
        hideBtn.addEventListener('mousedown', e => e.stopPropagation());
        hideBtn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
        fab.appendChild(hideBtn);
        sr.appendChild(fab);
        const pos = gmGet(POS_KEY, { bottom: '90px', right: '14px' });
        Object.assign(fab.style, { top: pos.top || 'auto', left: pos.left || 'auto', bottom: pos.bottom || 'auto', right: pos.right || 'auto' });

        let dragging = false, moved = false, sx = 0, sy = 0, ox = 0, oy = 0;
        const TH = 5;
        const down = e => {
            if (e.target === hideBtn || hideBtn.contains(e.target)) return;
            const t = e.touches ? e.touches[0] : e;
            dragging = true; moved = false; sx = t.clientX; sy = t.clientY;
            const r = fab.getBoundingClientRect(); ox = r.left; oy = r.top;
        };
        const move = e => {
            if (!dragging) return;
            const t = e.touches ? e.touches[0] : e;
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < TH) return;
            moved = true; e.preventDefault();
            const w = fab.offsetWidth, h = fab.offsetHeight;
            const nx = Math.max(0, Math.min(window.innerWidth - w, ox + dx));
            const ny = Math.max(0, Math.min(window.innerHeight - h, oy + dy));
            fab.style.left = nx + 'px'; fab.style.top = ny + 'px';
            fab.style.right = 'auto'; fab.style.bottom = 'auto';
        };
        const up = () => {
            if (!dragging) return;
            dragging = false;
            if (moved) {
                const r = fab.getBoundingClientRect();
                gmSet(POS_KEY, { top: r.top + 'px', left: r.left + 'px', bottom: 'auto', right: 'auto' });
            }
        };
        fab.addEventListener('touchstart', down, { passive: false });
        fab.addEventListener('touchmove', move, { passive: false });
        fab.addEventListener('touchend', up);
        fab.addEventListener('touchcancel', up);
        fab.addEventListener('mousedown', down);
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        fab.addEventListener('click', () => {
            if (moved) { moved = false; return; }
            mainOv.classList.contains('show') ? closePanel() : openPanel();
        });
        applyFabVisibility();
    }

    /* ---------- 启动 ---------- */
    function boot() {
        ensureHost();
        startGuardian();
        try { if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(t('title'), openPanel); } catch {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
