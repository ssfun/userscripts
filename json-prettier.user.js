// ==UserScript==
// @name        JSON Prettier
// @icon        https://live.staticflickr.com/65535/52564733798_c1cb151c64_o.png
// @version     1.0.0
// @description Format JSON data in a beautiful way. Supporting indentation, copying, indentation toggling (2/4 spaces), and width overflow optimization.
// @description:zh-CN 将 JSON 数据漂亮地展示出来，支持缩进、复制、缩进切换（2/4 空格）、宽度溢出优化。
// @license     MIT
// @require     https://cdn.jsdelivr.net/npm/@violentmonkey/dom@1
// @match       *://*/*
// @match       file:///*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
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

    /* Menu */
    ".menu{position:fixed;top:6px;right:6px;background:#fff;padding:6px;user-select:none;z-index:30;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.12)}",
    ".menu .btn{display:inline-block;padding:4px 10px;margin-right:6px;border-radius:6px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer;font-weight:500}", /* normal weight */
    ".menu .btn:hover{filter:brightness(0.98)}",
    ".menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}", /* no bold */
    ".menu .toggle.btn:not(.active){background:none}",
    ".dropdown{position:relative;display:inline-block;margin-right:6px}",
    ".dropdown .btn{margin-right:0}",
    ".dropdown-menu{position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);padding:6px;z-index:40;display:none}",
    ".dropdown.open .dropdown-menu{display:block}",
    ".dropdown-menu .item{display:block;padding:6px 10px;border-radius:6px;cursor:pointer;white-space:nowrap;font-weight:500}", /* normal weight */
    ".dropdown-menu .item:hover{background:#eef2ff}",
    ".expand-label,.indent-label{font-weight:500}", /* normal weight for labels */

    "@media (prefers-color-scheme: dark){",
    ".menu{background:#1e293b;color:#f1f5f9;box-shadow:0 2px 10px rgba(0,0,0,.6)}",
    ".menu .btn{background:#334155;border-color:#475569;color:#f1f5f9}",
    ".menu .btn:hover{filter:brightness(1.1)}",
    ".menu .btn.active{background:#2563eb;border-color:#2563eb;color:#fff}",
    ".menu .toggle.btn:not(.active){background:transparent;color:#94a3b8}",
    ".dropdown-menu{background:#0b1220;border-color:#1f2a44}",
    ".dropdown-menu .item:hover{background:#1e293b}",
    "}"
  ].join('');

  const React = VM;
  const gap = 5;
  const ROOT_DEPTH = 0;

  const formatter = {};

  const saved = GM_getValue('config') || {};
  const config = {
    indent: 2,                  // 默认 Indent 2
    wrap: true,
    expandMode: saved.expandMode || 'all', // 默认 Expand All
    ...saved
  };

  if (['application/json', 'text/plain', 'application/javascript', 'text/javascript'].includes(document.contentType)) formatJSON();
  GM_registerMenuCommand('Toggle JSON format', formatJSON);

  function createQuote() { return /*#__PURE__*/React.createElement("span", { className: "subtle quote" }, "\""); }
  function createComma() { return /*#__PURE__*/React.createElement("span", { className: "subtle comma" }, ","); }
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
      expectChar(start, '0');
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

  // ---------- 复制（含 Safari 回退） ----------
  async function copyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    }
    if (typeof GM_setClipboard === 'function') {
      try { GM_setClipboard(text, 'text'); return true; } catch (e) {}
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly','');
      ta.style.position='fixed'; ta.style.top='-9999px'; ta.style.left='-9999px';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }
  // ------------------------------------------------

  function loadJSON() {
    const raw = document.body.innerText;
    try {
      const content = tokenize(raw);
      return { raw, content };
    } catch (e) { /* not JSON */ }
    try {
      const parts = raw.match(/^(.*?\w\s*\()([\s\S]+)(\)[;\s]*)$/);
      const content = tokenize(parts[2]);
      return {
        raw,
        content,
        prefixText: parts[1].trim(),
        suffixText: parts[3].trim(),
        prefix: /*#__PURE__*/React.createElement("span", { className: "subtle" }, parts[1].trim()),
        suffix: /*#__PURE__*/React.createElement("span", { className: "subtle" }, parts[3].trim())
      };
    } catch (e) { /* not JSONP */ }
  }

  function formatJSON() {
    if (formatter.formatted) return;
    formatter.formatted = true;
    formatter.data = loadJSON();
    if (!formatter.data) return;
    formatter.style = GM_addStyle(css);
    formatter.root  = /*#__PURE__*/React.createElement("div", { id: "json-formatter" });
    document.body.innerHTML = '';
    document.body.append(formatter.root);
    initTips();
    initMenu();
    bindEvents();
    generateNodes(formatter.data, formatter.root);
    applyIndent();
    applyWrap();
    applyExpandMode(); // 初始化套用展开模式
    applyIndentLabel(); // 初始化 Indent 按钮文字
  }

  function toString(content) { return `${content.source}`; }

  // === 深度相关工具 ===
  function collapseTo(level) {
    const list = document.querySelectorAll('#json-formatter .complex');
    list.forEach(n => {
      const d = Number(n.dataset.depth || 0);
      if (d > level) n.classList.add('collapse');
      else n.classList.remove('collapse');
    });
  }
  function expandTo(level) { collapseTo(level); }
  function expandAll() {
    document.querySelectorAll('#json-formatter .complex').forEach(n => n.classList.remove('collapse'));
  }
  function collapseAll() {
    document.querySelectorAll('#json-formatter .complex').forEach(n => n.classList.add('collapse'));
  }

  // === 结构节点渲染（带深度） ===
  function setFolderWithDepth(elBlock, length, depth) {
    if (length) {
      elBlock.classList.add('complex');
      elBlock.dataset.depth = String(depth);
      elBlock.append(
        /*#__PURE__*/React.createElement("div", { className: "folder" }, '\u25b8'),
        /*#__PURE__*/React.createElement("span", { className: "summary" }, `// ${length} items`)
      );
    }
  }

  function generateArrayWithDepth({ el, elBlock, content, depth }) {
    const elContent = content.data.length && /*#__PURE__*/React.createElement("div", { className: "content" });
    setFolderWithDepth(elBlock, content.data.length, depth);
    el.append(
      /*#__PURE__*/React.createElement("span", { className: "bracket" }, "["),
      elContent || ' ',
      /*#__PURE__*/React.createElement("span", { className: "bracket" }, "]")
    );
    return content.data.map((item, i) => {
      const elValue = /*#__PURE__*/React.createElement("span", null);
      const elChild = /*#__PURE__*/React.createElement("div", null, elValue);
      elContent && elContent.append(elChild);
      if (i < content.data.length - 1) elChild.append(createComma());
      return { el: elValue, elBlock: elChild, content: item, depth: depth + 1 };
    });
  }

  function generateObjectWithDepth({ el, elBlock, content, depth }) {
    const elContent = content.data.length && /*#__PURE__*/React.createElement("div", { className: "content" });
    setFolderWithDepth(elBlock, content.data.length, depth);
    el.append(
      /*#__PURE__*/React.createElement("span", { className: "bracket" }, '{'),
      elContent || ' ',
      /*#__PURE__*/React.createElement("span", { className: "bracket" }, '}')
    );
    return content.data.map(({ key, value }, i) => {
      const elValue = /*#__PURE__*/React.createElement("span", null);
      const elChild = /*#__PURE__*/React.createElement(
        "div",
        null,
        createQuote(),
        /*#__PURE__*/React.createElement("span", { className: "key item", "data-type": key.type }, key.data),
        createQuote(),
        ': ',
        elValue
      );
      if (i < content.data.length - 1) elChild.append(createComma());
      elContent && elContent.append(elChild);
      return { el: elValue, content: value, elBlock: elChild, depth: depth + 1 };
    });
  }

  function generateNodes(data, container) {
    const rootSpan = /*#__PURE__*/React.createElement("span", null);
    const root     = /*#__PURE__*/React.createElement("div", null, rootSpan);
    const pre      = /*#__PURE__*/React.createElement("pre", null, root);
    formatter.pre  = pre;

    const queue    = [{ el: rootSpan, elBlock: root, ...data, depth: ROOT_DEPTH }];
    while (queue.length) {
      const item = queue.shift();
      const { el, content, prefix, suffix } = item;

      if (prefix) el.append(prefix);

      if (content.type === 'array') queue.push(...generateArrayWithDepth(item));
      else if (content.type === 'object') queue.push(...generateObjectWithDepth(item));
      else {
        const { type, color } = content;
        if (type === 'string') el.append(createQuote());
        if (color) el.append( /*#__PURE__*/React.createElement("span", { className: "color", style: `background-color: ${content.data}` }));
        el.append( /*#__PURE__*/React.createElement("span", { className: `${type} item`, "data-type": type, "data-value": toString(content) }, toString(content)));
        if (type === 'string') el.append(createQuote());
      }

      if (suffix) el.append(suffix);
    }

    container.append(pre);
  }

  // === 展开模式 ===
  function getExpandLabel(mode) {
    switch (mode) {
      case 'l1': return 'Expand L1';
      case 'l2': return 'Expand L2';
      case 'l3': return 'Expand L3';
      case 'collapse_all': return 'Collapse All';
      case 'all':
      default: return 'Expand All';
    }
  }
  function applyExpandMode() {
    const mode = config.expandMode || 'all';
    if (mode === 'l1') expandTo(1);
    else if (mode === 'l2') expandTo(2);
    else if (mode === 'l3') expandTo(3);
    else if (mode === 'collapse_all') collapseAll();
    else expandAll();
    const labelEl = formatter.root.querySelector('.expand-label');
    if (labelEl) labelEl.textContent = getExpandLabel(mode);
  }
  function setExpandMode(mode) {
    config.expandMode = mode;
    GM_setValue('config', config);
    applyExpandMode();
    formatter.root.querySelectorAll('.dropdown.open').forEach(n => n.classList.remove('open'));
  }

  // === Indent 菜单 ===
  function getIndentLabel() {
    return `Indent ${Number(config.indent) === 4 ? 4 : 2}`;
  }
  function applyIndent() {
    if (!formatter.root) return;
    const ch = Math.max(0, Number(config.indent) || 2);
    formatter.root.style.setProperty('--indent', `${ch}ch`);
  }
  function setIndent(val) {
    const v = Number(val) === 4 ? 4 : 2;
    config.indent = v;
    GM_setValue('config', config);
    applyIndent();
    applyIndentLabel();
    formatter.root.querySelectorAll('.dropdown.open').forEach(n => n.classList.remove('open'));
  }
  function applyIndentLabel() {
    const lbl = formatter.root.querySelector('.indent-label');
    if (lbl) lbl.textContent = getIndentLabel();
  }

  // === Wrap 模式 ===
  function applyWrap() {
    if (!formatter.pre) return;
    formatter.pre.classList.toggle('wrap-on', !!config.wrap);
    formatter.pre.classList.toggle('wrap-off', !config.wrap);
  }

  // 复制（按当前缩进 pretty-print，兼容 JSONP）
  async function copyPretty() {
    const indent = Number(config.indent) === 4 ? 4 : 2;
    const raw = formatter.data.raw;
    let out = raw;

    try {
      const obj = JSON.parse(raw);
      out = JSON.stringify(obj, null, indent);
    } catch (_) {
      const m = raw.match(/^(.*?\w\s*\()([\s\S]+)(\)[;\s]*)$/);
      if (m) {
        try {
          const obj = JSON.parse(m[2]);
          out = m[1].trim() + JSON.stringify(obj, null, indent) + m[3].trim();
        } catch (_) {
          out = raw;
        }
      }
    }
    return copyText(out);
  }

  function removeEl(el) { el.remove(); }

  function initMenu() {
    const handleCopy = async () => {
      const ok = await copyPretty();
      try {
        const tip = document.createElement('div');
        tip.textContent = ok ? 'Copied (with indent)!' : '复制失败';
        tip.style.cssText = 'position:fixed;top:10px;right:10px;background:' + (ok ? '#16a34a' : '#dc2626') + ';color:#fff;padding:6px 10px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.15);z-index:9999;font:14px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto';
        document.body.appendChild(tip);
        setTimeout(() => tip.remove(), 1200);
        if (!ok) alert('复制失败：Safari 可能阻止了剪贴板访问。请在 HTTPS 页面重试或再次点击。');
      } catch (_) {}
    };

    const handleMenuClick = e => {
      const el = e.target.closest('.btn');
      if (!el) return;

      const { wrap } = el.dataset;

      if (wrap !== undefined) {
        config.wrap = !config.wrap;
        GM_setValue('config', config);
        applyWrap();
        el.classList.toggle('active', !!config.wrap);
        el.setAttribute('aria-pressed', config.wrap ? 'true' : 'false');
        return;
      }
    };

    const toggleDropdown = (dd) => {
      formatter.root.querySelectorAll('.dropdown.open').forEach(n => {
        if (n !== dd) n.classList.remove('open');
      });
      dd.classList.toggle('open');
    };

    // 构建菜单：Copy + Expand(单一) + Indent(下拉) + Wrap
    const expandLabelSpan = /*#__PURE__*/React.createElement("span", { className: "expand-label" }, getExpandLabel(config.expandMode || 'all'));
    const indentLabelSpan = /*#__PURE__*/React.createElement("span", { className: "indent-label" }, getIndentLabel());

    formatter.root.append(
      /*#__PURE__*/React.createElement("div", { className: "menu", onClick: handleMenuClick },
        /*#__PURE__*/React.createElement("span", { className: "btn", onClick: handleCopy, title: "Copy formatted text" }, "Copy"),

        // Expand menu
        /*#__PURE__*/React.createElement("span", { className: "dropdown" },
          /*#__PURE__*/React.createElement("span", {
            className: "btn",
            role: "button",
            "aria-haspopup": "menu",
            onClick: (e) => { e.stopPropagation(); toggleDropdown(e.currentTarget.parentNode); }
          }, expandLabelSpan, " \u25BE"),
          /*#__PURE__*/React.createElement("div", { className: "dropdown-menu", role: "menu" },
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setExpandMode('l1') }, "Expand L1"),
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setExpandMode('l2') }, "Expand L2"),
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setExpandMode('l3') }, "Expand L3"),
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setExpandMode('all') }, "Expand All"),
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setExpandMode('collapse_all') }, "Collapse All")
          )
        ),

        // Indent menu
        /*#__PURE__*/React.createElement("span", { className: "dropdown" },
          /*#__PURE__*/React.createElement("span", {
            className: "btn",
            role: "button",
            "aria-haspopup": "menu",
            onClick: (e) => { e.stopPropagation(); toggleDropdown(e.currentTarget.parentNode); }
          }, indentLabelSpan, " \u25BE"),
          /*#__PURE__*/React.createElement("div", { className: "dropdown-menu", role: "menu" },
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setIndent(2) }, "Indent 2"),
            /*#__PURE__*/React.createElement("span", { className: "item", role: "menuitem", onClick: () => setIndent(4) }, "Indent 4")
          )
        ),

        // Wrap toggle
        /*#__PURE__*/React.createElement("span", {
          className: "toggle btn" + (config.wrap ? " active" : ""),
          "data-wrap": "",
          role: "button",
          "aria-pressed": String(!!config.wrap),
          title: "自动换行（开/关）"
        }, "Wrap")
      )
    );
  }

  function initTips() {
    const tips = /*#__PURE__*/React.createElement("div", { className: "tips", onClick: e => { e.stopPropagation(); } });
    const hide = () => removeEl(tips);
    document.addEventListener('click', hide, false);
    formatter.tips = {
      node: tips,
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
        const gapX = 8;

        const preferTop = rects[0].top >= 100;
        if (!preferTop) {
          tips.style.top = `${rect.bottom + scrollTop + gap}px`;
          tips.style.bottom = '';
        } else {
          tips.style.top = '';
          tips.style.bottom = `${formatter.root.offsetHeight - rect.top - scrollTop + gap}px`;
        }

        let left = rect.left + scrollLeft;
        if (left + tipW + gapX > vw) left = Math.max(gapX, vw - tipW - gapX);
        tips.style.left = `${left}px`;

        const { type, value } = range.startContainer.dataset;
        tips.innerHTML = '';
        tips.append(
          /*#__PURE__*/React.createElement("span", { className: "tips-key" }, "type"), ': ',
          /*#__PURE__*/React.createElement("span", { className: "tips-val", dangerouslySetInnerHTML: { __html: type } })
        );
        if (type === 'string' && /^(https?|ftps?):\/\/\S+/.test(value)) {
          tips.append(
            /*#__PURE__*/React.createElement("br", null),
            /*#__PURE__*/React.createElement("a", { className: "tips-link", href: value, target: "_blank", rel: "noopener noreferrer" }, "Open link")
          );
        }

        tips.style.visibility = 'visible';
      }
    };
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

      // 点击外层关闭所有下拉
      const isDropdown = target.closest('.dropdown');
      if (!isDropdown) {
        formatter.root.querySelectorAll('.dropdown.open').forEach(n => n.classList.remove('open'));
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
