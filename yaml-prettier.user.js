// ==UserScript==
// @name        YAML Prettier
// @version     1.0.0
// @description Format YAML data in a beautiful way. 
// @description:zh-CN 将 YAML 数据漂亮地展示出来。
// @license     MIT
// @grant        GM_registerMenuCommand
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

    // ========== 样式（仅格式化后的内容样式）==========
    function addStyles() {
        if (document.getElementById('yaml-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'yaml-styles';
        style.textContent = `
            .yaml-formatted {
                font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace !important;
                background: linear-gradient(to bottom, #f8f9fa 0%, #f1f3f5 100%) !important;
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
            
            .yaml-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 2147483647;
                background: rgba(102, 126, 234, 0.95);
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                animation: slideIn 0.3s ease;
            }
            
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            .yaml-toast.success { background: rgba(64, 192, 87, 0.95); }
            .yaml-toast.error { background: rgba(250, 82, 82, 0.95); }
        `;
        document.head.appendChild(style);
    }

    // ========== 通知 ==========
    function showToast(message, type = 'info') {
        const existing = document.querySelectorAll('.yaml-toast');
        existing.forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = 'yaml-toast ' + type;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(400px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    // ========== YAML 检测 ==========
    function detectYAML(text) {
        text = text.trim();
        if (text.length < 20) return false;
        
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 3) return false;
        
        let kvLines = 0, listLines = 0, commentLines = 0, normalTextLines = 0, htmlTags = 0;
        
        for (let line of lines) {
            const trimmed = line.trim();
            if (/<[a-z][\s\S]*>/i.test(trimmed)) htmlTags++;
            if (/^#/.test(trimmed)) { commentLines++; continue; }
            if (/^-\s+/.test(trimmed)) { listLines++; continue; }
            if (/^[a-zA-Z][\w-]*\s*:\s*(\S.*)?$/.test(trimmed)) { kvLines++; continue; }
            if (/^\s+[a-zA-Z][\w-]*\s*:\s*(\S.*)?$/.test(line)) { kvLines++; continue; }
            if (trimmed.length > 0 && /[a-zA-Z]/.test(trimmed)) normalTextLines++;
        }
        
        const totalLines = lines.length;
        const yamlLines = kvLines + listLines + commentLines;
        const yamlRatio = yamlLines / totalLines;
        
        return yamlLines >= 3 && yamlRatio >= 0.6 && 
               htmlTags < totalLines * 0.2 && normalTextLines < totalLines * 0.4;
    }

    function isPureConfigPage() {
        const body = document.body;
        if (!body) return false;
        
        if (body.querySelectorAll('nav, header, footer, aside, menu, [role="navigation"]').length > 0) return false;
        if (body.querySelectorAll('a').length > 10) return false;
        if (body.querySelectorAll('form, input[type="text"], input[type="email"]').length > 2) return false;
        
        const textLength = (body.textContent || '').trim().length;
        const visibleChildren = Array.from(body.children).filter(el => 
            el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'NOSCRIPT' &&
            !el.classList.contains('yaml-formatted') && !el.classList.contains('yaml-toast')
        ).length;
        
        return textLength > 100 && textLength < 50000 && visibleChildren < 10;
    }

    // ========== 文本清理 ==========
    function cleanText(text) {
        return text
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/格式化\s*YAML/g, '')
            .replace(/格式化$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    // ========== 格式化 ==========
    function esc(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatValue(value) {
        value = value.trim();
        if (!value) return '';
        if (/^https?:\/\//.test(value)) return '<span class="yaml-url">' + esc(value) + '</span>';
        if (/^["'].*["']$/.test(value)) return '<span class="yaml-string">' + esc(value) + '</span>';
        if (/^(true|false|yes|no|on|off)$/i.test(value)) return '<span class="yaml-boolean">' + esc(value) + '</span>';
        if (/^(null|~)$/i.test(value)) return '<span class="yaml-null">' + esc(value) + '</span>';
        if (/^-?\d+(\.\d+)?$/.test(value)) return '<span class="yaml-number">' + esc(value) + '</span>';
        if (/^\[.*\]$/.test(value)) return '<span class="yaml-string">' + esc(value) + '</span>';
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(value)) return '<span class="yaml-number">' + esc(value) + '</span>';
        return '<span class="yaml-string">' + esc(value) + '</span>';
    }

    function parseAndFormat(text) {
        const lines = text.split('\n');
        let formatted = '';
        
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '格式化' || /[\u{1F300}-\u{1F9FF}]/u.test(trimmed)) continue;
            
            const leadingSpaces = line.match(/^\s*/)[0];
            
            if (trimmed.startsWith('#')) {
                formatted += leadingSpaces + '<span class="yaml-comment">' + esc(trimmed) + '</span>\n';
                continue;
            }
            
            if (/^-\s+/.test(trimmed)) {
                const match = trimmed.match(/^(-\s+)(.+)/);
                if (match) {
                    formatted += leadingSpaces + '<span class="yaml-key">' + match[1] + '</span>' + formatValue(match[2]) + '\n';
                }
                continue;
            }
            
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0 && /^[a-zA-Z][\w-]*:/.test(trimmed)) {
                const key = trimmed.substring(0, colonIndex);
                const value = trimmed.substring(colonIndex + 1).trim();
                formatted += leadingSpaces + '<span class="yaml-key">' + esc(key) + '</span>:';
                if (value) formatted += ' ' + formatValue(value);
                formatted += '\n';
                continue;
            }
            
            if (trimmed.length > 1 && /^[a-zA-Z0-9]/.test(trimmed)) {
                formatted += leadingSpaces + esc(trimmed) + '\n';
            }
        }
        
        return formatted;
    }

    function splitCompressedYAML(text) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 3) return text;
        
        const singleLine = lines.join(' ');
        const kvCount = (singleLine.match(/[a-zA-Z][\w-]*:/g) || []).length;
        if (singleLine.length < 200 || kvCount < 5) return text;
        
        let result = singleLine.replace(/\s+([a-zA-Z][\w-]*):/g, '\n$1:');
        return result.replace(/^\n+/, '');
    }

    // ========== 处理元素 ==========
    function processElement(el, force) {
        if (!el || (!force && el.classList.contains('yaml-formatted'))) return false;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.classList.contains('yaml-toast')) return false;
        
        let text = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.textContent || '');
        text = cleanText(text.trim());
        if (text.length < 20 || (!force && !detectYAML(text))) return false;
        
        try {
            const formatted = parseAndFormat(splitCompressedYAML(text));
            if (!formatted.trim()) return false;
            
            const pre = document.createElement('pre');
            pre.className = 'yaml-formatted';
            pre.innerHTML = formatted;
            
            if (el.tagName === 'BODY') {
                const toasts = Array.from(document.querySelectorAll('.yaml-toast'));
                el.innerHTML = '';
                el.appendChild(pre);
                toasts.forEach(t => el.appendChild(t));
            } else if (el.parentNode) {
                el.parentNode.replaceChild(pre, el);
            }
            
            return true;
        } catch (e) {
            console.error('[YAML] Error:', e);
            return false;
        }
    }

    // ========== 扫描 ==========
    function scanPage(force) {
        if (!force && !isPureConfigPage()) return 0;
        
        let count = 0;
        
        if (document.body) {
            const children = Array.from(document.body.children).filter(el =>
                el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' &&
                !el.classList.contains('yaml-formatted') && !el.classList.contains('yaml-toast')
            );
            
            if (children.length <= 3 && processElement(document.body, force)) {
                return 1;
            }
        }
        
        const candidates = new Set();
        document.querySelectorAll('*').forEach(el => {
            if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && !el.classList.contains('yaml-toast') &&
                el.children.length <= 5 && (el.textContent || '').trim().length > 50) {
                candidates.add(el);
            }
        });
        
        for (let el of candidates) {
            if (processElement(el, force)) {
                count++;
                break;
            }
        }
        
        return count;
    }

    // ========== 菜单命令 ==========
    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('格式化 YAML', function() {
                const count = scanPage(true);
                showToast(count > 0 ? '✓ 已格式化 ' + count + ' 个元素' : '✗ 未找到 YAML 内容', 
                         count > 0 ? 'success' : 'error');
            });
            console.log('[YAML] Menu command registered');
        }
    }

    // ========== 初始化 ==========
    function init() {
        addStyles();
        registerMenuCommands();
        setTimeout(() => scanPage(false), 500);
        console.log('[YAML] Ready (v6.2) - No UI buttons, use menu command');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    window.yamlFormat = function() {
        const count = scanPage(true);
        showToast(count > 0 ? '✓ 已格式化 ' + count + ' 个元素' : '✗ 未找到 YAML 内容',
                 count > 0 ? 'success' : 'error');
        return count;
    };

})();
