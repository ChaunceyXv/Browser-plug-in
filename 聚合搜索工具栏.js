// ==UserScript==
// @name         聚合搜索引擎工具栏
// @namespace    https://www.via.com
// @version      2.11.9
// @description  移动端浏览器脚本：仅域名白名单生效。下滑显示工具栏，触摸不倒计时，离开后计时。主题跟随，支持编辑引擎，油猴菜单栏打开管理界面。内置7大搜索引擎，设置按钮固定右侧。
// @author       Assistant
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_ENGINES = [
        { name: 'Bing', url: 'https://cn.bing.com/search?q=%s' },
        { name: 'Baidu', url: 'https://m.baidu.com/s?wd=%s' },
        { name: 'Yandex', url: 'https://yandex.com/search/?text=%s' },
        { name: 'Brave', url: 'https://search.brave.com/search?q=%s' },
        { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
        { name: 'Google.HK', url: 'https://www.google.com.hk/search?q=%s' },
        { name: 'Google', url: 'https://www.google.com/search?q=%s' }
    ];

    const STORAGE_KEY = 'AggSearchEngines';
    let currentEngines = [];
    let toolbarElement = null;
    let modalElement = null;

    let hideTimeout = null;
    let isTouchingToolbar = false;
    let isModalOpen = false;
    let isForcedVisible = false;
    let touchStartY = 0;
    let hasTriggeredSwipe = false;

    let currentTheme = 'dark';
    let themeMediaQuery = null;

    let editingIndex = -1;
    let baseURLWhitelist = [];

    function getBaseURLFromTemplate(urlTemplate) {
        const index = urlTemplate.indexOf('%s');
        if (index === -1) return null;
        return urlTemplate.substring(0, index);
    }

    function updateBaseURLWhitelist() {
        const list = [];
        currentEngines.forEach(engine => {
            const base = getBaseURLFromTemplate(engine.url);
            if (base) list.push(base);
        });
        baseURLWhitelist = list;
    }

    function isAllowedPage() {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('?')) return false;
        for (let base of baseURLWhitelist) {
            if (currentUrl.startsWith(base)) {
                return true;
            }
        }
        return false;
    }

    function loadEngines() {
        const stored = GM_getValue(STORAGE_KEY, null);
        if (stored && Array.isArray(stored)) {
            currentEngines = stored;
        } else {
            currentEngines = DEFAULT_ENGINES.map(e => ({ ...e }));
            saveEngines();
        }
        updateBaseURLWhitelist();
    }

    function saveEngines() {
        GM_setValue(STORAGE_KEY, currentEngines);
        updateBaseURLWhitelist();
    }

    function addEngine(name, url) {
        if (!name || !url) return false;
        if (!url.includes('%s')) {
            alert('搜索引擎URL必须包含占位符 %s');
            return false;
        }
        if (currentEngines.some(e => e.name === name)) {
            alert('已存在同名搜索引擎');
            return false;
        }
        currentEngines.push({ name: name.trim(), url: url.trim() });
        saveEngines();
        renderToolbar();
        return true;
    }

    function updateEngine(index, name, url) {
        if (!name || !url) return false;
        if (!url.includes('%s')) {
            alert('搜索引擎URL必须包含占位符 %s');
            return false;
        }
        if (currentEngines.some((e, i) => i !== index && e.name === name)) {
            alert('已存在同名搜索引擎');
            return false;
        }
        currentEngines[index] = { name: name.trim(), url: url.trim() };
        saveEngines();
        renderToolbar();
        return true;
    }

    function deleteEngine(index) {
        if (index >= 0 && index < currentEngines.length) {
            currentEngines.splice(index, 1);
            saveEngines();
            renderToolbar();
            if (modalElement && modalElement.style.display !== 'none') {
                closeModal();
                openSettingsModal();
            }
        }
    }

    function moveEngine(index, direction) {
        if (direction === 'up' && index > 0) {
            [currentEngines[index - 1], currentEngines[index]] = [currentEngines[index], currentEngines[index - 1]];
            saveEngines();
            renderToolbar();
            if (modalElement) refreshEngineListInModal();
        } else if (direction === 'down' && index < currentEngines.length - 1) {
            [currentEngines[index + 1], currentEngines[index]] = [currentEngines[index], currentEngines[index + 1]];
            saveEngines();
            renderToolbar();
            if (modalElement) refreshEngineListInModal();
        }
    }

    let refreshEngineListInModal = null;

    function extractKeywordFromInput() {
        const selectors = [
            'input[type="search"]', 'input[name="q"]', 'input[name="query"]',
            'input[name="wd"]', 'input[name="keyword"]', 'input[name="s"]',
            'input[type="text"][aria-label*="搜索"]', 'input[type="text"][placeholder*="搜索"]',
            'input[type="text"][placeholder*="Search"]', 'textarea[name="q"]',
            '.search-input', '#search-input', '#kw', '#search-kw'
        ];
        for (let sel of selectors) {
            let input = document.querySelector(sel);
            if (input && input.value.trim()) return input.value.trim();
        }
        return null;
    }

    function extractKeywordFromURL() {
        const paramNames = ['q', 'query', 'wd', 'keyword', 's', 'search', 'text', 'k', 'p'];
        const urlParams = new URLSearchParams(window.location.search);
        for (let p of paramNames) {
            if (urlParams.has(p)) {
                let val = urlParams.get(p).trim();
                if (val) return decodeURIComponent(val);
            }
        }
        return null;
    }

    function getCurrentPageKeyword() {
        return extractKeywordFromInput() || extractKeywordFromURL() || window.getSelection().toString().trim() || null;
    }

    function onEngineClick(engine) {
        let keyword = getCurrentPageKeyword();
        if (!keyword) {
            const manual = prompt('未自动获取到关键词，请输入搜索内容:');
            if (!manual) return;
            keyword = manual.trim();
            if (!keyword) return;
        }
        window.location.href = engine.url.replace('%s', encodeURIComponent(keyword));
    }

    function scheduleHide() {
        if (hideTimeout) clearTimeout(hideTimeout);
        if (isForcedVisible || isModalOpen) return;
        if (isTouchingToolbar) return;
        hideTimeout = setTimeout(() => {
            if (!isForcedVisible && !isModalOpen && !isTouchingToolbar) {
                if (toolbarElement) {
                    toolbarElement.style.opacity = '0';
                    toolbarElement.style.pointerEvents = 'none';
                }
            }
        }, 2000); // 修改为 1 秒
    }

    function showToolbar(permanent = false) {
        if (!toolbarElement) return;
        if (hideTimeout) clearTimeout(hideTimeout);
        toolbarElement.style.opacity = '1';
        toolbarElement.style.pointerEvents = 'auto';
        if (!permanent) scheduleHide();
    }

    function hideToolbar() {
        if (!toolbarElement) return;
        if (isForcedVisible || isModalOpen) return;
        if (hideTimeout) clearTimeout(hideTimeout);
        toolbarElement.style.opacity = '0';
        toolbarElement.style.pointerEvents = 'none';
    }

    function forceShowToolbar() {
        isForcedVisible = true;
        if (!toolbarElement) return;
        if (hideTimeout) clearTimeout(hideTimeout);
        toolbarElement.style.opacity = '1';
        toolbarElement.style.pointerEvents = 'auto';
    }

    function unforceShowToolbar() {
        isForcedVisible = false;
        if (!isModalOpen) scheduleHide();
    }

    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function applyThemeToToolbar() {
        if (!toolbarElement) return;
        const isDark = currentTheme === 'dark';
        toolbarElement.style.background = isDark ? 'rgba(30,30,40,0.92)' : 'rgba(240,240,245,0.92)';
        toolbarElement.style.border = isDark ? '0.5px solid rgba(255,255,255,0.2)' : '0.5px solid rgba(0,0,0,0.1)';
        toolbarElement.style.boxShadow = isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 12px rgba(0,0,0,0.15)';

        // 引擎按钮主题
        const engineBtns = toolbarElement.querySelectorAll('.agg-engine-btn');
        engineBtns.forEach(btn => {
            btn.style.background = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
            btn.style.color = isDark ? 'white' : '#1e1e2c';
            btn.style.boxShadow = isDark ? '0 1px 2px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)';
        });

        // 设置按钮主题
        const settingsBtn = toolbarElement.querySelector('#agg-settings-btn');
        if (settingsBtn) {
            settingsBtn.style.background = isDark ? 'rgba(70,70,90,0.9)' : 'rgba(200,200,210,0.9)';
            settingsBtn.style.color = isDark ? 'white' : '#1e1e2c';
            settingsBtn.style.boxShadow = isDark ? '0 1px 2px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)';
        }
    }

    function applyThemeToModal() {
        if (!modalElement) return;
        const isDark = currentTheme === 'dark';
        const panel = modalElement.querySelector('.agg-modal-panel');
        if (!panel) return;

        panel.style.background = isDark ? '#1e1e2c' : '#f0f0f5';
        panel.style.color = isDark ? 'white' : '#1e1e2c';
        panel.style.border = isDark ? '0.5px solid rgba(255,255,255,0.2)' : '0.5px solid rgba(0,0,0,0.1)';
        panel.style.boxShadow = isDark ? '0 20px 40px rgba(0,0,0,0.5)' : '0 20px 40px rgba(0,0,0,0.2)';

        const title = panel.querySelector('.agg-modal-title');
        if (title) title.style.color = isDark ? 'white' : '#1e1e2c';

        const items = panel.querySelectorAll('.agg-modal-item');
        items.forEach(item => {
            item.style.background = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
            const nameSpan = item.querySelector('.agg-engine-name');
            if (nameSpan) nameSpan.style.color = isDark ? 'white' : '#1e1e2c';
        });

        const inputs = panel.querySelectorAll('.agg-modal-input');
        inputs.forEach(input => {
            input.style.background = isDark ? '#2c2c3a' : '#e0e0e8';
            input.style.color = isDark ? 'white' : '#1e1e2c';
            input.style.border = isDark ? 'none' : '1px solid #ccc';
        });

        const addBtn = panel.querySelector('#addEngineBtn');
        if (addBtn) {
            addBtn.style.background = isDark ? '#2b7e3a' : '#2e7d32';
            addBtn.style.color = 'white';
        }
        const closeBtn = panel.querySelector('#closeModalBtn');
        if (closeBtn) {
            closeBtn.style.background = isDark ? '#4a4a5a' : '#9e9eae';
            closeBtn.style.color = isDark ? 'white' : '#1e1e2c';
        }
    }

    function onThemeChange(e) {
        currentTheme = e.matches ? 'dark' : 'light';
        applyThemeToToolbar();
        if (modalElement) applyThemeToModal();
    }

    function onTouchStart(e) {
        touchStartY = e.touches[0].clientY;
        hasTriggeredSwipe = false;
        if (toolbarElement && toolbarElement.contains(e.target)) {
            isTouchingToolbar = true;
            if (hideTimeout) clearTimeout(hideTimeout);
        } else {
            isTouchingToolbar = false;
        }
    }

    function onTouchMove(e) {
        if (!toolbarElement || isTouchingToolbar) return;
        if (hasTriggeredSwipe) return;
        const currentY = e.touches[0].clientY;
        const deltaY = currentY - touchStartY;
        if (deltaY > 10) {
            hasTriggeredSwipe = true;
            showToolbar(false);
        } else if (deltaY < -10) {
            hasTriggeredSwipe = true;
            hideToolbar();
        }
    }

    function onTouchEnd(e) {
        setTimeout(() => {
            isTouchingToolbar = false;
            scheduleHide();
        }, 50);
        touchStartY = 0;
        hasTriggeredSwipe = false;
    }

    function renderToolbar() {
        if (toolbarElement?.parentNode) toolbarElement.parentNode.removeChild(toolbarElement);

        const toolbar = document.createElement('div');
        toolbar.id = 'aggregated-search-toolbar';
        toolbar.style.cssText = `
            position: fixed; bottom: 8px; left: 8px; right: 8px;
            border-radius: 48px; padding: 4px 8px;
            display: flex; flex-wrap: nowrap; align-items: center; gap: 4px;
            z-index: 2147483647;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-tap-highlight-color: transparent;
            -webkit-overflow-scrolling: touch;
            transition: opacity 0.2s ease, background 0.2s ease;
            opacity: 0; pointer-events: none;
        `;

        // 可滚动的引擎按钮容器
        const engineScroll = document.createElement('div');
        engineScroll.id = 'agg-engine-scroll';
        engineScroll.style.cssText = `
            display: flex; flex-wrap: nowrap; overflow-x: auto; gap: 4px;
            flex: 1; min-width: 0;
            scrollbar-width: thin;
            -webkit-overflow-scrolling: touch;
            padding: 2px 0;
        `;

        currentEngines.forEach(engine => {
            const btn = document.createElement('button');
            btn.className = 'agg-engine-btn';
            btn.textContent = engine.name;
            btn.style.cssText = `
                border: none; border-radius: 40px;
                padding: 8px 10px; font-size: 12px; font-weight: 500;
                cursor: pointer; white-space: nowrap; flex-shrink: 0;
                letter-spacing: 0.5px;
                transition: transform 0.1s ease, background 0.2s ease;
            `;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                onEngineClick(engine);
            });
            engineScroll.appendChild(btn);
        });

        // 固定的设置按钮
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'agg-settings-btn';
        settingsBtn.textContent = '⚙️';
        settingsBtn.style.cssText = `
            border: none; border-radius: 40px;
            padding: 8px 10px; font-size: 14px; font-weight: 500;
            cursor: pointer; white-space: nowrap; flex-shrink: 0;
            display: inline-flex; align-items: center; justify-content: center;
            transition: transform 0.1s ease, background 0.2s ease;
        `;
        settingsBtn.addEventListener('click', () => openSettingsModal());

        toolbar.appendChild(engineScroll);
        toolbar.appendChild(settingsBtn);
        document.body.appendChild(toolbar);
        toolbarElement = toolbar;

        currentTheme = getSystemTheme();
        applyThemeToToolbar();

        if (themeMediaQuery) themeMediaQuery.removeEventListener('change', onThemeChange);
        themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        themeMediaQuery.addEventListener('change', onThemeChange);

        toolbar.addEventListener('touchstart', onTouchStart);
        document.body.addEventListener('touchstart', onTouchStart);
        document.body.addEventListener('touchmove', onTouchMove);
        document.body.addEventListener('touchend', onTouchEnd);
        document.body.addEventListener('touchcancel', onTouchEnd);

        hideToolbar();
    }

    const globalStyle = document.createElement('style');
    globalStyle.textContent = `
        #aggregated-search-toolbar button:active {
            transform: scale(0.96);
        }
    `;
    document.head.appendChild(globalStyle);

    function openSettingsModal() {
        if (modalElement?.style.display === 'flex') return;
        if (modalElement) modalElement.remove();

        isModalOpen = true;
        forceShowToolbar();
        editingIndex = -1;

        const modal = document.createElement('div');
        modal.id = 'aggregated-search-modal';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
            z-index: 2147483648; display: flex; align-items: center; justify-content: center;
            font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        `;

        const panel = document.createElement('div');
        panel.className = 'agg-modal-panel';
        panel.style.cssText = `
            width: 90%; max-width: 400px; max-height: 80%;
            border-radius: 32px; padding: 20px 16px;
            display: flex; flex-direction: column;
            overflow-y: auto;
            transition: background 0.2s ease, color 0.2s ease;
        `;

        const title = document.createElement('div');
        title.className = 'agg-modal-title';
        title.textContent = '🔍 管理搜索引擎';
        title.style.cssText = 'font-size: 20px; font-weight: bold; margin-bottom: 16px; text-align: center;';
        panel.appendChild(title);

        const listDiv = document.createElement('div');
        listDiv.style.cssText = 'margin-bottom: 20px; max-height: 320px; overflow-y: auto; border-radius: 20px;';

        function refreshEngineList() {
            listDiv.innerHTML = '';
            if (currentEngines.length === 0) {
                const emptyTip = document.createElement('div');
                emptyTip.textContent = '暂无搜索引擎，请添加';
                emptyTip.style.cssText = 'text-align:center; color:#aaa; padding:24px;';
                listDiv.appendChild(emptyTip);
            } else {
                currentEngines.forEach((engine, idx) => {
                    const item = document.createElement('div');
                    item.className = 'agg-modal-item';
                    item.style.cssText = `
                        display: flex; justify-content: space-between; align-items: center;
                        margin: 8px 0; padding: 8px 12px;
                        border-radius: 28px; gap: 8px; width: 100%; box-sizing: border-box;
                        transition: background 0.2s ease;
                        cursor: pointer;
                    `;
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'agg-engine-name';
                    nameSpan.textContent = engine.name;
                    nameSpan.style.cssText = `
                        font-size: 14px; font-weight: 500; overflow: hidden;
                        text-overflow: ellipsis; white-space: nowrap; flex: 1;
                        text-align: left; display: block;
                        pointer-events: none;
                    `;
                    
                    const btnContainer = document.createElement('div');
                    btnContainer.style.cssText = 'display: flex; gap: 6px; flex-shrink: 0;';
                    
                    const upBtn = document.createElement('button');
                    upBtn.textContent = '↑';
                    upBtn.style.cssText = `
                        background: #3a6ea5; border: none; border-radius: 20px;
                        width: 32px; height: 32px; min-width: 32px;
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 18px; font-weight: bold; cursor: pointer;
                        opacity: ${idx === 0 ? '0.4' : '1'};
                    `;
                    if (idx !== 0) {
                        upBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            moveEngine(idx, 'up');
                        });
                    }
                    
                    const downBtn = document.createElement('button');
                    downBtn.textContent = '↓';
                    downBtn.style.cssText = `
                        background: #3a6ea5; border: none; border-radius: 20px;
                        width: 32px; height: 32px; min-width: 32px;
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 18px; font-weight: bold; cursor: pointer;
                        opacity: ${idx === currentEngines.length - 1 ? '0.4' : '1'};
                    `;
                    if (idx !== currentEngines.length - 1) {
                        downBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            moveEngine(idx, 'down');
                        });
                    }
                    
                    const delBtn = document.createElement('button');
                    delBtn.textContent = '删除';
                    delBtn.style.cssText = `
                        background: #e34d4c; border: none; border-radius: 20px;
                        padding: 0 12px; height: 32px;
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 12px; font-weight: bold; cursor: pointer;
                    `;
                    delBtn.addEventListener('click', () => {
                        if (confirm(`确定删除「${engine.name}」吗？`)) {
                            deleteEngine(idx);
                            refreshEngineList();
                        }
                    });
                    
                    btnContainer.appendChild(upBtn);
                    btnContainer.appendChild(downBtn);
                    btnContainer.appendChild(delBtn);
                    item.appendChild(nameSpan);
                    item.appendChild(btnContainer);
                    
                    item.addEventListener('click', (e) => {
                        if (e.target === upBtn || e.target === downBtn || e.target === delBtn) return;
                        const nameInput = addSection.querySelector('#newEngineName');
                        const urlInput = addSection.querySelector('#newEngineUrl');
                        const addBtn = addSection.querySelector('#addEngineBtn');
                        nameInput.value = engine.name;
                        urlInput.value = engine.url;
                        editingIndex = idx;
                        addBtn.textContent = '更新引擎';
                        addBtn.style.background = '#f39c12';
                    });
                    
                    listDiv.appendChild(item);
                });
            }
            if (modalElement) applyThemeToModal();
        }
        
        refreshEngineListInModal = refreshEngineList;
        refreshEngineList();
        panel.appendChild(listDiv);

        const addSection = document.createElement('div');
        addSection.style.cssText = 'margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 16px;';
        addSection.innerHTML = `
            <div style="font-size:15px; margin-bottom:12px; font-weight:500;">➕ 添加/编辑搜索引擎</div>
            <input type="text" id="newEngineName" class="agg-modal-input" placeholder="引擎名称 (例: Yandex)" style="width:100%; padding:12px 14px; margin-bottom:12px; border-radius:28px; font-size:14px; box-sizing:border-box; outline:none; transition: background 0.2s ease, color 0.2s ease;">
            <input type="text" id="newEngineUrl" class="agg-modal-input" placeholder="搜索URL (使用 %s 代替关键词)" style="width:100%; padding:12px 14px; margin-bottom:16px; border-radius:28px; font-size:14px; box-sizing:border-box; outline:none; transition: background 0.2s ease, color 0.2s ease;">
            <button id="addEngineBtn" style="border:none; width:100%; padding:12px; border-radius:40px; font-size:16px; font-weight:bold; color:white; cursor:pointer; margin-bottom:8px; transition: background 0.2s ease;">添加引擎</button>
            <button id="closeModalBtn" style="border:none; width:100%; padding:12px; border-radius:40px; font-size:15px; font-weight:500; cursor:pointer; margin-top:12px; transition: background 0.2s ease, color 0.2s ease;">关闭</button>
        `;
        const nameInput = addSection.querySelector('#newEngineName');
        const urlInput = addSection.querySelector('#newEngineUrl');
        const addBtn = addSection.querySelector('#addEngineBtn');
        
        addBtn.addEventListener('click', () => {
            const newName = nameInput.value.trim();
            let newUrl = urlInput.value.trim();
            if (!newName || !newUrl) {
                alert('请完整填写名称和URL');
                return;
            }
            if (!/^https?:\/\//i.test(newUrl)) newUrl = 'https://' + newUrl;
            
            if (editingIndex !== -1) {
                if (updateEngine(editingIndex, newName, newUrl)) {
                    nameInput.value = '';
                    urlInput.value = '';
                    addBtn.textContent = '添加引擎';
                    addBtn.style.background = '#2b7e3a';
                    editingIndex = -1;
                    refreshEngineList();
                    alert(`成功更新 "${newName}"`);
                }
            } else {
                if (addEngine(newName, newUrl)) {
                    nameInput.value = '';
                    urlInput.value = '';
                    refreshEngineList();
                    alert(`成功添加 "${newName}"`);
                }
            }
        });
        
        function resetEditMode() {
            if (editingIndex !== -1) {
                editingIndex = -1;
                addBtn.textContent = '添加引擎';
                addBtn.style.background = '#2b7e3a';
            }
        }
        nameInput.addEventListener('input', function() {
            if (this.value === '' && urlInput.value === '') resetEditMode();
        });
        urlInput.addEventListener('input', function() {
            if (nameInput.value === '' && this.value === '') resetEditMode();
        });
        
        addSection.querySelector('#closeModalBtn').addEventListener('click', closeModal);
        panel.appendChild(addSection);
        modal.appendChild(panel);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        document.body.appendChild(modal);
        modalElement = modal;

        applyThemeToModal();
    }

    function closeModal() {
        if (modalElement?.parentNode) modalElement.parentNode.removeChild(modalElement);
        modalElement = null;
        refreshEngineListInModal = null;
        isModalOpen = false;
        unforceShowToolbar();
        editingIndex = -1;
    }

    function menuOpenSettings() {
        openSettingsModal();
    }

    GM_registerMenuCommand('⚙️ 打开管理界面', menuOpenSettings);

    function init() {
        if (window.top !== window.self) return;
        loadEngines();
        if (!isAllowedPage()) return;
        renderToolbar();
        new MutationObserver(() => {
            if (!document.getElementById('aggregated-search-toolbar') && document.body) renderToolbar();
        }).observe(document.body, { childList: true, subtree: false });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
