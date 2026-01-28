// ==UserScript==
// @name        JSON Prettier
// @icon        https://live.staticflickr.com/65535/52564733798_c1cb151c64_o.png
// @version     1.1.0
// @description Format JSON data in a beautiful way. Supporting indentation, copying, indentation toggling (2/4 spaces), width overflow optimization, dark mode, and copy path/value.
// @description:zh-CN 将 JSON 数据漂亮地展示出来，支持缩进、复制、缩进切换（2/4 空格）、宽度溢出优化。
// @license     MIT
// @match       *://*/*
// @match       file:///*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @namespace   https://github.com/ssfun
// @author      sfun
// @homepage    https://github.com/ssfun/userscripts
// @homepageURL https://github.com/ssfun/userscripts
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/json-prettier.user.js
// @updateURL   https://github.com/ssfun/userscripts/raw/refs/heads/main/json-prettier.user.js
// ==/UserScript==

(function () {
  'use strict';

  // 简易 createElement 实现
  const React = {
    createElement(tag, props, ...children) {
      const el = document.createElement(tag);
      if (props) {
        for (const [key, val] of Object.entries(props)) {
          if (key === 'className') el.className = val;
          else if (key.startsWith('on') && typeof val === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), val);
          } else if (key === 'style' && typeof val === 'string') {
            el.style.cssText = val;
          } else {
            el.setAttribute(key === 'htmlFor' ? 'for' : key, val);
          }
        }
      }
      for (const child of children.flat(Infinity)) {
        if (child == null || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
      }
      return el;
    }
  };

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

  const css = [
    "*{margin:0;padding:0}",
    "html,body{height:100%}",
    "body,html{font-family:Menlo,Microsoft YaHei,Tahoma}",
    "#json-formatter{position:relative;min-height:100vh;margin:0;padding:2.2em 1em 1em 2em;font-size:14px;line-height:1.5;--indent:2ch}",
    "#json-formatter>pre{max-width:100%;margin:0}",
    "#json-formatter>pre.wrap-on{white-space:pre-wrap}",
    "#json-formatter>pre.wrap-off{white-space:pre;overflow-x:auto;overflow-y:hidden}",
    ".item,.key,.string{overflow-wrap:anywhere;word-break:break-word;line-break:anywhere;hyphens:auto}",
    ".subtle{color:#999}.number{color:#ff8c00}.null{color:grey}.key{color:brown}.string{color:green}.boolean{color:#1e90ff}.bracket{color:#00f}",
    ".color{display:inline-block;width:.8em;height:.8em;margin:0 .2em;border:1px solid #666;vertical-align:-.1em}",
    ".item{cursor:pointer}",
    ".content{padding-left:var(--indent)}",
    ".collapse>span>.content{display:inline;padding-left:0}",
    ".collapse>span>.content>*{display:none}",
    ".collapse>span>.content:before{content:\"...\"}",
    ".complex{position:relative}",
    ".complex:before{content:\"\";position:absolute;top:1.5em;left:-.5em;bottom:.7em;margin-left:-1px;border-left:1px dashed #999}",
    ".complex.collapse:before{display:none}",
    ".folder{color:#999;position:absolute;top:0;left:-1em;width:1em;text-align:center;transform:rotate(90deg);transition:transform .3s;cursor:pointer}",
    ".collapse>.folder{transform:rotate(0)}",
    ".summary{color:#999;margin-left:1em}:not(.collapse)>.summary{display:none}",
    ".tips{position:absolute;padding:.5em;border-radius:.5em;box-shadow:0 0 1em rgba(0,0,0,.25);background:#fff;z-index:20;white-space:normal;color:#000;max-width:min(50vw,480px);overflow-wrap:anywhere;word-break:break-word}",
    ".tips-key{font-weight:700}.tips-val{color:#1e90ff}.tips-link{color:#2563eb;text-decoration:underline}",
    ".tips-path{color:#6a9955;font-family:monospace;font-size:12px;margin-top:4px}",
    ".tips-btn{display:inline-block;padding:2px 8px;margin:4px 4px 0 0;border-radius:4px;border:1px solid #d1d5db;background:#f3f4f6;color:#000;cursor:pointer;font-size:12px}",
    ".tips-btn:hover{background:#e5e7eb}",
    ".menu{position:fixed;top:6px;right:6px;background:#fff;padding:6px;user-select:none;z-index:30;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)}",
    ".menu .btn{display:inline-block;padding:4px 10px;margin-right:6px;border-radius:6px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer;font-weight:500}",
    ".menu .btn:hover{filter:brightness(0.98)}",
    ".menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".menu .toggle.btn:not(.active){background:none}",
    ".dropdown{position:relative;display:inline-block;margin-right:6px}",
    ".dropdown .btn{margin-right:0}",
    ".dropdown-menu{position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px;z-index:40;display:none}",
    ".dropdown.open .dropdown-menu{display:block}",
    ".dropdown-menu .item{display:block;padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:500}",
    ".dropdown-menu .item:hover{background:#eef2ff}",
    ".expand-label,.indent-label{font-weight:500}",
    "@media (prefers-color-scheme: dark){",
    "body,html{background:#1e1e1e;color:#d4d4d4}",
    "#json-formatter{background:#1e1e1e}",
    ".subtle{color:#6a6a6a}.number{color:#b5cea8}.null{color:#808080}.key{color:#9cdcfe}.string{color:#ce9178}.boolean{color:#569cd6}.bracket{color:#ffd700}",
    ".complex:before{border-left-color:#555}",
    ".tips{background:#252526;color:#d4d4d4;box-shadow:0 0 1em rgba(0,0,0,.5)}",
    ".tips-val{color:#569cd6}",
    ".tips-link{color:#3b82f6}",
    ".tips-path{color:#6a9955;font-family:monospace;font-size:12px}",
    ".tips-btn{display:inline-block;padding:2px 8px;margin:4px 4px 0 0;border-radius:4px;border:1px solid #555;background:#333;color:#d4d4d4;cursor:pointer;font-size:12px}",
    ".tips-btn:hover{background:#444}",
    ".menu{background:#1e293b;color:#f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,.6)}",
    ".menu .btn{background:#334155;border-color:#475569;color:#f1f5f9}",
    ".menu .btn:hover{filter:brightness(1.1)}",
    ".menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".menu .toggle.btn:not(.active){background:transparent;color:#94a3b8}",
    ".dropdown-menu{background:#0b1220;border-color:#1f2a44}",
    ".dropdown-menu .item:hover{background:#1e293b}",
    "}"
  ].join('');

  // JSONP 正则（复用）
  const JSONP_REGEX = /^(.*?\w\s*\()([\s\S]+)(\)[;\s]*)$/;

  const formatter = {};

  // 配置初始化
  const saved = GM_getValue('config') || {};
  const config = {
    indent: saved.indent ?? 2,
    wrap: saved.wrap ?? true,
    expandMode: saved.expandMode || 'all'
  };

  // 获取标准化的缩进值
  function getIndentValue() {
    return config.indent === 4 ? 4 : 2;
  }

  // 关闭所有下拉菜单
  function closeAllDropdowns() {
    formatter.root?.querySelectorAll('.dropdown.open').forEach(n => n.classList.remove('open'));
  }

  if (['application/json', 'text/plain', 'application/javascript', 'text/javascript'].includes(document.contentType)) formatJSON();

  function createQuote() { return React.createElement("span", { className: "subtle quote" }, "\""); }
  function createComma() { return React.createElement("span", { className: "subtle comma" }, ","); }
  function isColor(str) { return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(str); }

  function tokenize(raw) {
    const skipWhitespace = index => { while (index < raw.length && ' \t\r\n'.includes(raw[index])) index += 1; return index; };
    const expectIndex  = index => { if (index < raw.length) return index; throw new Error('Unexpected end of input'); };
    const expectChar   = (index, white, black) => { const ch = raw[index]; if ((white && !white.includes(ch)) || (black && black.includes(ch))) throw new Error(`Unexpected token "${ch}" at ${index}`); return ch; };
    const findWord     = (index, words) => { for (const w of words) { if (raw.slice(index, index + w.length) === w) return w; } };
    const expectSpaceAndCharIndex = (index, white, black) => { const i = expectIndex(skipWhitespace(index)); expectChar(i, white, black); return i; };

    const parseString = start => {
      let j;
      for (j = start + 1; true; j = expectIndex(j + 1)) {
        const ch = raw[j];
        if (ch === '"') break;
        if (ch === '\\') {
          j = expectIndex(j + 1);
          const ch2 = raw[j];
          if (ch2 === 'x') j = expectIndex(j + 2);
          else if (ch2 === 'u') j = expectIndex(j + 4);
        }
      }
      const source = raw.slice(start + 1, j);
      return { type: 'string', source, data: source, color: isColor(source), start, end: j + 1 };
    };

    const parseKeyword = start => {
      const nullWord = findWord(start, ['null']);
      if (nullWord) return { type: 'null', source: 'null', data: null, start, end: start + 4 };
      const bool = findWord(start, ['true','false']);
      if (bool) return { type: 'boolean', source: bool, data: bool === 'true', start, end: start + bool.length };
      throw new Error(`Unexpected token at ${start}`);
    };

    const DIGITS = '0123456789';
    const findDecimal = (start, fractional) => {
      let i = start;
      if ('+-'.includes(raw[i])) i += 1;
      let j, dot = -1;
      for (j = i; true; j = expectIndex(j + 1)) {
        const ch = expectChar(j, j === i || dot >= 0 && dot === j - 1 ? DIGITS : null, !fractional || dot >= 0 ? '.' : null);
        if (ch === '.') dot = j; else if (!DIGITS.includes(ch)) break;
      }
      return j;
    };
    const parseNumber = start => {
      let i = findDecimal(start, true);
      const ch = raw[i];
      if (ch && ch.toLowerCase() === 'e') i = findDecimal(i + 1);
      const source = raw.slice(start, i);
      return { type: 'number', source, data: +source, start, end: i };
    };

    let parseItem;
    const parseArray = start => {
      const result = { type: 'array', data: [], start };
      let i = start + 1;
      while (true) {
        i = expectIndex(skipWhitespace(i));
        if (raw[i] === ']') break;
        if (result.data.length) i = expectSpaceAndCharIndex(i, ',') + 1;
        const item = parseItem(i);
        result.data.push(item);
        i = item.end;
      }
      result.end = i + 1;
      return result;
    };

    const parseObject = start => {
      const result = { type: 'object', data: [], start };
      let i = start + 1;
      while (true) {
        i = expectIndex(skipWhitespace(i));
        if (raw[i] === '}') break;
        if (result.data.length) i = expectSpaceAndCharIndex(i, ',') + 1;
        i = expectSpaceAndCharIndex(i, '"');
        const key = parseString(i);
        i = expectSpaceAndCharIndex(key.end, ':') + 1;
        const value = parseItem(i);
        result.data.push({ key, value });
        i = value.end;
      }
      result.end = i + 1;
      return result;
    };

    parseItem = start => {
      const i = expectIndex(skipWhitespace(start));
      const ch = raw[i];
      if (ch === '"') return parseString(i);
      if (ch === '[') return parseArray(i);
      if (ch === '{') return parseObject(i);
      if ('-0123456789'.includes(ch)) return parseNumber(i);
      return parseKeyword(i);
    };

    const result = parseItem(0);
    const end = skipWhitespace(result.end);
    if (end < raw.length) expectChar(end, []);
    return result;
  }

  // 复制到剪贴板
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

  function loadJSON() {
    const raw = document.body.innerText;
    try {
      return { raw, content: tokenize(raw) };
    } catch (e) { /* not JSON */ }
    try {
      const parts = raw.match(JSONP_REGEX);
      return {
        raw,
        content: tokenize(parts[2]),
        prefix: React.createElement("span", { className: "subtle" }, parts[1].trim()),
        suffix: React.createElement("span", { className: "subtle" }, parts[3].trim())
      };
    } catch (e) { /* not JSONP */ }
  }

  function formatJSON() {
    if (formatter.formatted) return;
    formatter.formatted = true;
    formatter.data = loadJSON();
    if (!formatter.data) return;
    formatter.style = injectStyle(css);
    formatter.root  = React.createElement("div", { id: "json-formatter" });
    document.body.innerHTML = '';
    document.body.append(formatter.root);
    initTips();
    initMenu();
    bindEvents();
    generateNodes(formatter.data, formatter.root);
    applyIndent();
    applyWrap();
    applyExpandMode();
  }

  // === 展开/折叠 ===
  function setCollapseByDepth(level) {
    formatter.root.querySelectorAll('.complex').forEach(n => {
      const d = Number(n.dataset.depth || 0);
      n.classList.toggle('collapse', d > level);
    });
  }
  function expandAll() {
    formatter.root.querySelectorAll('.complex').forEach(n => n.classList.remove('collapse'));
  }
  function collapseAll() {
    formatter.root.querySelectorAll('.complex').forEach(n => n.classList.add('collapse'));
  }

  // === 结构节点渲染 ===
  function setFolderWithDepth(elBlock, length, depth) {
    if (length) {
      elBlock.classList.add('complex');
      elBlock.dataset.depth = String(depth);
      elBlock.append(
        React.createElement("div", { className: "folder" }, '\u25b8'),
        React.createElement("span", { className: "summary" }, `// ${length} items`)
      );
    }
  }

  function generateArrayWithDepth({ el, elBlock, content, depth, path }) {
    const elContent = content.data.length && React.createElement("div", { className: "content" });
    setFolderWithDepth(elBlock, content.data.length, depth);
    el.append(
      React.createElement("span", { className: "bracket" }, "["),
      elContent || ' ',
      React.createElement("span", { className: "bracket" }, "]")
    );
    return content.data.map((item, i) => {
      const itemPath = `${path}[${i}]`;
      const elValue = React.createElement("span", null);
      const elChild = React.createElement("div", null, elValue);
      elContent && elContent.append(elChild);
      if (i < content.data.length - 1) elChild.append(createComma());
      return { el: elValue, elBlock: elChild, content: item, depth: depth + 1, path: itemPath };
    });
  }

  function generateObjectWithDepth({ el, elBlock, content, depth, path }) {
    const elContent = content.data.length && React.createElement("div", { className: "content" });
    setFolderWithDepth(elBlock, content.data.length, depth);
    el.append(
      React.createElement("span", { className: "bracket" }, '{'),
      elContent || ' ',
      React.createElement("span", { className: "bracket" }, '}')
    );
    return content.data.map(({ key, value }, i) => {
      const keyStr = key.data;
      const itemPath = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyStr) ? `${path}.${keyStr}` : `${path}["${keyStr}"]`;
      const elValue = React.createElement("span", null);
      const elChild = React.createElement(
        "div",
        null,
        createQuote(),
        React.createElement("span", { className: "key item", "data-type": key.type, "data-path": itemPath }, key.data),
        createQuote(),
        ': ',
        elValue
      );
      if (i < content.data.length - 1) elChild.append(createComma());
      elContent && elContent.append(elChild);
      return { el: elValue, content: value, elBlock: elChild, depth: depth + 1, path: itemPath };
    });
  }

  function generateNodes(data, container) {
    const rootSpan = React.createElement("span", null);
    const root     = React.createElement("div", null, rootSpan);
    const pre      = React.createElement("pre", null, root);
    formatter.pre  = pre;

    const queue = [{ el: rootSpan, elBlock: root, ...data, depth: 0, path: '$' }];
    while (queue.length) {
      const item = queue.shift();
      const { el, content, prefix, suffix, path } = item;

      if (prefix) el.append(prefix);

      if (content.type === 'array') queue.push(...generateArrayWithDepth(item));
      else if (content.type === 'object') queue.push(...generateObjectWithDepth(item));
      else {
        const { type, color, source } = content;
        if (type === 'string') el.append(createQuote());
        if (color) el.append(React.createElement("span", { className: "color", style: `background-color: ${content.data}` }));
        el.append(React.createElement("span", { className: `${type} item`, "data-type": type, "data-value": source, "data-path": path }, source));
        if (type === 'string') el.append(createQuote());
      }

      if (suffix) el.append(suffix);
    }

    container.append(pre);
  }

  // === 展开模式 ===
  function getExpandLabel(mode) {
    const labels = { l1: 'Expand L1', l2: 'Expand L2', l3: 'Expand L3', collapse_all: 'Collapse All' };
    return labels[mode] || 'Expand All';
  }
  function applyExpandMode() {
    const mode = config.expandMode;
    if (mode === 'l1') setCollapseByDepth(1);
    else if (mode === 'l2') setCollapseByDepth(2);
    else if (mode === 'l3') setCollapseByDepth(3);
    else if (mode === 'collapse_all') collapseAll();
    else expandAll();
    const labelEl = formatter.root.querySelector('.expand-label');
    if (labelEl) labelEl.textContent = getExpandLabel(mode);
  }
  function setExpandMode(mode) {
    config.expandMode = mode;
    GM_setValue('config', config);
    applyExpandMode();
    closeAllDropdowns();
  }

  // === Indent ===
  function applyIndent() {
    if (!formatter.root) return;
    formatter.root.style.setProperty('--indent', `${getIndentValue()}ch`);
  }
  function applyIndentLabel() {
    const lbl = formatter.root.querySelector('.indent-label');
    if (lbl) lbl.textContent = `Indent ${getIndentValue()}`;
  }
  function setIndent(val) {
    config.indent = val === 4 ? 4 : 2;
    GM_setValue('config', config);
    applyIndent();
    applyIndentLabel();
    closeAllDropdowns();
  }

  // === Wrap ===
  function applyWrap() {
    if (!formatter.pre) return;
    formatter.pre.classList.toggle('wrap-on', !!config.wrap);
    formatter.pre.classList.toggle('wrap-off', !config.wrap);
  }

  // 复制格式化后的 JSON
  async function copyPretty() {
    const indent = getIndentValue();
    const raw = formatter.data.raw;

    try {
      return copyText(JSON.stringify(JSON.parse(raw), null, indent));
    } catch (_) {
      const m = raw.match(JSONP_REGEX);
      if (m) {
        try {
          return copyText(m[1].trim() + JSON.stringify(JSON.parse(m[2]), null, indent) + m[3].trim());
        } catch (_) {}
      }
    }
    return copyText(raw);
  }

  function initMenu() {
    const handleCopy = async () => {
      const ok = await copyPretty();
      showCopyTip(ok);
    };

    const handleMenuClick = e => {
      const el = e.target.closest('.btn');
      if (!el) return;
      if (el.dataset.wrap !== undefined) {
        config.wrap = !config.wrap;
        GM_setValue('config', config);
        applyWrap();
        el.classList.toggle('active', !!config.wrap);
        el.setAttribute('aria-pressed', String(!!config.wrap));
      }
    };

    const toggleDropdown = (dd) => {
      closeAllDropdowns();
      dd.classList.toggle('open');
    };

    const expandLabelSpan = React.createElement("span", { className: "expand-label" }, getExpandLabel(config.expandMode));
    const indentLabelSpan = React.createElement("span", { className: "indent-label" }, `Indent ${getIndentValue()}`);

    formatter.root.append(
      React.createElement("div", { className: "menu", onClick: handleMenuClick },
        React.createElement("span", { className: "btn", onClick: handleCopy, title: "Copy formatted JSON" }, "Copy"),

        React.createElement("span", { className: "dropdown" },
          React.createElement("span", {
            className: "btn",
            onClick: (e) => { e.stopPropagation(); toggleDropdown(e.currentTarget.parentNode); }
          }, expandLabelSpan, " \u25BE"),
          React.createElement("div", { className: "dropdown-menu" },
            React.createElement("span", { className: "item", onClick: () => setExpandMode('l1') }, "Expand L1"),
            React.createElement("span", { className: "item", onClick: () => setExpandMode('l2') }, "Expand L2"),
            React.createElement("span", { className: "item", onClick: () => setExpandMode('l3') }, "Expand L3"),
            React.createElement("span", { className: "item", onClick: () => setExpandMode('all') }, "Expand All"),
            React.createElement("span", { className: "item", onClick: () => setExpandMode('collapse_all') }, "Collapse All")
          )
        ),

        React.createElement("span", { className: "dropdown" },
          React.createElement("span", {
            className: "btn",
            onClick: (e) => { e.stopPropagation(); toggleDropdown(e.currentTarget.parentNode); }
          }, indentLabelSpan, " \u25BE"),
          React.createElement("div", { className: "dropdown-menu" },
            React.createElement("span", { className: "item", onClick: () => setIndent(2) }, "Indent 2"),
            React.createElement("span", { className: "item", onClick: () => setIndent(4) }, "Indent 4")
          )
        ),

        React.createElement("span", {
          className: "toggle btn" + (config.wrap ? " active" : ""),
          "data-wrap": "",
          "aria-pressed": String(!!config.wrap),
          title: "Toggle word wrap"
        }, "Wrap")
      )
    );
  }

  function initTips() {
    const tips = React.createElement("div", { className: "tips", onClick: e => e.stopPropagation() });
    const hide = () => tips.remove();
    document.addEventListener('click', hide, false);
    formatter.tips = {
      hide,
      show(range) {
        const { scrollTop, scrollLeft } = document.scrollingElement || document.documentElement;
        const rects = range.getClientRects();
        let rect = rects[0];
        if (rects[0].top < 100) rect = rects[rects.length - 1];

        tips.style.visibility = 'hidden';
        formatter.root.append(tips);

        const vw = document.documentElement.clientWidth;
        const tipW = tips.offsetWidth || 280;

        if (rects[0].top >= 100) {
          tips.style.top = '';
          tips.style.bottom = `${formatter.root.offsetHeight - rect.top - scrollTop + 5}px`;
        } else {
          tips.style.top = `${rect.bottom + scrollTop + 5}px`;
          tips.style.bottom = '';
        }

        let left = rect.left + scrollLeft;
        if (left + tipW + 8 > vw) left = Math.max(8, vw - tipW - 8);
        tips.style.left = `${left}px`;

        const { type, value, path } = range.startContainer.dataset;
        tips.innerHTML = '';
        tips.append(
          React.createElement("span", { className: "tips-key" }, "type"), ': ',
          React.createElement("span", { className: "tips-val" }, type)
        );
        if (path) {
          tips.append(
            React.createElement("br", null),
            React.createElement("span", { className: "tips-key" }, "path"), ': ',
            React.createElement("span", { className: "tips-path" }, path)
          );
        }
        if (type === 'string' && /^(https?|ftps?):\/\/\S+/.test(value)) {
          tips.append(
            React.createElement("br", null),
            React.createElement("a", { className: "tips-link", href: value, target: "_blank", rel: "noopener noreferrer" }, "Open link")
          );
        }
        tips.append(React.createElement("br", null));
        if (value !== undefined) {
          tips.append(
            React.createElement("span", {
              className: "tips-btn",
              onClick: () => { copyText(type === 'string' ? value : value); showCopyTip(true); }
            }, "Copy Value")
          );
        }
        if (path) {
          tips.append(
            React.createElement("span", {
              className: "tips-btn",
              onClick: () => { copyText(path); showCopyTip(true); }
            }, "Copy Path")
          );
        }

        tips.style.visibility = 'visible';
      }
    };
  }

  function showCopyTip(ok) {
    const tip = document.createElement('div');
    tip.textContent = ok ? 'Copied!' : 'Copy failed';
    tip.style.cssText = `position:fixed;top:10px;right:10px;background:${ok ? '#16a34a' : '#dc2626'};color:#fff;padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.15);z-index:9999;font:14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto`;
    document.body.appendChild(tip);
    setTimeout(() => tip.remove(), 1200);
  }

  function selectNode(node) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStartBefore(node.firstChild);
    range.setEndAfter(node.firstChild);
    selection.addRange(range);
    return range;
  }

  function bindEvents() {
    formatter.root.addEventListener('click', e => {
      e.stopPropagation();
      const { target } = e;

      if (!target.closest('.dropdown')) {
        closeAllDropdowns();
      }

      if (target.classList.contains('item')) {
        formatter.tips.show(selectNode(target));
      } else {
        formatter.tips.hide();
      }
      if (target.classList.contains('folder')) {
        target.parentNode.classList.toggle('collapse');
      }
    }, false);
  }

}());
