// ==UserScript==
// @name         Gemini 侧栏展开我的 Gem
// @name:en      Gemini Sidenav My Gems
// @namespace    local.gemini.gems
// @version      1.3.0
// @description  在 gemini.google.com 左侧导航展开显示「我的 Gem」。点击走站点 Angular Router + 清空当前会话，打开对应 Gem 的新对话（与原生行为一致）。访问 /gems/view 时自动同步，也可手动刷新。
// @description:en Expand "My Gems" in the Gemini sidenav. Clicks use Angular Router and clear the current conversation so the Gem opens as a new chat. Auto-sync on /gems/view; manual refresh supported.
// @author       sfun
// @license      MIT
// @homepageURL  https://github.com/ssfun/userscripts
// @supportURL   https://github.com/ssfun/userscripts/issues
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/gemini-gems-sidenav.user.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/gemini-gems-sidenav.user.js
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'gm-my-gems-section';
  const STYLE_ID = 'gm-my-gems-styles';
  const STORAGE_KEY = 'gm-my-gems-cache-v1';
  const EXPANDED_KEY = 'gm-my-gems-expanded';
  const LOG = '[Gemini My Gems]';
  const CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
  const IFRAME_TIMEOUT_MS = 20000;
  const BOOT_RETRY_MS = 500;
  const BOOT_MAX_TRIES = 40;

  /** @typedef {{ id: string, name: string, desc?: string, href: string, logoText?: string, logoBg?: string, logoTextColor?: string, updatedAt?: number }} GemItem */

  let bootTries = 0;
  let refreshInFlight = null;
  let lastPath = location.pathname;
  let observer = null;
  /** @type {null | { router: any, navigate: (path: string) => Promise<unknown>, chat?: any, gems?: any }} */
  let spaNav = null;
  let spaNavInFlight = false;

  // ── SPA navigation (Angular Router + clear conversation for new Gem chat) ──

  function getBardApi() {
    return window.default_BardChatUi || null;
  }

  function isLiveRouter(router) {
    if (!router || typeof router.navigate !== 'function') return false;
    // Disposed routers set Aa=true and make UF resolve false forever
    if (router.Aa === true) return false;
    try {
      // Touching url should work on a live instance
      void router.url;
      return true;
    } catch {
      return false;
    }
  }

  /** Live chat service (CP/yD) has a NgRx store and real uD/jSa implementations. */
  function isLiveChatService(svc) {
    return !!(
      svc &&
      typeof svc.uD === 'function' &&
      svc.store &&
      typeof svc.store.dispatch === 'function'
    );
  }

  function clearSpaNav() {
    spaNav = null;
  }

  /**
   * Walk root component LView injectors and collect Router + chat/gem services.
   * Gemini stores numeric __ngContext__ ids in default_BardChatUi.RBb.
   */
  function resolveFromInjectors() {
    const api = getBardApi();
    if (!api?.VF || !api?.RBb?.get) return null;

    const Router = api.VF;
    const ChatTokens = [api.CP, api.yD].filter(Boolean);
    const GemToken = api.jS;
    const roots = [
      document.querySelector('chat-app-orchestrator'),
      document.querySelector('chat-app'),
      document.querySelector('side-navigation-v2'),
      document.querySelector('[ng-version]'),
    ].filter(Boolean);

    let router = null;
    let chat = null;
    let gems = null;

    for (const el of roots) {
      try {
        const lView = api.RBb.get(el.__ngContext__);
        if (!lView || typeof lView.length !== 'number') continue;
        for (let i = 0; i < Math.min(lView.length, 120); i++) {
          const slot = lView[i];
          if (!slot || typeof slot.get !== 'function') continue;

          if (!router) {
            try {
              const r = slot.get(Router);
              if (isLiveRouter(r)) router = r;
            } catch {
              /* try next */
            }
          }

          if (!chat) {
            for (const Token of ChatTokens) {
              try {
                const s = slot.get(Token);
                if (isLiveChatService(s)) {
                  chat = s;
                  break;
                }
              } catch {
                /* try next */
              }
            }
          }

          if (!gems && GemToken) {
            try {
              const g = slot.get(GemToken);
              if (g && g.Sa) gems = g;
            } catch {
              /* try next */
            }
          }

          if (router && chat) break;
        }
      } catch {
        /* try next root */
      }
      if (router && chat) break;
    }

    if (!router) return null;
    return { router, chat, gems };
  }

  /**
   * Resolve Angular Router (+ chat service) via root component LView injector.
   * @param {boolean} [force]
   */
  function resolveSpaNav(force = false) {
    if (!force && isLiveRouter(spaNav?.router)) {
      // Refresh chat/gem handles if they went stale after a major route transition
      if (!isLiveChatService(spaNav.chat)) {
        const again = resolveFromInjectors();
        if (again?.chat) spaNav.chat = again.chat;
        if (again?.gems) spaNav.gems = again.gems;
      }
      return spaNav;
    }
    if (force) clearSpaNav();

    const api = getBardApi();
    if (!api || typeof api.UF !== 'function') return null;

    const resolved = resolveFromInjectors();
    if (!resolved?.router) return null;

    const { router, chat, gems } = resolved;

    /**
     * Navigate with full path via TF (parse) + UF (imperative), matching the app.
     * Falling back to Aj(commands) if TF is unavailable.
     * @param {string} path
     */
    const navigate = (path) => {
      let tree;
      if (typeof api.TF === 'function') {
        tree = api.TF(router, path);
      } else if (typeof router.Aj === 'function') {
        const parts = path.split('/').filter(Boolean);
        tree = router.Aj(parts);
      } else {
        return Promise.resolve(router.navigateByUrl?.(path) ?? router.navigate([path]));
      }
      return Promise.resolve(api.UF(router, tree));
    };

    spaNav = { router, navigate, chat, gems };
    console.info(LOG, 'Angular Router attached', {
      hasChat: !!chat,
      hasGems: !!gems,
    });
    return spaNav;
  }

  /**
   * Mirror native "open Gem as new chat":
   * 1) clear current conversation (Sa.uD)
   * 2) select the Gem bot (jSa / iS) when available
   * Without (1), Router only changes the URL and the previous conversation stays mounted.
   * @param {string} gemId
   * @param {any} [nav]
   */
  function prepareNewGemSession(gemId, nav) {
    const handle = nav || resolveSpaNav(false) || resolveSpaNav(true);
    if (!handle) return false;

    let chat = handle.chat;
    if (!isLiveChatService(chat)) {
      const again = resolveFromInjectors();
      if (again?.chat) {
        handle.chat = again.chat;
        chat = again.chat;
      }
      if (again?.gems) handle.gems = again.gems;
    }

    if (!isLiveChatService(chat)) {
      console.warn(LOG, 'chat service unavailable; Gem click may keep previous conversation');
      return false;
    }

    try {
      // Native conversation switch / new-chat path: Sa.uD(false)
      chat.uD(false);
    } catch (err) {
      console.warn(LOG, 'uD (clear conversation) failed', err);
      return false;
    }

    if (gemId) {
      try {
        // Preferred: gem service helper sets bot selection flags + jSa
        const api = getBardApi();
        if (handle.gems && typeof api?.iS === 'function') {
          api.iS(handle.gems, gemId);
        } else if (typeof chat.jSa === 'function') {
          chat.jSa(gemId);
        }
      } catch (err) {
        // Route /gem/:id usually still binds the bot; selection is best-effort.
        console.warn(LOG, 'select gem bot failed (non-fatal)', err);
      }
    }
    return true;
  }

  function normalizePath(href) {
    if (!href) return '';
    try {
      if (href.startsWith('http')) {
        const u = new URL(href, location.origin);
        if (u.origin !== location.origin) return '';
        return u.pathname;
      }
    } catch {
      return '';
    }
    const path = href.startsWith('/') ? href : `/${href}`;
    return path.split('?')[0].split('#')[0] || '';
  }

  function scheduleHighlightSync() {
    const sync = () => {
      lastPath = location.pathname;
      const root = document.getElementById(ROOT_ID);
      if (root) renderList(root, loadCache());
      ensureSection();
    };
    queueMicrotask(sync);
    setTimeout(sync, 200);
    setTimeout(sync, 800);
    setTimeout(sync, 1600);
  }

  /**
   * Client-side navigate like native sidenav links.
   * For /gem/:id, always open a *new* Gem chat (clear current conversation first).
   * @param {string} href e.g. /gem/b2396350cc82
   * @returns {boolean} true if SPA nav was started (caller may preventDefault)
   */
  function spaNavigate(href) {
    if (spaNavInFlight) return true;

    const path = normalizePath(href);
    if (!path || !path.startsWith('/')) return false;

    const gemMatch = path.match(/^\/gem\/([a-f0-9]{6,})\/?$/i);
    const gemId = gemMatch ? gemMatch[1].toLowerCase() : null;
    const isGemRoot = !!gemId;

    let nav = resolveSpaNav(false);
    if (!nav) nav = resolveSpaNav(true);
    if (!nav) return false;

    // Opening a Gem from any session must reset conversation state first.
    // Router-only navigation only rewrites the URL and leaves the previous thread mounted.
    if (isGemRoot) {
      const prepared = prepareNewGemSession(gemId, nav);
      if (!prepared) {
        // Without a live chat service we cannot safely SPA-open a new Gem chat.
        // Full navigation always boots a clean session for /gem/:id.
        console.warn(LOG, 'falling back to full navigation for Gem', path);
        location.assign(path);
        return true;
      }
      // Same Gem root URL: conversation was cleared above; no route change needed.
      if (path === location.pathname) {
        scheduleHighlightSync();
        return true;
      }
    } else if (path === location.pathname) {
      return true;
    }

    spaNavInFlight = true;
    const finish = () => {
      spaNavInFlight = false;
      scheduleHighlightSync();
    };

    try {
      const p = nav.navigate(path);
      Promise.resolve(p)
        .then((ok) => {
          // Angular returns false when navigation is cancelled / router disposed / same url
          if (ok === false && location.pathname !== path) {
            console.warn(LOG, 'SPA navigate returned false, re-resolving router', path);
            clearSpaNav();
            const retry = resolveSpaNav(true);
            if (retry) {
              if (isGemRoot && !prepareNewGemSession(gemId, retry)) {
                location.assign(path);
                return;
              }
              return Promise.resolve(retry.navigate(path)).then((ok2) => {
                if (ok2 === false && location.pathname !== path) {
                  console.warn(LOG, 'SPA retry failed, full navigation', path);
                  location.assign(path);
                }
              });
            }
            location.assign(path);
          }
        })
        .catch((err) => {
          console.warn(LOG, 'SPA navigate failed, full navigation', err);
          clearSpaNav();
          location.assign(path);
        })
        .finally(finish);

      // Optimistic UI sync
      scheduleHighlightSync();
      return true;
    } catch (err) {
      console.warn(LOG, 'SPA navigate error', err);
      clearSpaNav();
      spaNavInFlight = false;
      return false; // allow default <a> navigation
    }
  }

  function onGemLinkClick(e) {
    const a = e.target?.closest?.('a.gm-item');
    if (!a) return;
    const root = document.getElementById(ROOT_ID);
    if (!root || !root.contains(a)) return;

    // Let browser handle new-tab / download / non-primary clicks
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    // Only intercept same-origin gem paths
    const path = normalizePath(href);
    if (!path.startsWith('/gem/')) return;

    if (spaNavigate(href)) {
      e.preventDefault();
      // Do NOT stopPropagation — let Gemini's own analytics / sidenav listeners run
    }
  }

  // ── storage ──────────────────────────────────────────────────────────

  function loadCache() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { gems: [], updatedAt: 0 };
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.gems)) return { gems: [], updatedAt: 0 };
      return data;
    } catch {
      return { gems: [], updatedAt: 0 };
    }
  }

  /** @param {GemItem[]} gems */
  function saveCache(gems) {
    const payload = { gems, updatedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn(LOG, 'save cache failed', e);
    }
    return payload;
  }

  function isExpanded() {
    try {
      const v = localStorage.getItem(EXPANDED_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  }

  function setExpanded(v) {
    try {
      localStorage.setItem(EXPANDED_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  // ── scrape ───────────────────────────────────────────────────────────

  /**
   * Custom gems use /gem/<hex id>. Built-in gallery cards use slugs.
   * @param {Document|Element} root
   * @returns {GemItem[]}
   */
  function scrapeGems(root = document) {
    const rows = root.querySelectorAll('a.bot-row[href*="/gem/"], bot-list-row a[href*="/gem/"]');
    /** @type {Map<string, GemItem>} */
    const map = new Map();

    for (const a of rows) {
      const href = a.getAttribute('href') || '';
      const m = href.match(/\/gem\/([a-f0-9]{6,})/i);
      if (!m) continue;
      const id = m[1].toLowerCase();
      const name =
        a.querySelector('.title, .bot-title .gds-title-m, .gds-title-m')?.textContent?.trim() ||
        a.getAttribute('aria-label')?.replace(/^.*?[：:]\s*/, '').trim() ||
        id;
      const desc = a.querySelector('.bot-desc, .bot-description')?.textContent?.trim() || '';
      const logoText = a.querySelector('.bot-logo-text')?.textContent?.trim() || name.charAt(0);
      const style = a.querySelector('bot-logo')?.getAttribute('style') || '';
      const logoBg = style.match(/--bot-logo-bg:\s*([^;]+)/)?.[1]?.trim() || '#E8DEF8';
      const logoTextColor = style.match(/--bot-logo-text:\s*([^;]+)/)?.[1]?.trim() || '#4A4458';

      map.set(id, {
        id,
        name,
        desc: desc.slice(0, 120),
        href: `/gem/${id}`,
        logoText: logoText.slice(0, 2),
        logoBg,
        logoTextColor,
        updatedAt: Date.now(),
      });
    }

    return [...map.values()];
  }

  /** @param {GemItem[]} gems */
  function ingestScraped(gems) {
    if (!gems.length) return loadCache();
    return saveCache(gems);
  }

  // ── background refresh via same-origin iframe ────────────────────────

  function refreshViaIframe() {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.tabIndex = -1;
      Object.assign(iframe.style, {
        position: 'fixed',
        width: '1px',
        height: '1px',
        opacity: '0',
        pointerEvents: 'none',
        left: '-9999px',
        top: '0',
        border: '0',
      });
      iframe.src = 'https://gemini.google.com/gems/view?gm_sidenav_refresh=1';

      let settled = false;
      const cleanup = (result) => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(timer);
        iframe.remove();
        refreshInFlight = null;
        resolve(result);
      };

      const poll = setInterval(() => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return;
          const gems = scrapeGems(doc);
          if (gems.length) {
            const cache = ingestScraped(gems);
            console.info(LOG, `refreshed ${gems.length} gem(s) via iframe`);
            cleanup(cache);
          }
        } catch {
          /* not ready */
        }
      }, 400);

      const timer = setTimeout(() => {
        console.warn(LOG, 'iframe refresh timed out');
        cleanup(loadCache());
      }, IFRAME_TIMEOUT_MS);

      iframe.addEventListener('error', () => cleanup(loadCache()));
      document.documentElement.appendChild(iframe);
    });

    return refreshInFlight;
  }

  // ── styles ───────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        display: block;
        margin: 0;
        user-select: none;
      }
      #${ROOT_ID} .gm-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        height: 32px;
        padding: 1px 6px 1px 14px;
        margin: 0;
        border: 0;
        background: transparent;
        border-radius: 9999px;
        cursor: pointer;
        color: color-mix(in srgb, currentColor 55%, transparent);
        font: inherit;
        box-sizing: border-box;
      }
      #${ROOT_ID} .gm-header:hover {
        background: color-mix(in srgb, currentColor 6%, transparent);
      }
      #${ROOT_ID} .gm-title {
        font-family: "Google Sans Flex", "Google Sans", "Helvetica Neue", sans-serif;
        font-size: 13px;
        font-weight: 400;
        line-height: 20px;
        color: inherit;
      }
      #${ROOT_ID} .gm-header-actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      #${ROOT_ID} .gm-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 0;
        border-radius: 9999px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        flex-shrink: 0;
      }
      #${ROOT_ID} .gm-icon-btn:hover {
        background: color-mix(in srgb, currentColor 8%, transparent);
      }
      #${ROOT_ID} .gm-icon-btn[aria-disabled="true"] {
        opacity: 0.45;
        cursor: default;
        pointer-events: none;
      }
      #${ROOT_ID} .gm-chevron {
        display: inline-flex;
        transition: transform 0.15s ease;
        transform: rotate(-90deg);
      }
      #${ROOT_ID}.expanded .gm-chevron {
        transform: rotate(0deg);
      }
      #${ROOT_ID} .gm-spin {
        animation: gm-my-gems-spin 0.8s linear infinite;
      }
      @keyframes gm-my-gems-spin {
        to { transform: rotate(360deg); }
      }
      #${ROOT_ID} .gm-content {
        display: none;
        padding: 0;
      }
      #${ROOT_ID}.expanded .gm-content {
        display: block;
      }
      #${ROOT_ID} .gm-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      #${ROOT_ID} .gm-item {
        display: flex;
        align-items: center;
        gap: 10px;
        height: 32px;
        padding: 0 8px 0 12px;
        margin: 0;
        border-radius: 9999px;
        color: inherit;
        text-decoration: none;
        box-sizing: border-box;
        overflow: hidden;
      }
      #${ROOT_ID} .gm-item:hover {
        background: color-mix(in srgb, currentColor 6%, transparent);
      }
      #${ROOT_ID} .gm-item.active {
        background: color-mix(in srgb, currentColor 10%, transparent);
      }
      #${ROOT_ID} .gm-logo {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 500;
        line-height: 1;
        overflow: hidden;
      }
      #${ROOT_ID} .gm-name {
        flex: 1;
        min-width: 0;
        font-family: "Google Sans Flex", "Google Sans", "PingFang SC", "Helvetica Neue", sans-serif;
        font-size: 13px;
        line-height: 20px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${ROOT_ID} .gm-empty,
      #${ROOT_ID} .gm-meta {
        padding: 4px 14px 8px;
        font-size: 12px;
        line-height: 16px;
        color: color-mix(in srgb, currentColor 50%, transparent);
      }
      bard-sidenav.collapsed #${ROOT_ID},
      .sidenav-collapsed #${ROOT_ID} {
        display: none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  // ── DOM helpers (Trusted Types safe: no innerHTML) ───────────────────

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
      } else if (k in node && k !== 'href' && k !== 'role') {
        try {
          node[k] = v;
        } catch {
          node.setAttribute(k, String(v));
        }
      } else {
        node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function svgIcon(pathD, size = 18) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  const ICON = {
    chevron: () =>
      svgIcon('M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z', 18),
    refresh: () =>
      svgIcon(
        'M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7c2.76 0 5 2.24 5 5a5 5 0 0 1-8.66 3.46l-1.42 1.42A7 7 0 0 0 19 12c0-1.93-.78-3.68-2.05-4.95zM6 12c0-1.48.55-2.83 1.44-3.88l1.46 1.46A4.96 4.96 0 0 0 7 12c0 2.76 2.24 5 5 5v3l5-5-5-5v3a5 5 0 0 1-5-5z',
        16
      ),
  };

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ── DOM build ────────────────────────────────────────────────────────

  /** Always pin above 笔记本. No other placement. */
  function findNotebooksSection() {
    return document.querySelector(
      'expandable-section[data-test-id="notebooks-expandable-section"], expandable-section[storagekey="notebooks"]'
    );
  }

  function findInsertPoint() {
    const notebooks = findNotebooksSection();
    if (notebooks?.parentElement) {
      return { parent: notebooks.parentElement, before: notebooks };
    }
    return null;
  }

  /** True when root is the immediate previous sibling of 笔记本. */
  function isPinnedAboveNotebooks(root) {
    const notebooks = findNotebooksSection();
    return !!(notebooks && root && root.nextElementSibling === notebooks);
  }

  function placeSection(root) {
    const point = findInsertPoint();
    if (!point) return false;
    if (root.nextElementSibling === point.before && root.parentElement === point.parent) {
      return true;
    }
    point.parent.insertBefore(root, point.before);
    return true;
  }

  function currentGemId() {
    const m = location.pathname.match(/\/gem\/([a-f0-9]{6,})/i);
    return m ? m[1].toLowerCase() : null;
  }

  function formatUpdatedAt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function renderList(root, cache) {
    const list = root.querySelector('.gm-list');
    const empty = root.querySelector('.gm-empty');
    const meta = root.querySelector('.gm-meta');
    if (!list || !empty || !meta) return;

    const activeId = currentGemId();
    clearChildren(list);
    clearChildren(empty);

    if (!cache.gems.length) {
      empty.hidden = false;
      meta.hidden = true;
      empty.textContent = '暂无缓存的 Gem，请点击上方刷新同步。';
      return;
    }

    empty.hidden = true;
    meta.hidden = false;
    meta.textContent = cache.updatedAt ? `已同步 ${formatUpdatedAt(cache.updatedAt)}` : '';

    for (const gem of cache.gems) {
      const a = el(
        'a',
        {
          className: 'gm-item' + (activeId === gem.id ? ' active' : ''),
          href: gem.href,
          title: gem.desc ? `${gem.name}\n${gem.desc}` : gem.name,
          'aria-label': gem.name,
        },
        el('span', {
          className: 'gm-logo',
          text: gem.logoText || gem.name.charAt(0),
          style: {
            background: gem.logoBg || '#E8DEF8',
            color: gem.logoTextColor || '#4A4458',
          },
        }),
        el('span', { className: 'gm-name', text: gem.name })
      );
      list.appendChild(el('li', {}, a));
    }
  }

  function setRefreshing(root, on) {
    const btn = root.querySelector('.gm-refresh');
    if (!btn) return;
    btn.setAttribute('aria-disabled', on ? 'true' : 'false');
    clearChildren(btn);
    const icon = ICON.refresh();
    if (on) icon.classList.add('gm-spin');
    btn.appendChild(icon);
    btn.title = on ? '同步中…' : '刷新我的 Gem';
  }

  async function handleRefresh(root) {
    setRefreshing(root, true);
    try {
      if (/\/gems\/view/.test(location.pathname)) {
        const gems = scrapeGems(document);
        if (gems.length) {
          const cache = ingestScraped(gems);
          renderList(root, cache);
          return;
        }
      }
      const cache = await refreshViaIframe();
      renderList(root, cache);
    } finally {
      setRefreshing(root, false);
    }
  }

  function buildSection() {
    const expanded = isExpanded();
    const root = el('div', {
      id: ROOT_ID,
      className: expanded ? 'expanded' : '',
      'data-test-id': 'gm-my-gems-expandable-section',
    });

    const refreshBtn = el(
      'span',
      {
        className: 'gm-icon-btn gm-refresh',
        role: 'button',
        tabindex: '0',
        title: '刷新我的 Gem',
        'aria-label': '刷新我的 Gem',
      },
      ICON.refresh()
    );

    const chevron = el('span', { className: 'gm-chevron', 'aria-hidden': 'true' }, ICON.chevron());

    const header = el(
      'button',
      {
        type: 'button',
        className: 'gm-header',
        'aria-expanded': String(expanded),
        'aria-controls': 'gm-my-gems-content',
      },
      el('span', { className: 'gm-title', text: '我的 Gem' }),
      el('span', { className: 'gm-header-actions' }, refreshBtn, chevron)
    );

    const list = el('ul', { className: 'gm-list' });
    const empty = el('div', { className: 'gm-empty' });
    empty.hidden = true;
    const meta = el('div', { className: 'gm-meta' });
    meta.hidden = true;

    const content = el(
      'div',
      { className: 'gm-content', id: 'gm-my-gems-content' },
      list,
      empty,
      meta
    );

    root.append(header, content);

    header.addEventListener('click', (e) => {
      if (e.target.closest('.gm-refresh')) return;
      const next = !root.classList.contains('expanded');
      root.classList.toggle('expanded', next);
      header.setAttribute('aria-expanded', String(next));
      setExpanded(next);
    });

    const onRefresh = (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleRefresh(root);
    };
    refreshBtn.addEventListener('click', onRefresh);
    refreshBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onRefresh(e);
    });

    renderList(root, loadCache());
    return root;
  }

  function ensureSection() {
    if (location.search.includes('gm_sidenav_refresh=1')) return null;
    if (window !== window.top) return null;

    injectStyles();

    let root = document.getElementById(ROOT_ID);

    // Wait until 笔记本 exists so we can pin strictly above it.
    if (!findInsertPoint()) {
      if (root && root.isConnected) {
        // Temporarily hide until notebooks reappears, then re-pin.
        root.style.display = 'none';
      }
      return null;
    }

    if (root && root.isConnected) {
      root.style.display = '';
      placeSection(root);
      renderList(root, loadCache());
      return root;
    }

    // Detached leftover (e.g. Angular wiped parent) — rebuild.
    root?.remove();
    root = buildSection();
    placeSection(root);
    console.info(LOG, 'section mounted above notebooks');
    return root;
  }

  // ── page scrape + SPA navigation ─────────────────────────────────────

  function maybeScrapeCurrentPage() {
    if (!/\/gems\/view/.test(location.pathname)) return;
    const gems = scrapeGems(document);
    if (!gems.length) return;
    const cache = ingestScraped(gems);
    const root = document.getElementById(ROOT_ID);
    if (root) renderList(root, cache);
    console.info(LOG, `scraped ${gems.length} gem(s) from page`);
  }

  function onRouteMaybeChanged() {
    // Router instance can be recreated across major route transitions
    if (spaNav?.router && !isLiveRouter(spaNav.router)) clearSpaNav();

    if (location.pathname === lastPath) {
      const root = document.getElementById(ROOT_ID);
      if (root) renderList(root, loadCache());
      return;
    }
    lastPath = location.pathname;
    ensureSection();
    maybeScrapeCurrentPage();
    setTimeout(() => {
      ensureSection();
      maybeScrapeCurrentPage();
    }, 300);
    setTimeout(() => {
      ensureSection();
      maybeScrapeCurrentPage();
      // Re-bind router after Angular settles
      resolveSpaNav(true);
    }, 1200);
  }

  function patchHistory() {
    const wrap = (type) => {
      const orig = history[type];
      return function (...args) {
        const ret = orig.apply(this, args);
        queueMicrotask(onRouteMaybeChanged);
        return ret;
      };
    };
    history.pushState = wrap('pushState');
    history.replaceState = wrap('replaceState');
    window.addEventListener('popstate', onRouteMaybeChanged);
  }

  function watchDom() {
    if (observer) return;
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const root = document.getElementById(ROOT_ID);
        if (!root?.isConnected || !isPinnedAboveNotebooks(root)) {
          ensureSection();
        }
        if (/\/gems\/view/.test(location.pathname)) {
          if (document.querySelector('a.bot-row[href*="/gem/"]')) maybeScrapeCurrentPage();
        }
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── boot ─────────────────────────────────────────────────────────────

  function boot() {
    if (window !== window.top || location.search.includes('gm_sidenav_refresh=1')) return;

    const root = ensureSection();
    maybeScrapeCurrentPage();

    if (!root) {
      bootTries += 1;
      if (bootTries < BOOT_MAX_TRIES) setTimeout(boot, BOOT_RETRY_MS);
      else console.warn(LOG, 'sidenav not found, giving up boot retries');
      return;
    }

    const cache = loadCache();
    const stale = !cache.updatedAt || Date.now() - cache.updatedAt > CACHE_TTL_MS;
    if ((!cache.gems.length || stale) && !/\/gems\/view/.test(location.pathname)) {
      handleRefresh(root);
    }
  }

  patchHistory();
  watchDom();
  // Capture phase so we beat default <a> navigation even if re-rendered
  document.addEventListener('click', onGemLinkClick, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 1000);
  setTimeout(boot, 3000);
  // Router may not be ready at first paint
  setTimeout(() => resolveSpaNav(), 1500);
  setTimeout(() => resolveSpaNav(), 4000);
})();
