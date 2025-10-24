// ==UserScript==
// @name        Encoding Fixer
// @version     1.0.1
// @description Universal encoding problem detection and repair, suitable for all languages and content types, supports opening the encoding selection menu by pressing Cmd + Shift + E.
// @description:zh-CN 通用编码问题检测和修复，适用于所有语言和内容类型，支持按 Cmd + Shift + E 打开编码选择菜单。
// @license     MIT
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @namespace   https://github.com/ssfun
// @author      sfun
// @homepage    https://github.com/ssfun/userscripts
// @homepageURL https://github.com/ssfun/userscripts
// @downloadURL https://github.com/ssfun/userscripts/raw/refs/heads/main/encoding-fixer.user.js
// @updateURL   https://github.com/ssfun/userscripts/raw/refs/heads/main/encoding-fixer.user.js
// ==/UserScript==

(function() {
    'use strict';

    // 支持的编码列表
    const ENCODINGS = [
        'UTF-8',
        'GBK',
        'GB2312',
        'GB18030',
        'Big5',
        'Shift_JIS',
        'EUC-JP',
        'EUC-KR',
        'ISO-8859-1',
        'ISO-8859-2',
        'Windows-1252',
        'Windows-1251',
        'KOI8-R',
        'KOI8-U'
    ];

    // 通用乱码特征检测（不依赖具体内容）
    function analyzeTextQuality(text) {
        if (!text || text.length < 10) {
            return {
                score: 100,
                isGarbled: false,
                reason: 'Text too short'
            };
        }

        const analysis = {
            totalChars: text.length,
            replacementChars: 0,      // �
            controlChars: 0,          // 控制字符
            highBytes: 0,             // 高位字节异常组合
            isolatedHighBytes: 0,     // 孤立的高位字节
            validUnicode: 0,          // 有效 Unicode 字符
            printableAscii: 0,        // 可打印 ASCII
            suspiciousPatterns: 0,    // 可疑模式
            consecutiveHighBytes: 0,  // 连续高位字节
            brokenMultibyte: 0        // 破损的多字节字符
        };

        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            const char = text[i];

            // Unicode 替换字符
            if (code === 0xFFFD) {
                analysis.replacementChars++;
            }
            // 控制字符（除了常见的换行、制表符）
            else if (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
                analysis.controlChars++;
            }
            // 可打印 ASCII
            else if (code >= 0x20 && code <= 0x7E) {
                analysis.printableAscii++;
            }
            // 高位字节
            else if (code >= 0x80 && code <= 0xFF) {
                analysis.highBytes++;
                
                // 检测孤立的高位字节（前后都是 ASCII）
                const prevCode = i > 0 ? text.charCodeAt(i - 1) : 0;
                const nextCode = i < text.length - 1 ? text.charCodeAt(i + 1) : 0;
                
                if (prevCode < 0x80 && nextCode < 0x80) {
                    analysis.isolatedHighBytes++;
                }
            }
            // 有效的 Unicode 字符（BMP 平面）
            else if (code >= 0x100 && code <= 0xFFFF) {
                analysis.validUnicode++;
            }

            // 检测破损的多字节序列
            // UTF-8 代理对检测（错误的单个代理字符）
            if (code >= 0xD800 && code <= 0xDFFF) {
                analysis.brokenMultibyte++;
            }

            // 检测可疑的字符组合
            if (i < text.length - 1) {
                const next = text[i + 1];
                const nextCode = next.charCodeAt(0);

                // Latin-1 字符后跟高位字节（UTF-8 误判为 ISO-8859-1）
                if (code >= 0xC0 && code <= 0xFF && nextCode >= 0x80 && nextCode <= 0xBF) {
                    analysis.suspiciousPatterns++;
                }

                // 连续的高位字节
                if (code >= 0x80 && code <= 0xFF && nextCode >= 0x80 && nextCode <= 0xFF) {
                    analysis.consecutiveHighBytes++;
                }
            }
        }

        // 计算质量分数（0-100，越高越好）
        let score = 100;
        const len = analysis.totalChars;

        // 替换字符是最明显的乱码标志
        score -= (analysis.replacementChars / len) * 500;

        // 控制字符（非常不正常）
        score -= (analysis.controlChars / len) * 300;

        // 孤立的高位字节（可能是编码错误）
        score -= (analysis.isolatedHighBytes / len) * 200;

        // 破损的多字节序列
        score -= (analysis.brokenMultibyte / len) * 400;

        // 可疑模式（UTF-8 被误判）
        score -= (analysis.suspiciousPatterns / len) * 150;

        // 有效内容加分
        score += (analysis.printableAscii / len) * 20;
        score += (analysis.validUnicode / len) * 30;

        // 合理的连续高位字节（正常的多字节字符）
        const highByteRatio = analysis.consecutiveHighBytes / len;
        if (highByteRatio > 0.1 && highByteRatio < 0.7) {
            score += 10; // 可能是正常的非 ASCII 文本
        }

        score = Math.max(0, Math.min(100, score));

        return {
            score: score,
            isGarbled: score < 70,
            details: analysis,
            reason: getGarbledReason(analysis, len)
        };
    }

    // 分析乱码原因
    function getGarbledReason(analysis, totalLen) {
        const reasons = [];
        
        if (analysis.replacementChars > 0) {
            reasons.push(`${analysis.replacementChars} 个替换字符`);
        }
        if (analysis.controlChars > totalLen * 0.01) {
            reasons.push('异常控制字符');
        }
        if (analysis.isolatedHighBytes > totalLen * 0.05) {
            reasons.push('孤立字节');
        }
        if (analysis.suspiciousPatterns > totalLen * 0.05) {
            reasons.push('可疑编码模式');
        }
        if (analysis.brokenMultibyte > 0) {
            reasons.push('破损的字符');
        }

        return reasons.length > 0 ? reasons.join(', ') : '未知原因';
    }

    // 评估解码质量
    function evaluateDecoding(bytes, encoding) {
        try {
            const decoder = new TextDecoder(encoding, { fatal: false });
            const decoded = decoder.decode(bytes);
            
            const quality = analyzeTextQuality(decoded);
            
            // 额外的编码特定检查
            let bonus = 0;
            
            // 检测字符多样性（正常文本应该有多样的字符）
            const uniqueChars = new Set(decoded).size;
            const diversity = uniqueChars / decoded.length;
            if (diversity > 0.1 && diversity < 0.9) {
                bonus += 10;
            }

            // 检测空白字符比例（正常文本应该有合理的空白）
            const whitespaceCount = (decoded.match(/\s/g) || []).length;
            const whitespaceRatio = whitespaceCount / decoded.length;
            if (whitespaceRatio > 0.05 && whitespaceRatio < 0.5) {
                bonus += 5;
            }

            // 检测标点符号（任何语言都有标点）
            const punctuation = (decoded.match(/[,.:;!?'"()\[\]{}<>\/\\|@#$%^&*+=\-_~`]/g) || []).length;
            const punctRatio = punctuation / decoded.length;
            if (punctRatio > 0.01 && punctRatio < 0.3) {
                bonus += 5;
            }

            // 检测换行符（结构化文本的标志）
            const lines = decoded.split('\n').length;
            if (lines > 1 && lines < decoded.length / 10) {
                bonus += 5;
            }

            const finalScore = Math.min(100, quality.score + bonus);

            return {
                encoding: encoding,
                score: finalScore,
                quality: quality,
                preview: decoded.substring(0, 150)
            };

        } catch (e) {
            return {
                encoding: encoding,
                score: 0,
                quality: { isGarbled: true, reason: e.message },
                preview: ''
            };
        }
    }

    // 检测最佳编码
    function detectBestEncoding(bytes) {
        console.log('[编码检测] 开始分析...');
        
        const results = ENCODINGS.map(enc => evaluateDecoding(bytes, enc));
        
        // 按分数排序
        results.sort((a, b) => b.score - a.score);

        // 打印分析结果
        console.log('[编码检测] 评分结果:');
        results.forEach((result, index) => {
            if (index < 5) { // 只显示前5个
                console.log(`  ${index + 1}. ${result.encoding}: ${result.score.toFixed(1)} 分`);
                console.log(`     预览: ${result.preview.substring(0, 80)}...`);
            }
        });

        const best = results[0];
        console.log(`[编码检测] 最佳编码: ${best.encoding} (${best.score.toFixed(1)} 分)`);
        
        return best.encoding;
    }

    // 修复编码并保持格式
    function fixEncoding(targetEncoding = null) {
        return new Promise((resolve, reject) => {
            const url = window.location.href;
            
            console.log('[编码修复] 开始处理...');
            showNotification('🔄 正在重新加载页面...', false, 0);

            fetch(url, {
                credentials: 'include',
                cache: 'reload',
                headers: {
                    'Accept': '*/*'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                const bytes = new Uint8Array(buffer);
                
                // 自动检测编码
                if (!targetEncoding) {
                    targetEncoding = detectBestEncoding(bytes);
                } else {
                    console.log(`[编码修复] 使用指定编码: ${targetEncoding}`);
                }
                
                // 解码
                const decoder = new TextDecoder(targetEncoding);
                const decodedContent = decoder.decode(bytes);
                
                // 检测内容类型
                const contentType = document.contentType || '';
                const isPlainText = contentType.includes('text/plain');
                const hasPreTag = document.querySelector('pre') !== null;
                
                if (isPlainText || hasPreTag) {
                    // 纯文本：保持格式
                    let targetElement = document.querySelector('pre');
                    
                    if (!targetElement) {
                        // 如果没有 pre 标签，创建一个
                        targetElement = document.createElement('pre');
                        targetElement.style.cssText = `
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            font-family: monospace;
                            margin: 0;
                            padding: 10px;
                        `;
                        document.body.innerHTML = '';
                        document.body.appendChild(targetElement);
                    }
                    
                    targetElement.textContent = decodedContent;
                    console.log('[编码修复] 已更新纯文本内容');
                } else {
                    // HTML 内容：完整替换
                    document.open();
                    document.write(decodedContent);
                    document.close();
                    console.log('[编码修复] 已重新加载 HTML');
                }
                
                // 更新 charset 元标签
                updateCharset(targetEncoding);
                
                // 验证修复效果
                setTimeout(() => {
                    const newText = document.body.innerText.substring(0, 2000);
                    const newQuality = analyzeTextQuality(newText);
                    
                    if (newQuality.score > 70) {
                        showNotification(`✅ 修复成功: ${targetEncoding} (质量: ${newQuality.score.toFixed(0)}/100)`, false);
                    } else {
                        showNotification(`⚠️ 修复完成: ${targetEncoding} (质量: ${newQuality.score.toFixed(0)}/100)\n可能需要尝试其他编码`, false);
                    }
                }, 100);
                
                resolve(targetEncoding);
            })
            .catch(error => {
                console.error('[编码修复] 失败:', error);
                showNotification(`❌ 修复失败: ${error.message}`, true);
                reject(error);
            });
        });
    }

    // 更新字符集声明
    function updateCharset(encoding) {
        let meta = document.querySelector('meta[charset]') || 
                   document.querySelector('meta[http-equiv="Content-Type" i]');
        
        if (meta) {
            if (meta.hasAttribute('charset')) {
                meta.setAttribute('charset', encoding);
            } else {
                meta.setAttribute('content', `text/html; charset=${encoding}`);
            }
        } else {
            meta = document.createElement('meta');
            meta.setAttribute('charset', encoding);
            if (document.head) {
                document.head.insertBefore(meta, document.head.firstChild);
            }
        }
    }

    // 显示通知
    function showNotification(message, isError = false, autoClose = 3000) {
        const oldNotif = document.getElementById('encoding-fix-notification');
        if (oldNotif) oldNotif.remove();
        
        const notification = document.createElement('div');
        notification.id = 'encoding-fix-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${isError ? '#f44336' : '#4CAF50'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.3);
            z-index: 2147483647;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            animation: slideInRight 0.3s ease-out;
            max-width: 400px;
            line-height: 1.5;
            white-space: pre-line;
        `;
        
        notification.textContent = message;
        
        if (!document.getElementById('encoding-fix-style')) {
            const style = document.createElement('style');
            style.id = 'encoding-fix-style';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(450px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(notification);
        
        if (autoClose > 0) {
            setTimeout(() => {
                notification.style.transition = 'all 0.3s';
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(450px)';
                setTimeout(() => notification.remove(), 300);
            }, autoClose);
        }
    }

    // 创建编码选择菜单
    function createEncodingMenu() {
        const oldMenu = document.getElementById('encoding-fix-menu');
        if (oldMenu) oldMenu.remove();
        
        const overlay = document.createElement('div');
        overlay.style.cssText = `
                        position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 2147483646;
            animation: fadeIn 0.2s;
        `;
        
        const menu = document.createElement('div');
        menu.id = 'encoding-fix-menu';
        menu.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border-radius: 12px;
            padding: 24px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            min-width: 400px;
            max-width: 90%;
            max-height: 85vh;
            overflow-y: auto;
            animation: scaleIn 0.2s ease-out;
        `;
        
        if (!document.getElementById('menu-animation-style')) {
            const style = document.createElement('style');
            style.id = 'menu-animation-style';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { 
                        transform: translate(-50%, -50%) scale(0.9);
                        opacity: 0;
                    }
                    to { 
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 1;
                    }
                }
                .encoding-btn {
                    padding: 12px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    background: white;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 14px;
                    font-weight: 500;
                    color: #333;
                }
                .encoding-btn:hover {
                    border-color: #2196F3;
                    background: #f0f7ff;
                    transform: translateY(-2px);
                    box-shadow: 0 2px 8px rgba(33,150,243,0.3);
                }
            `;
            document.head.appendChild(style);
        }
        
        // 分析当前页面
        const currentText = (document.body?.innerText || '').substring(0, 2000);
        const currentQuality = analyzeTextQuality(currentText);
        
        menu.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 20px; color: #333; font-weight: 600;">
                🔧 编码修复工具
            </h3>
            
            <div style="margin-bottom: 20px; padding: 14px; background: ${currentQuality.isGarbled ? '#fff3e0' : '#e8f5e9'}; border-radius: 8px; border-left: 4px solid ${currentQuality.isGarbled ? '#ff9800' : '#4caf50'};">
                <div style="font-size: 13px; color: #555; margin-bottom: 8px;">
                    <strong>当前页面分析：</strong>
                </div>
                <div style="font-size: 14px; color: #333; font-weight: 600; margin-bottom: 6px;">
                    质量评分: <span style="color: ${currentQuality.score >= 70 ? '#4caf50' : '#ff9800'};">${currentQuality.score.toFixed(0)}/100</span>
                </div>
                <div style="font-size: 12px; color: #666;">
                    ${currentQuality.isGarbled ? 
                        `⚠️ 检测到乱码 (${currentQuality.reason})` : 
                        '✅ 页面显示正常'}
                </div>
                ${currentQuality.details.replacementChars > 0 ? 
                    `<div style="font-size: 12px; color: #d32f2f; margin-top: 4px;">
                        发现 ${currentQuality.details.replacementChars} 个无法显示的字符
                    </div>` : ''}
            </div>
            
            <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; color: #666; margin-bottom: 10px; font-weight: 500;">
                    💡 ${currentQuality.isGarbled ? '建议尝试以下编码：' : '您可以手动选择编码或使用自动检测：'}
                </div>
                <div id="encoding-buttons" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px;">
                    ${ENCODINGS.map(enc => `
                        <button class="encoding-btn" data-encoding="${enc}">
                            ${enc}
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <button id="auto-detect-btn" style="
                width: 100%;
                padding: 14px;
                border: none;
                border-radius: 8px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                cursor: pointer;
                font-size: 15px;
                font-weight: 600;
                margin-bottom: 10px;
                transition: all 0.2s;
                box-shadow: 0 2px 8px rgba(102,126,234,0.4);
            " onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 12px rgba(102,126,234,0.6)'"
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(102,126,234,0.4)'">
                🔍 智能检测最佳编码
            </button>
            
            <button id="close-menu-btn" style="
                width: 100%;
                padding: 11px;
                border: 1px solid #ddd;
                border-radius: 8px;
                background: white;
                cursor: pointer;
                font-size: 14px;
                color: #666;
                transition: all 0.2s;
            " onmouseover="this.style.background='#f5f5f5'"
               onmouseout="this.style.background='white'">
                取消
            </button>
        `;
        
        document.body.appendChild(overlay);
        document.body.appendChild(menu);
        
        // 绑定编码按钮事件
        menu.querySelectorAll('.encoding-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const encoding = btn.dataset.encoding;
                overlay.remove();
                menu.remove();
                fixEncoding(encoding);
            });
        });
        
        // 自动检测按钮
        document.getElementById('auto-detect-btn').addEventListener('click', () => {
            overlay.remove();
            menu.remove();
            fixEncoding();
        });
        
        // 关闭按钮
        const closeMenu = () => {
            overlay.style.opacity = '0';
            menu.style.opacity = '0';
            menu.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => {
                overlay.remove();
                menu.remove();
            }, 200);
        };
        
        document.getElementById('close-menu-btn').addEventListener('click', closeMenu);
        overlay.addEventListener('click', closeMenu);
        
        // ESC 键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeMenu();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // 添加快捷键支持
    document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + Shift + E
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            createEncodingMenu();
        }
    });

    // 页面加载后自动检测
    function autoDetectOnLoad() {
        setTimeout(() => {
            const bodyText = document.body?.innerText || '';
            const preText = document.querySelector('pre')?.textContent || '';
            const sampleText = (preText || bodyText).substring(0, 3000);
            
            if (sampleText.length === 0) {
                console.log('[编码检测] 页面内容为空，跳过检测');
                return;
            }
            
            const quality = analyzeTextQuality(sampleText);
            
            console.log('[编码检测] 页面质量分析:');
            console.log(`  [编码检测] 质量评分: ${quality.score.toFixed(1)}/100`);
            console.log(`  [编码检测] 是否乱码: ${quality.isGarbled ? '是' : '否'}`);
            console.log(`  [编码检测] 原因: ${quality.reason}`);
            console.log(`  [编码检测] 详细信息:`, quality.details);
            
            const autoFix = GM_getValue('autoFix', false);
            const autoFixThreshold = GM_getValue('autoFixThreshold', 60);
            
            if (quality.isGarbled && quality.score < autoFixThreshold) {
                if (autoFix) {
                    console.log('[编码检测] 质量分数过低，触发自动修复');
                    setTimeout(() => fixEncoding(), 300);
                } else {
                    console.log('[编码检测] 检测到编码问题，但自动修复已禁用');
                    showNotification(
                        `⚠️ 检测到编码问题\n质量: ${quality.score.toFixed(0)}/100\n\n按 Cmd+Shift+E 修复`,
                        false,
                        5000
                    );
                }
            } else {
                console.log('[编码检测] 页面质量良好，无需修复');
            }
        }, 800);
    }

    // 监听页面加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoDetectOnLoad);
    } else {
        autoDetectOnLoad();
    }

    // 注册用户脚本菜单命令
    if (typeof GM_registerMenuCommand !== 'undefined') {
        GM_registerMenuCommand('🔧 打开编码修复面板', createEncodingMenu);
        GM_registerMenuCommand('🔍 智能检测并修复', () => fixEncoding());
        
        // 自动修复开关
        const autoFix = GM_getValue('autoFix', false);
        GM_registerMenuCommand(
            (autoFix ? '✅' : '⬜') + ' 自动修复乱码',
            () => {
                const newValue = !autoFix;
                GM_setValue('autoFix', newValue);
                showNotification(
                    newValue ? '✅ 已启用自动修复' : '⬜ 已禁用自动修复'
                );
            }
        );
        
        // 设置检测阈值
        GM_registerMenuCommand('⚙️ 设置检测阈值', () => {
            const currentThreshold = GM_getValue('autoFixThreshold', 60);
            const newThreshold = prompt(
                '设置自动修复的质量阈值 (0-100)\n低于此分数将触发自动修复\n\n当前值: ' + currentThreshold,
                currentThreshold
            );
            
            if (newThreshold !== null) {
                const value = parseInt(newThreshold);
                if (value >= 0 && value <= 100) {
                    GM_setValue('autoFixThreshold', value);
                    showNotification(`✅ 阈值已设置为 ${value}`);
                } else {
                    showNotification('❌ 请输入 0-100 之间的数字', true);
                }
            }
        });
        
        // 显示页面质量分析
        GM_registerMenuCommand('📊 查看页面质量', () => {
            const text = (document.body?.innerText || '').substring(0, 3000);
            const quality = analyzeTextQuality(text);
            
            alert(
                `页面质量分析\n\n` +
                `质量评分: ${quality.score.toFixed(1)}/100\n` +
                `状态: ${quality.isGarbled ? '❌ 检测到乱码' : '✅ 显示正常'}\n` +
                `${quality.isGarbled ? '原因: ' + quality.reason + '\n' : ''}\n` +
                `详细信息:\n` +
                `- 总字符数: ${quality.details.totalChars}\n` +
                `- 替换字符: ${quality.details.replacementChars}\n` +
                `- 控制字符: ${quality.details.controlChars}\n` +
                `- 可疑模式: ${quality.details.suspiciousPatterns}\n` +
                `- 有效 Unicode: ${quality.details.validUnicode}\n` +
                `- 可打印 ASCII: ${quality.details.printableAscii}`
            );
        });
    }

    // 添加右键菜单支持（如果页面允许）
    document.addEventListener('contextmenu', (e) => {
        // 检查是否按住 Alt 键
        if (e.altKey) {
            e.preventDefault();
            createEncodingMenu();
        }
    });

})();
