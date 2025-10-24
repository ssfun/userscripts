// ==UserScript==
// @name        YAML Prettier
// @version     1.0.1
// @description Format YAML data in a beautiful way. 
// @description:zh-CN 将 YAML 数据漂亮地展示出来。
// @license     MIT
// @match        *://*/*
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

    // ========== 配置管理 ==========
    const STORAGE_KEY = 'yaml_formatter_config';
    
    const DEFAULT_CONFIG = {
        AUTO_FORMAT: false,
        MIN_YAML_RATIO: 0.8,
        MIN_KV_LINES: 5
    };

    let CONFIG = {};

    function loadConfig() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                CONFIG.AUTO_FORMAT = parsed.AUTO_FORMAT !== undefined ? parsed.AUTO_FORMAT : DEFAULT_CONFIG.AUTO_FORMAT;
                CONFIG.MIN_YAML_RATIO = parsed.MIN_YAML_RATIO !== undefined ? parsed.MIN_YAML_RATIO : DEFAULT_CONFIG.MIN_YAML_RATIO;
                CONFIG.MIN_KV_LINES = parsed.MIN_KV_LINES !== undefined ? parsed.MIN_KV_LINES : DEFAULT_CONFIG.MIN_KV_LINES;
            } else {
                CONFIG = { ...DEFAULT_CONFIG };
            }
            console.log('[YAML] Config loaded:', CONFIG);
        } catch (e) {
            console.warn('[YAML] Failed to load config, using defaults:', e);
            CONFIG = { ...DEFAULT_CONFIG };
        }
    }

    function saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(CONFIG));
            console.log('[YAML] Config saved:', CONFIG);
        } catch (e) {
            console.error('[YAML] Failed to save config:', e);
        }
    }

    // ========== 样式 ==========
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
            
            /* 通知提示 */
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
            
            /* 配置 Modal */
            .yaml-modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 2147483646;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: fadeIn 0.2s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .yaml-modal {
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                width: 500px;
                max-width: 90%;
                max-height: 80vh;
                overflow: hidden;
                animation: slideUp 0.3s ease;
            }
            
            @keyframes slideUp {
                from { transform: translateY(50px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            
            .yaml-modal-header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px 24px;
                font-size: 18px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .yaml-modal-close {
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 6px;
                transition: background 0.2s;
            }
            
            .yaml-modal-close:hover {
                background: rgba(255,255,255,0.2);
            }
            
            .yaml-modal-body {
                padding: 24px;
                overflow-y: auto;
                max-height: calc(80vh - 140px);
            }
            
            .yaml-form-group {
                margin-bottom: 24px;
            }
            
            .yaml-form-group:last-child {
                margin-bottom: 0;
            }
            
            .yaml-form-label {
                display: block;
                font-size: 14px;
                font-weight: 600;
                color: #212529;
                margin-bottom: 8px;
            }
            
            .yaml-form-description {
                display: block;
                font-size: 12px;
                color: #6c757d;
                margin-bottom: 8px;
                line-height: 1.5;
            }
            
            .yaml-form-input {
                width: 100%;
                padding: 10px 12px;
                border: 2px solid #dee2e6;
                border-radius: 6px;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                transition: border-color 0.2s;
                box-sizing: border-box;
            }
            
            .yaml-form-input:focus {
                outline: none;
                border-color: #667eea;
            }
            
            .yaml-form-checkbox {
                display: flex;
                align-items: flex-start;
                cursor: pointer;
                gap: 10px;
            }
            
            .yaml-form-checkbox input {
                width: 20px;
                height: 20px;
                margin-top: 2px;
                cursor: pointer;
                flex-shrink: 0;
            }
            
            .yaml-form-checkbox-content {
                flex: 1;
            }
            
            .yaml-modal-footer {
                padding: 16px 24px;
                background: #f8f9fa;
                display: flex;
                justify-content: space-between;
                gap: 12px;
                border-top: 1px solid #dee2e6;
            }
            
            .yaml-modal-footer-left {
                display: flex;
                gap: 12px;
            }
            
            .yaml-modal-footer-right {
                display: flex;
                gap: 12px;
            }
            
            .yaml-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
            }
            
            .yaml-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .yaml-btn-primary:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
            }
            
            .yaml-btn-secondary {
                background: white;
                color: #495057;
                border: 2px solid #dee2e6;
            }
            
            .yaml-btn-secondary:hover {
                background: #f8f9fa;
            }
            
            .yaml-btn-reset {
                background: #dc3545;
                color: white;
            }
            
            .yaml-btn-reset:hover {
                background: #c82333;
            }
            
            .yaml-current-value {
                display: inline-block;
                background: #e9ecef;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
                color: #495057;
                margin-left: 8px;
            }
        `;
        document.head.appendChild(style);
    }

    // ========== 配置 Modal ==========
    function showConfigModal() {
        // 检查是否已存在
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
                        <div class="yaml-form-checkbox-content">
                            <div class="yaml-form-label">
                                自动格式化
                                <span class="yaml-current-value">当前: ${CONFIG.AUTO_FORMAT ? '开启' : '关闭'}</span>
                            </div>
                            <span class="yaml-form-description">
                                页面加载时自动检测并格式化 YAML 内容。关闭后只能通过菜单手动触发。
                            </span>
                        </div>
                    </label>
                </div>
                
                <div class="yaml-form-group">
                    <label class="yaml-form-label" for="yaml-config-ratio">
                        YAML 特征占比 (0-1)
                        <span class="yaml-current-value">当前: ${CONFIG.MIN_YAML_RATIO}</span>
                    </label>
                    <span class="yaml-form-description">
                        YAML 格式行数占总行数的最低比例。值越高越严格，推荐 0.8 (80%)。<br>
                        降低此值可能导致误格式化普通文本。
                    </span>
                    <input 
                        type="number" 
                        class="yaml-form-input" 
                        id="yaml-config-ratio" 
                        min="0.1" 
                        max="1" 
                        step="0.1" 
                        value="${CONFIG.MIN_YAML_RATIO}"
                        placeholder="0.8"
                    >
                </div>
                
                <div class="yaml-form-group">
                    <label class="yaml-form-label" for="yaml-config-lines">
                        最少键值对行数
                        <span class="yaml-current-value">当前: ${CONFIG.MIN_KV_LINES}</span>
                    </label>
                    <span class="yaml-form-description">
                        至少需要多少行 "key: value" 格式才认为是 YAML。推荐 5 行。<br>
                        降低此值可能导致短文本被误识别。
                    </span>
                    <input 
                        type="number" 
                        class="yaml-form-input" 
                        id="yaml-config-lines" 
                        min="1" 
                        max="20" 
                        step="1" 
                        value="${CONFIG.MIN_KV_LINES}"
                        placeholder="5"
                    >
                </div>
            </div>
            <div class="yaml-modal-footer">
                <div class="yaml-modal-footer-left">
                    <button class="yaml-btn yaml-btn-reset" id="yaml-config-reset">
                        恢复默认
                    </button>
                </div>
                <div class="yaml-modal-footer-right">
                    <button class="yaml-btn yaml-btn-secondary" id="yaml-config-cancel">
                        取消
                    </button>
                    <button class="yaml-btn yaml-btn-primary" id="yaml-config-save">
                        保存
                    </button>
                </div>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // 事件绑定
        const closeBtn = document.getElementById('yaml-modal-close');
        const cancelBtn = document.getElementById('yaml-config-cancel');
        const saveBtn = document.getElementById('yaml-config-save');
        const resetBtn = document.getElementById('yaml-config-reset');
        
        const autoInput = document.getElementById('yaml-config-auto');
        const ratioInput = document.getElementById('yaml-config-ratio');
        const linesInput = document.getElementById('yaml-config-lines');
        
        // 关闭动画
        function closeModal() {
            overlay.style.opacity = '0';
            modal.style.transform = 'translateY(50px)';
            setTimeout(() => overlay.remove(), 200);
        }
        
        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;
        
        // 点击遮罩关闭
        overlay.onclick = function(e) {
            if (e.target === overlay) {
                closeModal();
            }
        };
        
        // 保存配置
        saveBtn.onclick = function() {
            const newAuto = autoInput.checked;
            const newRatio = parseFloat(ratioInput.value);
            const newLines = parseInt(linesInput.value);
            
            // 验证
            if (isNaN(newRatio) || newRatio < 0.1 || newRatio > 1) {
                showToast('⚠️ YAML 特征占比必须在 0.1-1 之间', 'error');
                ratioInput.focus();
                return;
            }
            
            if (isNaN(newLines) || newLines < 1 || newLines > 20) {
                showToast('⚠️ 最少键值对行数必须在 1-20 之间', 'error');
                linesInput.focus();
                return;
            }
            
            // 保存配置
            CONFIG.AUTO_FORMAT = newAuto;
            CONFIG.MIN_YAML_RATIO = newRatio;
            CONFIG.MIN_KV_LINES = newLines;
            
            saveConfig();
            showToast('✓ 配置已保存并生效', 'success');
            closeModal();
            
            console.log('[YAML] New config applied:', CONFIG);
        };
        
        // 重置为默认
        resetBtn.onclick = function() {
            autoInput.checked = DEFAULT_CONFIG.AUTO_FORMAT;
            ratioInput.value = DEFAULT_CONFIG.MIN_YAML_RATIO;
            linesInput.value = DEFAULT_CONFIG.MIN_KV_LINES;
            
            showToast('✓ 已重置为默认值（未保存）', 'success');
        };
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
        }, 2500);
    }

    // ========== YAML 检测 ==========
    function detectYAML(text) {
        text = text.trim();
        
        if (text.length < 50) return false;
        
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 5) return false;
        
        let kvLines = 0;
        let listLines = 0;
        let commentLines = 0;
        let normalTextLines = 0;
        let htmlTags = 0;
        
        const hasJavaScript = /function\s*\(|var\s+|const\s+|let\s+|=>|console\.|import\s|export\s/.test(text);
        const hasHTML = /<(div|span|p|a|img|script|style|head|body|html|button|input|form)/i.test(text);
        const hasProse = /\.\s+[A-Z]/.test(text);
        const hasLongParagraph = lines.some(l => l.length > 200 && !/:\s/.test(l));
        const hasJSON = /^\s*[\{\[]/.test(text) || /[\}\]]\s*$/.test(text);
        
        if (hasJavaScript || hasHTML || hasProse || hasLongParagraph || hasJSON) {
            return false;
        }
        
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (/<[a-z][\s\S]*>/i.test(trimmed)) {
                htmlTags++;
                continue;
            }
            
            if (/^#/.test(trimmed)) {
                commentLines++;
                continue;
            }
            
            if (/^-\s+\S/.test(trimmed)) {
                listLines++;
                continue;
            }
            
            if (/^[a-zA-Z][a-zA-Z0-9_-]*\s*:\s*(\S.*)?$/.test(trimmed)) {
                kvLines++;
                continue;
            }
            
            if (/^\s+[a-zA-Z][a-zA-Z0-9_-]*\s*:\s*(\S.*)?$/.test(line)) {
                kvLines++;
                continue;
            }
            
            normalTextLines++;
        }
        
        const totalLines = lines.length;
        const yamlLines = kvLines + listLines + commentLines;
        const yamlRatio = yamlLines / totalLines;
        
        const isYAML = 
            kvLines >= CONFIG.MIN_KV_LINES &&
            yamlRatio >= CONFIG.MIN_YAML_RATIO &&
            htmlTags === 0 &&
            normalTextLines < totalLines * 0.15;
        
        if (isYAML || kvLines >= 3) {
            console.log('[YAML] Detection:', {
                totalLines,
                kvLines,
                yamlRatio: (yamlRatio * 100).toFixed(1) + '%',
                threshold: (CONFIG.MIN_YAML_RATIO * 100).toFixed(0) + '%',
                isYAML
            });
        }
        
        return isYAML;
    }

    function isPureConfigPage() {
        const body = document.body;
        if (!body) return false;
        
        const hasNavigation = body.querySelectorAll('nav, header, footer, aside, menu, [role="navigation"], [role="banner"]').length > 0;
        const hasLinks = body.querySelectorAll('a').length > 10;
        const hasForms = body.querySelectorAll('form, input[type="text"], input[type="email"], textarea').length > 2;
        const hasImages = body.querySelectorAll('img').length > 3;
        
        if (hasNavigation || hasLinks || hasForms || hasImages) return false;
        
        const bodyText = (body.textContent || '').trim();
        const textLength = bodyText.length;
        
        const visibleChildren = Array.from(body.children).filter(el => 
            el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'NOSCRIPT' &&
            !el.classList.contains('yaml-formatted') && !el.classList.contains('yaml-toast') &&
            !el.classList.contains('yaml-modal-overlay')
        ).length;
        
        return textLength > 100 && textLength < 100000 && visibleChildren < 5;
    }

    // ========== 文本处理 ==========
    function cleanText(text) {
        return text
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/格式化\s*YAML/g, '')
            .replace(/配置设置/g, '')
            .replace(/格式化$/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

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
            if (!trimmed || /[\u{1F300}-\u{1F9FF}]/u.test(trimmed)) continue;
            
            const leadingSpaces = line.match(/^\s*/)[0];
            
            if (trimmed.startsWith('#')) {
                formatted += leadingSpaces + '<span class="yaml-comment">' + esc(trimmed) + '</span>\n';
                continue;
            }
            
            if (/^-\s+\S/.test(trimmed)) {
                const match = trimmed.match(/^(-\s+)(.+)/);
                if (match) {
                    formatted += leadingSpaces + '<span class="yaml-key">' + match[1] + '</span>' + formatValue(match[2]) + '\n';
                }
                continue;
            }
            
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0 && /^[a-zA-Z][a-zA-Z0-9_-]*:/.test(trimmed)) {
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
        const kvCount = (singleLine.match(/[a-zA-Z][a-zA-Z0-9_-]*:/g) || []).length;
        if (singleLine.length < 200 || kvCount < 5) return text;
        
        console.log('[YAML] Splitting compressed format');
        let result = singleLine.replace(/\s+([a-zA-Z][a-zA-Z0-9_-]*):/g, '\n$1:');
        return result.replace(/^\n+/, '');
    }

    // ========== 处理和扫描 ==========
    function processElement(el, force) {
        if (!el || (!force && el.classList.contains('yaml-formatted'))) return false;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || 
            el.classList.contains('yaml-toast') || el.classList.contains('yaml-modal-overlay')) return false;
        
        let text = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.textContent || '');
        text = cleanText(text.trim());
        
        if (text.length < 50) return false;
        if (!force && !detectYAML(text)) return false;
        
        console.log('[YAML] Processing element:', el.tagName);
        
        try {
            const formatted = parseAndFormat(splitCompressedYAML(text));
            if (!formatted.trim()) return false;
            
            const pre = document.createElement('pre');
            pre.className = 'yaml-formatted';
            pre.innerHTML = formatted;
            
            if (el.tagName === 'BODY') {
                const toasts = Array.from(document.querySelectorAll('.yaml-toast, .yaml-modal-overlay'));
                requestAnimationFrame(() => {
                    el.innerHTML = '';
                    el.appendChild(pre);
                    toasts.forEach(t => el.appendChild(t));
                });
            } else if (el.parentNode) {
                requestAnimationFrame(() => {
                    el.parentNode.replaceChild(pre, el);
                });
            }
            
            console.log('[YAML] ✓ Formatted');
            return true;
        } catch (e) {
            console.error('[YAML] Error:', e);
            return false;
        }
    }

    function scanPage(force) {
        console.log('[YAML] Scanning...', force ? '(manual)' : '(auto)');
        
        if (!force) {
            if (!CONFIG.AUTO_FORMAT) return 0;
            if (!isPureConfigPage()) return 0;
        }
        
        let count = 0;
        
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
                    if (processElement(document.body, force)) {
                        return 1;
                    }
                }
            }
        }
        
        const candidates = [];
        const preCode = document.querySelectorAll('pre, code');
        
        for (let el of preCode) {
            if (!el.classList.contains('yaml-formatted') && (el.textContent || '').trim().length > 50) {
                candidates.push(el);
            }
        }
        
        if (candidates.length === 0) {
            const divs = document.querySelectorAll('div');
            for (let el of divs) {
                if (el.children.length <= 2 && (el.textContent || '').trim().length > 50) {
                    candidates.push(el);
                    if (candidates.length >= 5) break;
                }
            }
        }
        
        console.log('[YAML] Checking', candidates.length, 'candidates');
        
        for (let el of candidates) {
                        if (processElement(el, force)) {
                count++;
                break;
            }
        }
        
        console.log('[YAML] Result:', count, 'formatted');
        return count;
    }

    // ========== 菜单命令 ==========
    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('格式化 YAML', function() {
                console.log('[YAML] Manual format triggered');
                const count = scanPage(true);
                showToast(count > 0 ? '✓ 已格式化 ' + count + ' 个元素' : '✗ 未找到 YAML 内容', 
                         count > 0 ? 'success' : 'error');
            });
            
            GM_registerMenuCommand('配置设置', function() {
                console.log('[YAML] Config modal opened');
                showConfigModal();
            });
            
            console.log('[YAML] Menu commands registered');
        } else {
            console.warn('[YAML] GM_registerMenuCommand not available');
        }
    }

    // ========== 初始化 ==========
    function init() {
        loadConfig();
        addStyles();
        registerMenuCommands();
        
        if (CONFIG.AUTO_FORMAT) {
            console.log('[YAML] Auto-format enabled');
            setTimeout(() => {
                const count = scanPage(false);
                if (count > 0) {
                    console.log('[YAML] Auto-formatted', count, 'elements');
                }
            }, 500);
        } else {
            console.log('[YAML] Auto-format disabled, use menu to format manually');
        }
        
        console.log('[YAML] Ready - Current config:', CONFIG);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 100);
    }

    // ========== 全局函数 ==========
    window.yamlFormat = function() {
        const count = scanPage(true);
        showToast(count > 0 ? '✓ 已格式化 ' + count + ' 个元素' : '✗ 未找到 YAML 内容',
                 count > 0 ? 'success' : 'error');
        return count;
    };
    
    window.yamlConfig = function() {
        showConfigModal();
    };
    
    window.yamlGetConfig = function() {
        console.log('Current config:', CONFIG);
        return CONFIG;
    };

})();
