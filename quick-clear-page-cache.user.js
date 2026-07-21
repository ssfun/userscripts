// ==UserScript==
// @name         快速清理网页缓存
// @name:en      Quick Clear Page Cache
// @namespace    https://github.com/ssfun/userscripts
// @version      1.1.0
// @description  通过油猴菜单一键清理当前网页的 localStorage / sessionStorage / Cookie / IndexedDB / Cache Storage / Service Worker，并支持强制刷新。悬浮按钮默认隐藏。
// @description:en Clear current site data via userscript menu (storage, cookies, IndexedDB, caches, service workers) and hard reload. Floating button hidden by default.
// @author       sfun
// @license      MIT
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/quick-clear-page-cache.user.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/quick-clear-page-cache.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (document.getElementById('qcc-root')) return;

  const NS = 'qcc';
  const HOTKEY = { key: 'k', alt: true, shift: true }; // Alt+Shift+K
  const POS_KEY = `${NS}:fab-pos`;
  const SHOW_FAB_KEY = `${NS}:show-fab`;

  const OPTIONS = [
    { id: 'localStorage', label: 'localStorage', default: true },
    { id: 'sessionStorage', label: 'sessionStorage', default: true },
    { id: 'cookies', label: 'Cookies', default: true },
    { id: 'indexedDB', label: 'IndexedDB', default: true },
    { id: 'cacheStorage', label: 'Cache Storage', default: true },
    { id: 'serviceWorkers', label: 'Service Workers', default: true },
    { id: 'hardReload', label: '清理后强制刷新', default: true },
  ];

  function getShowFab() {
    try {
      return !!GM_getValue(SHOW_FAB_KEY, false);
    } catch (_) {
      return false;
    }
  }

  function setShowFab(value) {
    try {
      GM_setValue(SHOW_FAB_KEY, !!value);
    } catch (_) {
      /* ignore */
    }
  }

  // ---------- styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #${NS}-root {
      --qcc-bg: #111827;
      --qcc-panel: #1f2937;
      --qcc-border: #374151;
      --qcc-text: #f9fafb;
      --qcc-muted: #9ca3af;
      --qcc-accent: #3b82f6;
      --qcc-danger: #ef4444;
      --qcc-ok: #22c55e;
      --qcc-shadow: 0 12px 40px rgba(0,0,0,.45);
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: var(--qcc-text);
      z-index: 2147483646;
      position: fixed;
      inset: 0;
      pointer-events: none;
    }
    #${NS}-root * { box-sizing: border-box; }

    #${NS}-fab {
      pointer-events: auto;
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: 46px;
      height: 46px;
      border: none;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
      cursor: grab;
      box-shadow: var(--qcc-shadow);
      display: none;
      align-items: center;
      justify-content: center;
      user-select: none;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    #${NS}-fab.visible { display: flex; }
    #${NS}-fab:hover {
      transform: scale(1.06);
      box-shadow: 0 16px 48px rgba(37,99,235,.45);
    }
    #${NS}-fab:active { cursor: grabbing; }
    #${NS}-fab svg { width: 22px; height: 22px; pointer-events: none; }

    #${NS}-panel {
      pointer-events: auto;
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: 320px;
      max-width: calc(100vw - 24px);
      background: var(--qcc-panel);
      border: 1px solid var(--qcc-border);
      border-radius: 14px;
      box-shadow: var(--qcc-shadow);
      overflow: hidden;
      display: none;
      flex-direction: column;
    }
    #${NS}-panel.open { display: flex; }
    #${NS}-panel.with-fab { bottom: 78px; }

    #${NS}-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--qcc-border);
      background: rgba(0,0,0,.15);
    }
    #${NS}-title {
      font-weight: 650;
      font-size: 14px;
      letter-spacing: .2px;
    }
    #${NS}-close {
      border: none;
      background: transparent;
      color: var(--qcc-muted);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 6px;
    }
    #${NS}-close:hover { background: rgba(255,255,255,.08); color: #fff; }

    #${NS}-body { padding: 10px 12px 6px; }
    #${NS}-site {
      color: var(--qcc-muted);
      font-size: 12px;
      margin: 0 2px 10px;
      word-break: break-all;
    }
    .${NS}-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px;
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
    }
    .${NS}-row:hover { background: rgba(255,255,255,.05); }
    .${NS}-row input {
      width: 15px;
      height: 15px;
      accent-color: var(--qcc-accent);
      cursor: pointer;
      margin: 0;
    }
    .${NS}-row span { flex: 1; color: var(--qcc-text); }

    #${NS}-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 10px 12px 12px;
    }
    #${NS}-actions button {
      border: none;
      border-radius: 9px;
      padding: 9px 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
    }
    #${NS}-clear {
      background: linear-gradient(135deg, #2563eb, #4f46e5);
    }
    #${NS}-clear:hover { filter: brightness(1.08); }
    #${NS}-clear:disabled {
      opacity: .55;
      cursor: not-allowed;
      filter: none;
    }
    #${NS}-reload {
      background: #374151;
    }
    #${NS}-reload:hover { background: #4b5563; }

    #${NS}-footer {
      padding: 0 14px 12px;
      color: var(--qcc-muted);
      font-size: 11px;
    }
    #${NS}-log {
      margin-top: 4px;
      min-height: 18px;
      color: var(--qcc-ok);
      white-space: pre-wrap;
      word-break: break-word;
    }
    #${NS}-log.error { color: var(--qcc-danger); }
  `;
  document.documentElement.appendChild(style);

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = `${NS}-root`;
  root.innerHTML = `
    <button id="${NS}-fab" type="button" title="清理网页缓存 (Alt+Shift+K)" aria-label="清理网页缓存">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"/>
        <path d="M8 6V4h8v2"/>
        <path d="M19 6l-1 14H6L5 6"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
      </svg>
    </button>
    <div id="${NS}-panel" role="dialog" aria-label="快速清理网页缓存">
      <div id="${NS}-header">
        <div id="${NS}-title">快速清理网页缓存</div>
        <button id="${NS}-close" type="button" aria-label="关闭">×</button>
      </div>
      <div id="${NS}-body">
        <div id="${NS}-site"></div>
        <div id="${NS}-options"></div>
      </div>
      <div id="${NS}-actions">
        <button id="${NS}-clear" type="button">立即清理</button>
        <button id="${NS}-reload" type="button">仅强制刷新</button>
      </div>
      <div id="${NS}-footer">
        快捷键：Alt + Shift + K · 油猴菜单可开关悬浮按钮
        <div id="${NS}-log"></div>
      </div>
    </div>
  `;
  document.documentElement.appendChild(root);

  const fab = root.querySelector(`#${NS}-fab`);
  const panel = root.querySelector(`#${NS}-panel`);
  const optionsEl = root.querySelector(`#${NS}-options`);
  const siteEl = root.querySelector(`#${NS}-site`);
  const logEl = root.querySelector(`#${NS}-log`);
  const clearBtn = root.querySelector(`#${NS}-clear`);
  const reloadBtn = root.querySelector(`#${NS}-reload`);
  const closeBtn = root.querySelector(`#${NS}-close`);

  siteEl.textContent = location.origin;

  for (const opt of OPTIONS) {
    const row = document.createElement('label');
    row.className = `${NS}-row`;
    row.innerHTML = `
      <input type="checkbox" data-id="${opt.id}" ${opt.default ? 'checked' : ''}>
      <span>${opt.label}</span>
    `;
    optionsEl.appendChild(row);
  }

  // ---------- helpers ----------
  function setLog(msg, isError = false) {
    logEl.textContent = msg || '';
    logEl.classList.toggle('error', !!isError);
  }

  function selected() {
    const map = {};
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      map[el.dataset.id] = el.checked;
    });
    return map;
  }

  function applyFabVisibility() {
    const show = getShowFab();
    fab.classList.toggle('visible', show);
    panel.classList.toggle('with-fab', show);
    if (!show) {
      // 无按钮时用右下角固定面板位置
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '20px';
      panel.style.bottom = '20px';
    } else if (fab._placePanel) {
      fab._placePanel();
    }
  }

  function openPanel() {
    panel.classList.add('open');
    setLog('');
    if (getShowFab() && fab._placePanel) fab._placePanel();
  }

  function closePanel() {
    panel.classList.remove('open');
  }

  function togglePanel() {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  function hardReload() {
    const url = new URL(location.href);
    url.searchParams.set('_qcc', String(Date.now()));
    location.replace(url.toString());
  }

  function clearCookies() {
    const hostname = location.hostname;
    const parts = hostname.split('.');
    const domains = new Set(['', hostname]);

    for (let i = 0; i < parts.length - 1; i++) {
      domains.add(parts.slice(i).join('.'));
      domains.add('.' + parts.slice(i).join('.'));
    }

    const pathParts = location.pathname.split('/').filter(Boolean);
    const paths = ['/', location.pathname];
    for (let i = 0; i < pathParts.length; i++) {
      paths.push('/' + pathParts.slice(0, i + 1).join('/'));
      paths.push('/' + pathParts.slice(0, i + 1).join('/') + '/');
    }

    const cookies = document.cookie ? document.cookie.split(';') : [];
    let count = 0;
    for (const raw of cookies) {
      const name = raw.split('=')[0].trim();
      if (!name) continue;
      for (const domain of domains) {
        for (const path of paths) {
          const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`;
          document.cookie = domain ? `${base}; domain=${domain}` : base;
          document.cookie = domain
            ? `${base}; domain=${domain}; Secure; SameSite=None`
            : `${base}; Secure; SameSite=None`;
        }
      }
      count++;
    }
    return count;
  }

  async function clearIndexedDB() {
    if (!indexedDB || typeof indexedDB.databases !== 'function') {
      return { deleted: 0, note: '当前浏览器不支持列举 IndexedDB' };
    }
    const dbs = await indexedDB.databases();
    let deleted = 0;
    await Promise.all(
      (dbs || []).map((db) => {
        if (!db || !db.name) return Promise.resolve();
        return new Promise((resolve) => {
          const req = indexedDB.deleteDatabase(db.name);
          req.onsuccess = () => {
            deleted++;
            resolve();
          };
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });
      })
    );
    return { deleted };
  }

  async function clearCacheStorage() {
    if (!('caches' in window)) return 0;
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    return keys.length;
  }

  async function clearServiceWorkers() {
    if (!('serviceWorker' in navigator)) return 0;
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return regs.length;
  }

  async function runClear() {
    const opts = selected();
    const report = [];
    clearBtn.disabled = true;
    setLog('清理中…');

    try {
      if (opts.localStorage) {
        const n = localStorage.length;
        localStorage.clear();
        report.push(`localStorage: ${n}`);
      }
      if (opts.sessionStorage) {
        const n = sessionStorage.length;
        sessionStorage.clear();
        report.push(`sessionStorage: ${n}`);
      }
      if (opts.cookies) {
        const n = clearCookies();
        report.push(`Cookies: ${n}`);
      }
      if (opts.indexedDB) {
        const r = await clearIndexedDB();
        report.push(
          r.note ? `IndexedDB: ${r.note}` : `IndexedDB: ${r.deleted}`
        );
      }
      if (opts.cacheStorage) {
        const n = await clearCacheStorage();
        report.push(`Cache Storage: ${n}`);
      }
      if (opts.serviceWorkers) {
        const n = await clearServiceWorkers();
        report.push(`Service Workers: ${n}`);
      }

      setLog('完成：' + report.join(' · '));

      if (opts.hardReload) {
        setLog((logEl.textContent || '') + '\n即将强制刷新…');
        setTimeout(hardReload, 350);
      }
    } catch (err) {
      console.error('[Quick Clear Cache]', err);
      setLog('清理失败：' + (err && err.message ? err.message : String(err)), true);
    } finally {
      clearBtn.disabled = false;
    }
  }

  async function runClearAllNow() {
    // 菜单快捷入口：按默认选项全清并强制刷新
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      const opt = OPTIONS.find((o) => o.id === el.dataset.id);
      el.checked = opt ? opt.default : true;
    });
    openPanel();
    await runClear();
  }

  // ---------- drag FAB ----------
  (function enableDrag() {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    function restorePos() {
      try {
        const raw = localStorage.getItem(POS_KEY);
        if (!raw) return;
        const pos = JSON.parse(raw);
        if (typeof pos.left === 'number' && typeof pos.top === 'number') {
          fab.style.left = pos.left + 'px';
          fab.style.top = pos.top + 'px';
          fab.style.right = 'auto';
          fab.style.bottom = 'auto';
          placePanelNearFab();
        }
      } catch (_) {
        /* ignore */
      }
    }

    function placePanelNearFab() {
      if (!getShowFab()) return;
      const rect = fab.getBoundingClientRect();
      const panelW = 320;
      const panelH = 420;
      let left = rect.left + rect.width - panelW;
      let top = rect.top - panelH - 12;
      if (top < 8) top = rect.bottom + 12;
      if (left < 8) left = 8;
      if (left + panelW > window.innerWidth - 8) {
        left = window.innerWidth - panelW - 8;
      }
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = fab.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      fab.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    }

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      let left = originLeft + dx;
      let top = originTop + dy;
      left = Math.max(8, Math.min(window.innerWidth - 54, left));
      top = Math.max(8, Math.min(window.innerHeight - 54, top));
      fab.style.left = left + 'px';
      fab.style.top = top + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
      if (panel.classList.contains('open')) placePanelNearFab();
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      try {
        fab.releasePointerCapture?.(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      if (moved) {
        const rect = fab.getBoundingClientRect();
        try {
          localStorage.setItem(
            POS_KEY,
            JSON.stringify({ left: rect.left, top: rect.top })
          );
        } catch (_) {
          /* ignore */
        }
        placePanelNearFab();
      } else {
        togglePanel();
        if (panel.classList.contains('open')) placePanelNearFab();
      }
    }

    fab.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', () => {
      if (panel.classList.contains('open')) placePanelNearFab();
    });

    fab._placePanel = placePanelNearFab;
    restorePos();
  })();

  // ---------- events ----------
  closeBtn.addEventListener('click', closePanel);
  clearBtn.addEventListener('click', runClear);
  reloadBtn.addEventListener('click', hardReload);

  document.addEventListener('keydown', (e) => {
    if (
      e.altKey === HOTKEY.alt &&
      e.shiftKey === HOTKEY.shift &&
      !e.ctrlKey &&
      !e.metaKey &&
      e.key.toLowerCase() === HOTKEY.key
    ) {
      e.preventDefault();
      togglePanel();
    }
    if (e.key === 'Escape' && panel.classList.contains('open')) {
      closePanel();
    }
  });

  document.addEventListener(
    'mousedown',
    (e) => {
      if (!panel.classList.contains('open')) return;
      const t = e.target;
      if (panel.contains(t) || fab.contains(t)) return;
      closePanel();
    },
    true
  );

  // ---------- GM menu ----------
  function registerMenus() {
    if (typeof GM_registerMenuCommand !== 'function') return;

    GM_registerMenuCommand('🧹 打开清理面板', () => {
      openPanel();
    });

    GM_registerMenuCommand('⚡ 一键全清并刷新', () => {
      runClearAllNow();
    });

    GM_registerMenuCommand('🔄 仅强制刷新', () => {
      hardReload();
    });

    GM_registerMenuCommand(
      getShowFab() ? '👁️ 隐藏悬浮按钮' : '👁️ 显示悬浮按钮',
      () => {
        setShowFab(!getShowFab());
        applyFabVisibility();
        // 重新注册菜单以刷新文案（部分脚本管理器会累积条目，这里仅切换可见性即可）
        registerMenus();
      }
    );
  }

  applyFabVisibility();
  registerMenus();
})();
