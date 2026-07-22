// ==UserScript==
// @name         GitHub 首页增强
// @name:en      GitHub Home Enhancer
// @namespace    https://github.com/ssfun/userscripts
// @version      2.0.0
// @description  将 GitHub 登录首页重排为工作台式三栏动态首页，中间栏展示 starred 仓库近 7 天有推送的 Release 动态。可选 PAT GraphQL / HTML 兜底。
// @description:en Rebuilds the signed-in GitHub home page into a three-column workbench with Release Radar for starred repos pushed in the last 7 days. Optional PAT GraphQL / HTML fallback.
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
  const TOKEN_STORAGE_KEY = 'ghg-github-token';
  const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
  const GRAPHQL_CACHE_KEY = 'graphql-feed-v4';
  const GRAPHQL_ACTIVE_CACHE_KEY = 'graphql-active-repos-v1';
  const HTML_FEED_CACHE_KEY = 'html-feed-v1';
  const STARS_CACHE_KEY = 'starred-repos-v2';
  const STYLE_ID = 'gh-home-enhancer-styles';

  const STARS_CACHE_TTL = 6 * 3600 * 1000;
  const RELEASES_CACHE_TTL = 1800 * 1000;
  const EMPTY_RELEASES_CACHE_TTL = 24 * 3600 * 1000;
  const STALE_RELEASES_CACHE_TTL = 12 * 3600 * 1000;
  const GRAPHQL_CACHE_TTL = 1800 * 1000;
  const GRAPHQL_ACTIVE_CACHE_TTL = 1800 * 1000;
  const GRAPHQL_PAGE_SIZE = 100;
  const GRAPHQL_MAX_PAGES = 6;
  const GRAPHQL_RELEASE_BATCH = 25;
  const GRAPHQL_RELEASE_CONCURRENCY = 4;
  const GRAPHQL_BODY_BATCH = 25;
  const GRAPHQL_BODY_CONCURRENCY = 2;
  const FEED_LIMIT = 60;
  const ACTIVE_REPO_DAYS = 7;
  const ACTIVE_MS = ACTIVE_REPO_DAYS * 24 * 3600 * 1000;
  const HTML_ATOM_CONCURRENCY = 10;
  const HTML_HOT_STAR_PAGES = 2;
  const HTML_FULL_STARS_MAX_PAGES = 15;
  const BODY_MAX_HEIGHT = 280; // px, scrollable release notes viewport
  const TOKEN_CREATE_URL = 'https://github.com/settings/tokens/new?description=GitHub%20Home%20Enhancer&scopes=read:user';
  const REPO_NAME_RE = /^[A-Za-z0-9_.-]+$/;

  let lastData = null;
  let lastDataKey = '';
  let releaseLoadKey = '';
  let releaseRequestId = 0;
  let settingsOpen = false;
  let eventsBound = false;
  let stylesInjected = false;
  let cachedToken = null; // null = unread; string = value (may be '')
  let pendingStatusMessage = '';
  let legacyStarsCacheCleared = false;

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
      settings: 'Settings',
      apiToken: 'GitHub Token',
      apiTokenHint: 'Optional personal access token for official GraphQL (fast path). Without it, the script scrapes stars pages + release Atom feeds. Note: GitHub’s same-origin /_graphql only accepts GitHub’s own persisted queries, so freeform session GraphQL is not usable.',
      apiTokenScopes: 'Classic: no scope needed for public stars; add "repo" for private starred repos. Fine-grained: Account permissions → Starring (Read), plus repository metadata read.',
      tokenPlaceholder: 'ghp_… or github_pat_…',
      saveToken: 'Save',
      clearToken: 'Clear',
      createToken: 'Create token',
      refreshFeed: 'Refresh',
      tokenConfigured: 'GraphQL',
      tokenMissing: 'HTML scrape',
      tokenSaved: 'Token saved. Refreshing…',
      tokenCleared: 'Token cleared. Falling back to HTML scrape…',
      refreshing: 'Updating…',
      tokenInvalid: 'Token rejected by GitHub. Check the value or scopes.',
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
      settings: '设置',
      apiToken: 'GitHub Token',
      apiTokenHint: '可选填写 Personal Access Token，走官方 GraphQL（快路径）。不填则抓取 Stars 页 + Release Atom。说明：GitHub 网页同域 /_graphql 只接受站内预注册查询，自定义 Session GraphQL 不可用。',
      apiTokenScopes: 'Classic：公开 Star 可不勾选 scope；私有 Star 需 repo。Fine-grained：Account → Starring（Read），并允许读取仓库元数据。',
      tokenPlaceholder: 'ghp_… 或 github_pat_…',
      saveToken: '保存',
      clearToken: '清除',
      createToken: '创建 Token',
      refreshFeed: '刷新',
      tokenConfigured: 'GraphQL',
      tokenMissing: 'HTML 抓取',
      tokenSaved: 'Token 已保存，正在刷新…',
      tokenCleared: 'Token 已清除，回退到 HTML 抓取…',
      refreshing: '更新中…',
      tokenInvalid: 'Token 被 GitHub 拒绝，请检查内容或权限。',
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

  function iconGear() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M8 0a1.5 1.5 0 0 1 1.34.83l.35.78c.2.43.64.7 1.11.7h.1c.55 0 1.05.35 1.24.87l.27.75c.19.52.02 1.1-.4 1.43l-.68.52a1.27 1.27 0 0 0 0 2.04l.68.52c.42.33.59.91.4 1.43l-.27.75c-.19.52-.69.87-1.24.87h-.1a1.27 1.27 0 0 0-1.11.7l-.35.78A1.5 1.5 0 0 1 8 16a1.5 1.5 0 0 1-1.34-.83l-.35-.78a1.27 1.27 0 0 0-1.11-.7h-.1c-.55 0-1.05-.35-1.24-.87l-.27-.75a1.27 1.27 0 0 1 .4-1.43l.68-.52a1.27 1.27 0 0 0 0-2.04l-.68-.52a1.27 1.27 0 0 1-.4-1.43l.27-.75c.19-.52.69-.87 1.24-.87h.1c.47 0 .91-.27 1.11-.7l.35-.78A1.5 1.5 0 0 1 8 0Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"></path></svg>';
  }

  function iconRefresh() {
    return '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>';
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

  function isValidRepoPart(value) {
    return Boolean(value && REPO_NAME_RE.test(value));
  }

  function isWithinActiveWindow(value) {
    if (!value) return false;
    const ts = new Date(value).getTime();
    return !Number.isNaN(ts) && Date.now() - ts <= ACTIVE_MS;
  }

  /** Run async mapper over items with a fixed concurrency pool. */
  async function mapPool(items, mapper, concurrency = 5) {
    if (!items.length) return [];
    const results = new Array(items.length);
    let index = 0;
    const limit = Math.max(1, Math.min(concurrency, items.length));

    async function worker() {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = await mapper(items[current], current);
        } catch (error) {
          results[current] = undefined;
        }
      }
    }

    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
  }

  /** Sanitize HTML from Atom/GraphQL release notes — allow safe tags only. */
  function sanitizeReleaseHtml(raw) {
    if (!raw) return '';
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    doc.querySelectorAll('script,style,iframe,object,embed,form,input,textarea,button,link,meta').forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on') || attr.name === 'style') {
          el.removeAttribute(attr.name);
        }
      }
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

  function cacheGet(key) {
    const entry = cacheGetEntry(key);
    if (!entry || entry.expired) return null;
    return entry.data;
  }

  /** Return cached data even if expired (for SWR). */
  function cacheGetEntry(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        data: parsed.data,
        expires: parsed.expires,
        expired: Date.now() > parsed.expires,
      };
    } catch (error) {
      return null;
    }
  }

  function cacheSet(key, data, ttl) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        data,
        expires: Date.now() + ttl,
      }));
    } catch (error) {
      // localStorage quota exceeded — silently ignore
    }
  }

  function clearFeedCaches() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
      });
    } catch (error) {
      // ignore
    }
  }

  // ── Token helpers ──────────────────────────────────────────────────────

  function getGithubToken() {
    if (cachedToken !== null) return cachedToken;
    try {
      cachedToken = compact(localStorage.getItem(TOKEN_STORAGE_KEY) || '');
    } catch (error) {
      cachedToken = '';
    }
    return cachedToken;
  }

  function setGithubToken(token) {
    try {
      const value = compact(token);
      cachedToken = value;
      if (value) localStorage.setItem(TOKEN_STORAGE_KEY, value);
      else localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (error) {
      cachedToken = compact(token);
    }
  }

  function hasGithubToken() {
    return Boolean(getGithubToken());
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

    if (!isValidRepoPart(owner) || !isValidRepoPart(repo)) return null;
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

  // ── Starred repos & releases fetching ─────────────────────────────────

  /** Find the cursor-based "Next" link on GitHub's stars page. */
  function findStarsNextUrl(doc) {
    // Current GitHub stars UI: <div data-test-selector="pagination"> with BtnGroup Next
    const pagination = doc.querySelector('[data-test-selector="pagination"]');
    if (pagination) {
      const nextBtn = Array.from(pagination.querySelectorAll('a.btn, a')).find((a) => {
        const text = compact(a.textContent).toLowerCase();
        const href = a.getAttribute('href') || '';
        return (text === 'next' || href.includes('after='))
          && !a.classList.contains('disabled')
          && a.getAttribute('aria-disabled') !== 'true'
          && !a.hasAttribute('disabled');
      });
      if (nextBtn?.getAttribute('href')) {
        return safeGithubUrl(nextBtn.getAttribute('href'));
      }
    }

    // Fallback: any Next / after= link (legacy or alternate layouts)
    const candidates = Array.from(doc.querySelectorAll(
      'a.next_page, a[rel="next"], .pagination a[href*="after="], a.btn.BtnGroup-item[href*="after="], a[href*="after="][href*="tab=stars"]'
    ));
    for (const link of candidates) {
      const href = link.getAttribute('href');
      if (!href) continue;
      if (link.classList.contains('disabled') || link.getAttribute('aria-disabled') === 'true') continue;
      const text = compact(link.textContent).toLowerCase();
      if (text && text !== 'next' && !href.includes('after=')) continue;
      return safeGithubUrl(href);
    }
    return null;
  }

  function parseStarredReposFromDoc(doc) {
    const repoLinks = Array.from(doc.querySelectorAll([
      'h3 a[href^="/"]',
      'a[data-hovercard-type="repository"]',
      '.d-inline-block h3 a',
    ].join(',')));

    const repos = [];
    for (const link of repoLinks) {
      const href = link.getAttribute('href');
      if (!href) continue;
      const parts = href.split('/').filter(Boolean);
      if (parts.length < 2) continue;
      const [owner, repo] = parts;
      if (!isValidRepoPart(owner) || !isValidRepoPart(repo)) continue;
      repos.push({
        name: `${owner}/${repo}`,
        owner,
        repo,
        href: `https://github.com/${owner}/${repo}`,
      });
    }
    return repos;
  }

  async function scrapeStarredRepoPages(userName, { maxPages = HTML_FULL_STARS_MAX_PAGES } = {}) {
    const repos = [];
    let nextUrl = `https://github.com/${encodeURIComponent(userName)}?tab=stars`;
    let page = 0;

    while (nextUrl && page < maxPages) {
      page++;
      const response = await fetch(nextUrl, { credentials: 'same-origin' });
      if (!response.ok) break;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const pageRepos = parseStarredReposFromDoc(doc);
      if (!pageRepos.length) break;

      repos.push(...pageRepos);

      const following = findStarsNextUrl(doc);
      nextUrl = following && following !== nextUrl ? following : null;
    }

    return {
      pages: page,
      repos: uniqueBy(repos, (repo) => repo.name),
    };
  }

  async function fetchStarredRepos(userName, { force = false } = {}) {
    // Cursor pagination — GitHub stars no longer supports ?page=N
    if (!force) {
      const cached = cacheGet(STARS_CACHE_KEY);
      if (cached?.length) return cached;
    }

    // One-time drop of legacy page-based cache
    if (!legacyStarsCacheCleared) {
      legacyStarsCacheCleared = true;
      try {
        localStorage.removeItem(CACHE_PREFIX + 'starred-repos');
      } catch (error) {
        // ignore
      }
    }

    const previous = cacheGetEntry(STARS_CACHE_KEY)?.data || [];
    const needFull = force || !previous.length;
    const scraped = await scrapeStarredRepoPages(userName, {
      maxPages: needFull ? HTML_FULL_STARS_MAX_PAGES : HTML_HOT_STAR_PAGES,
    });

    const uniqueRepos = needFull
      ? scraped.repos
      : uniqueBy([...scraped.repos, ...previous], (repo) => repo.name);

    console.debug(`${LOG_PREFIX} fetched starred repos`, {
      pages: scraped.pages,
      count: uniqueRepos.length,
      mode: needFull ? 'full' : 'hot-merge',
    });
    if (uniqueRepos.length) cacheSet(STARS_CACHE_KEY, uniqueRepos, STARS_CACHE_TTL);
    return uniqueRepos;
  }

  function parseAtomReleaseEntry(entry, repo) {
    const title = compact(entry.querySelector('title')?.textContent || '');
    const link = entry.querySelector('link[rel="alternate"]')?.getAttribute('href')
      || entry.querySelector('link')?.getAttribute('href')
      || '';
    const updated = entry.querySelector('updated')?.textContent || '';
    const author = compact(entry.querySelector('author name')?.textContent || '') || repo.owner;
    const tagMatch = link.match(/\/releases\/tag\/(.+)$/);
    const tagName = tagMatch ? decodeURIComponent(tagMatch[1]) : title;
    const rawBody = entry.querySelector('content')?.textContent || '';

    return {
      id: `release-${repo.name}-${tagName}`,
      actor: author,
      actorAvatar: githubAvatarUrl(repo.owner),
      createdAt: updated,
      href: link || repo.href,
      tagName,
      releaseName: title,
      repoName: repo.name,
      repoOwner: repo.owner,
      // Defer sanitize until a release makes the top feed — DOMParser is expensive at scale.
      bodyHtml: '',
      rawBody,
    };
  }

  function withSanitizedBody(item) {
    if (!item) return item;
    if (item.bodyHtml) return item;
    if (!item.rawBody) return { ...item, bodyHtml: '' };
    return {
      ...item,
      bodyHtml: sanitizeReleaseHtml(item.rawBody),
      rawBody: '',
    };
  }

  function latestReleaseAgeMs(releases) {
    if (!Array.isArray(releases) || !releases.length) return null;
    let newest = 0;
    for (const item of releases) {
      const ts = new Date(item?.createdAt || 0).getTime();
      if (!Number.isNaN(ts) && ts > newest) newest = ts;
    }
    return newest ? Date.now() - newest : null;
  }

  function releaseCacheTtl(releases) {
    if (!releases?.length) return EMPTY_RELEASES_CACHE_TTL;
    const age = latestReleaseAgeMs(releases);
    if (age == null || age > ACTIVE_MS) return STALE_RELEASES_CACHE_TTL;
    return RELEASES_CACHE_TTL;
  }

  async function fetchRepoReleases(repo) {
    const cacheKey = `releases-${repo.name}`;
    const entry = cacheGetEntry(cacheKey);

    if (entry && !entry.expired && entry.data) return entry.data;

    // Stale cache: empty feeds or known-old releases are extended, not refetched.
    if (Array.isArray(entry?.data)) {
      if (!entry.data.length) {
        cacheSet(cacheKey, [], EMPTY_RELEASES_CACHE_TTL);
        return entry.data;
      }
      const age = latestReleaseAgeMs(entry.data);
      if (age != null && age > ACTIVE_MS) {
        cacheSet(cacheKey, entry.data, STALE_RELEASES_CACHE_TTL);
        return entry.data;
      }
    }

    const response = await fetch(`https://github.com/${repo.name}/releases.atom`, {
      credentials: 'same-origin',
    });
    if (!response.ok) {
      cacheSet(cacheKey, [], EMPTY_RELEASES_CACHE_TTL);
      return [];
    }

    const xml = await response.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
      cacheSet(cacheKey, [], EMPTY_RELEASES_CACHE_TTL);
      return [];
    }

    const atomEntry = doc.querySelector('entry');
    const releases = atomEntry ? [parseAtomReleaseEntry(atomEntry, repo)] : [];
    // Cache metadata only — rawBody is large and only needed for this pass's sanitize.
    const metaOnly = releases.map(({ rawBody, ...meta }) => meta);
    cacheSet(cacheKey, metaOnly, releaseCacheTtl(metaOnly));
    return releases;
  }

  // ── GraphQL (optional PAT) + HTML fallback ─────────────────────────────
  //
  // GitHub’s same-origin endpoint (github.com/_graphql) only accepts the
  // site’s own persisted query ids. Freeform session GraphQL is rejected with
  // "No query with given identifier known", so we do NOT attempt it.
  // Fast path: api.github.com/graphql with a user PAT (two-phase).
  // Fallback: scrape stars pages + releases.atom.

  // Phase 1: find active repos (pushedAt within ACTIVE_REPO_DAYS). No nested releases —
  // that keeps the stars scan light, then we only query releases for active repos.
  const STARRED_REPOS_ACTIVITY_QUERY = `
    query StarredReposActivity($first: Int!, $after: String) {
      viewer {
        starredRepositories(
          first: $first
          after: $after
          orderBy: { field: STARRED_AT, direction: DESC }
        ) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            nameWithOwner
            owner {
              login
              avatarUrl
            }
            pushedAt
          }
        }
      }
    }
  `;

  // Phase 2: hydrate release notes only for the top feed items.
  const RELEASE_BODIES_QUERY = `
    query ReleaseBodies($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Release {
          id
          descriptionHTML
        }
      }
    }
  `;

  async function githubGraphql(query, variables = {}) {
    const token = getGithubToken();
    if (!token) {
      const err = new Error('missing token');
      err.code = 'MISSING_TOKEN';
      throw err;
    }

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      const err = new Error('graphql non-json response');
      err.status = response.status;
      throw err;
    }

    if (response.status === 401 || response.status === 403) {
      const err = new Error('token rejected');
      err.code = 'TOKEN_INVALID';
      err.status = response.status;
      throw err;
    }

    if (!response.ok) {
      const err = new Error(`graphql http ${response.status}`);
      err.status = response.status;
      throw err;
    }

    if (payload?.errors?.length) {
      // Partial success is common with nodes(ids:...); keep data when present.
      const fatal = !payload.data;
      const message = payload.errors.map((e) => e.message).join('; ');
      if (fatal) {
        const err = new Error(message || 'graphql error');
        if (/bad credentials|requires authentication|resource not accessible|401|403/i.test(message)) {
          err.code = 'TOKEN_INVALID';
        }
        throw err;
      }
      console.debug(`${LOG_PREFIX} GraphQL partial errors`, message);
    }

    return payload.data;
  }

  function releaseFromGraphqlNode(repoMeta, releaseNode) {
    const nameWithOwner = repoMeta.nameWithOwner || repoMeta.name || '';
    const [owner] = nameWithOwner.split('/');
    // Card avatar = repo owner (matches HTML path). Release authors are often GitHub Apps.
    const ownerLogin = repoMeta.ownerLogin || repoMeta.owner?.login || owner;
    const actorAvatar = repoMeta.ownerAvatar || repoMeta.owner?.avatarUrl || githubAvatarUrl(ownerLogin);
    const createdAt = releaseNode.publishedAt || releaseNode.createdAt || '';
    const tagName = releaseNode.tagName || releaseNode.name || '';

    return {
      id: `release-${nameWithOwner}-${tagName}`,
      nodeId: releaseNode.id || '',
      actor: releaseNode.author?.login || ownerLogin,
      actorAvatar,
      createdAt,
      href: releaseNode.url || `https://github.com/${nameWithOwner}`,
      tagName,
      releaseName: releaseNode.name || tagName,
      repoName: nameWithOwner,
      repoOwner: ownerLogin,
      bodyHtml: '',
    };
  }

  function rankReleaseItems(items) {
    return items
      .filter((item) => item && isWithinActiveWindow(item.createdAt))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, FEED_LIMIT);
  }

  function buildActiveReposReleaseQuery(batch) {
    // Dynamic aliases: r0: repository(owner:"..", name:"..") { releases(first:1) {...} }
    const fragments = batch.map((repo, index) => {
      const owner = JSON.stringify(repo.owner);
      const name = JSON.stringify(repo.repo);
      return `
        r${index}: repository(owner: ${owner}, name: ${name}) {
          nameWithOwner
          releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              id
              name
              tagName
              publishedAt
              createdAt
              url
              author { login }
            }
          }
        }`;
    });
    return `query ActiveRepoReleases {\n${fragments.join('\n')}\n}`;
  }

  function mapReleaseBatch(batch, data) {
    const items = [];
    batch.forEach((repo, index) => {
      const node = data?.[`r${index}`];
      const release = node?.releases?.nodes?.[0];
      if (!release) return;
      items.push(releaseFromGraphqlNode({
        nameWithOwner: node.nameWithOwner || repo.name,
        ownerLogin: repo.owner,
        ownerAvatar: repo.avatar,
      }, release));
    });
    return items;
  }

  // Global release-batch queue so pipelined scan pages share one concurrency cap.
  const releaseBatchQueue = [];
  let releaseBatchActive = 0;

  function enqueueReleaseBatch(batch) {
    return new Promise((resolve) => {
      releaseBatchQueue.push({ batch, resolve });
      pumpReleaseBatchQueue();
    });
  }

  function pumpReleaseBatchQueue() {
    while (releaseBatchActive < GRAPHQL_RELEASE_CONCURRENCY && releaseBatchQueue.length) {
      const { batch, resolve } = releaseBatchQueue.shift();
      releaseBatchActive++;
      githubGraphql(buildActiveReposReleaseQuery(batch), {})
        .then((data) => resolve(mapReleaseBatch(batch, data)))
        .catch((error) => {
          console.warn(`${LOG_PREFIX} active-repo release batch failed`, error);
          resolve([]);
        })
        .finally(() => {
          releaseBatchActive--;
          pumpReleaseBatchQueue();
        });
    }
  }

  async function fetchReleasesForActiveRepos(activeRepos) {
    if (!activeRepos.length) return [];
    const batches = [];
    for (let i = 0; i < activeRepos.length; i += GRAPHQL_RELEASE_BATCH) {
      batches.push(activeRepos.slice(i, i + GRAPHQL_RELEASE_BATCH));
    }
    const lists = await Promise.all(batches.map((batch) => enqueueReleaseBatch(batch)));
    return lists.flat().filter(Boolean);
  }

  async function hydrateReleaseBodies(items) {
    const pending = items.filter((item) => item.nodeId && !item.bodyHtml);
    if (!pending.length) return items;

    const bodyByNodeId = new Map();
    const batches = [];
    for (let i = 0; i < pending.length; i += GRAPHQL_BODY_BATCH) {
      batches.push(pending.slice(i, i + GRAPHQL_BODY_BATCH));
    }

    await mapPool(batches, async (batch) => {
      try {
        const data = await githubGraphql(RELEASE_BODIES_QUERY, {
          ids: batch.map((item) => item.nodeId),
        });
        for (const node of data?.nodes || []) {
          if (node?.id) bodyByNodeId.set(node.id, node.descriptionHTML || '');
        }
      } catch (error) {
        console.warn(`${LOG_PREFIX} failed to hydrate release bodies`, error);
      }
    }, GRAPHQL_BODY_CONCURRENCY);

    return items.map((item) => {
      if (!item.nodeId || !bodyByNodeId.has(item.nodeId)) return item;
      return {
        ...item,
        bodyHtml: sanitizeReleaseHtml(bodyByNodeId.get(item.nodeId) || ''),
      };
    });
  }

  async function finalizeGraphqlFeed(releaseItems, stats) {
    const tBody = performance.now();
    const sorted = await hydrateReleaseBodies(rankReleaseItems(releaseItems));
    const bodyMs = Math.round(performance.now() - tBody);

    console.debug(`${LOG_PREFIX} GraphQL feed ready`, {
      ...stats,
      activeDays: ACTIVE_REPO_DAYS,
      releases: sorted.length,
      bodyMs,
      totalMs: Math.round(performance.now() - stats.t0),
    });

    return {
      status: sorted.length ? 'ready' : 'empty',
      items: sorted,
      source: 'graphql',
      repoCount: stats.scanned,
      activeRepoCount: stats.activeRepos,
    };
  }

  // Single final paint only.
  // Pipeline: as each activity page returns, enqueue release batches so they
  // overlap later scan pages. Cursor pages stay serial; release queue is global.
  async function fetchGraphQLStarredReleases() {
    const t0 = performance.now();

    // Hot path: reuse cached active list (skip ~10s scan)
    const cached = cacheGet(GRAPHQL_ACTIVE_CACHE_KEY);
    if (cached?.activeRepos && Array.isArray(cached.activeRepos)) {
      const activeRepos = cached.activeRepos;
      const t1 = performance.now();
      const releaseItems = await fetchReleasesForActiveRepos(activeRepos);
      return finalizeGraphqlFeed(releaseItems, {
        t0,
        pages: cached.pages || 0,
        scanned: cached.scanned || activeRepos.length,
        activeRepos: activeRepos.length,
        scanFromCache: true,
        pageMs: [],
        scanMs: 0,
        releaseMs: Math.round(performance.now() - t1),
        releaseWaitMs: 0,
        pipelineMs: Math.round(performance.now() - t1),
      });
    }

    const activeRepos = [];
    const seenRepo = new Set();
    const releasePromises = [];
    let after = null;
    let page = 0;
    let scanned = 0;
    const pageMs = [];

    while (page < GRAPHQL_MAX_PAGES) {
      page++;
      const pageStart = performance.now();
      const data = await githubGraphql(STARRED_REPOS_ACTIVITY_QUERY, {
        first: GRAPHQL_PAGE_SIZE,
        after,
      });
      pageMs.push(Math.round(performance.now() - pageStart));

      const connection = data?.viewer?.starredRepositories;
      if (!connection) break;

      const pageActive = [];
      for (const node of connection.nodes || []) {
        if (!node?.nameWithOwner || seenRepo.has(node.nameWithOwner)) continue;
        seenRepo.add(node.nameWithOwner);
        scanned++;
        if (!isWithinActiveWindow(node.pushedAt)) continue;

        const [owner, repo] = node.nameWithOwner.split('/');
        const row = {
          name: node.nameWithOwner,
          owner,
          repo,
          avatar: node.owner?.avatarUrl || githubAvatarUrl(owner),
          pushedAt: node.pushedAt,
          href: `https://github.com/${node.nameWithOwner}`,
        };
        activeRepos.push(row);
        pageActive.push(row);
      }

      // Overlap: fetch this page's active releases while later scan pages load
      if (pageActive.length) {
        releasePromises.push(fetchReleasesForActiveRepos(pageActive));
      }

      if (!connection.pageInfo?.hasNextPage || !connection.pageInfo?.endCursor) break;
      after = connection.pageInfo.endCursor;
    }

    const scanMs = Math.round(performance.now() - t0);

    activeRepos.sort((a, b) => new Date(b.pushedAt || 0) - new Date(a.pushedAt || 0));
    cacheSet(GRAPHQL_ACTIVE_CACHE_KEY, {
      activeRepos,
      scanned,
      pages: page,
      activeDays: ACTIVE_REPO_DAYS,
    }, GRAPHQL_ACTIVE_CACHE_TTL);

    const tWait = performance.now();
    const releaseLists = await Promise.all(releasePromises);
    const releaseWaitMs = Math.round(performance.now() - tWait);
    const releaseItems = releaseLists.flat().filter(Boolean);

    return finalizeGraphqlFeed(releaseItems, {
      t0,
      pages: page,
      scanned,
      activeRepos: activeRepos.length,
      scanFromCache: false,
      pageMs,
      scanMs,
      releaseWaitMs,
      pipelineMs: scanMs + releaseWaitMs,
    });
  }

  function stripRawBody(item) {
    if (!item) return item;
    const { rawBody, ...rest } = item;
    return rest;
  }

  async function fetchHtmlStarredReleases(userName, { force = false } = {}) {
    const t0 = performance.now();
    const starredRepos = await fetchStarredRepos(userName, { force });
    if (!starredRepos.length) {
      return { status: 'empty', items: [], source: 'html', repoCount: 0 };
    }

    // Latest release meta per repo. Known-old/empty caches are skipped inside fetchRepoReleases.
    const allReleases = await mapPool(starredRepos, fetchRepoReleases, HTML_ATOM_CONCURRENCY);

    let ranked = allReleases
      .flat()
      .filter((item) => item && isWithinActiveWindow(item.createdAt))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, FEED_LIMIT)
      .map(withSanitizedBody);

    // Cache hits have no rawBody — re-fetch only top cards that still need notes
    const missingBodyRepos = uniqueBy(
      ranked
        .filter((item) => !item.bodyHtml)
        .map((item) => ({
          name: item.repoName,
          owner: item.repoOwner,
          repo: (item.repoName || '').split('/')[1],
          href: `https://github.com/${item.repoName}`,
        })),
      (repo) => repo.name
    );

    if (missingBodyRepos.length) {
      const bodyByRepo = new Map();
      await mapPool(missingBodyRepos, async (repo) => {
        try {
          const response = await fetch(`https://github.com/${repo.name}/releases.atom`, {
            credentials: 'same-origin',
          });
          if (!response.ok) return;
          const xml = await response.text();
          const doc = new DOMParser().parseFromString(xml, 'application/xml');
          if (doc.querySelector('parsererror')) return;
          const entry = doc.querySelector('entry');
          if (!entry) return;
          const clean = stripRawBody(withSanitizedBody(parseAtomReleaseEntry(entry, repo)));
          bodyByRepo.set(repo.name, clean.bodyHtml || '');
          cacheSet(`releases-${repo.name}`, [clean], releaseCacheTtl([clean]));
        } catch (error) {
          // ignore single-repo body failures
        }
      }, HTML_ATOM_CONCURRENCY);

      ranked = ranked.map((item) => (
        item.bodyHtml ? item : { ...item, bodyHtml: bodyByRepo.get(item.repoName) || '' }
      ));
    } else {
      // Persist sanitized bodies so later visits skip re-sanitize work
      ranked.forEach((item) => {
        if (!item?.bodyHtml || !item.repoName) return;
        cacheSet(`releases-${item.repoName}`, [stripRawBody(item)], releaseCacheTtl([item]));
      });
    }

    ranked = ranked.map(stripRawBody);

    console.debug(`${LOG_PREFIX} HTML feed ready`, {
      repos: starredRepos.length,
      releases: ranked.length,
      activeDays: ACTIVE_REPO_DAYS,
      totalMs: Math.round(performance.now() - t0),
    });

    return {
      status: ranked.length ? 'ready' : 'empty',
      items: ranked,
      source: 'html',
      repoCount: starredRepos.length,
    };
  }

  async function loadStarredReleases(data, { force = false } = {}) {
    const useGraphql = hasGithubToken();

    // Fresh cache hit only — stale entries are shown by loadReleasesFor, then revalidated here
    if (!force) {
      for (const key of [GRAPHQL_CACHE_KEY, HTML_FEED_CACHE_KEY]) {
        const entry = cacheGetEntry(key);
        if (entry && !entry.expired && entry.data?.items) {
          // Prefer GraphQL cache only when token is present; otherwise prefer HTML cache
          if (key === GRAPHQL_CACHE_KEY && !useGraphql) continue;
          return {
            status: entry.data.items.length ? 'ready' : 'empty',
            items: entry.data.items,
            source: entry.data.source || (useGraphql ? 'graphql' : 'html'),
            fromCache: true,
          };
        }
      }
    }

    let result;
    if (useGraphql) {
      try {
        result = await fetchGraphQLStarredReleases();
      } catch (error) {
        console.warn(`${LOG_PREFIX} GraphQL failed, falling back to HTML scrape`, error);
        result = await fetchHtmlStarredReleases(data.userName, { force });
        if (error?.code === 'TOKEN_INVALID') result.tokenError = true;
      }
    } else {
      result = await fetchHtmlStarredReleases(data.userName, { force });
    }

    const storeKey = result.source === 'graphql' ? GRAPHQL_CACHE_KEY : HTML_FEED_CACHE_KEY;
    const ttl = result.source === 'graphql' ? GRAPHQL_CACHE_TTL : RELEASES_CACHE_TTL;
    cacheSet(storeKey, {
      items: result.items,
      source: result.source,
      repoCount: result.repoCount,
    }, ttl);

    return result;
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
      feedSource: hasGithubToken() ? 'graphql' : 'html',
      feedStale: false,
      statusMessage: '',
      repoCount: repos.length,
    };
  }

  function dataKey(data) {
    return `${data.userName}|${data.repos.map((repo) => repo.name).join(',')}|${isChineseLocale() ? 'zh' : 'en'}`;
  }

  function pickFeedCacheEntry() {
    const useGraphql = hasGithubToken();
    const order = useGraphql
      ? [GRAPHQL_CACHE_KEY, HTML_FEED_CACHE_KEY]
      : [HTML_FEED_CACHE_KEY, GRAPHQL_CACHE_KEY];
    for (const key of order) {
      const entry = cacheGetEntry(key);
      if (entry?.data?.items?.length) return entry;
    }
    return null;
  }

  function applyFeedResult(result) {
    if (!lastData) return;
    lastData.releaseItems = result.items || [];
    lastData.releaseStatus = result.status || 'empty';
    lastData.feedSource = result.source || (hasGithubToken() ? 'graphql' : 'html');
    lastData.feedStale = false;
    if (result.tokenError) {
      lastData.statusMessage = t('tokenInvalid');
    } else if (pendingStatusMessage) {
      lastData.statusMessage = pendingStatusMessage;
      pendingStatusMessage = '';
    } else {
      lastData.statusMessage = '';
    }
  }

  function loadReleasesFor(data, key, { force = false } = {}) {
    if (!force && releaseLoadKey === key) return;
    releaseLoadKey = key;
    const requestId = ++releaseRequestId;

    // SWR: paint cache immediately; revalidate when stale or forced
    let needsNetwork = force;
    if (!force) {
      const entry = pickFeedCacheEntry();
      if (entry?.data?.items?.length && lastData) {
        lastData.releaseItems = entry.data.items;
        lastData.releaseStatus = 'ready';
        lastData.feedSource = entry.data.source || (hasGithubToken() ? 'graphql' : 'html');
        lastData.feedStale = entry.expired;
        lastData.statusMessage = entry.expired ? t('refreshing') : '';
        renderWorkbench(lastData);
        if (!entry.expired) {
          releaseLoadKey = '';
          return;
        }
        needsNetwork = true;
      } else {
        needsNetwork = true;
      }
    } else if (lastData) {
      lastData.releaseStatus = lastData.releaseItems?.length ? 'ready' : 'loading';
      lastData.statusMessage = pendingStatusMessage || t('refreshing');
      lastData.feedStale = true;
      renderWorkbench(lastData);
    }

    if (!needsNetwork) {
      releaseLoadKey = '';
      return;
    }

    loadStarredReleases(data, { force: true })
      .then((result) => {
        if (requestId !== releaseRequestId || key !== lastDataKey || !lastData) return;
        applyFeedResult(result);
        releaseLoadKey = '';
        renderWorkbench(lastData);
      })
      .catch((error) => {
        console.warn(`${LOG_PREFIX} failed to load starred releases`, error);
        if (requestId !== releaseRequestId || key !== lastDataKey || !lastData) return;
        if (!lastData.releaseItems?.length) {
          lastData.releaseItems = [];
          lastData.releaseStatus = 'error';
        }
        lastData.feedStale = false;
        lastData.statusMessage = error?.code === 'TOKEN_INVALID' ? t('tokenInvalid') : '';
        pendingStatusMessage = '';
        releaseLoadKey = '';
        renderWorkbench(lastData);
      });
  }

  function forceRefreshFeed() {
    if (!lastData || !lastDataKey) return;
    clearFeedCaches();
    // Keep token; only drop feed/stars/release caches
    lastData.releaseItems = [];
    lastData.releaseStatus = 'loading';
    lastData.statusMessage = pendingStatusMessage || t('refreshing');
    releaseLoadKey = '';
    renderWorkbench(lastData);
    loadReleasesFor(lastData, lastDataKey, { force: true });
  }

  function saveTokenFromInput() {
    const input = document.getElementById('ghg-token-input');
    const value = compact(input?.value || '');
    if (!value) return;
    setGithubToken(value);
    settingsOpen = false;
    pendingStatusMessage = t('tokenSaved');
    if (lastData) lastData.feedSource = 'graphql';
    forceRefreshFeed();
  }

  function clearTokenAndRefresh() {
    setGithubToken('');
    settingsOpen = false;
    pendingStatusMessage = t('tokenCleared');
    if (lastData) lastData.feedSource = 'html';
    forceRefreshFeed();
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
    const ownerKey = item.repoOwner || (item.repoName || '').split('/')[0];
    const avatarFallback = githubAvatarUrl(ownerKey);
    const avatar = item.actorAvatar || avatarFallback;

    return `
      <article class="ghg-rc">
        <div class="ghg-rc-header">
          <a class="ghg-rc-avatar-wrap" href="${escapeHtml(repoUrl)}">
            <img class="ghg-rc-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(avatarFallback)}'">
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

  function settingsPanelTemplate() {
    const token = getGithubToken();
    const masked = token
      ? `${token.slice(0, 7)}…${token.slice(-4)}`
      : '';

    return `
      <div class="ghg-settings ${settingsOpen ? 'is-open' : ''}" id="ghg-settings">
        <div class="ghg-settings-head">
          <strong>${escapeHtml(t('apiToken'))}</strong>
          <a href="${escapeHtml(TOKEN_CREATE_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t('createToken'))}</a>
        </div>
        <p class="ghg-settings-hint">${escapeHtml(t('apiTokenHint'))}</p>
        <p class="ghg-settings-scopes">${escapeHtml(t('apiTokenScopes'))}</p>
        <div class="ghg-settings-row">
          <input
            id="ghg-token-input"
            class="ghg-token-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="${escapeHtml(token ? masked : t('tokenPlaceholder'))}"
          />
        </div>
        <div class="ghg-settings-actions">
          <button type="button" class="ghg-btn ghg-btn-primary" data-ghg-action="save-token">${escapeHtml(t('saveToken'))}</button>
          <button type="button" class="ghg-btn" data-ghg-action="clear-token" ${token ? '' : 'disabled'}>${escapeHtml(t('clearToken'))}</button>
        </div>
      </div>
    `;
  }

  function mainHeadTemplate(data) {
    const source = data.feedSource || (hasGithubToken() ? 'graphql' : 'html');
    const isGraphql = source === 'graphql';
    const sourceLabel = isGraphql ? t('tokenConfigured') : t('tokenMissing');
    const badgeClass = isGraphql ? 'is-graphql' : 'is-html';
    const msg = data.statusMessage || (data.feedStale ? t('refreshing') : '');

    return `
      <div class="ghg-main-head">
        <div class="ghg-main-head-left">
          <h1>${escapeHtml(t('releaseRadar'))}</h1>
          <span class="ghg-source-badge ${badgeClass}" title="${escapeHtml(sourceLabel)}">${escapeHtml(sourceLabel)}</span>
          ${msg ? `<span class="ghg-status-msg">${escapeHtml(msg)}</span>` : ''}
        </div>
        <div class="ghg-main-actions">
          <button type="button" class="ghg-icon-btn" data-ghg-action="refresh" title="${escapeHtml(t('refreshFeed'))}" aria-label="${escapeHtml(t('refreshFeed'))}">
            ${iconRefresh()}
          </button>
          <button type="button" class="ghg-icon-btn ${settingsOpen ? 'is-active' : ''}" data-ghg-action="toggle-settings" title="${escapeHtml(t('settings'))}" aria-label="${escapeHtml(t('settings'))}" aria-expanded="${settingsOpen ? 'true' : 'false'}">
            ${iconGear()}
          </button>
        </div>
      </div>
      ${settingsPanelTemplate()}
    `;
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

  function ensureStyles() {
    if (stylesInjected && document.getElementById(STYLE_ID)) return;
    let styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      document.documentElement.appendChild(styleEl);
    }
    styleEl.textContent = styles();
    stylesInjected = true;
  }

  function renderWorkbench(data) {
    ensureStyles();

    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      findInsertionPoint().before(root);
    }

    root.innerHTML = `
      <div class="ghg-shell">
        <aside class="ghg-left" aria-label="${escapeHtml(t('myWorkspace'))}">
          ${leftMenuTemplate(data)}
        </aside>

        <main class="ghg-main" aria-label="${escapeHtml(t('releaseRadar'))}">
          ${mainHeadTemplate(data)}
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
                  <img src="${escapeHtml(user.avatar || githubAvatarUrl(user.name))}" alt="">
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
    bindWorkbenchEvents();
    console.debug(`${LOG_PREFIX} rendered`, {
      path: location.pathname,
      releases: (data.releaseItems || []).length,
      source: data.feedSource,
    });
  }

  function bindWorkbenchEvents() {
    if (eventsBound) return;
    eventsBound = true;

    document.addEventListener('click', (event) => {
      const actionEl = event.target.closest?.('[data-ghg-action]');
      if (!actionEl || !document.getElementById(ROOT_ID)?.contains(actionEl)) return;

      const action = actionEl.getAttribute('data-ghg-action');
      if (action === 'toggle-settings') {
        settingsOpen = !settingsOpen;
        if (lastData) renderWorkbench(lastData);
        return;
      }
      if (action === 'refresh') {
        forceRefreshFeed();
        return;
      }
      if (action === 'save-token') {
        saveTokenFromInput();
        return;
      }
      if (action === 'clear-token') {
        clearTokenAndRefresh();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'ghg-token-input') return;
      event.preventDefault();
      saveTokenFromInput();
    });
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
      .ghg-main-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
      .ghg-main-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
      .ghg-main h1 { margin: 0; color: #1f2328; font-size: 20px; line-height: 28px; font-weight: 600; }
      .ghg-main-actions { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .ghg-icon-btn { width: 32px; height: 32px; display: inline-grid; place-items: center; border: 1px solid #d0d7de; border-radius: 6px; background: #ffffff; color: #57606a; cursor: pointer; padding: 0; }
      .ghg-icon-btn svg { width: 16px; height: 16px; fill: currentColor; }
      .ghg-icon-btn:hover { color: #0969da; border-color: #0969da; background: #f6f8fa; }
      .ghg-icon-btn.is-active { color: #0969da; border-color: #0969da; background: #ddf4ff; }
      .ghg-source-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 22px; border: 1px solid transparent; }
      .ghg-source-badge.is-graphql { color: #1a7f37; background: #dafbe1; border-color: #4ac26b66; }
      .ghg-source-badge.is-html { color: #57606a; background: #eaeef2; border-color: #d0d7de; }
      .ghg-status-msg { color: #656d76; font-size: 12px; }
      .ghg-settings { display: none; margin: 0 0 16px; padding: 16px; border: 1px solid #d0d7de; border-radius: 8px; background: #ffffff; }
      .ghg-settings.is-open { display: block; }
      .ghg-settings-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
      .ghg-settings-head strong { color: #1f2328; font-size: 14px; }
      .ghg-settings-head a { color: #0969da; font-size: 13px; }
      .ghg-settings-hint, .ghg-settings-scopes { margin: 0 0 8px; color: #57606a; font-size: 13px; line-height: 1.5; }
      .ghg-settings-scopes { margin-bottom: 12px; }
      .ghg-settings-row { margin-bottom: 12px; }
      .ghg-token-input { width: 100%; height: 36px; padding: 0 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; color: #1f2328; font-size: 14px; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
      .ghg-token-input:focus { outline: 2px solid #0969da33; border-color: #0969da; background: #ffffff; }
      .ghg-settings-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .ghg-btn { height: 32px; padding: 0 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; color: #24292f; font-size: 13px; font-weight: 600; cursor: pointer; }
      .ghg-btn:hover:not(:disabled) { background: #eaeef2; }
      .ghg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .ghg-btn-primary { background: #1f883d; border-color: #1f883d; color: #ffffff; }
      .ghg-btn-primary:hover:not(:disabled) { background: #1a7f37; border-color: #1a7f37; }
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

      /* Release notes body — fixed viewport, scroll for full content */
      .ghg-rc-body { display: flex; flex-direction: column; border: 1px solid #d0d7de; border-radius: 6px; overflow: hidden; min-width: 0; }
      .ghg-rc-body-inner { padding: 16px; max-height: ${BODY_MAX_HEIGHT}px; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; font-size: 14px; line-height: 1.6; color: #1f2328; overflow-wrap: break-word; word-break: break-word; scrollbar-width: thin; scrollbar-color: #d0d7de transparent; }
      .ghg-rc-body-inner::-webkit-scrollbar { width: 8px; }
      .ghg-rc-body-inner::-webkit-scrollbar-thumb { background: #d0d7de; border-radius: 4px; }
      .ghg-rc-body-inner::-webkit-scrollbar-thumb:hover { background: #afb8c1; }
      .ghg-rc-body-inner::-webkit-scrollbar-track { background: transparent; }

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

  function boot({ langOnly = false } = {}) {
    if (!isGithubHome()) {
      document.body.classList.remove(ACTIVE_CLASS);
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      stylesInjected = false;
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

    // Language switch: re-render labels without re-fetching data
    if (langOnly && lastData && document.getElementById(ROOT_ID)) {
      lastDataKey = dataKey(lastData);
      renderWorkbench(lastData);
      return;
    }

    const data = collectGithubData();
    const key = dataKey(data);
    if (lastData && lastDataKey === key && document.getElementById(ROOT_ID)) {
      if (lastData.releaseStatus === 'loading') loadReleasesFor(lastData, key);
      return;
    }

    // Preserve in-flight / ready feed across soft navigations when user is the same
    if (lastData && lastData.userName === data.userName && lastData.releaseItems?.length) {
      data.releaseItems = lastData.releaseItems;
      data.releaseStatus = lastData.releaseStatus;
      data.feedSource = lastData.feedSource;
      data.feedStale = lastData.feedStale;
      data.statusMessage = lastData.statusMessage;
    }

    lastData = data;
    lastDataKey = key;
    renderWorkbench(lastData);
    loadReleasesFor(lastData, key);
  }

  let scheduled = false;
  let scheduledLangOnly = false;
  function scheduleBoot(options = {}) {
    if (options.langOnly) scheduledLangOnly = true;
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(() => {
      const langOnly = scheduledLangOnly;
      scheduled = false;
      scheduledLangOnly = false;
      boot({ langOnly });
    }, 0);
  }

  scheduleBoot();
  [300, 1000, 2500, 5000].forEach((delay) => {
    window.setTimeout(() => scheduleBoot(), delay);
  });
  new MutationObserver((mutations) => {
    if (!isGithubHome()) return;
    const langChanged = mutations.some((mutation) => (
      mutation.type === 'attributes' && mutation.attributeName === 'lang'
    ));
    if (langChanged) {
      scheduleBoot({ langOnly: true });
      return;
    }
    if (!document.getElementById(ROOT_ID)) scheduleBoot();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['lang'],
  });
  window.addEventListener('turbo:load', () => scheduleBoot());
  window.addEventListener('turbo:render', () => scheduleBoot());
  window.addEventListener('pjax:end', () => scheduleBoot());
})();
