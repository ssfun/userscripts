// ==UserScript==
// @name        YAML Prettier
// @version     1.1.0
// @description Format YAML data in a beautiful way with dark mode support.
// @description:zh-CN 将 YAML 数据漂亮地展示出来，支持暗色模式。
// @license     MIT
// @match       *://*/*
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @run-at      document-end
// @namespace   https://github.com/ssfun
// @author      sfun
// @homepage    https://github.com/ssfun/userscripts
// @homepageURL https://github.com/ssfun/userscripts
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/yaml-prettier.user.js
// @updateURL   https://github.com/ssfun/userscripts/raw/refs/heads/main/yaml-prettier.user.js
// ==/UserScript==

(function() {
  'use strict';

  // 使用 adoptedStyleSheets 注入样式（绕过 CSP）
  function injectStyle(cssText) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(cssText);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      return sheet;
    } catch (e) {
      if (typeof GM_addStyle === 'function') {
        try { return GM_addStyle(cssText); } catch (_) {}
      }
      const style = document.createElement('style');
      style.textContent = cssText;
      (document.head || document.documentElement).appendChild(style);
      return style;
    }
  }

  // ========== 检测配置 ==========
  const CONFIG = { MIN_YAML_RATIO: 0.8, MIN_YAML_LINES: 5 };

  // ========== 样式 ==========
  const css = [
    "*{margin:0;padding:0}",
    "html,body{height:100%}",
    "body,html{font-family:'SF Mono',Monaco,Menlo,Consolas,monospace}",
    "#yaml-formatter{position:relative;min-height:100vh;margin:0;padding:2.2em 1em 1em 2em;font-size:14px;line-height:1.6;background:#f8f9fa;color:#212529}",
    "#yaml-formatter>pre{max-width:100%;margin:0}",
    "#yaml-formatter>pre.wrap-on{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}",
    "#yaml-formatter>pre.wrap-off{white-space:pre;overflow-x:auto;overflow-y:hidden}",
    ".yaml-key{color:#1971c2;font-weight:600}",
    ".yaml-string{color:#087f5b}",
    ".yaml-number{color:#c92a2a}",
    ".yaml-boolean{color:#ae3ec9;font-weight:600}",
    ".yaml-null{color:#868e96;font-style:italic}",
    ".yaml-comment{color:#868e96}",
    ".yaml-url{color:#1971c2;text-decoration:underline;cursor:pointer}",
    ".yaml-url:hover{opacity:0.8}",
    ".yaml-menu{position:fixed;top:6px;right:6px;background:#fff;padding:6px;user-select:none;z-index:30;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)}",
    ".yaml-menu .btn{display:inline-block;padding:4px 10px;margin-right:6px;border-radius:6px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer;font-weight:500}",
    ".yaml-menu .btn:last-child{margin-right:0}",
    ".yaml-menu .btn:hover{filter:brightness(0.98)}",
    ".yaml-menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".yaml-menu .toggle.btn:not(.active){background:none}",
    ".yaml-toast{position:fixed;top:10px;right:10px;background:#16a34a;color:#fff;padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.15);z-index:9999;font:14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto}",
    ".yaml-toast.error{background:#dc2626}",
    "@media (prefers-color-scheme:dark){",
    "body,html{background:#1e1e1e;color:#d4d4d4}",
    "#yaml-formatter{background:#1e1e1e;color:#d4d4d4}",
    ".yaml-key{color:#9cdcfe}",
    ".yaml-string{color:#ce9178}",
    ".yaml-number{color:#b5cea8}",
    ".yaml-boolean{color:#569cd6}",
    ".yaml-null{color:#808080}",
    ".yaml-comment{color:#6a9955}",
    ".yaml-url{color:#3b82f6}",
    ".yaml-menu{background:#1e293b;color:#f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,.6)}",
    ".yaml-menu .btn{background:#334155;border-color:#475569;color:#f1f5f9}",
    ".yaml-menu .btn:hover{filter:brightness(1.1)}",
    ".yaml-menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".yaml-menu .toggle.btn:not(.active){background:transparent;color:#94a3b8}",
    "}"
  ].join('');

  let formatter = { wrap: true };

  // ========== 检测 YAML ==========
  function detectYAML(text) {
    text = text.trim();
    if (text.length < 50) return false;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 5) return false;

    // 排除其他格式
    if (/function\s*\(|var\s+|const\s+|let\s+|=>|console\.|import\s|export\s/.test(text)) return false;
    if (/<(div|span|p|a|img|script|style|head|body|html|button|input|form)/i.test(text)) return false;
    if (/\.\s+[A-Z]/.test(text)) return false;
    if (/^\s*[\{\[]/.test(text) || /[\}\]]\s*$/.test(text)) return false;

    let kv = 0, list = 0, comment = 0, html = 0, normal = 0;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/<[a-z][\s\S]*>/i.test(t)) { html++; continue; }
      if (/^#/.test(t)) { comment++; continue; }
      if (/^-\s+\S/.test(t)) { list++; continue; }
      if (/^[a-zA-Z][\w-]*\s*:/.test(t)) { kv++; continue; }
      normal++;
    }

    const total = lines.length;
    const yamlLines = kv + list + comment;
    const ratio = yamlLines / total;
    return (kv + list) >= CONFIG.MIN_YAML_LINES && ratio >= CONFIG.MIN_YAML_RATIO && html === 0 && normal < total * 0.15;
  }

  // ========== 格式化 ==========
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function fmtVal(v) {
    v = v.trim();
    if (!v) return '';
    if (/^https?:\/\//.test(v)) return '<a class="yaml-url" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">' + esc(v) + '</a>';
    if (/^["'].*["']$/.test(v)) return '<span class="yaml-string">' + esc(v) + '</span>';
    if (/^(true|false|yes|no|on|off)$/i.test(v)) return '<span class="yaml-boolean">' + esc(v) + '</span>';
    if (/^(null|~)$/i.test(v)) return '<span class="yaml-null">' + esc(v) + '</span>';
    if (/^-?\d+(\.\d+)?$/.test(v)) return '<span class="yaml-number">' + esc(v) + '</span>';
    if (/^\[.*\]$/.test(v)) return '<span class="yaml-string">' + esc(v) + '</span>';
    if (/^\d{1,3}(\.\d{1,3}){3}/.test(v)) return '<span class="yaml-number">' + esc(v) + '</span>';
    return '<span class="yaml-string">' + esc(v) + '</span>';
  }

  function parseAndFormat(text) {
    const lines = text.split('\n');
    let out = '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) { out += '\n'; continue; }
      const lead = line.match(/^\s*/)[0];

      // 注释
      if (t.startsWith('#')) {
        out += lead + '<span class="yaml-comment">' + esc(t) + '</span>\n';
        continue;
      }

      // 列表项
      if (/^-\s+/.test(t)) {
        const m = t.match(/^(-\s+)(.*)$/);
        if (m) {
          out += lead + '<span class="yaml-key">' + esc(m[1]) + '</span>' + fmtVal(m[2]) + '\n';
        } else {
          out += lead + esc(t) + '\n';
        }
        continue;
      }

      // 键值对
      const colonIdx = t.indexOf(':');
      if (colonIdx > 0 && /^[a-zA-Z][\w-]*:/.test(t)) {
        const key = t.slice(0, colonIdx);
        const val = t.slice(colonIdx + 1).trim();
        out += lead + '<span class="yaml-key">' + esc(key) + '</span>:' + (val ? ' ' + fmtVal(val) : '') + '\n';
        continue;
      }

      // 其他行保留
      out += lead + esc(t) + '\n';
    }
    return out;
  }

  // ========== 复制 ==========
  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    }
    if (typeof GM_setClipboard === 'function') {
      try { GM_setClipboard(text, 'text'); return true; } catch (e) {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch (e) { return false; }
  }

  function showToast(ok, msg) {
    const tip = document.createElement('div');
    tip.className = 'yaml-toast' + (ok ? '' : ' error');
    tip.textContent = msg || (ok ? 'Copied!' : 'Copy failed');
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
  }

  // ========== Wrap ==========
  function applyWrap() {
    if (!formatter.pre) return;
    formatter.pre.classList.toggle('wrap-on', !!formatter.wrap);
    formatter.pre.classList.toggle('wrap-off', !formatter.wrap);
  }

  // ========== 菜单 ==========
  function initMenu() {
    const menu = document.createElement('div');
    menu.className = 'yaml-menu';

    const copyBtn = document.createElement('span');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy YAML content';
    copyBtn.onclick = async () => {
      const ok = await copyText(formatter.raw);
      showToast(ok);
    };

    const wrapBtn = document.createElement('span');
    wrapBtn.className = 'toggle btn' + (formatter.wrap ? ' active' : '');
    wrapBtn.textContent = 'Wrap';
    wrapBtn.title = 'Toggle word wrap';
    wrapBtn.onclick = () => {
      formatter.wrap = !formatter.wrap;
      wrapBtn.classList.toggle('active', formatter.wrap);
      applyWrap();
    };

    menu.appendChild(copyBtn);
    menu.appendChild(wrapBtn);
    formatter.root.appendChild(menu);
  }

  // ========== 主流程 ==========
  function formatYAML() {
    if (formatter.formatted) return;

    const raw = (document.body.textContent || '').trim();
    if (!detectYAML(raw)) return;

    formatter.formatted = true;
    formatter.raw = raw;
    formatter.style = injectStyle(css);
    formatter.root = document.createElement('div');
    formatter.root.id = 'yaml-formatter';

    const pre = document.createElement('pre');
    pre.innerHTML = parseAndFormat(raw);
    formatter.pre = pre;
    formatter.root.appendChild(pre);

    document.body.innerHTML = '';
    document.body.appendChild(formatter.root);

    initMenu();
    applyWrap();
  }

  // ========== 初始化 ==========
  function init() {
    // YAML 相关 contentType 直接格式化
    if (['text/plain', 'application/x-yaml', 'text/yaml', 'text/x-yaml'].includes(document.contentType)) {
      formatYAML();
      return;
    }

    // 对于其他类型，检查是否为简单文本页面（body 子元素少）
    if (document.body) {
      const children = Array.from(document.body.children).filter(el =>
        el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
      );
      // 简单页面（如只有一个 pre 标签）尝试检测 YAML
      if (children.length <= 3) {
        formatYAML();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

})();
