// ==UserScript==
// @name         阅读模式增强插件
// @namespace    https://viayoo.com/
// @version      12.23
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
    function getDomain() { return window.location.hostname.split('.').slice(-2).join('.'); }

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

    const cfgStyle = `
        #via-cfg-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 2147483647; display: flex; align-items: center; justify-content: center; font-family: -apple-system, sans-serif; }
        .via-box { position: relative; width: 85%; max-width: 350px; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .via-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #000; border-bottom: 1px solid #eee; padding-bottom: 10px; padding-right: 30px; }
        .via-close { position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; color: #666; transition: 0.2s; }
        .via-close:hover { background: rgba(0,0,0,0.2); color: #000; }
        .via-label { font-size: 13px; color: #666; display: block; margin-bottom: 5px; }
        .via-input { width: 100%; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; margin-bottom: 15px; font-size: 14px; box-sizing: border-box; outline: none; }
        .toggle-switch { display: flex; align-items: center; justify-content: space-between; margin-bottom: 15px; flex-wrap: wrap; }
        .toggle-switch span { font-size: 14px; color: #333; }
        .toggle-label { position: relative; display: inline-block; width: 50px; height: 24px; }
        .toggle-label input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: 0.3s; border-radius: 24px; }
        .toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: 0.3s; border-radius: 50%; }
        input:checked + .toggle-slider { background-color: #4CAF50; }
        input:checked + .toggle-slider:before { transform: translateX(26px); }
        .via-hint { font-size: 11px; color: #888; margin-top: 4px; width: 100%; }
    `;
    GM_addStyle(cfgStyle);

    function showViaConfig() {
        if (document.getElementById('via-cfg-mask')) return;
        const domain = getDomain();
        const rule = customRules[domain] || { title: '', content: '', next: '', filter: '' };
        const autoEnterEnabled = !!autoEnterRules[domain];

        let effectivePlaceholder = '';
        if (rule.content) {
            effectivePlaceholder = '自定义';
        } else if (window._savedContentSelector) {
            effectivePlaceholder = window._savedContentSelector;
        } else {
            effectivePlaceholder = '空';
        }

        const mask = document.createElement('div');
        mask.id = 'via-cfg-mask';
        mask.innerHTML = `
            <div class="via-box">
                <div class="via-close">✕</div>
                <div class="via-title">⚙️ 配置面板 - ${domain}</div>
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
                <input type="text" id="via-t" class="via-input" placeholder=".chapter-title" value="${escapeHtml(rule.title || '')}">
                <span class="via-label">正文内容选择器</span>
                <input type="text" id="via-c" class="via-input" placeholder="${effectivePlaceholder}" value="${escapeHtml(rule.content || '')}">
                <span class="via-label">下一页选择器</span>
                <input type="text" id="via-n" class="via-input" placeholder=".next-page" value="${escapeHtml(rule.next || '')}">
                <span class="via-label">过滤选择器（与内置规则同时生效）</span>
                <input type="text" id="via-f" class="via-input" placeholder=".ad, .banner, .tips, .share" value="${escapeHtml(rule.filter || '')}">
            </div>`;
        document.body.appendChild(mask);

        const clickPageToggle = document.getElementById('click-page-toggle');
        const autoEnterToggle = document.getElementById('auto-enter-toggle');
        const titleInput = document.getElementById('via-t');
        const contentInput = document.getElementById('via-c');
        const nextInput = document.getElementById('via-n');
        const filterInput = document.getElementById('via-f');
        const closeBtn = mask.querySelector('.via-close');

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
    }

    function escapeHtml(str) {
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    GM_registerMenuCommand("⚙️ 配置面板", showViaConfig);

    // ================== 手动退出标记处理（使用 GM_setValue）==================
    const getPageKey = () => {
        return window.location.origin + window.location.pathname;
    };
    const manualExitKey = 'reader_manual_exit_' + getPageKey();
    const exitFlag = GM_getValue(manualExitKey, 0);
    const now = Date.now();
    // 如果标记存在且在 3 秒内（避免旧残留），则跳过自动进入
    if (exitFlag && (now - exitFlag < 3000)) {
        GM_setValue(manualExitKey, 0);
        var skipAutoEnter = true;
        console.log('[阅读模式] 检测到手动退出标记，本次跳过自动进入');
    } else {
        if (exitFlag) GM_setValue(manualExitKey, 0);
        var skipAutoEnter = false;
    }

    // ================== 创建可拖拽的阅读按钮（增加移动容忍阈值）==================
    if (!document.getElementById("txtyd")) {
        const btn = document.createElement("div");
        btn.id = "txtyd";
        btn.innerHTML = "📖";
        btn.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            width: 45px;
            height: 45px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.5);
            color: #fff;
            border-radius: 50%;
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
            const defaultLeft = window.innerWidth - btn.offsetWidth - 20;
            const defaultTop = window.innerHeight - btn.offsetHeight - 20;
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
        const MOVE_TOLERANCE = 10; // 移动容忍阈值（像素），小于此值不取消长按

        let totalMoveX = 0, totalMoveY = 0; // 累计移动距离

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
            totalMoveX = 0;
            totalMoveY = 0;
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
            
            // 计算本次移动增量
            let dx = clientX - dragStartX;
            let dy = clientY - dragStartY;
            // 更新累计移动距离
            totalMoveX = dx;
            totalMoveY = dy;
            let distance = Math.sqrt(dx*dx + dy*dy);
            
            // 如果移动距离超过容忍阈值，才视为真正的拖拽并取消长按
            if (distance > MOVE_TOLERANCE) {
                clearLongPress();
                if (!hasMoved) {
                    hasMoved = true;
                    // 如果长按尚未触发，取消长按标记
                    if (!isLongPressed) {
                        // 长按定时器已清除，且没有触发长按，允许拖拽移动
                    }
                }
                // 拖拽移动更新按钮位置
                if (dragAnimationFrame) cancelAnimationFrame(dragAnimationFrame);
                dragAnimationFrame = requestAnimationFrame(() => {
                    let newLeft = dragStartLeft + dx;
                    let newTop = dragStartTop + dy;
                    setButtonBasePosition(newLeft, newTop);
                });
            } else {
                // 移动未超过阈值，不更新按钮位置，也不取消长按
                // 但需要确保长按定时器仍然运作
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
            // 只有真正移动过（超过阈值）才保存位置
            if (hasMoved) {
                GM_setValue("reader_btn_pos", { left: btnLeft, top: btnTop });
            }
            // 如果没有移动（或移动在阈值内）且未触发长按，则视为单击；如果已触发长按，则不再进入阅读模式
            if (!hasMoved && !isLongPressed) {
                enterReaderMode();
            }
            hasMoved = false;
            isLongPressed = false;
            totalMoveX = 0;
            totalMoveY = 0;
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

        // ========== 自动进入阅读模式（检查 skipAutoEnter 标记）==========
        if (autoEnterRules[getDomain()] && !skipAutoEnter) {
            function checkAndEnter() {
                if (document.getElementById("reader-toolbar")) return;
                const doc = document;
                const domain = getDomain();
                const rule = customRules[domain] || {};
                let foundNode = null;
                if (rule.content) {
                    foundNode = doc.querySelector(rule.content);
                } else {
                    const contentSelectors = [
                        "#chaptercontent", "#nr", "#content", ".content", ".page-content",
                        "#contentn", ".txtnav", ".isTxt.chapter-content", ".con", "#novelcontent",
                        ".read-content", ".article-content", ".chapterCon",
                        '[id^="cont"]'
                    ];
                    for (let s of contentSelectors) {
                        let node = doc.querySelector(s);
                        if (node && node.innerText.length > 200) {
                            foundNode = node;
                            break;
                        }
                    }
                }
                if (foundNode && foundNode !== document.body) {
                    enterReaderMode();
                }
            }
            if (document.readyState === "loading") {
                window.addEventListener('DOMContentLoaded', checkAndEnter);
            } else {
                checkAndEnter();
            }
        }
    }

    // ================== 阅读模式核心功能 ==================
    function enterReaderMode() {
        if (window._readingModeActive) return;
        window._readingModeActive = true;

        if (window._savedContentSelector === undefined) {
            const domain = getDomain();
            const rule = customRules[domain] || {};
            let effectiveSelector = "";
            if (rule.content) {
                effectiveSelector = rule.content;
            } else {
                const contentSelectors = [
                    "#chaptercontent", "#nr", "#content", ".content", ".page-content",
                    "#contentn", ".txtnav", ".isTxt.chapter-content", ".con", "#novelcontent",
                    ".read-content", ".article-content", ".chapterCon",
                    '[id^="cont"]'
                ];
                for (let s of contentSelectors) {
                    let node = document.querySelector(s);
                    if (node && node.innerText.length > 200 && node !== document.body) {
                        if (s === '[id^="cont"]') {
                            const id = node.id;
                            if (id && (id === "content" || id === "container" || id === "cont")) {
                                effectiveSelector = `#${id}`;
                            } else {
                                effectiveSelector = s;
                            }
                        } else {
                            effectiveSelector = s;
                        }
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
                <title>${originalTitle}</title>
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
                    #exit-btn {
                        color: red !important;
                    }
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
                    .font-control-item:active {
                        opacity: 0.7;
                    }
                    #theme-panel {
                        display: none !important;
                        visibility: hidden !important;
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
                        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    }
                    #theme-panel.show {
                        display: flex !important;
                        visibility: visible !important;
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

        document.open(); document.write(readerHTML); document.close();

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
        let startTouchY = 0;
        window.addEventListener('touchstart', e => { startTouchY = e.touches[0].clientY; }, {passive:true});
        window.addEventListener('touchend', e => {
            let diff = startTouchY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 30) {
                if (diff < 0) {
                    if (!toolbarVisible) { toolbar.classList.remove("hidden"); toolbarVisible = true; }
                } else {
                    if (toolbarVisible) { toolbar.classList.add("hidden"); toolbarVisible = false; }
                }
            }
        }, {passive:true});

        function applySettings() {
            const [bg, text, texture] = settings.theme.split("-");
            document.body.style.backgroundColor = bg;
            document.body.style.color = text || "#000";
            if (texture === "paper") {
                document.body.style.backgroundImage = `radial-gradient(circle at 25% 40%, rgba(0,0,0,0.03) 1px, transparent 1px), radial-gradient(circle at 75% 60%, rgba(0,0,0,0.02) 1px, transparent 1px)`;
                document.body.style.backgroundSize = "40px 40px, 60px 60px";
            } else {
                document.body.style.backgroundImage = "none";
            }
            contentArea.style.fontSize = settings.fontSize + "px";
            fontSizeDisplay.innerText = settings.fontSize;
        }

        function showToast(msg) {
            let toast = document.querySelector(".toast");
            if (toast) toast.remove();
            toast = document.createElement("div");
            toast.className = "toast";
            toast.innerText = msg;
            toast.style.position = "fixed";
            toast.style.bottom = "80px";
            toast.style.left = "50%";
            toast.style.transform = "translateX(-50%)";
            toast.style.backgroundColor = "rgba(0,0,0,0.7)";
            toast.style.color = "#fff";
            toast.style.padding = "6px 12px";
            toast.style.borderRadius = "20px";
            toast.style.fontSize = "14px";
            toast.style.zIndex = "2147483647";
            toast.style.pointerEvents = "none";
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1500);
        }

        function buildThemePanel() {
            const themeList = themes.split(";");
            themePanel.innerHTML = "";
            themeList.forEach((t, idx) => {
                const [bg] = t.split("-");
                const dot = document.createElement("div");
                dot.style.width = "40px";
                dot.style.height = "40px";
                dot.style.borderRadius = "50%";
                dot.style.backgroundColor = bg;
                dot.style.border = "2px solid rgba(255,255,255,0.5)";
                dot.style.cursor = "pointer";
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

        fontDecr.onclick = () => {
            settings.fontSize = Math.max(12, settings.fontSize - 2);
            saveSettings();
            applySettings();
        };
        fontIncr.onclick = () => {
            settings.fontSize = Math.min(40, settings.fontSize + 2);
            saveSettings();
            applySettings();
        };
        configBtn.onclick = () => showViaConfig();
        
        // 退出逻辑：使用 GM_setValue 存储手动退出标记
        exitBtn.onclick = () => {
            const pageKey = window.location.origin + window.location.pathname;
            const markKey = 'reader_manual_exit_' + pageKey;
            GM_setValue(markKey, Date.now());
            location.reload();
        };

        applySettings();

        let nextUrl = initialUrl, isLoading = false;
        const displayedUrls = new Set();
        const prefetchedData = new Map();
        let activePrefetchCount = 0;
        const MAX_CONCURRENT_PREFETCH = 2;
        let retryTimer = null;

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
                    prefetchedData.set(startUrl, doc);
                } catch(e) { console.error("预加载失败", e); activePrefetchCount--; return; }
                finally { activePrefetchCount--; }
            }
            const domain = getDomain();
            const rule = customRules[domain] || {};
            let newNextUrl = "";
            if (rule.next) {
                let el = doc.querySelector(rule.next);
                if (el) newNextUrl = el.href;
            }
            if (!newNextUrl) {
                const allLinks = doc.querySelectorAll("a");
                const nextReg = /下一页|下页|下一章|下章|下一篇|后一页|后一章|next|下一頁|下頁|後一頁|後一章/i;
                for (let a of allLinks) {
                    if (nextReg.test(a.innerText)) {
                        let h = a.getAttribute("href");
                        if (h && !h.startsWith("javascript")) {
                            newNextUrl = new URL(h, startUrl).href;
                            break;
                        }
                    }
                }
            }
            if (newNextUrl && depth > 1) await prefetchChain(newNextUrl, depth-1);
        }

        function extractContentFromDoc(doc, rule) {
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
                '[id^="cont"]', "article", "body"
            ];
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
                    .map(l => `<p>${l}</p>`).join("");
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
                const domain = getDomain();
                const rule = customRules[domain] || {};
                const { title, mainHTML } = extractContentFromDoc(doc, rule);
                if (mainHTML.length < 100 && url !== initialUrl) throw new Error("内容过短");
                let newNextUrl = "";
                if (rule.next) {
                    let el = doc.querySelector(rule.next);
                    if (el) newNextUrl = el.href;
                }
                if (!newNextUrl) {
                    const allLinks = doc.querySelectorAll("a");
                    const nextReg = /下一页|下页|下一章|下章|下一篇|后一页|后一章|next|下一頁|下頁|後一頁|後一章/i;
                    for (let a of allLinks) {
                        if (nextReg.test(a.innerText)) {
                            let h = a.getAttribute("href");
                            if (h && !h.startsWith("javascript")) {
                                newNextUrl = new URL(h, url).href;
                                break;
                            }
                        }
                    }
                }
                const sec = document.createElement("div");
                sec.innerHTML = `<div class="chapter-title">${title}</div>${mainHTML}`;
                contentArea.appendChild(sec);
                if (url !== initialUrl) history.pushState(null, originalTitle, url);
                applySettings();
                displayedUrls.add(url);
                nextUrl = newNextUrl;
                loadingDiv.innerText = nextUrl ? "滑动加载下一页" : "--- 全文完 ---";
                if (nextUrl) prefetchChain(nextUrl, 2).catch(e=>console.error(e));
            } catch (e) {
                console.error("加载失败", e);
                loadingDiv.innerText = "网络正在连接中...";
                retryTimer = setTimeout(() => {
                    if (nextUrl && !isLoading && !displayedUrls.has(nextUrl)) fetchContent(nextUrl);
                    retryTimer = null;
                }, 5000);
            } finally { isLoading = false; }
        }

        window.onscroll = () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 800) {
                if (nextUrl && !isLoading && !displayedUrls.has(nextUrl)) fetchContent(nextUrl);
            }
        };
        document.addEventListener('click', (e) => {
            if (!settings.clickPage) return;
            if (e.target.closest('#toolbar-container') || e.target.closest('#theme-panel') || e.target.closest('#via-cfg-mask')) return;
            const vh = window.innerHeight;
            e.clientY < vh * 0.4 ? window.scrollBy(0, -vh * 0.85) : window.scrollBy(0, vh * 0.85);
        });
        fetchContent(initialUrl);
    }
})();
