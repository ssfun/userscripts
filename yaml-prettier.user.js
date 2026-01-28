// ==UserScript==
// @name        YAML Prettier
// @version     1.0.2
// @description Format YAML data in a beautiful way. 
// @description:zh-CN 将 YAML 数据漂亮地展示出来。
// @license     MIT
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-end
// @namespace   https://github.com/ssfun
// @author      sfun
// @homepage    https://github.com/ssfun/userscripts
// @homepageURL https://github.com/ssfun/userscripts
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/yaml-prettier.user.js
// @updateURL   https://github.com/ssfun/userscripts/raw/refs/heads/main/yaml-prettier.user.js
// ==/UserScript==

(function() {
  'use strict';

  // ========== 配置（localStorage） ==========
  const STORAGE_KEY = 'yaml_formatter_config';
  const DEFAULT_CONFIG = { AUTO_FORMAT: false, MIN_YAML_RATIO: 0.8, MIN_KV_LINES: 5 };
  let CONFIG = loadConfig();

  function loadConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return { ...DEFAULT_CONFIG };
      const cfg = JSON.parse(saved);
      return {
        AUTO_FORMAT: typeof cfg.AUTO_FORMAT === 'boolean' ? cfg.AUTO_FORMAT : DEFAULT_CONFIG.AUTO_FORMAT,
        MIN_YAML_RATIO: typeof cfg.MIN_YAML_RATIO === 'number' ? cfg.MIN_YAML_RATIO : DEFAULT_CONFIG.MIN_YAML_RATIO,
        MIN_KV_LINES: Number.isInteger(cfg.MIN_KV_LINES) ? cfg.MIN_KV_LINES : DEFAULT_CONFIG.MIN_KV_LINES
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  function saveConfig() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG)); } catch {}
  }

  // ========== 按需样式注入 ==========
  const injected = { format: false, toast: false, modal: false };
  function ensureStyle(kind) {
    if (injected[kind]) return;
    let css = '';
    if (kind === 'format') {
      css = `
        .yaml-formatted {
          font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace !important;
          background: #f8f9fa !important;
          border: 1px solid #dee2e6 !important;
          border-left: 4px solid #4c6ef5 !important;
          border-radius: 6px !important;
          padding: 16px !important;
          margin: 16px 0 !important;
          white-space: pre !important;
          overflow-x: auto !important;
          line-height: 1.6 !important;
          font-size: 13px !important;
          color: #212529 !important;
          display: block !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        }
        .yaml-key { color: #1971c2 !important; font-weight: 600 !important; }
        .yaml-string { color: #087f5b !important; }
        .yaml-number { color: #c92a2a !important; }
        .yaml-boolean { color: #ae3ec9 !important; font-weight: 600 !important; }
        .yaml-null { color: #868e96 !important; font-style: italic !important; }
        .yaml-comment { color: #868e96 !important; }
        .yaml-url { color: #1971c2 !important; text-decoration: underline !important; }
      `;
    } else if (kind === 'toast') {
      css = `
        .yaml-toast {
          position: fixed; top: 20px; right: 20px; z-index: 2147483647;
          background: rgba(102, 126, 234, 0.95); color: #fff;
          padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 600;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          transition: all .3s ease; will-change: transform, opacity;
        }
        .yaml-toast.success { background: rgba(64, 192, 87, 0.95); }
        .yaml-toast.error { background: rgba(250, 82, 82, 0.95); }
      `;
    } else if (kind === 'modal') {
      css = `
        .yaml-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2147483646;
          display: flex; align-items: center; justify-content: center;
        }
        .yaml-modal {
          background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.3);
          width: 500px; max-width: 90%; max-height: 80vh; overflow: hidden;
        }
        .yaml-modal-header {
          background: linear-gradient(135deg, #667eea, #764ba2); color: #fff;
          padding: 16px 20px; font-size: 16px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;
        }
        .yaml-modal-close { background: none; border: 0; color: #fff; font-size: 22px; cursor: pointer; }
        .yaml-modal-body { padding: 16px 20px; overflow-y: auto; max-height: calc(80vh - 120px); }
        .yaml-form-group { margin-bottom: 16px; }
        .yaml-form-label { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        .yaml-form-description { font-size: 12px; color: #6c757d; margin-bottom: 8px; line-height: 1.5; }
        .yaml-form-input { width: 100%; padding: 10px 12px; border: 2px solid #dee2e6; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
        .yaml-form-input:focus { outline: none; border-color: #667eea; }
        .yaml-form-checkbox { display: flex; gap: 10px; align-items: flex-start; }
        .yaml-form-checkbox input { width: 18px; height: 18px; margin-top: 2px; }
        .yaml-current-value { display: inline-block; background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 12px; margin-left: 6px; }
        .yaml-modal-footer { padding: 12px 20px; background: #f8f9fa; display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #dee2e6; }
        .yaml-btn { padding: 8px 14px; border: 0; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .yaml-btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; }
        .yaml-btn-secondary { background: #fff; color: #495057; border: 2px solid #dee2e6; }
        .yaml-btn-reset { background: #dc3545; color: #fff; }
      `;
    }
    if (css) GM_addStyle(css);
    injected[kind] = true;
  }

  // ========== Toast（按需） ==========
  function showToast(message, type = 'info') {
    ensureStyle('toast');
    document.querySelectorAll('.yaml-toast').forEach(t => t.remove());
    const t = document.createElement('div');
    t.className = 'yaml-toast ' + type;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(400px)';
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  // ========== 配置 Modal（按需） ==========
  function showConfigModal() {
    ensureStyle('modal');
    if (document.getElementById('yaml-config-modal')) return;

    const overlay = document.createElement('div');
    overlay.className = 'yaml-modal-overlay';
    overlay.id = 'yaml-config-modal';

    const modal = document.createElement('div');
    modal.className = 'yaml-modal';
    modal.innerHTML = `
      <div class="yaml-modal-header">
        <span>⚙️ YAML 格式化配置</span>
        <button class="yaml-modal-close" id="yaml-modal-close">×</button>
      </div>
      <div class="yaml-modal-body">
        <div class="yaml-form-group">
          <label class="yaml-form-checkbox">
            <input type="checkbox" id="yaml-config-auto" ${CONFIG.AUTO_FORMAT ? 'checked' : ''}>
            <div>
              <div class="yaml-form-label">
                自动格式化
                <span class="yaml-current-value">当前: ${CONFIG.AUTO_FORMAT ? '开启' : '关闭'}</span>
              </div>
              <div class="yaml-form-description">页面加载时自动检测并格式化 YAML。关闭则仅手动触发。</div>
            </div>
          </label>
        </div>
        <div class="yaml-form-group">
          <label class="yaml-form-label" for="yaml-config-ratio">
            YAML 特征占比 (0.1-1.0)
            <span class="yaml-current-value">当前: ${CONFIG.MIN_YAML_RATIO}</span>
          </label>
          <div class="yaml-form-description">YAML 格式行数/总行数。值越高越严格，建议 0.8。</div>
          <input type="number" class="yaml-form-input" id="yaml-config-ratio" min="0.1" max="1" step="0.1" value="${CONFIG.MIN_YAML_RATIO}">
        </div>
        <div class="yaml-form-group">
          <label class="yaml-form-label" for="yaml-config-lines">
            最少键值对行数
            <span class="yaml-current-value">当前: ${CONFIG.MIN_KV_LINES}</span>
          </label>
          <div class="yaml-form-description">至少多少条 "key: value" 才视为 YAML。建议 5。</div>
          <input type="number" class="yaml-form-input" id="yaml-config-lines" min="1" max="20" step="1" value="${CONFIG.MIN_KV_LINES}">
        </div>
      </div>
      <div class="yaml-modal-footer">
        <button class="yaml-btn yaml-btn-reset" id="yaml-config-reset">恢复默认</button>
        <button class="yaml-btn yaml-btn-secondary" id="yaml-config-cancel">取消</button>
        <button class="yaml-btn yaml-btn-primary" id="yaml-config-save">保存</button>
      </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    modal.querySelector('#yaml-modal-close').onclick = close;
    modal.querySelector('#yaml-config-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    modal.querySelector('#yaml-config-save').onclick = () => {
      const auto = modal.querySelector('#yaml-config-auto').checked;
      const ratio = parseFloat(modal.querySelector('#yaml-config-ratio').value);
      const lines = parseInt(modal.querySelector('#yaml-config-lines').value, 10);
      if (!(ratio >= 0.1 && ratio <= 1)) { showToast('YAML 占比需在 0.1-1 之间', 'error'); return; }
      if (!(lines >= 1 && lines <= 20)) { showToast('最少键值对行数需在 1-20', 'error'); return; }
      CONFIG.AUTO_FORMAT = auto;
      CONFIG.MIN_YAML_RATIO = ratio;
      CONFIG.MIN_KV_LINES = lines;
      saveConfig();
      showToast('配置已保存', 'success');
      close();
    };
    modal.querySelector('#yaml-config-reset').onclick = () => {
      CONFIG = { ...DEFAULT_CONFIG };
      saveConfig();
      showToast('已恢复默认', 'success');
      close();
    };
  }

  // ========== 检测与格式化 ==========
  function detectYAML(text) {
    text = text.trim();
    if (text.length < 50) return false;
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 5) return false;

    let kv = 0, list = 0, comment = 0, normal = 0, html = 0;
    const hasJS = /function\s*\(|var\s+|const\s+|let\s+|=>|console\.|import\s|export\s/.test(text);
    const hasHTML = /<(div|span|p|a|img|script|style|head|body|html|button|input|form)/i.test(text);
    const hasProse = /\.\s+[A-Z]/.test(text);
    const hasLong = lines.some(l => l.length > 200 && !/:\s/.test(l));
    const hasJSON = /^\s*[\{\[]/.test(text) || /[\}\]]\s*$/.test(text);
    if (hasJS || hasHTML || hasProse || hasLong || hasJSON) return false;

    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/<[a-z][\s\S]*>/i.test(t)) { html++; continue; }
      if (/^#/.test(t)) { comment++; continue; }
      if (/^-\s+\S/.test(t)) { list++; continue; }
      if (/^[a-zA-Z][\w-]*\s*:\s*(\S.*)?$/.test(t)) { kv++; continue; }
      if (/^\s+[a-zA-Z][\w-]*\s*:\s*(\S.*)?$/.test(line)) { kv++; continue; }
      normal++;
    }
    const total = lines.length;
    const yamlLines = kv + list + comment;
    const ratio = yamlLines / total;
    return kv >= CONFIG.MIN_KV_LINES && ratio >= CONFIG.MIN_YAML_RATIO && html === 0 && normal < total * 0.15;
  }

  function cleanText(text) {
    return text
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function fmtVal(v) {
    v = v.trim();
    if (!v) return '';
    if (/^https?:\/\//.test(v)) return '<span class="yaml-url">' + esc(v) + '</span>';
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
      if (!t) continue;
      const lead = line.match(/^\s*/)[0];
      if (t.startsWith('#')) { out += lead + '<span class="yaml-comment">' + esc(t) + '</span>\n'; continue; }
      if (/^-\s+\S/.test(t)) { const m = t.match(/^(-\s+)(.+)/); if (m) out += lead + '<span class="yaml-key">' + m[1] + '</span>' + fmtVal(m[2]) + '\n'; continue; }
      const idx = t.indexOf(':');
      if (idx > 0 && /^[a-zA-Z][\w-]*:/.test(t)) {
        const key = t.slice(0, idx), val = t.slice(idx + 1).trim();
        out += lead + '<span class="yaml-key">' + esc(key) + '</span>:' + (val ? ' ' + fmtVal(val) : '') + '\n';
        continue;
      }
      if (/^[a-zA-Z0-9]/.test(t)) out += lead + esc(t) + '\n';
    }
    return out;
  }
  function splitCompressed(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length > 3) return text;
    const one = lines.join(' ');
    const kvCount = (one.match(/[a-zA-Z][\w-]*:/g) || []).length;
    if (one.length < 200 || kvCount < 5) return text;
    return one.replace(/\s+([a-zA-Z][\w-]*):/g, '\n$1:').replace(/^\n+/, '');
  }

  // ========== 处理与扫描（避免未触发时抖动） ==========
  function processElement(el, force) {
    if (!el || (!force && el.classList.contains('yaml-formatted'))) return false;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return false;

    let text = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.textContent || '');
    text = cleanText(text);
    if (text.length < 50) return false;
    if (!force && !detectYAML(text)) return false;

    try {
      const formatted = parseAndFormat(splitCompressed(text));
      if (!formatted.trim()) return false;

      ensureStyle('format');
      const pre = document.createElement('pre');
      pre.className = 'yaml-formatted';
      pre.innerHTML = formatted;

      requestAnimationFrame(() => {
        if (el.tagName === 'BODY') {
          // 保留任何已存在的提示/弹窗
          const preserve = Array.from(document.querySelectorAll('.yaml-toast, .yaml-modal-overlay'));
          el.innerHTML = '';
          el.appendChild(pre);
          preserve.forEach(p => document.body.appendChild(p));
        } else if (el.parentNode) {
          el.parentNode.replaceChild(pre, el);
        }
      });

      return true;
    } catch (e) {
      console.error('[YAML] Error:', e);
      return false;
    }
  }

  function scanPage(force) {
    if (!force) {
      if (!CONFIG.AUTO_FORMAT) return 0;
    }
    let count = 0;

    // 优先尝试 body（简单文本页）
    if (document.body) {
      const children = Array.from(document.body.children).filter(el =>
        el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' &&
        !el.classList.contains('yaml-formatted') &&
        !el.classList.contains('yaml-toast') &&
        !el.classList.contains('yaml-modal-overlay')
      );
      if (children.length <= 3) {
        const bodyText = cleanText((document.body.textContent || '').trim());
        if (bodyText.length >= 50 && (force || detectYAML(bodyText))) {
          if (processElement(document.body, force)) return 1;
        }
      }
    }

    // pre/code
    const candidates = [];
    document.querySelectorAll('pre, code').forEach(el => {
      if (!el.classList.contains('yaml-formatted') && (el.textContent || '').trim().length > 50) {
        candidates.push(el);
      }
    });

    // 简单 div 兜底
    if (candidates.length === 0) {
      const divs = document.querySelectorAll('div');
      for (let el of divs) {
        if (el.children.length <= 2 && (el.textContent || '').trim().length > 50) {
          candidates.push(el);
          if (candidates.length >= 5) break;
        }
      }
    }

    for (let el of candidates) {
      if (processElement(el, force)) { count++; break; }
    }
    return count;
  }

  // ========== 菜单命令 ==========
  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('格式化 YAML', function() {
        const count = scanPage(true);
        ensureStyle('toast');
        showToast(count > 0 ? `✓ 已格式化 ${count} 个元素` : '✗ 未找到 YAML 内容', count > 0 ? 'success' : 'error');
      });
      GM_registerMenuCommand('配置设置', function() {
        showConfigModal();
      });
    } else {
      console.warn('[YAML] GM_registerMenuCommand not available. Use window.yamlFormat() / window.yamlConfig()');
    }
  }

  // ========== 初始化（不注入样式，避免抖动） ==========
  function init() {
    registerMenuCommands();
    if (CONFIG.AUTO_FORMAT) {
      setTimeout(() => { scanPage(false); }, 500);
    }
    console.log('[YAML] Ready. AUTO_FORMAT =', CONFIG.AUTO_FORMAT);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 50);
  }

  // ========== 全局函数（控制台备用） ==========
  window.yamlFormat = function() {
    const count = scanPage(true);
    ensureStyle('toast');
    showToast(count > 0 ? `✓ 已格式化 ${count} 个元素` : '✗ 未找到 YAML 内容', count > 0 ? 'success' : 'error');
    return count;
  };
  window.yamlConfig = function() { showConfigModal(); };
  window.yamlGetConfig = function() { return { ...CONFIG }; };

})();
