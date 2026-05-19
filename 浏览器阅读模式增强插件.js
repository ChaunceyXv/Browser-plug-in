// ==UserScript==
// @name         阅读模式增强插件
// @namespace    https://viayoo.com/
// @version      12.27.17
// @match        *://*/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = "reader_mode_settings";
    const CUSTOM_RULES_KEY = "reader_custom_rules";
    const AUTO_ENTER_KEY = "auto_enter_rules";

    let settings = GM_getValue(STORAGE_KEY, {
        fontSize: 16,
        theme: "#e3edcd-#000",
        clickPage: false
    });

    let customRules = GM_getValue(CUSTOM_RULES_KEY, {});
    let autoEnterRules = GM_getValue(AUTO_ENTER_KEY, {});

    const themes = "#e3edcd-#000;#fce4ec-#880e4f;#CCE2BF-green;#e0f2f1-#004d40;#494949-#C1C1C1;#1a1c23-#c6c7c8;#000000-#bbbbbb;#C7EDCC-#000;#DCECD2-#000;#f4f0e9-#333;#ffffff-#000;#f4f0e9-#333-paper";
    const themeNames = ["浅米绿","浅粉红","浅绿","浅青绿","深灰夜","蓝灰夜","纯黑夜","淡绿","淡黄绿","米白纸","纯白","仿纸纹理"];

    function saveSettings() { GM_setValue(STORAGE_KEY, settings); }
    function saveRules() { GM_setValue(CUSTOM_RULES_KEY, customRules); }
    function saveAutoEnter() { GM_setValue(AUTO_ENTER_KEY, autoEnterRules); }
    
    function getDomain() { 
        const hostname = window.location.hostname;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
        const parts = hostname.split('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    }
    
    function getDomainFromUrl(url) {
        try {
            const hostname = new URL(url).hostname;
            if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return hostname;
            const parts = hostname.split('.');
            return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
        } catch(e) {
            return getDomain();
        }
    }
    
    function getPageKey() {
        return window.location.origin + window.location.pathname;
    }

    // 迁移旧的全局 autoEnter
    if (settings.autoEnter !== undefined) {
        const domain = getDomain();
        if (!autoEnterRules[domain]) {
            autoEnterRules[domain] = settings.autoEnter;
            saveAutoEnter();
        }
        delete settings.autoEnter;
        saveSettings();
    }

    // ================== 手动退出标记处理 ==================
    const manualExitKey = 'reader_manual_exit_' + getPageKey();
    const exitFlag = GM_getValue(manualExitKey, 0);
    const now = Date.now();
    
    let skipAutoEnter = false;
    if (exitFlag && (now - exitFlag < 3000)) {
        skipAutoEnter = true;
        console.log('[阅读模式] 检测到手动退出标记，本次跳过自动进入');
        setTimeout(() => {
            const currentFlag = GM_getValue(manualExitKey, 0);
            if (currentFlag === exitFlag) {
                GM_setValue(manualExitKey, 0);
            }
        }, 10000);
    } else if (exitFlag) {
        GM_setValue(manualExitKey, 0);
    }

    const cfgStyle = `
        #via-cfg-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; }
        .via-box { position: relative; width: 85%; max-width: 350px; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .via-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #000; border-bottom: 1px solid #eee; padding-bottom: 10px; padding-right: 30px; }
        .via-close { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #666; transition: 0.2s; }
        .via-close:hover { background: rgba(0,0,0,0.2); color: #000; }
        .via-label { font-size: 13px; color: #666; display: block; margin-bottom: 5px; }
        .via-input { width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; margin-bottom: 15px; font-size: 10px; box-sizing: border-box; outline: none; }
        .toggle-switch { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; flex-wrap: wrap; }
        .toggle-switch span { font-size: 14px; color: #333; }
        .toggle-label { position: relative; display: inline-block; width: 50px; height: 24px; }
        .toggle-label input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.3s; border-radius: 24px; }
        .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; }
        input:checked + .toggle-slider { background-color: #4CAF50; }
        input:checked + .toggle-slider:before { transform: translateX(26px); }
        .via-hint { font-size: 11px; color: #888; margin-top: 4px; width: 100%; }
        .via-btn { display: block; width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; background: #f8f8f8; color: #333; font-size: 14px; cursor: pointer; margin-bottom: 15px; transition: 0.2s; text-align: center; }
        .via-btn:hover { background: #eee; }
        .via-btn-primary { background: #4CAF50; color: #fff; border: none; font-weight: bold; }
        .via-btn-primary:hover { background: #45a049; }
        .via-back { position: absolute; top: 12px; left: 12px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #666; transition: 0.2s; }
        .via-back:hover { background: rgba(0,0,0,0.2); color: #000; }
        .site-list { max-height: 60vh; overflow-y: auto; margin-bottom: 15px; }
        .site-item { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; }
        .site-item:last-child { border-bottom: none; }
        .site-info { flex: 1; min-width: 0; }
        .site-domain { font-size: 14px; font-weight: bold; color: #333; }
        .site-detail { font-size: 11px; color: #999; margin-top: 2px; }
        .site-auto-row { display: flex; align-items: center; gap: 4px; flex-shrink: 0; margin: 0 12px; }
        .site-auto-label { font-size: 12px; color: #666; white-space: nowrap; }
        .site-delete-text { font-size: 13px; color: #ff4444; cursor: pointer; flex-shrink: 0; padding: 4px 8px; border-radius: 4px; transition: 0.2s; }
        .site-delete-text:hover { background: rgba(255,0,0,0.1); }
        .empty-state { text-align: center; padding: 30px 0; color: #999; font-size: 14px; }
        .site-count { font-size: 12px; color: #999; margin-bottom: 10px; }
    `;
    GM_addStyle(cfgStyle);

    // ================== 安全的 HTML 转义函数 ==================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML.replace(/"/g, '&quot;');
    }

    // ================== 配置面板 ==================
    function showViaConfig(targetDomain) {
        const domain = targetDomain || getDomain();
        
        const existingManager = document.getElementById('via-site-manager');
        if (existingManager) existingManager.remove();

        if (document.getElementById('via-cfg-mask')) return;
        
        const rule = customRules[domain] || { title: '', content: '', next: '', filter: '' };
        const autoEnterEnabled = !!autoEnterRules[domain];

        // 正文内容选择器的 placeholder 逻辑
        let contentPlaceholder = '';
        if (rule.content) {
            contentPlaceholder = '自定义';
        } else if (window._savedContentSelector) {
            contentPlaceholder = window._savedContentSelector;
        } else {
            contentPlaceholder = '示例：#content, .article-content, [id^="cont"]';
        }

        const mask = document.createElement('div');
        mask.id = 'via-cfg-mask';
        mask.innerHTML = `
            <div class="via-box">
                <div class="via-close">✕</div>
                <div class="via-title">⚙️ 配置面板 - ${escapeHtml(domain)}</div>
                <button class="via-btn via-btn-primary" id="site-manager-btn">📋 网址管理</button>
                <div class="toggle-switch">
                    <span>点击翻页</span>
                    <label class="toggle-label">
                        <input type="checkbox" id="click-page-toggle" ${settings.clickPage ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div class="toggle-switch">
                    <span>自动进入阅读模式</span>
                    <label class="toggle-label">
                        <input type="checkbox" id="auto-enter-toggle" ${autoEnterEnabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="via-hint">自动阅读模式已匹配大部分规则，非正文误判请自定义正文选择器来规避</div>
                </div>
                <span class="via-label">章节标题选择器</span>
                <input type="text" id="via-t" class="via-input" placeholder="示例：.chapter-title" value="${escapeHtml(rule.title || '')}">
                <span class="via-label">正文内容选择器</span>
                <input type="text" id="via-c" class="via-input" placeholder="${contentPlaceholder}" value="${escapeHtml(rule.content || '')}">
                <span class="via-label">下一页选择器</span>
                <input type="text" id="via-n" class="via-input" placeholder="示例：.next-page 或 regex:第\\s*[\\d一二三]+\\s*节" value="${escapeHtml(rule.next || '')}">
                <span class="via-label">过滤选择器（与内置规则同时生效）</span>
                <input type="text" id="via-f" class="via-input" placeholder="示例：.ad, .banner, .tips, .share" value="${escapeHtml(rule.filter || '')}">
            </div>`;
        document.body.appendChild(mask);

        const clickPageToggle = document.getElementById('click-page-toggle');
        const autoEnterToggle = document.getElementById('auto-enter-toggle');
        const titleInput = document.getElementById('via-t');
        const contentInput = document.getElementById('via-c');
        const nextInput = document.getElementById('via-n');
        const filterInput = document.getElementById('via-f');
        const closeBtn = mask.querySelector('.via-close');
        const siteManagerBtn = document.getElementById('site-manager-btn');

        function saveCurrentRules() {
            const t = titleInput.value.trim();
            const c = contentInput.value.trim();
            const n = nextInput.value.trim();
            const f = filterInput.value.trim();
            if (!t && !c && !n && !f) {
                delete customRules[domain];
            } else {
                customRules[domain] = { title: t, content: c, next: n, filter: f };
            }
            saveRules();
        }

        clickPageToggle.onchange = () => {
            settings.clickPage = clickPageToggle.checked;
            saveSettings();
        };
        autoEnterToggle.onchange = () => {
            autoEnterRules[domain] = autoEnterToggle.checked;
            saveAutoEnter();
        };

        titleInput.addEventListener('blur', saveCurrentRules);
        contentInput.addEventListener('blur', saveCurrentRules);
        nextInput.addEventListener('blur', saveCurrentRules);
        filterInput.addEventListener('blur', saveCurrentRules);

        closeBtn.onclick = () => {
            saveCurrentRules();
            mask.remove();
        };

        siteManagerBtn.onclick = () => {
            saveCurrentRules();
            showSiteManager();
        };
    }

    function showSiteManager() {
        const cfgMask = document.getElementById('via-cfg-mask');
        if (cfgMask) cfgMask.remove();

        if (document.getElementById('via-site-manager')) return;

        const allDomains = new Set();
        for (let d in customRules) allDomains.add(d);
        for (let d in autoEnterRules) allDomains.add(d);

        const mask = document.createElement('div');
        mask.id = 'via-site-manager';
        mask.style.cssText = 'position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif;';

        let siteListHTML = '';
        if (allDomains.size === 0) {
            siteListHTML = '<div class="empty-state">📭 暂无已配置的网址</div>';
        } else {
            const domains = Array.from(allDomains).sort();
            domains.forEach(domain => {
                const rule = customRules[domain] || {};
                const autoEnabled = !!autoEnterRules[domain];
                
                let detailParts = [];
                if (rule.title) detailParts.push('标题规则');
                if (rule.content) detailParts.push('正文规则');
                if (rule.next) detailParts.push('翻页规则');
                if (rule.filter) detailParts.push('过滤规则');
                const detail = detailParts.length > 0 ? detailParts.join(' · ') : '';

                siteListHTML += `
                    <div class="site-item" data-domain="${escapeHtml(domain)}">
                        <div class="site-info site-domain-clickable" data-domain="${escapeHtml(domain)}">
                            <div class="site-domain">${escapeHtml(domain)}</div>
                            ${detail ? `<div class="site-detail">${escapeHtml(detail)}</div>` : ''}
                        </div>
                        <div class="site-auto-row">
                            <span class="site-auto-label">自动阅读</span>
                            <label class="toggle-label">
                                <input type="checkbox" class="site-auto-toggle" data-domain="${escapeHtml(domain)}" ${autoEnabled ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <span class="site-delete-text" data-domain="${escapeHtml(domain)}">删除</span>
                    </div>`;
            });
        }

        mask.innerHTML = `
            <div class="via-box" style="max-width: 420px;">
                <div class="via-back" id="site-manager-back">←</div>
                <div class="via-close" id="site-manager-close">✕</div>
                <div class="via-title" style="padding-left: 30px;">📋 网址管理</div>
                <div class="site-count">共 ${allDomains.size} 个网址</div>
                <div class="site-list">${siteListHTML}</div>
                <button class="via-btn" id="clear-all-btn" style="color:#ff4444; border-color:#ff4444;">🗑️ 清空全部配置</button>
            </div>`;
        document.body.appendChild(mask);

        document.getElementById('site-manager-back').onclick = () => {
            mask.remove();
            showViaConfig();
        };

        document.getElementById('site-manager-close').onclick = () => {
            mask.remove();
        };

        mask.querySelectorAll('.site-auto-toggle').forEach(toggle => {
            toggle.onchange = () => {
                const domain = toggle.getAttribute('data-domain');
                autoEnterRules[domain] = toggle.checked;
                saveAutoEnter();
            };
        });

        mask.querySelectorAll('.site-domain-clickable').forEach(el => {
            el.style.cursor = 'pointer';
            el.onclick = () => {
                const domain = el.getAttribute('data-domain');
                mask.remove();
                showViaConfig(domain);
            };
        });

        mask.querySelectorAll('.site-delete-text').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const domain = btn.getAttribute('data-domain');
                if (confirm(`确定要删除 ${domain} 的所有配置吗？`)) {
                    delete customRules[domain];
                    delete autoEnterRules[domain];
                    saveRules();
                    saveAutoEnter();
                    mask.remove();
                    showSiteManager();
                }
            };
        });

        document.getElementById('clear-all-btn').onclick = () => {
            if (confirm('确定要清空所有网址的配置吗？此操作不可恢复！')) {
                customRules = {};
                autoEnterRules = {};
                saveRules();
                saveAutoEnter();
                mask.remove();
                showSiteManager();
            }
        };
    }

    GM_registerMenuCommand("⚙️ 配置面板", () => showViaConfig());

    // ================== 创建阅读按钮 ==================
    function createReaderButton() {
        if (document.getElementById("txtyd")) return;
        
        const btn = document.createElement("div");
        btn.id = "txtyd";
        btn.innerHTML = "📖";
        btn.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            cursor: grab;
            font-size: 28px;
            user-select: none;
            transition: transform 0.3s ease;
            touch-action: none;
        `;
        document.body.appendChild(btn);

        const savedPos = GM_getValue("reader_btn_pos", null);
        let btnLeft = 0, btnTop = 0;
        let isHidden = false;

        function getHideDirection() {
            const rect = btn.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const screenWidth = window.innerWidth;
            return centerX < screenWidth / 2 ? 'left' : 'right';
        }

        function applyHideShow() {
            if (isHidden) {
                const dir = getHideDirection();
                if (dir === 'left') {
                    btn.style.transform = "translateX(calc(-100% - 100vw))";
                } else {
                    btn.style.transform = "translateX(calc(100% + 100vw))";
                }
            } else {
                btn.style.transform = "translateX(0)";
            }
        }

        const setButtonBasePosition = (left, top) => {
            const maxX = window.innerWidth - btn.offsetWidth;
            const maxY = window.innerHeight - btn.offsetHeight;
            btnLeft = Math.min(Math.max(0, left), maxX);
            btnTop = Math.min(Math.max(0, top), maxY);
            btn.style.left = btnLeft + "px";
            btn.style.top = btnTop + "px";
            btn.style.right = "auto";
            btn.style.bottom = "auto";
            applyHideShow();
        };

        if (savedPos && typeof savedPos.left === "number" && typeof savedPos.top === "number") {
            setButtonBasePosition(savedPos.left, savedPos.top);
        } else {
            const defaultLeft = window.innerWidth - 45 - 20;
            const defaultTop = window.innerHeight - 45 - 20;
            setButtonBasePosition(defaultLeft, defaultTop);
            GM_setValue("reader_btn_pos", { left: btnLeft, top: btnTop });
        }

        let startY = 0;
        window.addEventListener('touchstart', e => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        window.addEventListener('touchend', e => {
            if (isDragging) return;
            let diff = startY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 25) {
                if (diff < 0) {
                    if (isHidden) {
                        isHidden = false;
                        applyHideShow();
                    }
                } else {
                    if (!isHidden) {
                        isHidden = true;
                        applyHideShow();
                    }
                }
            }
        }, { passive: true });

        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let dragStartLeft = 0, dragStartTop = 0;
        let hasMoved = false;
        let dragAnimationFrame = null;
        let longPressTimer = null;
        let isLongPressed = false;
        const LONG_PRESS_DURATION = 500;
        const MOVE_TOLERANCE = 10;

        const clearLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        const onLongPress = () => {
            isLongPressed = true;
            showViaConfig();
        };

        const onDragStart = (e) => {
            e.stopPropagation();
            if (isHidden) {
                isHidden = false;
                applyHideShow();
            }
            const clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            const clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
            if (clientX === undefined) return;
            dragStartX = clientX;
            dragStartY = clientY;
            dragStartLeft = btnLeft;
            dragStartTop = btnTop;
            isDragging = true;
            hasMoved = false;
            isLongPressed = false;
            btn.style.cursor = "grabbing";
            btn.style.transition = "none";
            if (e.cancelable) e.preventDefault();
            document.body.style.userSelect = 'none';
            clearLongPress();
            longPressTimer = setTimeout(() => {
                if (isDragging && !isLongPressed) {
                    onLongPress();
                }
            }, LONG_PRESS_DURATION);
        };

        const onDragMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            e.stopPropagation();
            let clientX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
            let clientY = e.clientY ?? (e.touches ? e.touches[0].clientY : 0);
            if (clientX === undefined) return;
            
            let dx = clientX - dragStartX;
            let dy = clientY - dragStartY;
            let distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance > MOVE_TOLERANCE) {
                clearLongPress();
                if (!hasMoved) hasMoved = true;
                if (dragAnimationFrame) cancelAnimationFrame(dragAnimationFrame);
                dragAnimationFrame = requestAnimationFrame(() => {
                    setButtonBasePosition(dragStartLeft + dx, dragStartTop + dy);
                });
            }
        };

        const onDragEnd = (e) => {
            if (!isDragging) return;
            clearLongPress();
            if (dragAnimationFrame) cancelAnimationFrame(dragAnimationFrame);
            isDragging = false;
            btn.style.cursor = "grab";
            btn.style.transition = "transform 0.3s ease";
            document.body.style.userSelect = '';
            if (hasMoved) {
                GM_setValue("reader_btn_pos", { left: btnLeft, top: btnTop });
            }
            if (!hasMoved && !isLongPressed) {
                enterReaderMode();
            }
            hasMoved = false;
            isLongPressed = false;
        };

        btn.addEventListener("mousedown", onDragStart);
        window.addEventListener("mousemove", onDragMove);
        window.addEventListener("mouseup", onDragEnd);
        btn.addEventListener("touchstart", onDragStart, { passive: false });
        window.addEventListener("touchmove", onDragMove, { passive: false });
        window.addEventListener("touchend", onDragEnd);
        btn.addEventListener("contextmenu", (e) => e.preventDefault());

        window.addEventListener("resize", () => {
            if (btnLeft !== undefined) {
                setButtonBasePosition(btnLeft, btnTop);
                GM_setValue("reader_btn_pos", { left: btnLeft, top: btnTop });
            }
        });
    }

    // ================== 自动进入阅读模式检测 ==================
    function tryAutoEnter() {
        if (!autoEnterRules[getDomain()] || skipAutoEnter) return;
        if (window._readingModeActive || document.getElementById("reader-toolbar")) return;
        
        if (document.readyState === 'loading') {
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(tryAutoEnter, 500);
            });
            return;
        }
        
        setTimeout(() => {
            if (window._readingModeActive || document.getElementById("reader-toolbar")) return;
            
            const domain = getDomain();
            const rule = customRules[domain] || {};
            let foundNode = null;
            
            if (rule.content) {
                foundNode = document.querySelector(rule.content);
            } else {
                const contentSelectors = [
                    "#chaptercontent", "#nr", "#content", ".content", ".page-content",
                    "#contentn", ".txtnav", ".isTxt.chapter-content", ".con", "#novelcontent",
                    ".read-content", ".article-content", ".chapterCon"
                ];
                for (let s of contentSelectors) {
                    let node = document.querySelector(s);
                    if (node && node.innerText.length > 200) {
                        foundNode = node;
                        break;
                    }
                }
            }
            
            if (foundNode && foundNode !== document.body && foundNode.innerText.length > 500) {
                console.log('[阅读模式] 自动进入');
                enterReaderMode();
            }
        }, 200);
    }

    // ================== 阅读模式核心功能 ==================
    function enterReaderMode() {
        if (window._readingModeActive) return;
        window._readingModeActive = true;

        const initialDomain = getDomain();
        const initialRule = customRules[initialDomain] || {};

        if (window._savedContentSelector === undefined) {
            let effectiveSelector = "";
            if (initialRule.content) {
                effectiveSelector = initialRule.content;
            } else {
                const contentSelectors = [
                    "#chaptercontent", "#nr", "#content", ".content", ".page-content",
                    "#contentn", ".txtnav", ".isTxt.chapter-content", ".con", "#novelcontent",
                    ".read-content", ".article-content", ".chapterCon"
                ];
                for (let s of contentSelectors) {
                    let node = document.querySelector(s);
                    if (node && node.innerText.length > 200 && node !== document.body) {
                        effectiveSelector = s;
                        break;
                    }
                }
            }
            window._savedContentSelector = effectiveSelector || '';
        }

        const charset = document.characterSet || "utf-8";
        const initialUrl = location.href;
        const originalTitle = document.title;
        const originalHTML = document.documentElement.outerHTML;

        const readerHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="${charset}">
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                <title>${escapeHtml(originalTitle)}</title>
                <style>
                    body { margin: 0; padding: 15px; font-family: sans-serif; line-height: 1.8; overflow-x: hidden; }
                    #container { max-width: 850px; margin: 0 auto; }
                    .chapter-title { font-weight: bold; border-bottom: 1px solid rgba(128,128,128,0.3); margin: 40px 0 20px; padding-bottom: 15px; font-size: 1.4em; text-align: center; }
                    #content-area p { text-indent: 2em; margin: 1.2em 0; text-align: justify; word-wrap: break-word; display: block; }
                    #content-area a { color: inherit; text-decoration: underline; opacity: 0.8; }
                    * { -webkit-tap-highlight-color: transparent !important; outline: none !important; }
                    
                    #toolbar-container {
                        position: fixed;
                        bottom: 20px;
                        left: 0;
                        right: 0;
                        display: flex;
                        justify-content: center;
                        gap: 10px;
                        z-index: 2147483647;
                        transition: transform 0.3s ease;
                        transform: translateY(0);
                    }
                    #toolbar-container.hidden {
                        transform: translateY(100px);
                    }
                    .toolbar-btn {
                        width: 35px;
                        height: 35px;
                        line-height: 35px;
                        text-align: center;
                        background: rgba(0,0,0,0.5);
                        color: #fff;
                        border-radius: 50%;
                        cursor: pointer;
                        font-size: 22px;
                        user-select: none;
                        transition: 0.3s;
                        display: inline-block;
                    }
                    .toolbar-btn.active {
                        background: #4CAF50;
                    }
                    #exit-btn { color: red !important; }
                    .font-control {
                        display: flex;
                        background: rgba(0,0,0,0.5);
                        border-radius: 22px;
                        height: 35px;
                        align-items: center;
                        justify-content: space-between;
                        padding: 0 8px;
                        gap: 6px;
                    }
                    .font-control-item {
                        width: 35px;
                        text-align: center;
                        font-size: 20px;
                        color: white;
                        cursor: pointer;
                        user-select: none;
                    }
                    .font-control-item.font-size-value {
                        font-size: 18px;
                        cursor: default;
                        width: auto;
                        min-width: 32px;
                    }
                    #theme-panel {
                        display: none !important;
                        position: fixed;
                        bottom: 80px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: rgba(0,0,0,0.8);
                        backdrop-filter: blur(12px);
                        border-radius: 24px;
                        padding: 12px;
                        flex-wrap: wrap;
                        justify-content: center;
                        gap: 12px;
                        z-index: 2147483647;
                        max-width: 90%;
                    }
                    #theme-panel.show {
                        display: flex !important;
                    }
                    ${cfgStyle}
                </style>
            </head>
            <body>
                <div id="container"><div id="content-area"></div>
                <div id="loading" style="text-align:center; padding:30px; opacity:0.5;">正在加载...</div></div>
                <div id="toolbar-container">
                    <div class="font-control">
                        <div class="font-control-item" id="font-decr">A-</div>
                        <div class="font-control-item font-size-value" id="font-size-display">${settings.fontSize}</div>
                        <div class="font-control-item" id="font-incr">A+</div>
                    </div>
                    <div class="toolbar-btn" id="theme-btn">🎨</div>
                    <div class="toolbar-btn" id="config-btn">⚙️</div>
                    <div class="toolbar-btn" id="exit-btn">🚫</div>
                </div>
                <div id="theme-panel"></div>
            </body>
            </html>
        `;

        const savedSettings = { ...settings };
        const savedContentSelector = window._savedContentSelector;

        document.open(); document.write(readerHTML); document.close();

        settings = savedSettings;
        window._savedContentSelector = savedContentSelector;

        const contentArea = document.getElementById("content-area");
        const loadingDiv = document.getElementById("loading");
        const toolbar = document.getElementById("toolbar-container");
        const fontDecr = document.getElementById("font-decr");
        const fontIncr = document.getElementById("font-incr");
        const fontSizeDisplay = document.getElementById("font-size-display");
        const themeBtn = document.getElementById("theme-btn");
        const configBtn = document.getElementById("config-btn");
        const exitBtn = document.getElementById("exit-btn");
        const themePanel = document.getElementById("theme-panel");

        themePanel.classList.remove("show");

        let toolbarVisible = true;
        let startToolbarY = 0;
        window.addEventListener('touchstart', e => { startToolbarY = e.touches[0].clientY; }, {passive:true});
        window.addEventListener('touchend', e => {
            let diff = startToolbarY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 30) {
                if (diff < 0) {
                    if (!toolbarVisible) { toolbar.classList.remove("hidden"); toolbarVisible = true; }
                } else {
                    if (toolbarVisible) { toolbar.classList.add("hidden"); toolbarVisible = false; }
                }
            }
        }, {passive:true});

        function applySettings() {
            const parts = settings.theme.split("-");
            const bg = parts[0];
            const text = parts[1] || "#000";
            const texture = parts[2] || "";
            document.body.style.backgroundColor = bg;
            document.body.style.color = text;
            if (texture === "paper") {
                document.body.style.backgroundImage = `radial-gradient(circle at 25% 40%, rgba(0,0,0,0.03) 1px, transparent 1px), radial-gradient(circle at 75% 60%, rgba(0,0,0,0.02) 1px, transparent 1px)`;
                document.body.style.backgroundSize = "40px 40px, 60px 60px";
            } else {
                document.body.style.backgroundImage = "none";
            }
            if (contentArea) contentArea.style.fontSize = settings.fontSize + "px";
            if (fontSizeDisplay) fontSizeDisplay.innerText = settings.fontSize;
        }

        function showToast(msg) {
            if (!document.body) return;
            let toast = document.querySelector(".toast");
            if (toast) toast.remove();
            toast = document.createElement("div");
            toast.className = "toast";
            toast.innerText = msg;
            toast.style.cssText = "position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.7); color:#fff; padding:6px 12px; border-radius:20px; font-size:14px; z-index:2147483647; pointer-events:none;";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1500);
        }

        function buildThemePanel() {
            const themeList = themes.split(";");
            themePanel.innerHTML = "";
            themeList.forEach((t, idx) => {
                const bg = t.split("-")[0];
                const dot = document.createElement("div");
                dot.style.cssText = "width:40px; height:40px; border-radius:50%; border:2px solid rgba(255,255,255,0.5); cursor:pointer;";
                dot.style.backgroundColor = bg;
                if (settings.theme === t) dot.style.border = "3px solid red";
                dot.onclick = () => {
                    settings.theme = t;
                    saveSettings();
                    applySettings();
                    showToast(themeNames[idx] || "主题已切换");
                    themePanel.classList.remove("show");
                };
                themePanel.appendChild(dot);
            });
        }

        themeBtn.onclick = (e) => {
            e.stopPropagation();
            if (themePanel.classList.contains("show")) {
                themePanel.classList.remove("show");
            } else {
                buildThemePanel();
                themePanel.classList.add("show");
            }
        };
        document.addEventListener('click', (e) => {
            if (themePanel.classList.contains("show") && !themePanel.contains(e.target) && e.target !== themeBtn) {
                themePanel.classList.remove("show");
            }
        });

        fontDecr.onclick = () => { settings.fontSize = Math.max(12, settings.fontSize - 2); saveSettings(); applySettings(); };
        fontIncr.onclick = () => { settings.fontSize = Math.min(40, settings.fontSize + 2); saveSettings(); applySettings(); };
        configBtn.onclick = () => showViaConfig();
        exitBtn.onclick = () => {
            const markKey = 'reader_manual_exit_' + getPageKey();
            GM_setValue(markKey, Date.now());
            location.reload();
        };

        applySettings();

        let nextUrl = initialUrl, isLoading = false;
        const displayedUrls = new Set();
        const MAX_CACHE_SIZE = 20;
        const prefetchedData = new Map();
        let activePrefetchCount = 0;
        const MAX_CONCURRENT_PREFETCH = 2;
        let retryTimer = null;
        let retryCount = 0;
        const MAX_RETRIES = 3;

        function setPrefetchCache(url, doc) {
            if (prefetchedData.size >= MAX_CACHE_SIZE) {
                const firstKey = prefetchedData.keys().next().value;
                prefetchedData.delete(firstKey);
            }
            prefetchedData.set(url, doc);
        }

        function getRuleForUrl(url) {
            const urlDomain = getDomainFromUrl(url);
            return customRules[urlDomain] || initialRule;
        }

        async function prefetchChain(startUrl, depth) {
            if (depth <= 0 || !startUrl) return;
            if (activePrefetchCount >= MAX_CONCURRENT_PREFETCH) return;
            let doc = null;
            if (prefetchedData.has(startUrl)) {
                doc = prefetchedData.get(startUrl);
            } else {
                activePrefetchCount++;
                try {
                    const res = await fetch(startUrl);
                    const buffer = await res.arrayBuffer();
                    let decoder = new TextDecoder('utf-8');
                    let htmlText = decoder.decode(buffer);
                    const charsetMatch = htmlText.match(/charset=["']?([\w-]+)["']?/i);
                    if (charsetMatch && !/utf-8/i.test(charsetMatch[1])) {
                        htmlText = new TextDecoder(charsetMatch[1]).decode(buffer);
                    }
                    doc = new DOMParser().parseFromString(htmlText, "text/html");
                    setPrefetchCache(startUrl, doc);
                } catch(e) { 
                    console.error("预加载失败", e); 
                    return; 
                } finally { 
                    activePrefetchCount--; 
                }
            }
            
            const rule = getRuleForUrl(startUrl);
            let newNextUrl = "";
            
            // 1. 自定义规则（最高优先级）
            if (rule.next) {
                let nextSelector = rule.next;
                let useRegex = false;
                let regexPattern = null;
                if (nextSelector.startsWith('regex:')) {
                    useRegex = true;
                    try {
                        regexPattern = new RegExp(nextSelector.slice(6), 'i');
                    } catch(e) { console.error("正则无效", e); }
                }
                
                if (useRegex && regexPattern) {
                    const allLinks = doc.querySelectorAll('a');
                    for (let a of allLinks) {
                        if (regexPattern.test(a.innerText) || regexPattern.test(a.href)) {
                            if (a.href && !a.href.startsWith("javascript:")) {
                                newNextUrl = new URL(a.href, startUrl).href;
                                break;
                            }
                        }
                    }
                } else {
                    let el = doc.querySelector(nextSelector);
                    if (el && el.tagName === 'A' && el.href && !el.href.startsWith("javascript:")) {
                        newNextUrl = new URL(el.href, startUrl).href;
                    }
                }
            }
            
            // 2. 内置文本正则匹配（第二优先级）
            if (!newNextUrl) {
                const allLinks = doc.querySelectorAll("a");
                const nextReg = /下一页|下页|下一章|下章|下一篇|后一页|后一章|next|下一頁|下頁|後一頁|後一章/i;
                for (let a of allLinks) {
                    if (nextReg.test(a.innerText)) {
                        let h = a.getAttribute("href");
                        if (h && !h.startsWith("javascript:")) {
                            newNextUrl = new URL(h, startUrl).href;
                            break;
                        }
                    }
                }
            }
            
            // 3. 属性选择器（第三优先级，作为兜底）
            if (!newNextUrl) {
                const fallbackSelectors = [
                    'link[rel="next"]',
                    'a[rel="next"]',
                    'a[class*="next"]',
                    'a[class*="pager"]',
                    'a[aria-label*="next" i]',
                    'a[data-page*="next" i]'
                ];
                for (let sel of fallbackSelectors) {
                    let el;
                    if (sel === 'link[rel="next"]') {
                        el = doc.head.querySelector(sel);
                    } else {
                        el = doc.querySelector(sel);
                    }
                    if (el && el.href && !el.href.startsWith("javascript:")) {
                        newNextUrl = new URL(el.href, startUrl).href;
                        break;
                    }
                }
            }
            
            if (newNextUrl && depth > 1) {
                prefetchChain(newNextUrl, depth-1).catch(e => console.error("预加载链中断", e));
            }
        }

        function extractContentFromDoc(doc, rule, customContentSelector = false) {
            let title = "";
            const titleSelectors = rule.title ? [rule.title] : [".nr_title", "h1.title", "h1", ".content-title"];
            for (let ts of titleSelectors) {
                let node = doc.querySelector(ts);
                if (node && node.innerText.trim()) {
                    title = node.innerText.replace(/最新章节|笔趣阁|小说网/g, "").trim();
                    break;
                }
            }
            if (!title) title = doc.title.split("_")[0].split("-")[0].trim();
            let mainHTML = "";
            const contentSelectors = rule.content ? [rule.content] : [
                "#chaptercontent", "#nr", "#content", ".content", ".page-content",
                "#contentn", ".txtnav", ".isTxt.chapter-content", ".con", "#novelcontent",
                ".read-content", ".article-content", ".chapterCon",
                "article", "body"
            ];

            if (customContentSelector) {
                // 自定义规则：合并所有匹配项，限制字数 >200
                for (let s of contentSelectors) {
                    const nodes = doc.querySelectorAll(s);
                    for (const node of nodes) {
                        if (node && node.innerText.length > 200) {
                            const clone = node.cloneNode(true);
                            const baseRemoveSel = "script, style, ins, .ads, iframe, table";
                            const customFilter = rule.filter ? rule.filter.trim() : "";
                            let removeSel = baseRemoveSel;
                            if (customFilter) removeSel = `${baseRemoveSel}, ${customFilter}`;
                            clone.querySelectorAll(removeSel).forEach(el => el.remove());
                            clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                            clone.querySelectorAll('div,p').forEach(el => { el.prepend('\n'); el.append('\n'); });
                            const text = clone.innerText.replace(/\r\n|\r/g, "\n").split("\n")
                                .map(l => l.trim()).filter(l => l.length > 0)
                                .map(l => `<p>${escapeHtml(l)}</p>`).join("");
                            mainHTML += text;
                        }
                    }
                    if (mainHTML) break;
                }
            } else {
                // 默认行为：只取第一个匹配的选择器，限制字数 >200
                let foundNode = null;
                for (let s of contentSelectors) {
                    foundNode = doc.querySelector(s);
                    if (foundNode && foundNode.innerText.length > 200) break;
                }
                if (foundNode) {
                    const clone = foundNode.cloneNode(true);
                    const baseRemoveSel = "script, style, ins, .ads, iframe, table";
                    const customFilter = rule.filter ? rule.filter.trim() : "";
                    let removeSel = baseRemoveSel;
                    if (customFilter) removeSel = `${baseRemoveSel}, ${customFilter}`;
                    clone.querySelectorAll(removeSel).forEach(el => el.remove());
                    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
                    clone.querySelectorAll('div,p').forEach(el => { el.prepend('\n'); el.append('\n'); });
                    mainHTML = clone.innerText.replace(/\r\n|\r/g, "\n").split("\n")
                        .map(l => l.trim()).filter(l => l.length > 0)
                        .map(l => `<p>${escapeHtml(l)}</p>`).join("");
                }
            }
            return { title, mainHTML };
        }

        async function fetchContent(url) {
            if (!url || displayedUrls.has(url) || isLoading) return;
            if (retryTimer) clearTimeout(retryTimer);
            isLoading = true;
            loadingDiv.innerText = "正在加载...";
            try {
                let doc;
                if (prefetchedData.has(url)) doc = prefetchedData.get(url);
                else if (url === initialUrl) {
                    const parser = new DOMParser();
                    doc = parser.parseFromString(originalHTML, "text/html");
                } else {
                    const res = await fetch(url);
                    const buffer = await res.arrayBuffer();
                    let decoder = new TextDecoder('utf-8');
                    let htmlText = decoder.decode(buffer);
                    const charsetMatch = htmlText.match(/charset=["']?([\w-]+)["']?/i);
                    if (charsetMatch && !/utf-8/i.test(charsetMatch[1])) {
                        htmlText = new TextDecoder(charsetMatch[1]).decode(buffer);
                    }
                    doc = new DOMParser().parseFromString(htmlText, "text/html");
                }
                
                const rule = getRuleForUrl(url);
                const isCustomContent = !!rule.content;
                const { title, mainHTML } = extractContentFromDoc(doc, rule, isCustomContent);
                
                // 先查找下一页链接（无论正文是否为空，都尝试翻页）
                let newNextUrl = "";
                
                // 1. 自定义规则（最高优先级）
                if (rule.next) {
                    let nextSelector = rule.next;
                    let useRegex = false;
                    let regexPattern = null;
                    if (nextSelector.startsWith('regex:')) {
                        useRegex = true;
                        try {
                            regexPattern = new RegExp(nextSelector.slice(6), 'i');
                        } catch(e) { console.error("正则无效", e); }
                    }
                    
                    if (useRegex && regexPattern) {
                        const allLinks = doc.querySelectorAll('a');
                        for (let a of allLinks) {
                            if (regexPattern.test(a.innerText) || regexPattern.test(a.href)) {
                                if (a.href && !a.href.startsWith("javascript:")) {
                                    newNextUrl = new URL(a.href, url).href;
                                    break;
                                }
                            }
                        }
                    } else {
                        let el = doc.querySelector(nextSelector);
                        if (el && el.tagName === 'A' && el.href && !el.href.startsWith("javascript:")) {
                            newNextUrl = new URL(el.href, url).href;
                        }
                    }
                }
                
                // 2. 内置文本正则匹配（第二优先级）
                if (!newNextUrl) {
                    const allLinks = doc.querySelectorAll("a");
                    const nextReg = /下一页|下页|下一章|下章|下一篇|后一页|后一章|next|下一頁|下頁|後一頁|後一章/i;
                    for (let a of allLinks) {
                        if (nextReg.test(a.innerText)) {
                            let h = a.getAttribute("href");
                            if (h && !h.startsWith("javascript:")) {
                                newNextUrl = new URL(h, url).href;
                                break;
                            }
                        }
                    }
                }
                
                // 3. 属性选择器（第三优先级，作为兜底）
                if (!newNextUrl) {
                    const fallbackSelectors = [
                        'link[rel="next"]',
                        'a[rel="next"]',
                        'a[class*="next"]',
                        'a[class*="pager"]',
                        'a[aria-label*="next" i]',
                        'a[data-page*="next" i]'
                    ];
                    for (let sel of fallbackSelectors) {
                        let el;
                        if (sel === 'link[rel="next"]') {
                            el = doc.head.querySelector(sel);
                        } else {
                            el = doc.querySelector(sel);
                        }
                        if (el && el.href && !el.href.startsWith("javascript:")) {
                            newNextUrl = new URL(el.href, url).href;
                            break;
                        }
                    }
                }
                
                // 移除短内容检查（不再抛出异常，短内容正常显示）
                // 只有正文非空时才显示标题和内容，避免空标题
                if (mainHTML) {
                    const sec = document.createElement("div");
                    sec.innerHTML = `<div class="chapter-title">${escapeHtml(title)}</div>${mainHTML}`;
                    contentArea.appendChild(sec);
                }
                if (url !== initialUrl) history.pushState(null, originalTitle, url);
                applySettings();
                displayedUrls.add(url);
                nextUrl = newNextUrl;
                loadingDiv.innerText = nextUrl ? "滑动加载下一页" : "--- 全文完 ---";
                retryCount = 0;
                if (nextUrl) prefetchChain(nextUrl, 2).catch(e => console.error(e));
            } catch (e) {
                console.error("加载失败", e);
                retryCount++;
                if (retryCount <= MAX_RETRIES) {
                    loadingDiv.innerText = `加载失败，5秒后重试 (${retryCount}/${MAX_RETRIES})...`;
                    retryTimer = setTimeout(() => {
                        if (nextUrl && !isLoading && !displayedUrls.has(nextUrl)) fetchContent(nextUrl);
                        retryTimer = null;
                    }, 5000);
                } else {
                    loadingDiv.innerText = "加载失败，请检查网络后刷新页面";
                }
            } finally { isLoading = false; }
        }

        window.onscroll = () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800) {
                if (nextUrl && !isLoading && !displayedUrls.has(nextUrl)) fetchContent(nextUrl);
            }
        };
        
        document.addEventListener('click', (e) => {
            if (!settings.clickPage) return;
            if (window.getSelection().toString().length > 0) return;
            if (e.target.closest('#toolbar-container') || e.target.closest('#theme-panel') || e.target.closest('#via-cfg-mask')) return;
            const vh = window.innerHeight;
            e.clientY < vh * 0.4 ? window.scrollBy(0, -vh * 0.85) : window.scrollBy(0, vh * 0.85);
        });
        fetchContent(initialUrl);
    }

    // ================== 初始化 ==================
    createReaderButton();
    tryAutoEnter();
})();
