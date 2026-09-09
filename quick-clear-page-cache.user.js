// ==UserScript==
// @name         快速清理网页缓存
// @name:en      Quick Clear Page Cache
// @namespace    https://github.com/ssfun/userscripts
// @version      1.2.2
// @description  通过油猴菜单一键打开清理面板，清理当前网页的 localStorage / sessionStorage / Cookie / IndexedDB / Cache Storage / Service Worker，并支持强制刷新。悬浮按钮默认隐藏。
// @description:en Open a panel via the userscript menu to clear current site data (storage, cookies, IndexedDB, caches, service workers) and hard reload. Floating button hidden by default.
// @author       sfun
// @license      MIT
// @match        *://*/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/quick-clear-page-cache.user.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/quick-clear-page-cache.user.js
// ==/UserScript==

(function () {
  'use strict';

  if (window.top !== window.self) return;
  if (document.getElementById('qcc-host')) return;

  const NS = 'qcc';
  const HOTKEY = { code: 'KeyK', alt: true, shift: true }; // Alt/Option+Shift+K
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

  // Build DOM without innerHTML — YouTube/Google enforce Trusted Types.
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val == null || val === false) continue;
        if (key === 'className') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key === 'checked') node.checked = !!val;
        else if (key === 'disabled') node.disabled = !!val;
        else if (key === 'dataset') Object.assign(node.dataset, val);
        else if (key === 'style' && typeof val === 'string') node.style.cssText = val;
        else node.setAttribute(key, val === true ? '' : String(val));
      }
    }
    if (children != null) {
      const list = Array.isArray(children) ? children : [children];
      for (const child of list) {
        if (child == null || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    }
    return node;
  }

  function svgEl(tag, attrs, children) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) {
      for (const [key, val] of Object.entries(attrs)) {
        if (val == null || val === false) continue;
        node.setAttribute(key, String(val));
      }
    }
    if (children) {
      const list = Array.isArray(children) ? children : [children];
      for (const child of list) node.append(child);
    }
    return node;
  }

  const CSS = `
    :host {
      position: fixed !important;
      inset: 0 !important;
      width: auto !important;
      height: auto !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      background: transparent !important;
      overflow: visible !important;
      outline: none !important;
      z-index: 2147483646 !important;
      pointer-events: none !important;
      box-sizing: border-box !important;
      transform: none !important;
      filter: none !important;
    }
    :host(:popover-open) {
      display: block !important;
    }

    * { box-sizing: border-box; }

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
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC",
        "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: var(--qcc-text);
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    #${NS}-fab {
      pointer-events: auto;
      position: absolute;
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
      position: absolute;
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
      padding: 0 6px 12px;
      color: var(--qcc-muted);
      font-size: 11px;
    }
    #${NS}-hint {
      padding: 0 8px;
    }
    #${NS}-log {
      margin-top: 4px;
      padding: 0 8px;
      min-height: 18px;
      color: var(--qcc-ok);
      white-space: pre-wrap;
      word-break: break-word;
    }
    #${NS}-log.error { color: var(--qcc-danger); }
  `;

  // Host lives in the light DOM so it can enter the top layer (popover).
  // Inline !important keeps page CSS from shoving it into document flow.
  const host = el('div', {
    id: `${NS}-host`,
    'data-qcc': '1',
    popover: 'manual',
    style: [
      'position: fixed',
      'inset: 0',
      'width: auto',
      'height: auto',
      'max-width: none',
      'max-height: none',
      'margin: 0',
      'padding: 0',
      'border: none',
      'background: transparent',
      'overflow: visible',
      'outline: none',
      'z-index: 2147483646',
      'pointer-events: none',
      'box-sizing: border-box',
      'transform: none',
      'filter: none',
      'contain: layout style',
      'isolation: isolate',
    ]
      .map((s) => s + ' !important')
      .join(';'),
  });

  const shadow = host.attachShadow({ mode: 'open' });
  const styleEl = el('style');
  styleEl.textContent = CSS;

  const fab = el(
    'button',
    {
      id: `${NS}-fab`,
      type: 'button',
      title: '清理网页缓存 (Alt+Shift+K)',
      'aria-label': '清理网页缓存',
    },
    svgEl(
      'svg',
      {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': '2',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
      [
        svgEl('path', { d: 'M3 6h18' }),
        svgEl('path', { d: 'M8 6V4h8v2' }),
        svgEl('path', { d: 'M19 6l-1 14H6L5 6' }),
        svgEl('path', { d: 'M10 11v6' }),
        svgEl('path', { d: 'M14 11v6' }),
      ]
    )
  );

  const siteEl = el('div', { id: `${NS}-site` });
  const optionsEl = el('div', { id: `${NS}-options` });
  const closeBtn = el('button', {
    id: `${NS}-close`,
    type: 'button',
    'aria-label': '关闭',
    text: '×',
  });
  const clearBtn = el('button', { id: `${NS}-clear`, type: 'button', text: '立即清理' });
  const reloadBtn = el('button', { id: `${NS}-reload`, type: 'button', text: '仅强制刷新' });
  const showFabEl = el('input', { id: `${NS}-show-fab`, type: 'checkbox' });
  const logEl = el('div', { id: `${NS}-log` });

  const panel = el(
    'div',
    { id: `${NS}-panel`, role: 'dialog', 'aria-label': '快速清理网页缓存' },
    [
      el('div', { id: `${NS}-header` }, [
        el('div', { id: `${NS}-title`, text: '快速清理网页缓存' }),
        closeBtn,
      ]),
      el('div', { id: `${NS}-body` }, [siteEl, optionsEl]),
      el('div', { id: `${NS}-actions` }, [clearBtn, reloadBtn]),
      el('div', { id: `${NS}-footer` }, [
        el('label', { className: `${NS}-row` }, [
          showFabEl,
          el('span', { text: '显示悬浮按钮' }),
        ]),
        el('div', { id: `${NS}-hint`, text: '快捷键：Alt + Shift + K' }),
        logEl,
      ]),
    ]
  );

  const root = el('div', { id: `${NS}-root` }, [fab, panel]);
  shadow.append(styleEl, root);

  siteEl.textContent = location.origin;
  showFabEl.checked = getShowFab();

  for (const opt of OPTIONS) {
    const input = el('input', {
      type: 'checkbox',
      dataset: { id: opt.id },
      checked: !!opt.default,
    });
    optionsEl.append(
      el('label', { className: `${NS}-row` }, [input, el('span', { text: opt.label })])
    );
  }

  const canPopover = typeof host.showPopover === 'function';

  function mountParent() {
    return document.body || document.documentElement;
  }

  function mount() {
    const parent = mountParent();
    if (!parent) return false;
    if (host.parentNode !== parent) parent.appendChild(host);
    return host.isConnected;
  }

  function showHost() {
    if (!mount()) return;
    if (canPopover) {
      if (host.matches && host.matches(':popover-open')) return;
      try {
        host.showPopover();
      } catch (_) {
        host.style.setProperty('display', 'block', 'important');
      }
    } else {
      host.style.setProperty('display', 'block', 'important');
    }
  }

  function hideHost() {
    if (canPopover) {
      if (host.matches && !host.matches(':popover-open')) return;
      try {
        host.hidePopover();
      } catch (_) {
        /* ignore */
      }
    } else {
      host.style.setProperty('display', 'none', 'important');
    }
  }

  function hostNeeded() {
    return panel.classList.contains('open') || getShowFab();
  }

  function syncHost() {
    if (hostNeeded()) showHost();
    else hideHost();
  }

  function setLog(msg, isError = false) {
    logEl.textContent = msg || '';
    logEl.classList.toggle('error', !!isError);
  }

  function selected() {
    const map = {};
    optionsEl.querySelectorAll('input[type="checkbox"]').forEach((node) => {
      map[node.dataset.id] = node.checked;
    });
    return map;
  }

  function applyFabVisibility() {
    const show = getShowFab();
    showFabEl.checked = show;
    fab.classList.toggle('visible', show);
    panel.classList.toggle('with-fab', show);
    if (!show) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '20px';
      panel.style.bottom = '';
    } else if (fab._placePanel) {
      fab._placePanel();
    }
    syncHost();
  }

  function openPanel() {
    panel.classList.add('open');
    setLog('');
    syncHost();
    if (getShowFab() && fab._placePanel) fab._placePanel();
  }

  function closePanel() {
    panel.classList.remove('open');
    syncHost();
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
        report.push(r.note ? `IndexedDB: ${r.note}` : `IndexedDB: ${r.deleted}`);
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
      if (panel.classList.contains('open') && getShowFab()) placePanelNearFab();
    });

    fab._placePanel = placePanelNearFab;
    restorePos();
  })();

  // ---------- events ----------
  closeBtn.addEventListener('click', closePanel);
  clearBtn.addEventListener('click', runClear);
  reloadBtn.addEventListener('click', hardReload);
  showFabEl.addEventListener('change', () => {
    setShowFab(showFabEl.checked);
    applyFabVisibility();
  });

  function isHotkey(e) {
    if (e.repeat) return false;
    if (e.altKey !== HOTKEY.alt) return false;
    if (e.shiftKey !== HOTKEY.shift) return false;
    if (e.ctrlKey || e.metaKey) return false;
    // Use e.code: on macOS Option+Shift+K produces a symbol in e.key, not "k".
    if (e.code === HOTKEY.code) return true;
    const key = (e.key || '').toLowerCase();
    return key === 'k';
  }

  let lastHotkeyAt = 0;
  function onKeyDown(e) {
    if (isHotkey(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const now = Date.now();
      if (now - lastHotkeyAt < 80) return;
      lastHotkeyAt = now;
      togglePanel();
      return;
    }
    if ((e.key === 'Escape' || e.code === 'Escape') && panel.classList.contains('open')) {
      e.preventDefault();
      closePanel();
    }
  }

  // Capture on window first so sites like YouTube (which bind 'k' later) don't eat it.
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keydown', onKeyDown, true);

  document.addEventListener(
    'mousedown',
    (e) => {
      if (!panel.classList.contains('open')) return;
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(panel) || path.includes(fab) || path.includes(host)) return;
      closePanel();
    },
    true
  );

  // SPA / framework may rebuild <html>/<body> children and drop the host.
  let remountQueued = false;
  function watch(target) {
    if (!target) return;
    new MutationObserver(() => {
      if (host.isConnected || !hostNeeded() || remountQueued) return;
      remountQueued = true;
      requestAnimationFrame(() => {
        remountQueued = false;
        if (!host.isConnected && hostNeeded()) showHost();
      });
    }).observe(target, { childList: true });
  }
  watch(document.documentElement);
  if (document.body) watch(document.body);
  else {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        watch(document.body);
        if (hostNeeded()) showHost();
      },
      { once: true }
    );
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('打开清理面板', openPanel);
  }

  applyFabVisibility();
})();
