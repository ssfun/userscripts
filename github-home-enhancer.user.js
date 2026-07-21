// ==UserScript==
// @name         GitHub 首页增强
// @name:en      GitHub Home Enhancer
// @namespace    https://github.com/ssfun/userscripts
// @version      1.1.2
// @description  将 GitHub 登录首页重排为工作台式三栏动态首页，中间栏展示 starred 仓库的 Release 动态。
// @description:en Rebuilds the signed-in GitHub home page into a three-column workbench with a Release Radar for starred repositories.
// @author       sfun
// @license      MIT
// @homepageURL  https://github.com/ssfun/userscripts
// @supportURL   https://github.com/ssfun/userscripts/issues
// @match        https://github.com/*
// @run-at       document-idle
// @grant        none
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/github-home-enhancer.user.js
// @updateURL https://github.com/ssfun/userscripts/raw/refs/heads/main/github-home-enhancer.user.js
// ==/UserScript==

(function () {
  'use strict';

  const ROOT_ID = 'gh-home-enhancer-workbench';
  const ACTIVE_CLASS = 'gh-home-enhancer-active';
  const HOME_PATHS = new Set(['/', '', '/dashboard']);
  const LOG_PREFIX = '[GitHub Home Enhancer]';
  const CACHE_PREFIX = 'ghg-release-radar-';
  const STARS_CACHE_TTL = 6 * 3600 * 1000;   // 6 hours
  const RELEASES_CACHE_TTL = 1800 * 1000;     // 0.5 hour hard TTL
  const RELEASES_SOFT_TTL = 5 * 60 * 1000;    // 5 min: show cache, revalidate in background
  const RELEASES_ERROR_TTL = 60 * 1000;       // transient errors: retry soon
  const MEMORY_REFRESH_MS = 5 * 60 * 1000;    // in-page release refresh interval
  const BODY_MAX_HEIGHT = 200;                // px, release notes truncation
  const ATOM_NS = 'http://www.w3.org/2005/Atom';

  let lastData = null;
  let lastDataKey = '';
  let releaseLoadKey = '';
  let releaseRequestId = 0;

  const LABELS = {
    en: {
      myWorkspace: 'My workspace',
      repositories: 'Repositories',
      viewAll: 'View all',
      pullRequests: 'Pull Requests',
      issues: 'Issues',
      gists: 'Gists',
      stars: 'Stars',
      releaseRadar: 'Release Radar',
      released: 'released',
      readMore: 'Read more',
      recommendations: 'Recommendations',
      relatedUsers: 'Related users',
      exploreMore: 'Explore more',
      relatedRepositories: 'Related repositories',
      exploreRepositories: 'Explore repositories',
      viewRepository: 'View repository',
      from: 'From',
      basedOnRepoActivity: 'Based on GitHub repository activity',
      gitCommandGuide: 'Git command guide',
      githubTrending: 'GitHub Trending',
      aiCodingAssistant: 'AI coding assistant',
      mobileApps: 'Mobile apps',
      docs: 'Docs',
      support: 'Support',
      changelog: 'Changelog',
      noReleases: 'No recent releases from your starred repositories.',
      justNow: 'just now',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago',
      monthsAgo: 'months ago',
    },
    zh: {
      myWorkspace: '我的工作台',
      repositories: '仓库',
      viewAll: '查看全部',
      pullRequests: 'Pull Requests',
      issues: 'Issues',
      gists: '代码片段',
      stars: '我的 Stars',
      releaseRadar: 'Release 动态',
      released: '发布了',
      readMore: '阅读全文',
      recommendations: '推荐',
      relatedUsers: '相关用户',
      exploreMore: '探索更多',
      relatedRepositories: '相关仓库',
      exploreRepositories: '探索仓库',
      viewRepository: '查看仓库',
      from: '来自',
      basedOnRepoActivity: '基于 GitHub 仓库活动推荐',
      gitCommandGuide: 'Git 命令学习',
      githubTrending: 'GitHub Trending',
      aiCodingAssistant: 'AI 编程助手',
      mobileApps: 'App 与插件下载',
      docs: '帮助文档',
      support: '在线自助服务',
      changelog: '更新日志',
      noReleases: '你关注的仓库暂无新发布。',
      justNow: '刚刚',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前',
      monthsAgo: '个月前',
    },
  };

  function isChineseLocale() {
    return /^zh(?:-|$)/i.test(document.documentElement.lang || '');
  }

  function t(key) {
    const locale = isChineseLocale() ? 'zh' : 'en';
    return LABELS[locale][key] || LABELS.en[key] || key;
  }

  // ── Icons ──────────────────────────────────────────────────────────────

  function iconPullRequest() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5 3.25a1.75 1.75 0 1 0-2.5 1.58v6.34a1.75 1.75 0 1 0 1.5 0V4.83c.61-.21 1-.78 1-1.58ZM3.25 2.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0 9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5ZM11 3.25a1.75 1.75 0 1 1 2.5 1.58v1.42A2.75 2.75 0 0 1 10.75 9H8.5v2.17a1.75 1.75 0 1 1-1.5 0V8.25c0-.41.34-.75.75-.75h3A1.25 1.25 0 0 0 12 6.25V4.83a1.75 1.75 0 0 1-1-1.58Zm1.75-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM7.75 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"></path></svg>';
  }

  function iconLock() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M4.5 7V5a3.5 3.5 0 1 1 7 0v2h.25c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-7.5C3.56 15 3 14.44 3 13.75v-5.5C3 7.56 3.56 7 4.25 7h.25Zm1.5 0h4V5a2 2 0 1 0-4 0v2Zm-1.5 1.5v5h7v-5h-7Z"></path></svg>';
  }

  function iconCode() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="m6.22 3.22 1.06 1.06L3.56 8l3.72 3.72-1.06 1.06-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25Zm3.56 0 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25-1.06-1.06L12.44 8 8.72 4.28l1.06-1.06Z"></path></svg>';
  }

  function iconStar() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .67.42l1.88 3.82 4.21.61a.75.75 0 0 1 .42 1.28l-3.05 2.97.72 4.2a.75.75 0 0 1-1.09.79L8 12.36l-3.76 1.98a.75.75 0 0 1-1.09-.79l.72-4.2L.82 6.38a.75.75 0 0 1 .42-1.28l4.21-.61L7.33.67A.75.75 0 0 1 8 .25Z"></path></svg>';
  }

  function iconTag() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"></path></svg>';
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  const fallbackRepos = [
    { name: 'github/docs', href: 'https://github.com/github/docs' },
    { name: 'microsoft/vscode', href: 'https://github.com/microsoft/vscode' },
    { name: 'vercel/next.js', href: 'https://github.com/vercel/next.js' },
  ];

  function isGithubHome() {
    return location.hostname === 'github.com' && HOME_PATHS.has(location.pathname);
  }

  function isLoggedInHome() {
    return Boolean(
      document.querySelector('meta[name="user-login"]')
      || document.body?.classList.contains('logged-in')
      || document.querySelector('.feed-background')
      || document.querySelector('.js-dashboard-repos-list')
    );
  }

  function compact(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeGithubUrl(value, fallback = 'https://github.com/') {
    try {
      const url = new URL(value, location.origin);
      if (url.protocol === 'https:' && url.hostname === 'github.com') return url.href;
    } catch (error) {
      return fallback;
    }
    return fallback;
  }

  function githubAvatarUrl(name) {
    return `https://github.com/${encodeURIComponent(name)}.png?size=80`;
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyFn(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Sanitize HTML from Atom feed <content> — allow safe tags only. */
  function sanitizeReleaseHtml(raw) {
    if (!raw) return '';
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    // Remove dangerous elements
    doc.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button,link,meta').forEach((el) => el.remove());
    // Remove event handler attributes
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on') || attr.name === 'style') {
          el.removeAttribute(attr.name);
        }
      }
      // Rewrite relative links to absolute GitHub URLs
      if (el.tagName === 'A' && el.getAttribute('href')) {
        el.setAttribute('href', safeGithubUrl(el.getAttribute('href')));
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
      if (el.tagName === 'IMG' && el.getAttribute('src')) {
        try {
          const url = new URL(el.getAttribute('src'), 'https://github.com');
          el.setAttribute('src', url.href);
        } catch (error) {
          el.remove();
        }
      }
    });
    return doc.body.innerHTML;
  }

  // ── Cache helpers ─────────────────────────────────────────────────────
  // App-level TTL lives in localStorage. Network fetch itself must bypass the
  // browser HTTP cache: Safari is especially sticky with same-origin GET
  // responses (releases.atom / ?tab=stars), so after localStorage expires we
  // can still keep serving stale feed HTML/XML for a long time.

  function cacheRead(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !('expires' in parsed)) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      const expires = Number(parsed.expires);
      const cachedAt = Number(parsed.cachedAt || (expires - RELEASES_CACHE_TTL));
      if (!Number.isFinite(expires)) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return {
        data: parsed.data,
        expires,
        cachedAt: Number.isFinite(cachedAt) ? cachedAt : 0,
        age: Math.max(0, Date.now() - (Number.isFinite(cachedAt) ? cachedAt : 0)),
        expired: Date.now() > expires,
      };
    } catch (error) {
      return null;
    }
  }

  function cacheGet(key, { allowExpired = false } = {}) {
    const entry = cacheRead(key);
    if (!entry) return null;
    if (entry.expired) {
      if (!allowExpired) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return entry.data;
    }
    return entry.data;
  }

  function cacheSet(key, data, ttl) {
    try {
      const now = Date.now();
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        expires: now + ttl,
        cachedAt: now,
      }));
    } catch (error) {
      // localStorage quota exceeded / private mode — silently ignore
    }
  }

  function cacheRemove(key) {
    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      // ignore
    }
  }

  /** Same-origin GitHub fetch that avoids Safari HTTP cache stickiness. */
  async function fetchGithub(url, init = {}) {
    const bust = `_ghg=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const joined = url.includes('?') ? `${url}&${bust}` : `${url}?${bust}`;
    const { headers: initHeaders, ...rest } = init;
    const headers = {
      'Cache-Control': 'no-cache, no-store, max-age=0',
      Pragma: 'no-cache',
      ...(initHeaders || {}),
    };

    // Prefer Request + cache:'reload' so Safari doesn't reuse disk cache by URL path.
    try {
      const request = new Request(joined, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'reload',
        headers,
      });
      return await fetch(request);
    } catch (error) {
      return fetch(joined, {
        ...rest,
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers,
      });
    }
  }

  // ── Atom helpers (Safari-safe) ─────────────────────────────────────────
  // GitHub Atom uses a default namespace. Safari's querySelector() often fails
  // to match namespaced nodes; getElementsByTagName(localName) is reliable.

  function atomElements(root, localName) {
    if (!root) return [];
    if (typeof root.getElementsByTagNameNS === 'function') {
      const namespaced = root.getElementsByTagNameNS(ATOM_NS, localName);
      if (namespaced && namespaced.length) return Array.from(namespaced);
    }
    return Array.from(root.getElementsByTagName(localName));
  }

  function atomElement(root, localName) {
    return atomElements(root, localName)[0] || null;
  }

  function atomText(root, localName) {
    return compact(atomElement(root, localName)?.textContent || '');
  }

  function atomLinkHref(entry) {
    const links = atomElements(entry, 'link');
    if (!links.length) return '';
    const alternate = links.find((link) => {
      const rel = (link.getAttribute('rel') || 'alternate').toLowerCase();
      return rel === 'alternate' || rel.split(/\s+/).includes('alternate');
    });
    return (alternate || links[0]).getAttribute('href') || '';
  }

  function atomContentHtml(entry) {
    const contentEl = atomElement(entry, 'content') || atomElement(entry, 'summary');
    if (!contentEl) return '';
    // Prefer textContent: Atom usually stores HTML as escaped character data.
    // Fall back to innerHTML when the parser already expanded child nodes.
    const raw = contentEl.textContent && contentEl.textContent.trim()
      ? contentEl.textContent
      : contentEl.innerHTML;
    return raw || '';
  }

  function parseAtomDocument(xml) {
    const attempts = ['application/xml', 'text/xml'];
    for (const type of attempts) {
      const doc = new DOMParser().parseFromString(xml, type);
      if (doc.querySelector('parsererror')) continue;
      const entries = atomElements(doc, 'entry');
      if (entries.length) return { doc, entries };
      // Keep a valid empty doc rather than failing hard — repo may have no releases.
      if (doc.documentElement) return { doc, entries };
    }

    // Last resort: parse as HTML so CSS selectors ignore XML namespaces.
    const htmlDoc = new DOMParser().parseFromString(xml, 'text/html');
    const entries = Array.from(htmlDoc.querySelectorAll('entry'));
    return { doc: htmlDoc, entries };
  }

  // ── Repo collection (left sidebar) ────────────────────────────────────

  function repoFromLink(link, fallbackOwner = '') {
    const textName = compact(link.textContent).replace(/\s*Public\s*$/, '');
    const href = safeGithubUrl(link.href || link.getAttribute('href'));
    let owner = '';
    let repo = '';
    try {
      const url = new URL(href);
      const parts = url.pathname.split('/').filter(Boolean);
      [owner, repo] = parts;
    } catch (error) {
      return null;
    }

    const textParts = textName.includes('/') ? textName.split('/') : [];
    if (textParts.length >= 2) {
      owner = textParts[0];
      repo = textParts.slice(1).join('/');
    } else if (fallbackOwner && textName) {
      owner = fallbackOwner;
      repo = textName;
    }

    if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    const name = `${owner}/${repo}`;
    const container = link.closest('li') || link.parentElement;
    const isPrivate = Boolean(
      container?.querySelector('svg.octicon-lock, [aria-label*="Private"], [aria-label*="private"]')
    ) || /\bPrivate\b/i.test(compact(container?.textContent || ''));
    return {
      name,
      href,
      owner,
      repo,
      avatar: link.querySelector('img')?.src || '',
      private: isPrivate,
    };
  }

  function collectRepos() {
    const selectors = [
      '.js-dashboard-repos-list a[href]',
      '.feed-left-sidebar a[href*="/"]',
      'aside a[href^="/"][data-hovercard-type="repository"]',
    ];

    const links = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const repos = uniqueBy(links.map(repoFromLink).filter(Boolean), (repo) => repo.name).slice(0, 12);
    return repos.length ? repos : fallbackRepos;
  }

  function usersFromRepos(repos, userName, avatar) {
    return uniqueBy(repos.map((repo) => ({
      name: repo.owner,
      href: safeGithubUrl(`/${repo.owner}`),
      source: repo.name,
      avatar: repo.owner === userName
        ? (avatar || repo.avatar || githubAvatarUrl(repo.owner))
        : (repo.avatar || githubAvatarUrl(repo.owner)),
    })), (user) => user.name).slice(0, 5);
  }

  // ── Time formatting ───────────────────────────────────────────────────

  function relativeTime(value) {
    const date = new Date(value);
    const diffMs = Date.now() - date.getTime();
    if (!value || Number.isNaN(diffMs) || diffMs < 60_000) return t('justNow');
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `${minutes} ${t('minutesAgo')}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${t('hoursAgo')}`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ${t('daysAgo')}`;
    return `${Math.floor(days / 30)} ${t('monthsAgo')}`;
  }

  function dateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-');
  }

  // ── Starred repos & releases fetching ─────────────────────────────────

  async function fetchStarredRepos(userName, { force = false } = {}) {
    const cacheKey = 'starred-repos';
    if (!force) {
      const cached = cacheGet(cacheKey);
      if (cached?.length) return cached;
    }

    const repos = [];
    let page = 1;
    const maxPages = 7; // ~210 repos at 30/page

    while (page <= maxPages) {
      const url = `https://github.com/${encodeURIComponent(userName)}?tab=stars&page=${page}`;
      let response;
      try {
        response = await fetchGithub(url, {
          headers: { Accept: 'text/html,application/xhtml+xml' },
        });
      } catch (error) {
        console.warn(`${LOG_PREFIX} starred page fetch failed`, page, error);
        break;
      }
      if (!response.ok) {
        console.warn(`${LOG_PREFIX} starred page HTTP ${response.status}`, page);
        break;
      }

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const repoLinks = Array.from(doc.querySelectorAll([
        'h3 a[href^="/"]',
        'a[data-hovercard-type="repository"]',
        '.d-inline-block h3 a',
        '#user-starred-repos h3 a',
        '[data-repository-hovercards-enabled] h3 a',
      ].join(',')));

      if (!repoLinks.length) break;

      for (const link of repoLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const parts = href.split('/').filter(Boolean);
        if (parts.length < 2) continue;
        const [owner, repo] = parts;
        if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) continue;
        repos.push({
          name: `${owner}/${repo}`,
          owner,
          repo,
          href: `https://github.com/${owner}/${repo}`,
        });
      }

      const nextLink = doc.querySelector('a.next_page, a[rel="next"], .pagination a:last-child[href]');
      if (!nextLink || nextLink.classList.contains('disabled') || nextLink.getAttribute('aria-disabled') === 'true') break;
      page++;
    }

    const uniqueRepos = uniqueBy(repos, (repo) => repo.name);
    if (uniqueRepos.length) {
      cacheSet(cacheKey, uniqueRepos, STARS_CACHE_TTL);
      return uniqueRepos;
    }

    // Keep previous stars list if a forced/hard refresh returned nothing (rate limit / HTML change).
    const stale = cacheGet(cacheKey, { allowExpired: true });
    if (stale?.length) {
      console.warn(`${LOG_PREFIX} starred scrape empty; reusing stale list (${stale.length})`);
      return stale;
    }
    return [];
  }

  function mapAtomEntry(entry, repo) {
    const title = atomText(entry, 'title');
    const link = atomLinkHref(entry);
    const updated = atomText(entry, 'updated') || atomText(entry, 'published');
    const authorNode = atomElement(entry, 'author');
    const author = (authorNode ? atomText(authorNode, 'name') : '') || repo.owner;
    const bodyRaw = atomContentHtml(entry);

    const tagMatch = link.match(/\/releases\/tag\/(.+)$/);
    const tagName = tagMatch ? decodeURIComponent(tagMatch[1]) : title;
    if (!tagName && !updated) return null;

    return {
      id: `release-${repo.name}-${tagName || updated}`,
      actor: author,
      actorAvatar: githubAvatarUrl(repo.owner),
      createdAt: updated,
      href: link || repo.href,
      tagName: tagName || title || 'release',
      releaseName: title,
      repoName: repo.name,
      repoOwner: repo.owner,
      bodyHtml: sanitizeReleaseHtml(bodyRaw),
    };
  }

  async function fetchRepoReleases(repo, { force = false } = {}) {
    const cacheKey = `releases-${repo.name}`;
    const cachedEntry = cacheRead(cacheKey);

    if (!force && cachedEntry && !cachedEntry.expired) {
      // Soft TTL: serve cache immediately, but let callers revalidate in background.
      return {
        items: Array.isArray(cachedEntry.data) ? cachedEntry.data : [],
        fromCache: true,
        softStale: cachedEntry.age > RELEASES_SOFT_TTL,
        age: cachedEntry.age,
      };
    }

    if (!force && cachedEntry?.expired) {
      // Drop hard-expired entries so we don't keep reusing them accidentally.
      cacheRemove(cacheKey);
    }

    const url = `https://github.com/${repo.name}/releases.atom`;
    let response;
    try {
      response = await fetchGithub(url, {
        headers: { Accept: 'application/atom+xml, application/xml, text/xml, */*;q=0.1' },
      });
    } catch (error) {
      console.warn(`${LOG_PREFIX} release fetch failed`, repo.name, error);
      const stale = cacheGet(cacheKey, { allowExpired: true });
      if (Array.isArray(stale)) {
        return { items: stale, fromCache: true, softStale: true, error: true };
      }
      return { items: [], fromCache: false, softStale: false, error: true };
    }

    if (response.status === 404) {
      // Repo truly has no releases feed.
      cacheSet(cacheKey, [], RELEASES_CACHE_TTL);
      return { items: [], fromCache: false, softStale: false };
    }

    if (!response.ok) {
      // 429 / 5xx / auth glitches: short retry window, keep stale data if any.
      console.warn(`${LOG_PREFIX} release HTTP ${response.status}`, repo.name);
      cacheSet(cacheKey, cacheGet(cacheKey, { allowExpired: true }) || [], RELEASES_ERROR_TTL);
      const stale = cacheGet(cacheKey, { allowExpired: true });
      if (Array.isArray(stale) && stale.length) {
        return { items: stale, fromCache: true, softStale: true, error: true };
      }
      return { items: [], fromCache: false, softStale: false, error: true };
    }

    const xml = await response.text();
    if (!xml || !xml.includes('<')) {
      cacheSet(cacheKey, [], RELEASES_ERROR_TTL);
      return { items: [], fromCache: false, softStale: false, error: true };
    }

    const { entries } = parseAtomDocument(xml);
    const releases = entries
      .slice(0, 3)
      .map((entry) => mapAtomEntry(entry, repo))
      .filter(Boolean);

    cacheSet(cacheKey, releases, RELEASES_CACHE_TTL);
    return { items: releases, fromCache: false, softStale: false };
  }

  async function fetchAllWithConcurrency(items, fetchFn, concurrency = 5) {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = await fetchFn(items[current]);
        } catch (error) {
          results[current] = { items: [], fromCache: false, softStale: false, error: true };
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  function assembleReleaseItems(releaseLists) {
    return releaseLists
      .flat()
      .filter((item) => item && item.createdAt)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 60);
  }

  async function loadStarredReleases(data, { force = false, onPartial } = {}) {
    const starredRepos = await fetchStarredRepos(data.userName, { force: false });
    if (!starredRepos.length) {
      return { status: 'empty', items: [], revalidated: true };
    }

    // Pass 1: prefer localStorage. Fresh cache paints immediately; missing/expired hit network.
    const firstPass = await fetchAllWithConcurrency(
      starredRepos,
      (repo) => fetchRepoReleases(repo, { force: false }),
      6
    );

    let networkHits = firstPass.filter((result) => result && !result.fromCache && !result.error).length;
    const softStaleRepos = starredRepos.filter((_, index) => firstPass[index]?.softStale);
    let releaseLists = firstPass.map((result) => (result?.items ? result.items : []));
    let items = assembleReleaseItems(releaseLists);

    // Paint cached cards ASAP, then revalidate soft-stale repos in the background path.
    if (typeof onPartial === 'function' && items.length) {
      try {
        onPartial({ status: 'ready', items, partial: true });
      } catch (error) {
        // ignore partial render failures
      }
    }

    // Pass 2: revalidate soft-stale caches, or everything when force=true.
    const needsRefresh = force
      ? starredRepos
      : softStaleRepos;

    if (needsRefresh.length) {
      const refreshed = await fetchAllWithConcurrency(
        needsRefresh,
        (repo) => fetchRepoReleases(repo, { force: true }),
        4
      );
      const refreshMap = new Map(needsRefresh.map((repo, i) => [repo.name, refreshed[i]]));
      releaseLists = starredRepos.map((repo, index) => {
        const updated = refreshMap.get(repo.name);
        if (updated) {
          if (!updated.error && !updated.fromCache) networkHits += 1;
          // Keep previous cards if a forced refresh failed transiently.
          if (updated.error && !(updated.items && updated.items.length)) {
            return firstPass[index]?.items || [];
          }
          return updated.items || [];
        }
        return firstPass[index]?.items || [];
      });
      items = assembleReleaseItems(releaseLists);
    }

    console.debug(`${LOG_PREFIX} releases loaded`, {
      repos: starredRepos.length,
      items: items.length,
      networkHits,
      softStale: softStaleRepos.length,
      refreshed: needsRefresh.length,
      force,
    });

    return {
      status: items.length ? 'ready' : 'empty',
      items,
      revalidated: true,
    };
  }

  // ── Data collection ───────────────────────────────────────────────────

  function collectGithubData() {
    document.body.classList.remove(ACTIVE_CLASS);

    const repos = collectRepos();
    const avatar = document.querySelector('img.avatar, img[src*="avatars.githubusercontent.com"]');
    const loginMeta = document.querySelector('meta[name="user-login"]')?.content;
    const userName = loginMeta || compact(avatar?.alt).replace(/^@/, '') || repos[0]?.owner || 'GitHub';

    return {
      userName,
      avatar: avatar?.src || '',
      repos,
      users: usersFromRepos(repos, userName, avatar?.src || ''),
      releaseItems: [],
      releaseStatus: 'loading',
      releaseFetchedAt: 0,
      repoCount: repos.length,
      today: dateDaysAgo(0),
    };
  }

  function dataKey(data) {
    return `${data.userName}|${data.repos.map((repo) => repo.name).join(',')}`;
  }

  function loadReleasesFor(data, key, { force = false } = {}) {
    // Allow a forced refresh to interrupt an in-flight soft load for the same key.
    if (!force && releaseLoadKey === key) return;
    releaseLoadKey = key;
    const requestId = ++releaseRequestId;

    const applyResult = (result, { final = false } = {}) => {
      if (requestId !== releaseRequestId || key !== lastDataKey || !lastData) return;
      lastData.releaseItems = result.items;
      lastData.releaseStatus = result.status;
      if (final) lastData.releaseFetchedAt = Date.now();
      renderWorkbench(lastData);
    };

    loadStarredReleases(data, {
      force,
      onPartial: (partial) => applyResult(partial, { final: false }),
    })
      .then((result) => {
        applyResult(result, { final: true });
        if (requestId === releaseRequestId) releaseLoadKey = '';
      })
      .catch((error) => {
        console.warn(`${LOG_PREFIX} failed to load starred releases`, error);
        if (requestId !== releaseRequestId || key !== lastDataKey || !lastData) return;
        // Keep previous items on refresh failure so the feed doesn't flash empty.
        if (!lastData.releaseItems?.length) {
          lastData.releaseItems = [];
          lastData.releaseStatus = 'error';
          renderWorkbench(lastData);
        }
        lastData.releaseFetchedAt = Date.now();
        releaseLoadKey = '';
      });
  }

  // ── Templates ─────────────────────────────────────────────────────────

  function repoListTemplate(repos) {
    return repos.slice(0, 5).map((repo) => `
      <a class="ghg-repo" href="${escapeHtml(repo.href)}">
        <span class="ghg-line-icon">${repo.private ? iconLock() : iconCode()}</span>
        <span>${escapeHtml(repo.name)}</span>
      </a>
    `).join('');
  }

  function releaseCardTemplate(item) {
    const repoUrl = `https://github.com/${escapeHtml(item.repoName)}`;
    const hasBody = item.bodyHtml && item.bodyHtml.trim().length > 0;

    return `
      <article class="ghg-rc">
        <div class="ghg-rc-header">
          <a class="ghg-rc-avatar-wrap" href="${escapeHtml(repoUrl)}">
            <img class="ghg-rc-avatar" src="${escapeHtml(item.actorAvatar)}" alt="">
            <span class="ghg-rc-badge">${iconTag()}</span>
          </a>
          <div class="ghg-rc-meta">
            <div class="ghg-rc-meta-top">
              <a class="ghg-rc-repo" href="${escapeHtml(repoUrl)}">${escapeHtml(item.repoName)}</a>
              <span class="ghg-rc-verb">${escapeHtml(t('released'))}</span>
            </div>
            <time class="ghg-rc-time">${escapeHtml(item.createdAt ? relativeTime(item.createdAt) : t('justNow'))}</time>
          </div>
        </div>
        <a class="ghg-rc-tag" href="${escapeHtml(item.href)}">${escapeHtml(item.tagName)}</a>
        ${hasBody ? `
          <div class="ghg-rc-body">
            <div class="ghg-rc-body-inner markdown-body">
              ${item.bodyHtml}
            </div>
            <a class="ghg-rc-readmore" href="${escapeHtml(item.href)}">${escapeHtml(t('readMore'))}</a>
          </div>
        ` : ''}
      </article>
    `;
  }

  function releaseFeedTemplate(data) {
    const items = data.releaseItems || [];

    if (data.releaseStatus === 'loading' && !items.length) {
      return Array.from({ length: 3 }, () => `
        <article class="ghg-rc ghg-rc-skeleton" aria-hidden="true">
          <div class="ghg-rc-header">
            <div class="ghg-sk-avatar"></div>
            <div class="ghg-rc-meta">
              <div class="ghg-sk-line" style="width:160px"></div>
              <div class="ghg-sk-line" style="width:80px"></div>
            </div>
          </div>
          <div class="ghg-sk-line ghg-sk-tag"></div>
          <div class="ghg-rc-body">
            <div class="ghg-sk-block"></div>
          </div>
        </article>
      `).join('');
    }

    if (!items.length) {
      return `<div class="ghg-empty">${escapeHtml(t('noReleases'))}</div>`;
    }

    return items.map(releaseCardTemplate).join('');
  }

  function leftMenuTemplate(data) {
    return `
      <section>
        <h2>${escapeHtml(t('myWorkspace'))}</h2>
        <a class="ghg-left-row is-active" href="https://github.com/">
          <span><i>${iconCode()}</i>${escapeHtml(t('repositories'))}</span>
        </a>
        <div class="ghg-repo-list">${repoListTemplate(data.repos)}</div>
        <a class="ghg-more" href="https://github.com/${encodeURIComponent(data.userName)}?tab=repositories">${escapeHtml(t('viewAll'))}</a>
      </section>

      <section class="ghg-work-stats">
        <a href="https://github.com/pulls"><span><i>${iconPullRequest()}</i>${escapeHtml(t('pullRequests'))}</span></a>
        <a href="https://github.com/issues"><span><i>◎</i>${escapeHtml(t('issues'))}</span></a>
        <a href="https://gist.github.com/"><span><i>${iconCode()}</i>${escapeHtml(t('gists'))}</span></a>
        <a href="https://github.com/stars"><span><i>${iconStar()}</i>${escapeHtml(t('stars'))}</span></a>
      </section>
    `;
  }

  function findInsertionPoint() {
    return document.querySelector('.feed-background')
      || document.querySelector('.application-main')
      || document.querySelector('main')
      || document.body;
  }

  // ── Render ────────────────────────────────────────────────────────────

  function renderWorkbench(data) {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      findInsertionPoint().before(root);
    }

    root.innerHTML = `
      <style>${styles()}</style>
      <div class="ghg-shell">
        <aside class="ghg-left" aria-label="${escapeHtml(t('myWorkspace'))}">
          ${leftMenuTemplate(data)}
        </aside>

        <main class="ghg-main" aria-label="${escapeHtml(t('releaseRadar'))}">
          <div class="ghg-main-head">
            <h1>${escapeHtml(t('releaseRadar'))}</h1>
          </div>
          <div class="ghg-release-feed">
            ${releaseFeedTemplate(data)}
          </div>
        </main>

        <aside class="ghg-right" aria-label="${escapeHtml(t('recommendations'))}">
          <section class="ghg-panel">
            <div class="ghg-panel-title">
              <h2>${escapeHtml(t('relatedUsers'))}</h2>
              <a href="https://github.com/explore">${escapeHtml(t('exploreMore'))}</a>
            </div>
            ${data.users.map((user) => `
              <div class="ghg-follow">
                <a class="ghg-follow-avatar" href="${escapeHtml(user.href)}">
                  ${user.avatar ? `<img src="${escapeHtml(user.avatar)}" alt="">` : `<img src="${escapeHtml(githubAvatarUrl(user.name))}" alt="">`}
                </a>
                <span>
                  <a class="ghg-user-link" href="${escapeHtml(user.href)}">${escapeHtml(user.name)}</a>
                  <em>${escapeHtml(t('from'))} ${escapeHtml(user.source)}</em>
                </span>
              </div>
            `).join('')}
          </section>

          <section class="ghg-panel">
            <div class="ghg-panel-title">
              <h2>${escapeHtml(t('relatedRepositories'))}</h2>
              <a href="https://github.com/explore">${escapeHtml(t('exploreRepositories'))}</a>
            </div>
            ${data.repos.slice(3, 9).map((repo) => `
              <a class="ghg-suggest-repo" href="${escapeHtml(repo.href)}">
                <span><strong>${escapeHtml(repo.repo || repo.name)}</strong><em>${escapeHtml(t('basedOnRepoActivity'))}</em></span>
                <b>${escapeHtml(t('viewRepository'))}</b>
              </a>
            `).join('')}
          </section>

          <section class="ghg-links">
            <a href="https://docs.github.com/get-started/using-git/about-git">${escapeHtml(t('gitCommandGuide'))}</a>
            <a href="https://github.com/trending">${escapeHtml(t('githubTrending'))}</a>
            <a href="https://github.com/features/copilot">${escapeHtml(t('aiCodingAssistant'))}</a>
            <a href="https://github.com/mobile">${escapeHtml(t('mobileApps'))}</a>
          </section>

          <footer class="ghg-footer">
            <a href="https://docs.github.com/">${escapeHtml(t('docs'))}</a>
            <a href="https://github.com/contact">${escapeHtml(t('support'))}</a>
            <a href="https://github.blog/changelog/">${escapeHtml(t('changelog'))}</a>
            <span>© GitHub.com</span>
          </footer>
        </aside>
      </div>
    `;

    document.body.classList.add(ACTIVE_CLASS);
    console.debug(`${LOG_PREFIX} rendered`, { path: location.pathname, releases: (data.releaseItems || []).length });
  }

  // ── Styles ────────────────────────────────────────────────────────────

  function styles() {
    return `
      /* ── Reset & shell ─────────────────────────────────────────── */
      html:has(body.${ACTIVE_CLASS}) { background: #f6f8fa !important; }
      body.${ACTIVE_CLASS} { background: #f6f8fa !important; overflow: auto !important; }
      body.${ACTIVE_CLASS} .feed-background { display: none !important; }
      body.${ACTIVE_CLASS} #${ROOT_ID} ~ .application-main .feed-background { display: none !important; }
      #${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
      #${ROOT_ID} { min-height: calc(100vh - 64px); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, "Microsoft YaHei", sans-serif; color: #1f2328; background: #f6f8fa; }
      #${ROOT_ID} a { text-decoration: none; }
      .ghg-panel a:hover, .ghg-footer a:hover, .ghg-links a:hover, .ghg-repo:hover, .ghg-work-stats a:hover { color: #0969da; }
      .ghg-shell { display: grid; grid-template-columns: 304px minmax(0, 1fr) 328px; min-height: calc(100vh - 64px); border-top: 1px solid #d0d7de; }

      /* ── Left sidebar ──────────────────────────────────────────── */
      .ghg-left { position: sticky; top: 0; height: 100vh; overflow: auto; padding: 24px 16px 28px 24px; border-right: 1px solid #d0d7de; background: #ffffff; }
      .ghg-left section + section { margin-top: 30px; }
      .ghg-left h2 { margin: 0 0 18px; font-size: 14px; font-weight: 500; color: #57606a; }
      .ghg-panel h2 { margin: 0; font-size: 17px; font-weight: 800; color: #000; }
      .ghg-left-row { min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px; border-radius: 6px; color: #1f2328; font-size: 15px; }
      .ghg-left-row span { display: inline-flex; align-items: center; min-width: 0; }
      .ghg-left-row i, .ghg-line-icon, .ghg-work-stats i { width: 22px; margin-right: 8px; color: #6e7781; font-style: normal; text-align: center; white-space: nowrap; flex: 0 0 22px; }
      .ghg-left-row svg, .ghg-line-icon svg, .ghg-work-stats svg { width: 16px; height: 16px; fill: currentColor; vertical-align: text-bottom; }
      .ghg-left-row strong, .ghg-work-stats strong { min-width: 18px; height: 18px; display: inline-grid; place-items: center; padding: 0 5px; border-radius: 9px; background: #eaeef2; color: #57606a; font-size: 12px; font-weight: 600; }
      .ghg-left-row.is-active { background: #f6f8fa; color: #1f2328; }
      .ghg-left-row:hover { color: #0969da; background: #f6f8fa; }
      .ghg-left-row:hover i { color: #0969da; }
      .ghg-repo-list { position: relative; display: grid; gap: 8px; margin-left: 16px; padding-left: 22px; border-left: 1px solid #d8dee4; }
      .ghg-repo { min-height: 32px; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; border-radius: 6px; color: #1f2328; font-weight: 600; }
      .ghg-repo span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ghg-repo:hover { color: #0969da; }
      .ghg-more { display: inline-block; margin: 8px 0 0 36px; color: #57606a !important; }
      .ghg-work-stats { display: grid; gap: 8px; }
      .ghg-work-stats a { display: flex; justify-content: space-between; align-items: center; min-height: 34px; padding: 0 10px; border-radius: 6px; color: #1f2328; font-size: 15px; }
      .ghg-work-stats a span { display: inline-flex; align-items: center; min-width: 0; }
      .ghg-work-stats a:hover { background: #f6f8fa; color: #0969da; }

      /* ── Main column (Release Feed) ────────────────────────────── */
      .ghg-main { padding: 24px 32px 48px; min-width: 0; overflow: hidden; background: #f6f8fa; }
      .ghg-main-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
      .ghg-main h1 { margin: 0; color: #1f2328; font-size: 20px; line-height: 28px; font-weight: 600; }
      .ghg-release-feed { display: grid; gap: 16px; min-width: 0; }

      /* ── Release card ──────────────────────────────────────────── */
      .ghg-rc { background: #ffffff; border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; overflow: hidden; }

      /* Card header: avatar + badge + meta */
      .ghg-rc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
      .ghg-rc-avatar-wrap { position: relative; flex-shrink: 0; width: 40px; height: 40px; }
      .ghg-rc-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #e8edf3; }
      .ghg-rc-badge { position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%; background: #1a7f37; color: #fff; border: 2px solid #ffffff; }
      .ghg-rc-badge svg { width: 10px; height: 10px; fill: #fff; }
      .ghg-rc-meta { min-width: 0; }
      .ghg-rc-meta-top { display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; }
      .ghg-rc-repo { color: #1f2328; font-weight: 600; font-size: 14px; }
      .ghg-rc-repo:hover { color: #0969da; text-decoration: underline; }
      .ghg-rc-verb { color: #656d76; font-size: 14px; }
      .ghg-rc-time { color: #656d76; font-size: 12px; }

      /* Tag name — large & bold */
      .ghg-rc-tag { display: block; margin-bottom: 12px; color: #1f2328; font-size: 20px; font-weight: 600; line-height: 1.3; word-break: break-word; }
      .ghg-rc-tag:hover { color: #0969da; }

      /* Release notes body */
      .ghg-rc-body { position: relative; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; min-width: 0; }
      .ghg-rc-body-inner { padding: 16px; max-height: ${BODY_MAX_HEIGHT}px; overflow: hidden; font-size: 14px; line-height: 1.6; color: #1f2328; overflow-wrap: break-word; word-break: break-word; }
      .ghg-rc-body-inner::after { content: ''; position: absolute; bottom: 32px; left: 0; right: 0; height: 60px; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1)); pointer-events: none; }

      /* Markdown-ish styling for release notes */
      .ghg-rc-body-inner h1, .ghg-rc-body-inner h2, .ghg-rc-body-inner h3 { margin: 16px 0 8px; font-weight: 600; line-height: 1.3; border: 0; }
      .ghg-rc-body-inner h1 { font-size: 20px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }
      .ghg-rc-body-inner h2 { font-size: 16px; padding-bottom: 4px; border-bottom: 1px solid #d0d7de; }
      .ghg-rc-body-inner h3 { font-size: 14px; }
      .ghg-rc-body-inner h1:first-child, .ghg-rc-body-inner h2:first-child, .ghg-rc-body-inner h3:first-child { margin-top: 0; }
      .ghg-rc-body-inner p { margin: 8px 0; }
      .ghg-rc-body-inner ul, .ghg-rc-body-inner ol { margin: 8px 0; padding-left: 24px; }
      .ghg-rc-body-inner li { margin: 4px 0; }
      .ghg-rc-body-inner li + li { margin-top: 4px; }
      .ghg-rc-body-inner code { padding: 2px 6px; border-radius: 4px; background: #eff1f3; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
      .ghg-rc-body-inner pre { margin: 8px 0; padding: 12px; border-radius: 6px; background: #f6f8fa; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .ghg-rc-body-inner pre code { padding: 0; background: transparent; }
      .ghg-rc-body-inner a { color: #0969da; }
      .ghg-rc-body-inner a:hover { text-decoration: underline; }
      .ghg-rc-body-inner img { max-width: 100%; border-radius: 6px; }
      .ghg-rc-body-inner blockquote { margin: 8px 0; padding: 4px 16px; border-left: 3px solid #d0d7de; color: #656d76; }
      .ghg-rc-body-inner hr { margin: 12px 0; border: 0; border-top: 1px solid #d0d7de; }

      /* Read more link */
      .ghg-rc-readmore { display: block; padding: 8px 16px; border-top: 1px solid #d0d7de; background: #ffffff; color: #1f2328; font-size: 13px; font-weight: 600; }
      .ghg-rc-readmore:hover { color: #0969da; background: #f6f8fa; }

      /* ── Skeleton loading ──────────────────────────────────────── */
      .ghg-rc-skeleton { pointer-events: none; }
      .ghg-sk-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(90deg, #eaeef2 25%, #f6f8fa 37%, #eaeef2 63%); background-size: 400% 100%; animation: ghg-shimmer 1.4s ease infinite; flex-shrink: 0; }
      .ghg-sk-line { height: 14px; border-radius: 6px; background: linear-gradient(90deg, #eaeef2 25%, #f6f8fa 37%, #eaeef2 63%); background-size: 400% 100%; animation: ghg-shimmer 1.4s ease infinite; }
      .ghg-sk-tag { width: 120px; height: 24px; margin-bottom: 12px; border-radius: 6px; }
      .ghg-sk-block { height: 100px; border-radius: 6px; background: linear-gradient(90deg, #eaeef2 25%, #f6f8fa 37%, #eaeef2 63%); background-size: 400% 100%; animation: ghg-shimmer 1.4s ease infinite; }
      .ghg-rc-skeleton .ghg-rc-meta { display: grid; gap: 8px; }
      .ghg-rc-skeleton .ghg-rc-body { border: 0; padding: 0; }
      @keyframes ghg-shimmer {
        0% { background-position: 100% 0; }
        100% { background-position: 0 0; }
      }

      /* ── Right sidebar ─────────────────────────────────────────── */
      .ghg-right { padding: 30px 28px 40px 14px; overflow: auto; }
      .ghg-panel { margin-bottom: 30px; }
      .ghg-panel-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .ghg-panel-title a { color: #57606a; font-size: 13px; }
      .ghg-follow { display: grid; grid-template-columns: 46px minmax(0, 1fr); align-items: center; gap: 12px; min-height: 60px; }
      .ghg-follow span:nth-child(2) { min-width: 0; display: grid; }
      .ghg-follow em { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #57606a; font-size: 12px; font-style: normal; }
      .ghg-user-link { color: #1f2328 !important; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ghg-user-link:hover { color: #0969da !important; text-decoration: underline !important; }
      .ghg-follow-avatar, .ghg-follow-avatar img, .ghg-follow-avatar span { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; background: #57606a; color: #fff; font-size: 20px; font-weight: 700; object-fit: cover; }
      .ghg-suggest-repo { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: 10px; margin: 0 -10px; padding: 8px 10px; border-radius: 6px; color: #57606a; }
      .ghg-suggest-repo span { min-width: 0; display: grid; }
      .ghg-suggest-repo strong { color: #666; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ghg-suggest-repo em { color: #57606a; font-style: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ghg-suggest-repo b { color: #57606a; font-size: 12px; font-weight: 500; text-align: right; }
      .ghg-suggest-repo:hover { color: #0969da; background: #f6f8fa; }
      .ghg-suggest-repo:hover strong, .ghg-suggest-repo:hover b { color: #0969da; }
      .ghg-links { display: flex; flex-wrap: wrap; gap: 8px 10px; padding: 16px 0; border-top: 1px solid #d8dee4; border-bottom: 1px solid #d8dee4; color: #57606a; }
      .ghg-links a { color: #57606a; }
      .ghg-links a::after { content: "·"; margin-left: 10px; color: #c8cdd2; }
      .ghg-links a:last-child::after { content: ""; margin: 0; }
      .ghg-footer { display: flex; flex-wrap: wrap; gap: 8px 10px; margin-top: 16px; color: #57606a; font-size: 13px; }
      .ghg-footer a { color: #57606a; }
      .ghg-footer span { flex-basis: 100%; margin-top: 8px; }
      .ghg-empty { padding: 48px 24px; border-radius: 8px; background: #ffffff; border: 1px solid #d0d7de; color: #656d76; text-align: center; font-size: 14px; }

      /* ── Responsive ────────────────────────────────────────────── */
      @media (max-width: 1180px) {
        .ghg-shell { grid-template-columns: 280px minmax(0, 1fr); }
        .ghg-right { display: none; }
      }
      @media (max-width: 820px) {
        .ghg-shell { display: block; }
        .ghg-left { position: static; height: auto; width: auto; border-right: 0; border-bottom: 1px solid #d0d7de; padding: 16px 12px; }
        .ghg-main { padding: 16px 12px 40px; }
      }
    `;
  }

  // ── Boot ───────────────────────────────────────────────────────────────

  function boot() {
    if (!isGithubHome()) {
      document.body.classList.remove(ACTIVE_CLASS);
      document.getElementById(ROOT_ID)?.remove();
      lastData = null;
      lastDataKey = '';
      releaseLoadKey = '';
      return;
    }

    if (!document.body) return;
    if (!isLoggedInHome()) {
      console.debug(`${LOG_PREFIX} skipped: not on the logged-in dashboard home`);
      return;
    }

    const data = collectGithubData();
    const key = dataKey(data);
    if (lastData && lastDataKey === key && document.getElementById(ROOT_ID)) {
      if (lastData.releaseStatus === 'loading') {
        loadReleasesFor(lastData, key);
        return;
      }
      // Same SPA session / turbo revisit: soft-revalidate after MEMORY_REFRESH_MS
      // instead of permanently freezing the first successful paint in memory.
      const age = Date.now() - (lastData.releaseFetchedAt || 0);
      if (age >= MEMORY_REFRESH_MS) {
        loadReleasesFor(lastData, key, { force: false });
      }
      return;
    }

    // Preserve already-fetched release cards across re-boots when only the
    // left/right chrome needs re-scraping (e.g. mutation observer re-entry).
    if (lastData && lastDataKey === key && lastData.releaseItems?.length) {
      data.releaseItems = lastData.releaseItems;
      data.releaseStatus = lastData.releaseStatus;
      data.releaseFetchedAt = lastData.releaseFetchedAt || 0;
    }

    lastData = data;
    lastDataKey = key;
    renderWorkbench(lastData);

    const needsLoad = lastData.releaseStatus === 'loading'
      || !lastData.releaseFetchedAt
      || (Date.now() - lastData.releaseFetchedAt) >= MEMORY_REFRESH_MS;
    if (needsLoad) {
      loadReleasesFor(lastData, key, { force: false });
    }
  }

  // Manual escape hatch for debugging in Safari Web Inspector:
  //   window.__ghgRefreshReleases()
  window.__ghgRefreshReleases = function ghgRefreshReleases() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
    lastData = null;
    lastDataKey = '';
    releaseLoadKey = '';
    releaseRequestId += 1;
    scheduleBoot();
    console.info(`${LOG_PREFIX} cache cleared; reloading release radar`);
  };

  let scheduled = false;
  function scheduleBoot() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      scheduled = false;
      boot();
    }, 0);
  }

  scheduleBoot();
  [300, 1000, 2500, 5000].forEach((delay) => {
    window.setTimeout(scheduleBoot, delay);
  });
  new MutationObserver((mutations) => {
    const langChanged = mutations.some((mutation) => mutation.type === 'attributes' && mutation.attributeName === 'lang');
    if (isGithubHome() && (langChanged || !document.getElementById(ROOT_ID))) scheduleBoot();
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['lang'] });
  window.addEventListener('turbo:load', scheduleBoot);
  window.addEventListener('turbo:render', scheduleBoot);
  window.addEventListener('pjax:end', scheduleBoot);
})();
