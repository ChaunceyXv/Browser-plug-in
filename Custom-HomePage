// ==UserScript==
// @name         Custom HomePage
// @namespace    https://github.com/user/Custom-HomePage
// @version      2.9.0
// @description  自定义主页（优化版 P0-P2）
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

/**
 * ============================================================
 *  Custom HomePage — 基础框架规范（AI 开发约束）
 * ============================================================
 *
 * 【架构】
 *   数据层 → 配置管理 → 工具函数 → Loader → 五个功能模块 → 渲染入口
 *
 * 【模块列表】
 *   Search      — 搜索模块（始终可见，z-index: 1）
 *   Shortcuts   — 快捷方式模块（默认可见，配置可隐藏）
 *                 · 长按进入编辑模式
 *                 · 编辑模式：删除、编辑、拖拽排序（移动端触摸）、占位添加
 *   Bookmarks   — 书签面板（默认隐藏，从底部滑入，点击 Logo 触发）
 *   Settings    — 设置面板（默认隐藏，从底部滑入，长按 Logo 触发）
 *   Loader      — 全局加载指示器（右上角跳动圆点，自动触发）
 *
 * 【渲染机制】
 *   - renderHomepage() 只提供 6 个空容器，禁止在此处添加任何模块样式或逻辑
 *   - 每个模块通过自己的 init() 获取容器并注入 render() 返回的 HTML
 *   - 模块样式完全封装在各自的 <style> 中，互不影响
 *
 * 【持久化变量】
 *   GM_key: homepage_config
 *   结构: { homepage, shortcutsVisible, searchEngines, defaultEngine, bookmarkRoot, shortcuts }
 *   - 新增配置项直接在 Config.defaults 中添加字段
 *   - 模块禁止直接调用 Storage，必须通过 Config 读写
 *
 * 【全局颜色池】
 *   12 个预设颜色，用于搜索引擎图标、快捷方式图标、书签图标等
 *
 * 【开发约束（AI 必须遵守）】
 *   - 全局行为放 renderHomepage()，模块行为放各自模块内
 *   - 新增持久化数据走 Config，不直接调用 Storage
 *   - 面板类模块（Bookmarks、Settings）统一提供 show() / hide() / bindEvents()
 *   - 可见类模块（Search、Shortcuts）统一提供 render() / init()
 *   - 优先引用移动端特性，禁止引用 PC 端特性（如 wheel 事件、Ctrl 快捷键、HTML5 Drag API 用于排序）
 *   - 规范注释为框架永久组成部分，禁止删除或遗漏，每次输出完整代码必须包含
 *   - 每次代码改动后，如有规范变更必须更新本注释
 *
 * ============================================================
 */

(function() {
    'use strict';

    if (window.top !== window.self) return;

    const ColorPool = [
        '#008373', '#2932E1', '#DE5833', '#4285F4',
        '#EA4335', '#1A73E8', '#1DA1F2', '#333333',
        '#FF6B35', '#7B1FA2', '#00ACC1', '#FFB300'
    ];

    const EventBus = (() => {
        const events = {};
        return {
            on(event, callback) {
                (events[event] = events[event] || []).push(callback);
            },
            off(event, callback) {
                if (events[event]) events[event] = events[event].filter(cb => cb !== callback);
            },
            emit(event, data) {
                (events[event] || []).forEach(cb => { try { cb(data); } catch(e) { console.error(e); } });
            }
        };
    })();

    const Storage = {
        get(key, fallback) { return GM_getValue(key, fallback); },
        set(key, value) { GM_setValue(key, value); }
    };

    const Config = (() => {
        const KEY = 'homepage_config';
        let cache = null;
        let saveTimer = null;
        let isDirty = false;

        const defaults = {
            homepage: '',
            shortcutsVisible: true,
            searchEngines: [
                { name: 'Bing', url: 'https://www.bing.com/search?q=', color: '#008373' },
                { name: 'Baidu', url: 'https://www.baidu.com/s?wd=', color: '#2932E1' },
                { name: 'Google', url: 'https://www.google.com/search?q=', color: '#4285F4' },
                { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', color: '#DE5833' }
            ],
            defaultEngine: 'Bing',
            bookmarkRoot: {
                id: 'root', title: '书签栏', type: 'folder', expanded: true, collapsible: false, children: [
                    { id: 'f1', title: '常用', type: 'folder', expanded: true, color: '#008373', children: [
                        { id: 'b1', title: 'GitHub', type: 'bookmark', url: 'https://github.com', color: '#333333' },
                        { id: 'b2', title: 'Google', type: 'bookmark', url: 'https://www.google.com', color: '#4285F4' }
                    ]},
                    { id: 'f2', title: '工具', type: 'folder', expanded: false, color: '#DE5833', children: [
                        { id: 'f3', title: '设计资源', type: 'folder', expanded: false, color: '#7B1FA2', children: [
                            { id: 'b5', title: 'Figma', type: 'bookmark', url: 'https://figma.com', color: '#1A73E8' },
                            { id: 'b6', title: 'Dribbble', type: 'bookmark', url: 'https://dribbble.com', color: '#EA4335' }
                        ]},
                        { id: 'b3', title: '翻译', type: 'bookmark', url: 'https://translate.google.com', color: '#1DA1F2' },
                        { id: 'b4', title: '开发者文档', type: 'bookmark', url: 'https://developer.mozilla.org', color: '#FF6B35' }
                    ]},
                    { id: 'b7', title: 'YouTube', type: 'bookmark', url: 'https://youtube.com', color: '#FF0000' }
                ]
            },
            shortcuts: [
                { id: 's1', title: 'GitHub', url: 'https://github.com', color: '#333333' },
                { id: 's2', title: 'YouTube', url: 'https://youtube.com', color: '#FF0000' },
                { id: 's3', title: 'Gmail', url: 'https://mail.google.com', color: '#EA4335' },
                { id: 's4', title: '地图', url: 'https://maps.google.com', color: '#4285F4' },
                { id: 's5', title: '翻译', url: 'https://translate.google.com', color: '#1A73E8' },
                { id: 's6', title: 'Twitter', url: 'https://twitter.com', color: '#1DA1F2' }
            ]
        };

        function load() {
            if (cache) return cache;
            try {
                const merged = JSON.parse(JSON.stringify(defaults));
                const stored = Storage.get(KEY, {});
                Object.assign(merged, stored);
                
                if (!Array.isArray(merged.searchEngines) || merged.searchEngines.length === 0) {
                    merged.searchEngines = JSON.parse(JSON.stringify(defaults.searchEngines));
                }
                if (!merged.searchEngines.some(e => e.name === merged.defaultEngine)) {
                    merged.defaultEngine = merged.searchEngines[0].name;
                }
                cache = merged;
                return merged;
            } catch (e) {
                console.error('Config load failed, using defaults', e);
                cache = JSON.parse(JSON.stringify(defaults));
                return cache;
            }
        }

        function save(config) {
            try {
                Storage.set(KEY, config);
                cache = config;
            } catch (e) { console.error('Config save failed', e); }
        }

        function scheduleSave() {
            isDirty = true;
            if (saveTimer) clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                if (isDirty) {
                    Storage.set(KEY, cache);
                    isDirty = false;
                }
                saveTimer = null;
            }, 150);
        }

        function get(path) {
            const cfg = load();
            return path.split('.').reduce((o, k) => o[k], cfg);
        }

        function update(path, value) {
            const cfg = load();
            const keys = path.split('.');
            const last = keys.pop();
            const obj = keys.reduce((o, k) => o[k], cfg);
            obj[last] = value;
            cache = cfg;
            scheduleSave();
            EventBus.emit('config:updated', { path, value });
        }

        return { load, save, update, get defaults() { return defaults; } };
    })();

    const Utils = {
        getCurrentUrl() { return window.location.href; },
        isHomepage() { const c = Config.load(); return c.homepage !== '' && c.homepage === this.getCurrentUrl(); },
        truncate(str, max) { return str.length > max ? str.slice(0, max) + '...' : str; },
        randomColor() { return ColorPool[Math.floor(Math.random() * ColorPool.length)]; },
        ensureUrl(url) {
            if (!url) return url;
            const trimmed = url.trim();
            if (/^(javascript|data|vbscript|file|about):/i.test(trimmed)) return '';
            if (/^https?:\/\//i.test(trimmed)) return trimmed;
            return 'https://' + trimmed;
        },
        generateId() { return 'n' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); },
        isValidNavigationUrl(url) {
            if (!url) return false;
            const trimmed = url.trim();
            return /^https?:\/\//i.test(trimmed) && !/^(javascript|data|vbscript|file|about):/i.test(trimmed);
        },
        escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },
        validateEngineUrl(url) {
            if (!url || !/^https?:\/\//i.test(url)) return false;
            return /[\?&][a-zA-Z0-9_]+=|\{query\}|%s/.test(url);
        },
        isValidColor(str) {
            return typeof str === 'string' && /^#[0-9A-Fa-f]{6}$/.test(str);
        }
    };

    const PanelHelper = {
        show(panelId, overlayId, onBeforeShow) {
            const panel = document.getElementById(panelId);
            const overlay = document.getElementById(overlayId);
            if (panel) {
                if (onBeforeShow) onBeforeShow();
                panel.classList.add('show');
            }
            if (overlay) overlay.style.pointerEvents = 'auto';
        },
        hide(panelId, overlayId, onAfterHide) {
            const panel = document.getElementById(panelId);
            const overlay = document.getElementById(overlayId);
            if (panel) {
                panel.classList.remove('show');
                if (onAfterHide) onAfterHide();
            }
            if (overlay) overlay.style.pointerEvents = 'none';
        }
    };

    const Loader = {
        render() {
            return `<style>
                #global-loader { position:fixed; top:16px; right:16px; display:flex; gap:6px; z-index:999; opacity:0; pointer-events:none; transition:opacity .2s; }
                #global-loader.show { opacity:1; }
                .loader-dot { width:8px; height:8px; border-radius:50%; background:var(--loader-color,#008373); animation:dot-bounce .6s ease-in-out infinite; }
                .loader-dot:nth-child(1) { animation-delay:0s; }
                .loader-dot:nth-child(2) { animation-delay:.15s; }
                .loader-dot:nth-child(3) { animation-delay:.3s; }
                @keyframes dot-bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
            </style>
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>
            <div class="loader-dot"></div>`;
        },
        show() {
            const el = document.getElementById('global-loader');
            if (el) el.classList.add('show');
        },
        init() {
            const container = document.getElementById('global-loader-container');
            if (!container) return;
            container.innerHTML = this.render();
            const searchForm = document.getElementById('search-form');
            if (searchForm) searchForm.addEventListener('submit', () => this.show(), true);
            window.addEventListener('beforeunload', () => this.show());
            EventBus.on('engine:color-changed', color => {
                const el = document.getElementById('global-loader');
                if (el) el.style.setProperty('--loader-color', color);
            });
        }
    };

    const Dialog = (() => {
        let currentConfig = null;
        function getEl(id) { return document.querySelector('#dialog-container ' + id); }
        function show(config) {
            currentConfig = config;
            const overlay = getEl('#dialog-overlay');
            if (!overlay) return;
            overlay.classList.add('show');
            if (config.mode === 'alert') {
                getEl('#dialog-title').textContent = config.title || '';
                getEl('#dialog-input-wrap').style.display = 'none';
                getEl('#dialog-url-wrap').style.display = 'none';
                getEl('#dialog-color-wrap').style.display = 'none';
                getEl('#dialog-confirm').textContent = config.confirmText || '知道了';
                getEl('#dialog-cancel').style.display = 'none';
                return;
            }
            getEl('#dialog-title').textContent = config.title || '';
            const inputWrap = getEl('#dialog-input-wrap');
            const urlWrap = getEl('#dialog-url-wrap');
            const colorWrap = getEl('#dialog-color-wrap');
            inputWrap.style.display = (config.mode === 'confirm') ? 'none' : '';
            urlWrap.style.display = (config.mode === 'prompt-url' || config.mode === 'prompt-url-color') ? '' : 'none';
            colorWrap.style.display = (config.mode === 'prompt-url-color') ? '' : 'none';
            getEl('#dialog-cancel').style.display = '';
            if (config.mode !== 'confirm') {
                getEl('#dialog-input').value = config.value || '';
                getEl('#dialog-input').placeholder = config.placeholder || '';
            }
            if (urlWrap.style.display !== 'none') {
                getEl('#dialog-url').value = config.urlValue || 'https://';
            }
            if (colorWrap.style.display !== 'none') {
                const pool = getEl('#dialog-color-pool');
                pool.innerHTML = ColorPool.map(c => 
                    `<div class="dialog-color-item ${c === config.colorValue ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`
                ).join('');
                pool.querySelectorAll('.dialog-color-item').forEach(item => {
                    item.addEventListener('click', () => {
                        pool.querySelectorAll('.dialog-color-item').forEach(el => el.classList.remove('selected'));
                        item.classList.add('selected');
                    });
                });
            }
            getEl('#dialog-confirm').textContent = config.confirmText || '确定';
            getEl('#dialog-cancel').textContent = config.cancelText || '取消';
            getEl('#dialog-input').focus();
        }
        function hide() {
            const overlay = getEl('#dialog-overlay');
            if (overlay) overlay.classList.remove('show');
            currentConfig = null;
        }
        function getValues() {
            const values = {
                value: getEl('#dialog-input')?.value || '',
                url: getEl('#dialog-url')?.value || '',
                color: getEl('#dialog-color-pool')?.querySelector('.selected')?.dataset.color || ColorPool[0]
            };
            return values;
        }
        function initDialog() {
            const container = document.getElementById('dialog-container');
            if (!container) return;
            container.innerHTML = `
                <style>
                    #dialog-container { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:300; }
                    .dialog-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:301; display:none; align-items:center; justify-content:center; }
                    .dialog-overlay.show { display:flex; }
                    .dialog-box { background:#fff; border-radius:14px; padding:20px; width:80%; max-width:340px; box-shadow:0 8px 30px rgba(0,0,0,0.2); }
                    .dialog-title { font-size:16px; font-weight:600; color:#333; margin-bottom:16px; text-align:center; }
                    .dialog-input-wrap { margin-bottom:10px; }
                    .dialog-input { width:100%; padding:10px 12px; border:1px solid #e0e0e0; border-radius:8px; font-size:14px; color:#333; outline:none; background:#f9f9f9; }
                    .dialog-input:focus { border-color:var(--engine-color,#008373); }
                    .dialog-color-label { font-size:12px; color:#999; margin-bottom:6px; }
                    .dialog-color-pool { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; }
                    .dialog-color-item { width:100%; aspect-ratio:1; border-radius:6px; cursor:pointer; border:2px solid transparent; }
                    .dialog-color-item.selected { border-color:#333; }
                    .dialog-buttons { display:flex; gap:10px; margin-top:6px; }
                    .dialog-btn { flex:1; padding:10px; border:none; border-radius:8px; font-size:14px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
                    .dialog-btn-cancel { background:#f0f0f0; color:#666; }
                    .dialog-btn-confirm { background:var(--engine-color,#008373); color:#fff; }
                </style>
                <div class="dialog-overlay" id="dialog-overlay">
                    <div class="dialog-box">
                        <div class="dialog-title" id="dialog-title"></div>
                        <div class="dialog-input-wrap" id="dialog-input-wrap">
                            <input class="dialog-input" id="dialog-input">
                        </div>
                        <div class="dialog-input-wrap" id="dialog-url-wrap" style="display:none">
                            <input class="dialog-input" id="dialog-url" placeholder="URL">
                        </div>
                        <div class="dialog-input-wrap" id="dialog-color-wrap" style="display:none">
                            <div class="dialog-color-label">图标颜色</div>
                            <div class="dialog-color-pool" id="dialog-color-pool"></div>
                        </div>
                        <div class="dialog-buttons">
                            <button class="dialog-btn dialog-btn-cancel" id="dialog-cancel">取消</button>
                            <button class="dialog-btn dialog-btn-confirm" id="dialog-confirm">确定</button>
                        </div>
                    </div>
                </div>
            `;
            const overlay = getEl('#dialog-overlay');
            if (overlay) {
                overlay.addEventListener('click', e => {
                    if (e.target === overlay) hide();
                });
            }
            getEl('#dialog-cancel').addEventListener('click', hide);
            getEl('#dialog-confirm').addEventListener('click', () => {
                if (currentConfig && currentConfig.onConfirm) {
                    currentConfig.onConfirm(getValues());
                }
                hide();
            });
            getEl('#dialog-input')?.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const urlInput = getEl('#dialog-url');
                    if (urlInput && urlInput.offsetParent !== null) urlInput.focus();
                    else getEl('#dialog-confirm').click();
                }
            });
            getEl('#dialog-url')?.addEventListener('keydown', e => {
                if (e.key === 'Enter') getEl('#dialog-confirm').click();
            });
        }
        return { show, hide, initDialog };
    })();

    const Search = {
        currentEngine: null, engines: [], dropdownVisible: false, longPressTimer: null, longPressTriggered: false,
        preventClick: false,
        abortController: null,
        render() {
            const c = Config.load();
            this.engines = c.searchEngines;
            this.currentEngine = this.engines.find(e => e.name === c.defaultEngine) || this.engines[0];
            if (!this.currentEngine) {
                this.currentEngine = { name: 'Search', url: 'https://www.google.com/search?q=', color: '#4285F4' };
            }
            const safeName = Utils.escapeHtml(this.currentEngine.name);
            const dn = Utils.truncate(this.currentEngine.name, 6);
            return `<style>
                #search-area { position:absolute; top:30%; left:50%; transform:translateX(-50%); width:80%; z-index:1; }
                .search-logo { display:inline-block; text-align:center; margin-bottom:40px; font-size:48px; font-weight:700; color:var(--engine-color); transition:color .2s; cursor:pointer; -webkit-tap-highlight-color:transparent; user-select:none; -webkit-user-select:none; }
                @keyframes glow-pulse { 0% { box-shadow:0 0 8px 0 var(--engine-color-33),0 0 16px 0 var(--engine-color-1a); } 50% { box-shadow:0 0 16px 0 var(--engine-color-33),0 0 28px 0 var(--engine-color-1a); } 100% { box-shadow:0 0 8px 0 var(--engine-color-33),0 0 16px 0 var(--engine-color-1a); } }
                .search-box { display:flex; align-items:center; background:transparent; border:2px solid #e0e0e0; border-radius:12px; overflow:visible; position:relative; transition:border-color .2s; width:100%; min-width:280px; }
                .search-box:focus-within { border-color:var(--engine-color); animation:glow-pulse 3s ease-in-out infinite; }
                .search-engine-btn { display:flex; align-items:center; gap:6px; height:44px; padding:0 10px; cursor:pointer; flex-shrink:0; -webkit-tap-highlight-color:transparent; }
                .search-engine-icon { width:32px; height:32px; border-radius:8px; background:var(--engine-color); color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:600; flex-shrink:0; }
                .search-engine-name { font-size:13px; color:#666; white-space:nowrap; }
                .search-engine-arrow { font-size:10px; color:#e0e0e0; line-height:1; transition:color .2s; }
                .search-box:focus-within .search-engine-arrow { color:var(--engine-color); }
                .search-engine-dropdown { position:absolute; top:48px; left:0; background:#fff; border:1px solid #e0e0e0; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,.12); z-index:50; display:none; padding:6px 0; white-space:nowrap; }
                .search-engine-dropdown.show { display:block; }
                .search-engine-option { display:flex; align-items:center; gap:10px; padding:10px 14px 10px 10px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-size:14px; }
                .search-engine-option:active { background:#f0f0f0; }
                .search-engine-option .engine-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px; font-weight:600; flex-shrink:0; }
                .search-engine-option .engine-name { color:#333; }
                #search-input { flex:1; border:none; background:transparent; padding:14px 8px; font-size:16px; color:#333; outline:none; min-width:0; user-select:text; }
                .search-submit-btn { width:44px; height:44px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; -webkit-tap-highlight-color:transparent; }
                .search-submit-btn svg { width:20px; height:20px; stroke:#e0e0e0; fill:none; stroke-width:2; transition:stroke .2s; }
                .search-box:focus-within .search-submit-btn svg { stroke:var(--engine-color); }
            </style>
            <div style="text-align:center"><div class="search-logo" id="search-logo">${safeName}</div></div>
            <div class="search-box" id="search-box">
                <div class="search-engine-btn" id="engine-btn">
                    <div class="search-engine-icon" id="engine-icon">${safeName.charAt(0)}</div>
                    <span class="search-engine-name" id="engine-name">${dn}</span>
                    <span class="search-engine-arrow">&#9660;</span>
                </div>
                <!-- P1#2 防御注释：下拉菜单事件依赖容器 #engine-dropdown，禁止直接替换该元素，只能用 innerHTML 更新选项 -->
                <div class="search-engine-dropdown" id="engine-dropdown">
                    ${this.engines.map(e => `<div class="search-engine-option" data-engine="${Utils.escapeHtml(e.name)}"><div class="engine-icon" style="background:${e.color}">${Utils.escapeHtml(e.name.charAt(0))}</div><span class="engine-name">${Utils.escapeHtml(e.name)}</span></div>`).join('')}
                </div>
                <form id="search-form" style="display:contents">
                    <input type="text" id="search-input" enterkeyhint="go" autocomplete="off">
                    <div class="search-submit-btn" id="search-submit">
                        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </div>
                </form>
            </div>`;
        },
        init() {
            const container = document.getElementById('search-area');
            if (container) {
                if (this.abortController) this.abortController.abort();
                this.abortController = new AbortController();
                container.innerHTML = this.render();
                this.applyEngineColors();
                this.bindEvents();
            }
        },
        applyEngineColors() {
            const color = this.currentEngine.color;
            const area = document.getElementById('search-area');
            if (area) {
                area.style.setProperty('--engine-color', color);
                area.style.setProperty('--engine-color-33', color+'33');
                area.style.setProperty('--engine-color-1a', color+'1a');
            }
            EventBus.emit('engine:color-changed', color);
        },
        getCurrentColor() { return this.currentEngine ? this.currentEngine.color : '#008373'; },
        refreshDropdown() {
            const engines = Config.get('searchEngines');
            this.engines = engines;
            this.currentEngine = engines.find(e => e.name === Config.get('defaultEngine')) || engines[0] || null;
            if (!this.currentEngine) {
                this.currentEngine = { name: 'Search', url: 'https://www.google.com/search?q=', color: '#4285F4' };
            }
            const dd = document.getElementById('engine-dropdown');
            if (dd) {
                dd.innerHTML = engines.map(e => 
                    `<div class="search-engine-option" data-engine="${Utils.escapeHtml(e.name)}"><div class="engine-icon" style="background:${e.color}">${Utils.escapeHtml(e.name.charAt(0))}</div><span class="engine-name">${Utils.escapeHtml(e.name)}</span></div>`
                ).join('');
            }
            const engineIcon = document.getElementById('engine-icon');
            const engineName = document.getElementById('engine-name');
            const searchLogo = document.getElementById('search-logo');
            if (engineIcon) engineIcon.textContent = this.currentEngine.name.charAt(0);
            if (engineName) engineName.textContent = Utils.truncate(this.currentEngine.name, 6);
            if (searchLogo) {
                searchLogo.textContent = this.currentEngine.name;
                searchLogo.style.color = this.currentEngine.color;
            }
            this.applyEngineColors();
        },
        bindEvents() {
            const area = document.getElementById('search-area');
            if (!area) return;
            const signal = this.abortController.signal;
            const logo = document.getElementById('search-logo');
            const engineBtn = document.getElementById('engine-btn');
            const dropdown = document.getElementById('engine-dropdown');
            const searchInput = document.getElementById('search-input');
            const submitBtn = document.getElementById('search-submit');
            const arrow = engineBtn.querySelector('.search-engine-arrow');

            logo.addEventListener('touchstart', () => {
                clearTimeout(this.longPressTimer);
                this.preventClick = false;
                this.longPressTriggered = false;
                this.longPressTimer = setTimeout(() => {
                    this.longPressTriggered = true;
                    this.preventClick = true;
                    Settings.show();
                }, 500);
            }, { signal });
            logo.addEventListener('touchend', () => {
                clearTimeout(this.longPressTimer);
            }, { signal });
            logo.addEventListener('touchmove', () => clearTimeout(this.longPressTimer), { signal });
            logo.addEventListener('click', (e) => {
                if (this.preventClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.preventClick = false;
                } else {
                    Bookmarks.show();
                }
            }, { signal });

            engineBtn.addEventListener('click', () => {
                this.dropdownVisible = !this.dropdownVisible;
                dropdown.classList.toggle('show', this.dropdownVisible);
                arrow.innerHTML = this.dropdownVisible ? '&#9650;' : '&#9660;';
            }, { signal });
            dropdown.addEventListener('click', (e) => {
                const option = e.target.closest('.search-engine-option');
                if (!option) return;
                const name = option.dataset.engine;
                Config.update('defaultEngine', name);
                this.dropdownVisible = false;
                dropdown.classList.remove('show');
                arrow.innerHTML = '&#9660;';
                this.refreshDropdown();
                searchInput.focus();
            }, { signal });
            document.addEventListener('click', (e) => {
                if (this.dropdownVisible && !engineBtn.contains(e.target) && !dropdown.contains(e.target)) {
                    this.dropdownVisible = false;
                    dropdown.classList.remove('show');
                    arrow.innerHTML = '&#9660;';
                }
            }, { signal });

            const doSearch = () => {
                const q = searchInput.value.trim();
                if (q && this.currentEngine) {
                    Loader.show();
                    window.location.href = this.currentEngine.url + encodeURIComponent(q);
                }
            };
            submitBtn.addEventListener('click', doSearch, { signal });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    doSearch();
                }
            }, { signal });

            EventBus.on('config:updated', ({ path }) => {
                if (path === 'searchEngines' || path === 'defaultEngine') this.refreshDropdown();
            });
        }
    };

    const Shortcuts = (() => {
        const COLS = 4, ROWS = 3;
        let editing = false;
        let eventsBound = false;
        let dragStartIndex = -1;
        let touchDragElement = null;
        let touchStartX = 0, touchStartY = 0;
        let ignoreNextClick = false;
        let rafPending = false;
        let isDragging = false;
        let abortController = null;

        function getMaxSlots() { return COLS * ROWS; }

        function render() {
            const shortcuts = Config.get('shortcuts') || [];
            const maxSlots = getMaxSlots();
            const items = [];
            for (let i = 0; i < maxSlots; i++) {
                if (i < shortcuts.length) {
                    const s = shortcuts[i];
                    items.push(`
                        <div class="shortcut-item ${editing ? 'editing' : ''}" data-index="${i}" data-id="${s.id}">
                            <div class="shortcut-icon" style="background:${s.color}">
                                ${Utils.escapeHtml(s.title.charAt(0))}
                                ${editing ? `<span class="shortcut-delete" data-index="${i}">✕</span>` : ''}
                            </div>
                            <span class="shortcut-title">${Utils.escapeHtml(s.title)}</span>
                        </div>
                    `);
                } else {
                    if (editing && i === shortcuts.length) {
                        items.push(`<div class="shortcut-item placeholder" data-action="add"><div class="shortcut-icon placeholder-icon">+</div><span class="shortcut-title">添加</span></div>`);
                    } else {
                        items.push('<div class="shortcut-item empty"></div>');
                    }
                }
            }
            return `<style>
                #shortcuts-area { position:absolute; top:calc(30% + 180px); left:50%; transform:translateX(-50%); width:80%; display:${Config.get('shortcutsVisible') !== false ? 'grid' : 'none'}; grid-template-columns:repeat(${COLS},1fr); grid-template-rows:repeat(${ROWS},auto); gap:24px 8px; justify-items:center; }
                .shortcut-item { display:flex; flex-direction:column; align-items:center; gap:10px; cursor:pointer; -webkit-tap-highlight-color:transparent; text-decoration:none; width:72px; position:relative; transition:transform 0.2s; }
                .shortcut-item.empty { pointer-events:none; }
                .shortcut-item.editing .shortcut-icon { animation:wiggle .3s ease-in-out infinite alternate; }
                @keyframes wiggle { 0% { transform:rotate(-1deg); } 100% { transform:rotate(1deg); } }
                .shortcut-item:active .shortcut-icon { transform:scale(.92); }
                .shortcut-item.drag-moving { opacity:0.4; }
                .shortcut-item.drag-over { outline: 2px dashed var(--engine-color, #008373); outline-offset: 4px; border-radius: 12px; background: rgba(0,0,0,0.03); }
                .shortcut-icon { width:56px; height:56px; border-radius:14px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:26px; font-weight:600; flex-shrink:0; transition:transform .15s; position:relative; }
                .shortcut-delete { position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:var(--engine-color,#008373); color:#fff; font-size:11px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:2; line-height:1; }
                .placeholder-icon { background:#e0e0e0!important; color:#999!important; font-size:28px; }
                .shortcut-title { font-size:11px; color:#666; text-align:center; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:72px; }
            </style>${items.join('')}`;
        }

        function init() {
            const container = document.getElementById('shortcuts-area');
            if (container) {
                if (abortController) abortController.abort();
                abortController = new AbortController();
                const wasEditing = editing;
                container.innerHTML = render();
                if (wasEditing) editing = true;
                if (!eventsBound) {
                    bindEvents();
                    eventsBound = true;
                }
            }
        }

        function bindEvents() {
            const container = document.getElementById('shortcuts-area');
            if (!container) return;
            const signal = abortController.signal;

            let pressTimer;
            container.addEventListener('touchstart', (e) => {
                const item = e.target.closest('.shortcut-item:not(.empty):not(.placeholder)');
                if (!item || editing) return;
                pressTimer = setTimeout(() => {
                    ignoreNextClick = true;
                    editing = true;
                    init();
                }, 500);
            }, { signal });
            container.addEventListener('touchend', () => clearTimeout(pressTimer), { signal });
            container.addEventListener('touchmove', () => clearTimeout(pressTimer), { signal });

            document.addEventListener('click', function exitEdit(e) {
                if (!editing) return;
                const target = e.target;
                if (target.closest('#shortcuts-area') || 
                    target.closest('#bookmarks-panel') || 
                    target.closest('#settings-panel') || 
                    target.closest('.dialog-overlay') ||
                    target.closest('#bookmarks-context-menu')) {
                    return;
                }
                editing = false;
                init();
            }, { signal });

            container.addEventListener('click', (e) => {
                if (ignoreNextClick) {
                    ignoreNextClick = false;
                    return;
                }
                const item = e.target.closest('.shortcut-item:not(.empty)');
                if (!item) return;
                const index = parseInt(item.dataset.index);
                if (!editing) {
                    const shortcuts = Config.get('shortcuts');
                    if (shortcuts[index] && Utils.isValidNavigationUrl(shortcuts[index].url)) {
                        Loader.show();
                        window.location.href = shortcuts[index].url;
                    }
                    return;
                }
                const delBtn = e.target.closest('.shortcut-delete');
                if (delBtn) {
                    e.stopPropagation();
                    const delIndex = parseInt(delBtn.dataset.index);
                    const shortcuts = Config.get('shortcuts');
                    shortcuts.splice(delIndex, 1);
                    Config.update('shortcuts', shortcuts);
                    init();
                    return;
                }
                if (e.target.closest('.shortcut-item.placeholder')) {
                    Dialog.show({
                        mode: 'prompt-url-color',
                        title: '添加快捷方式',
                        value: '',
                        urlValue: 'https://',
                        colorValue: Utils.randomColor(),
                        onConfirm: (vals) => {
                            const title = vals.value.trim();
                            const url = Utils.ensureUrl(vals.url.trim());
                            if (!title || !url) return;
                            const shortcuts = Config.get('shortcuts');
                            if (shortcuts.length >= getMaxSlots()) return;
                            shortcuts.push({ id: Utils.generateId(), title, url, color: vals.color });
                            Config.update('shortcuts', shortcuts);
                            init();
                        }
                    });
                    return;
                }
                const shortcuts = Config.get('shortcuts');
                const s = shortcuts[index];
                if (s) {
                    Dialog.show({
                        mode: 'prompt-url-color',
                        title: '编辑快捷方式',
                        value: s.title,
                        urlValue: s.url,
                        colorValue: s.color,
                        onConfirm: (vals) => {
                            s.title = vals.value.trim();
                            s.url = Utils.ensureUrl(vals.url.trim());
                            s.color = vals.color;
                            Config.update('shortcuts', shortcuts);
                            init();
                        }
                    });
                }
            }, { signal });

            container.addEventListener('touchstart', (e) => {
                if (!editing) return;
                const item = e.target.closest('.shortcut-item.editing');
                if (!item || e.target.closest('.shortcut-delete')) return;
                touchDragElement = item;
                dragStartIndex = parseInt(item.dataset.index);
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                isDragging = false;
                item.classList.add('drag-moving');
            }, { passive: false, signal });

            container.addEventListener('touchmove', (e) => {
                if (!touchDragElement) return;
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);
                if (!isDragging && absDy > absDx && absDy > 10) {
                    touchDragElement.classList.remove('drag-moving');
                    touchDragElement = null;
                    isDragging = false;
                    return;
                }
                if (!isDragging && (absDx > 5 || absDy > 5)) {
                    isDragging = true;
                }
                if (!isDragging) return;
                e.preventDefault();
                touchDragElement.style.transform = `translate(${dx}px, ${dy}px)`;

                if (!rafPending) {
                    rafPending = true;
                    requestAnimationFrame(() => {
                        container.querySelectorAll('.shortcut-item.drag-over').forEach(el => el.classList.remove('drag-over'));
                        const overElement = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.shortcut-item.editing');
                        if (overElement && overElement !== touchDragElement) {
                            overElement.classList.add('drag-over');
                        }
                        rafPending = false;
                    });
                }
            }, { passive: false, signal });

            container.addEventListener('touchend', (e) => {
                if (!touchDragElement) return;
                touchDragElement.style.transform = '';
                touchDragElement.classList.remove('drag-moving');
                container.querySelectorAll('.shortcut-item.drag-over').forEach(el => el.classList.remove('drag-over'));
                if (isDragging) {
                    const touch = e.changedTouches[0];
                    const overElement = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.shortcut-item.editing');
                    if (overElement && overElement !== touchDragElement) {
                        const targetIndex = parseInt(overElement.dataset.index);
                        if (targetIndex !== dragStartIndex) {
                            const shortcuts = Config.get('shortcuts');
                            const [moved] = shortcuts.splice(dragStartIndex, 1);
                            shortcuts.splice(targetIndex, 0, moved);
                            Config.update('shortcuts', shortcuts);
                        }
                    }
                }
                touchDragElement = null;
                dragStartIndex = -1;
                isDragging = false;
            }, { signal });
        }

        EventBus.on('config:updated', ({ path }) => {
            if (path === 'shortcuts' || path === 'shortcutsVisible') init();
        });

        return { init, getMaxSlots, show() { document.getElementById('shortcuts-area').style.display = 'grid'; }, hide() { document.getElementById('shortcuts-area').style.display = 'none'; } };
    })();

    const Bookmarks = (() => {
        let visible = false;
        let abortController = null;

        function sortChildrenCopy(nodes) {
            if (!nodes) return [];
            const copy = nodes.map(node => ({...node, children: node.children ? sortChildrenCopy(node.children) : undefined}));
            copy.sort((a, b) => a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1);
            return copy;
        }

        function findNode(tree, id) {
            for (let i = 0; i < tree.length; i++) {
                if (tree[i].id === id) return { node: tree[i], parentArray: tree, index: i };
                if (tree[i].children) {
                    const r = findNode(tree[i].children, id);
                    if (r) return r;
                }
            }
            return null;
        }

        function buildTreeNode(node, depth) {
            const isF = node.type === 'folder', isE = node.expanded !== false, ind = depth * 20;
            const color = (depth === 0) ? '#999' : (node.color || Utils.randomColor());
            const safeTitle = Utils.escapeHtml(node.title);
            if (isF) {
                let children = node.children ? node.children : [];
                if (depth === 0) {
                    children = sortChildrenCopy(children);
                } else {
                    children = children.length > 0 ? sortChildrenCopy(children) : [];
                }
                const childrenHTML = children.length > 0 ? children.map(c => buildTreeNode(c, depth+1)).join('') : `<div class="tree-empty" style="padding-left:${ind+32}px">空</div>`;
                return `<div class="tree-node" data-id="${node.id}" data-type="folder">
                    <div class="tree-row folder" style="padding-left:${ind}px" data-id="${node.id}">
                        <span class="tree-arrow ${node.id === 'root' ? 'hidden' : ''} ${isE ? 'expanded' : ''}" data-id="${node.id}">▶</span>
                        <span class="tree-icon">📁</span>
                        <span class="tree-title">${safeTitle}</span>
                        <span class="tree-menu-btn" data-id="${node.id}">⋮</span>
                    </div>
                    <div class="tree-children ${isE ? '' : 'collapsed'}" data-id="${node.id}">${childrenHTML}</div>
                </div>`;
            } else {
                const safeUrl = Utils.escapeHtml(node.url || '');
                return `<div class="tree-node" data-id="${node.id}" data-type="bookmark" data-url="${safeUrl}">
                    <div class="tree-row bookmark" style="padding-left:${ind+32}px">
                        <span class="bm-icon" style="background:${color}">${safeTitle.charAt(0)}</span>
                        <span class="tree-title">${safeTitle}</span>
                        <span class="tree-url">${safeUrl}</span>
                        <span class="tree-menu-btn" data-id="${node.id}">⋮</span>
                    </div>
                </div>`;
            }
        }

        function render() {
            const root = Config.get('bookmarkRoot');
            const treeHTML = buildTreeNode(root, 0);
            return `<style>
                #bookmarks-overlay { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:100; }
                #bookmarks-panel { position:fixed; bottom:0; left:0; width:100%; height:70%; background:#fff; border-radius:16px 16px 0 0; box-shadow:0 -4px 20px rgba(0,0,0,.15); z-index:101; transform:translateY(100%); transition:transform .3s ease-out; display:flex; flex-direction:column; pointer-events:auto; }
                #bookmarks-panel.show { transform:translateY(0); }
                .bookmarks-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; flex-shrink:0; }
                .bookmarks-title { font-size:18px; font-weight:600; color:#333; }
                .bookmarks-close { width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; -webkit-tap-highlight-color:transparent; font-size:20px; color:#999; }
                .bookmarks-close:active { background:#f0f0f0; }
                .bookmarks-list { flex:1; overflow-y:auto; padding:8px 0; -webkit-overflow-scrolling:touch; }
                .tree-row { display:flex; align-items:center; gap:8px; padding:10px 16px; cursor:pointer; -webkit-tap-highlight-color:transparent; font-size:15px; min-height:44px; }
                .tree-row:active { background:#f5f5f5; }
                .tree-arrow { width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--bm-color,#999); transition:transform .2s,color .2s; flex-shrink:0; }
                .tree-arrow.hidden { visibility:hidden; }
                .tree-arrow.expanded { transform:rotate(90deg); }
                .tree-icon { width:35px; height:35px; display:flex; align-items:center; justify-content:center; font-size:28px; flex-shrink:0; }
                .bm-icon { width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; font-weight:600; flex-shrink:0; }
                .tree-title { color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
                .tree-url { font-size:11px; color:#999; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px; flex-shrink:1; margin-left:4px; }
                .tree-menu-btn { width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; -webkit-tap-highlight-color:transparent; font-size:16px; color:#ccc; flex-shrink:0; letter-spacing:1px; font-weight:700; margin-left:auto; }
                .tree-menu-btn:active { background:#f0f0f0; }
                .context-menu { position:fixed; background:#fff; border:1px solid #e0e0e0; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.15); z-index:200; padding:6px 0; min-width:140px; display:none; }
                .context-menu.show { display:block; }
                .context-menu-item { padding:10px 16px; font-size:14px; color:#333; cursor:pointer; -webkit-tap-highlight-color:transparent; }
                .context-menu-item:active { background:#f0f0f0; }
                .context-menu-item.danger { color:#e55; }
                .context-menu-item.disabled { color:#ccc; pointer-events:none; }
                .tree-children.collapsed { display:none; }
                .tree-empty { padding:8px 16px; color:#ccc; font-size:13px; }
            </style>
            <div id="bookmarks-panel">
                <div class="bookmarks-header"><span class="bookmarks-title">书签</span><span class="bookmarks-close" id="bookmarks-close">✕</span></div>
                <div class="bookmarks-list" id="bookmarks-list">${treeHTML}</div>
            </div>
            <div class="context-menu" id="bookmarks-context-menu"></div>`;
        }

        function init() {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const container = document.getElementById('bookmarks-overlay');
            if (container) container.innerHTML = render();
            applyColor();
            bindEvents();
        }

        function applyColor() {
            const color = Search.getCurrentColor();
            const panel = document.getElementById('bookmarks-panel');
            if (panel) panel.style.setProperty('--bm-color', color);
        }

        function show() {
            EventBus.emit('panel:show', 'bookmarks');
            PanelHelper.show('bookmarks-panel', 'bookmarks-overlay', () => {
                applyColor();
                refreshPanel();
            });
            visible = true;
        }

        function hide() {
            PanelHelper.hide('bookmarks-panel', 'bookmarks-overlay', () => {
                closeContextMenu();
            });
            visible = false;
        }

        function closeContextMenu() {
            const cm = document.getElementById('bookmarks-context-menu');
            if (cm) cm.classList.remove('show');
        }

        function showContextMenu(e, id, type) {
            e.stopPropagation();
            const cm = document.getElementById('bookmarks-context-menu');
            if (!cm) return;
            const root = Config.get('bookmarkRoot');
            const found = type === 'root' ? { node: root, parentArray: null, index: -1 } : findNode(root.children, id);
            if (!found) return;
            let items = '';
            if (type === 'root') {
                items = `<div class="context-menu-item" data-action="add-folder">添加文件夹</div><div class="context-menu-item" data-action="add-bookmark">添加书签</div>`;
            } else if (type === 'folder') {
                items = `<div class="context-menu-item" data-action="edit">编辑</div><div class="context-menu-item danger" data-action="delete">删除</div><div class="context-menu-item" data-action="add-folder">添加文件夹</div><div class="context-menu-item" data-action="add-bookmark">添加书签</div>`;
            } else {
                const node = found.node;
                const shortcuts = Config.get('shortcuts') || [];
                const maxSlots = Shortcuts.getMaxSlots();
                const isInShortcuts = shortcuts.some(s => s.url === node.url);
                const isFull = shortcuts.length >= maxSlots;
                let shortcutText = '添加快捷方式', shortcutClass = '';
                if (isInShortcuts) { shortcutText = '移除快捷方式'; shortcutClass = 'danger'; }
                else if (isFull) { shortcutText = '快捷方式已满'; shortcutClass = 'disabled'; }
                items = `<div class="context-menu-item" data-action="edit">编辑</div><div class="context-menu-item danger" data-action="delete">删除</div><div class="context-menu-item ${shortcutClass}" data-action="add-shortcut">${shortcutText}</div>`;
            }
            cm.innerHTML = items;
            cm.classList.add('show');
            const menuWidth = cm.offsetWidth || 150;
            const menuHeight = cm.offsetHeight || 160;
            let left = e.clientX, top = e.clientY;
            if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 5;
            if (top + menuHeight > window.innerHeight) top = window.innerHeight - menuHeight - 5;
            left = Math.max(5, left);
            top = Math.max(5, top);
            cm.style.left = left + 'px';
            cm.style.top = top + 'px';
            cm.querySelectorAll('.context-menu-item:not(.disabled)').forEach(item => {
                item.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const action = item.dataset.action;
                    closeContextMenu();
                    handleContextAction(action, id, type);
                });
            });
        }

        function handleContextAction(action, id, type) {
            const root = Config.get('bookmarkRoot');
            const found = type === 'root' ? { node: root, parentArray: null, index: -1 } : findNode(root.children, id);
            if (!found) return;
            const { node, parentArray, index } = found;
            if (action === 'edit') {
                Dialog.show({
                    mode: node.type === 'bookmark' ? 'prompt-url' : 'prompt',
                    title: node.type === 'bookmark' ? '编辑书签' : '编辑文件夹',
                    value: node.title,
                    urlValue: node.type === 'bookmark' ? node.url : '',
                    onConfirm: (vals) => {
                        node.title = vals.value.trim();
                        if (node.type === 'bookmark') node.url = Utils.ensureUrl(vals.url.trim());
                        Config.update('bookmarkRoot', root);
                        refreshPanel();
                    }
                });
            } else if (action === 'delete') {
                Dialog.show({
                    mode: 'confirm',
                    title: '确定删除？',
                    onConfirm: () => {
                        parentArray.splice(index, 1);
                        Config.update('bookmarkRoot', root);
                        refreshPanel();
                    }
                });
            } else if (action === 'add-folder' || action === 'add-bookmark') {
                Dialog.show({
                    mode: action === 'add-bookmark' ? 'prompt-url' : 'prompt',
                    title: action === 'add-bookmark' ? '添加书签' : '添加文件夹',
                    value: '',
                    urlValue: action === 'add-bookmark' ? 'https://' : '',
                    onConfirm: (vals) => {
                        const title = vals.value.trim();
                        if (!title) return;
                        const newNode = action === 'add-bookmark'
                            ? { id: Utils.generateId(), title, type: 'bookmark', url: Utils.ensureUrl(vals.url.trim()), color: Utils.randomColor() }
                            : { id: Utils.generateId(), title, type: 'folder', expanded: true, color: Utils.randomColor(), children: [] };
                        if (!node.children) node.children = [];
                        node.children.push(newNode);
                        node.expanded = true;
                        Config.update('bookmarkRoot', root);
                        refreshPanel();
                    }
                });
            } else if (action === 'add-shortcut') {
                const shortcuts = Config.get('shortcuts') || [];
                const maxSlots = Shortcuts.getMaxSlots();
                const existingIndex = shortcuts.findIndex(s => s.url === node.url);
                if (existingIndex >= 0) {
                    shortcuts.splice(existingIndex, 1);
                } else if (shortcuts.length < maxSlots) {
                    shortcuts.push({ id: Utils.generateId(), title: node.title, url: node.url, color: node.color || Utils.randomColor() });
                }
                Config.update('shortcuts', shortcuts);
            }
        }

        function refreshPanel() {
            const root = Config.get('bookmarkRoot');
            const list = document.getElementById('bookmarks-list');
            if (list) {
                const scrollTop = list.scrollTop;
                list.innerHTML = buildTreeNode(root, 0);
                list.scrollTop = scrollTop;
                applyColor();
            }
        }

        function bindEvents() {
            const signal = abortController.signal;
            const closeBtn = document.getElementById('bookmarks-close');
            if (closeBtn) closeBtn.addEventListener('click', hide, { signal });
            const list = document.getElementById('bookmarks-list');
            if (!list) return;

            list.addEventListener('click', (e) => {
                const menuBtn = e.target.closest('.tree-menu-btn');
                if (menuBtn) {
                    const nodeEl = menuBtn.closest('.tree-node');
                    const type = nodeEl ? nodeEl.dataset.type : 'bookmark';
                    const isRoot = menuBtn.dataset.id === 'root';
                    showContextMenu(e, menuBtn.dataset.id, isRoot ? 'root' : type);
                    return;
                }
                const row = e.target.closest('.tree-row');
                if (!row) return;
                const id = row.dataset.id;
                if (row.classList.contains('folder')) {
                    const root = Config.get('bookmarkRoot');
                    const found = id === 'root' ? { node: root } : findNode(root.children, id);
                    if (found && found.node.type === 'folder') {
                        found.node.expanded = !found.node.expanded;
                        Config.update('bookmarkRoot', root);
                        refreshPanel();
                    }
                } else if (row.classList.contains('bookmark')) {
                    const node = e.target.closest('.tree-node');
                    const url = node ? node.dataset.url : null;
                    if (url && Utils.isValidNavigationUrl(url)) {
                        Loader.show();
                        window.location.href = url;
                    }
                }
            }, { signal });

            document.addEventListener('click', (e) => {
                if (!visible) return;
                const panel = document.getElementById('bookmarks-panel');
                const cm = document.getElementById('bookmarks-context-menu');
                const logo = document.getElementById('search-logo');
                if (panel && !panel.contains(e.target) && !(cm && cm.contains(e.target))) {
                    if (logo && logo.contains(e.target)) return;
                    hide();
                }
            }, { signal });

            EventBus.on('engine:color-changed', applyColor);
            EventBus.on('config:updated', ({ path }) => {
                if (path === 'bookmarkRoot') refreshPanel();
            });

            EventBus.on('panel:show', (panelName) => {
                if (panelName !== 'bookmarks') hide();
            });
        }

        return { init, show, hide, bindEvents };
    })();

    const Settings = (() => {
        let visible = false;
        let selectedColor = ColorPool[0];
        let editingIndex = -1;
        let abortController = null;

        function render() {
            const cfg = Config.load();
            return `<style>
                #settings-overlay { position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:100; }
                #settings-panel { position:fixed; bottom:0; left:0; width:100%; height:70%; background:#fff; border-radius:16px 16px 0 0; box-shadow:0 -4px 20px rgba(0,0,0,.15); z-index:101; transform:translateY(100%); transition:transform .3s ease-out; display:flex; flex-direction:column; pointer-events:auto; }
                #settings-panel.show { transform:translateY(0); }
                .settings-header { display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #f0f0f0; flex-shrink:0; }
                .settings-title { font-size:18px; font-weight:600; color:#333; }
                .settings-close { width:32px; height:32px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; -webkit-tap-highlight-color:transparent; font-size:20px; color:#999; }
                .settings-close:active { background:#f0f0f0; }
                .settings-content { display:flex; flex:1; overflow:hidden; }
                .settings-tabs { width:100px; flex-shrink:0; overflow-y:auto; border-right:1px solid #f0f0f0; padding:8px 0; -webkit-overflow-scrolling:touch; }
                .settings-tab { padding:14px 12px; font-size:13px; color:#999; cursor:pointer; -webkit-tap-highlight-color:transparent; border-left:2px solid transparent; transition:color .2s,border-color .2s; text-align:center; }
                .settings-tab.active { color:var(--engine-color,#008373); border-left-color:var(--engine-color,#008373); background:#f9f9f9; }
                .settings-body { flex:1; overflow-y:auto; padding:16px; -webkit-overflow-scrolling:touch; }
                .settings-section { display:none; }
                .settings-section.active { display:block; }
                .engine-form { display:flex; align-items:center; gap:8px; margin-bottom:16px; padding-left:12px; }
                .color-picker-wrapper { position:relative; flex-shrink:0; }
                .color-chip { width:32px; height:32px; border-radius:8px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
                .color-pool { position:absolute; background:#fff; border:1px solid #e0e0e0; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,.12); padding:6px; display:none; z-index:10; max-height:160px; overflow-y:auto; -webkit-overflow-scrolling:touch; grid-template-columns:repeat(4,1fr); gap:4px; }
                .color-pool.show { display:grid; }
                .color-pool-item { width:32px; height:32px; border-radius:6px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
                .color-pool-item.selected { outline:2px solid #333; outline-offset:1px; }
                .engine-form input { padding:8px 10px; border:1px solid #e0e0e0; border-radius:8px; font-size:13px; color:#333; outline:none; background:#f9f9f9; }
                .engine-form input:focus { border-color:var(--engine-color,#008373); }
                #eng-name { flex:.6; min-width:50px; }
                #eng-url { flex:2.4; min-width:120px; }
                .engine-form-btn { padding:8px 14px; border:none; border-radius:8px; font-size:13px; cursor:pointer; -webkit-tap-highlight-color:transparent; flex-shrink:0; }
                .btn-add { background:var(--engine-color,#008373); color:#fff; }
                .btn-clear { background:#f0f0f0; color:#666; }
                .engine-list { display:flex; flex-direction:column; gap:8px; }
                .engine-list-item { display:flex; align-items:center; gap:8px; padding:10px 12px; background:#f9f9f9; border-radius:10px; cursor:pointer; -webkit-tap-highlight-color:transparent; }
                .engine-list-item:active { background:#eee; }
                .engine-list-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:16px; font-weight:600; flex-shrink:0; }
                .engine-list-info { flex:1; min-width:0; }
                .engine-list-name { font-size:14px; color:#333; font-weight:500; }
                .engine-list-url { font-size:11px; color:#999; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .engine-list-delete { width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:50%; -webkit-tap-highlight-color:transparent; font-size:16px; color:#ccc; flex-shrink:0; }
                .engine-list-delete:active { background:#fee; color:#e55; }
                .engine-list-delete.disabled { color:#ddd; pointer-events:none; }
                .settings-item { display:flex; align-items:center; justify-content:space-between; padding:14px 0; border-bottom:1px solid #f5f5f5; }
                .settings-label { font-size:15px; color:#333; }
                .settings-desc { font-size:12px; color:#999; margin-top:2px; }
                .toggle-switch { position:relative; display:inline-block; width:48px; height:28px; flex-shrink:0; }
                .toggle-switch input { opacity:0; width:0; height:0; }
                .toggle-slider { position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:#e0e0e0; border-radius:28px; transition:background .3s; }
                .toggle-slider:before { content:""; position:absolute; height:22px; width:22px; left:3px; bottom:3px; background:#fff; border-radius:50%; transition:transform .3s; }
                .toggle-switch input:checked+.toggle-slider { background:var(--engine-color,#008373); }
                .toggle-switch input:checked+.toggle-slider:before { transform:translateX(20px); }
            </style>
            <div id="settings-panel">
                <div class="settings-header"><span class="settings-title">设置</span><span class="settings-close" id="settings-close">✕</span></div>
                <div class="settings-content">
                    <div class="settings-tabs" id="settings-tabs">
                        <div class="settings-tab active" data-tab="engine">搜索引擎</div>
                        <div class="settings-tab" data-tab="appearance">外观设置</div>
                        <div class="settings-tab" data-tab="toolbar">工具栏</div>
                        <div class="settings-tab" data-tab="webdav">WebDAV</div>
                        <div class="settings-tab" data-tab="profile">配置文件</div>
                        <div class="settings-tab" data-tab="reset">还原默认</div>
                    </div>
                    <div class="settings-body">
                        <div class="settings-section active" id="section-engine">
                            <div class="engine-form">
                                <div class="color-picker-wrapper"><div class="color-chip" id="color-chip" style="background:${selectedColor}"></div><div class="color-pool" id="color-pool">${ColorPool.map(c => `<div class="color-pool-item ${c===selectedColor?'selected':''}" data-color="${c}" style="background:${c}"></div>`).join('')}</div></div>
                                <input type="text" id="eng-name" placeholder="名称"><input type="text" id="eng-url" placeholder="URL (需包含查询参数 ?key=)">
                                <button class="engine-form-btn btn-add" id="btn-add-engine">添加</button>
                                <button class="engine-form-btn btn-clear" id="btn-clear-form">清空</button>
                            </div>
                            <div class="engine-list" id="engine-list"></div>
                        </div>
                        <div class="settings-section" id="section-appearance">
                            <div class="settings-item"><div><div class="settings-label">快捷方式模块</div><div class="settings-desc">显示或隐藏快捷方式图标</div></div><label class="toggle-switch"><input type="checkbox" id="toggle-shortcuts" ${cfg.shortcutsVisible!==false?'checked':''}><span class="toggle-slider"></span></label></div>
                        </div>
                        <div class="settings-section" id="section-toolbar"><p style="color:#999;text-align:center;margin-top:40px;">工具栏 — 开发中...</p></div>
                        <div class="settings-section" id="section-webdav"><p style="color:#999;text-align:center;margin-top:40px;">WebDAV 同步 — 开发中...</p></div>
                        <div class="settings-section" id="section-profile"><p style="color:#999;text-align:center;margin-top:40px;">配置文件导出/导入 — 开发中...</p></div>
                        <div class="settings-section" id="section-reset">
                            <p style="color:#333;margin-bottom:12px;">将清除所有自定义数据并恢复为默认配置，此操作不可撤销。</p>
                            <button class="engine-form-btn btn-add" id="btn-reset-defaults">恢复默认</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        function init() {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const container = document.getElementById('settings-overlay');
            if (container) container.innerHTML = render();
            applyColor();
            bindEvents();
            refreshEngineList();
        }

        function applyColor() {
            const color = Search.getCurrentColor();
            const panel = document.getElementById('settings-panel');
            if (panel) panel.style.setProperty('--engine-color', color);
        }

        function refreshEngineList() {
            const engines = Config.get('searchEngines');
            const le = document.getElementById('engine-list');
            if (!le) return;
            le.innerHTML = engines.map((e, i) => `
                <div class="engine-list-item" data-index="${i}">
                    <div class="engine-list-icon" style="background:${e.color}">${Utils.escapeHtml(e.name.charAt(0))}</div>
                    <div class="engine-list-info"><div class="engine-list-name">${Utils.escapeHtml(e.name)}</div><div class="engine-list-url">${Utils.escapeHtml(e.url)}</div></div>
                    <div class="engine-list-delete${engines.length <= 1 ? ' disabled' : ''}" data-index="${i}">✕</div>
                </div>`).join('');

            le.querySelectorAll('.engine-list-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.engine-list-delete')) return;
                    const idx = parseInt(item.dataset.index);
                    const eng = Config.get('searchEngines')[idx];
                    document.getElementById('eng-name').value = eng.name;
                    document.getElementById('eng-url').value = eng.url;
                    selectedColor = eng.color;
                    document.getElementById('color-chip').style.background = eng.color;
                    document.getElementById('color-pool').querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
                    const pi = document.getElementById('color-pool').querySelector(`[data-color="${eng.color}"]`);
                    if (pi) pi.classList.add('selected');
                    editingIndex = idx;
                    document.getElementById('btn-add-engine').textContent = '更新';
                }, { signal: abortController.signal });
            });

            le.querySelectorAll('.engine-list-delete:not(.disabled)').forEach(btn => btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                const engines = Config.get('searchEngines');
                if (engines.length <= 1) return;
                const deleted = engines.splice(idx, 1);
                if (deleted[0]?.name === Config.get('defaultEngine')) {
                    Config.update('defaultEngine', engines[0].name);
                }
                Config.update('searchEngines', engines);
                refreshEngineList();
                resetForm();
            }, { signal: abortController.signal }));
        }

        function resetForm() {
            document.getElementById('eng-name').value = '';
            document.getElementById('eng-url').value = '';
            selectedColor = ColorPool[0];
            document.getElementById('color-chip').style.background = selectedColor;
            document.getElementById('color-pool').querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
            const pi = document.getElementById('color-pool').querySelector(`[data-color="${selectedColor}"]`);
            if (pi) pi.classList.add('selected');
            editingIndex = -1;
            document.getElementById('btn-add-engine').textContent = '添加';
        }

        function show() {
            EventBus.emit('panel:show', 'settings');
            PanelHelper.show('settings-panel', 'settings-overlay', () => {
                applyColor();
                refreshEngineList();
                const toggle = document.getElementById('toggle-shortcuts');
                if (toggle) toggle.checked = Config.get('shortcutsVisible') !== false;
            });
            visible = true;
        }

        function hide() {
            PanelHelper.hide('settings-panel', 'settings-overlay', () => {
                const colorPool = document.getElementById('color-pool');
                if (colorPool) colorPool.classList.remove('show');
            });
            visible = false;
        }

        function switchTab(name) {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            const tab = document.querySelector(`.settings-tab[data-tab="${name}"]`);
            const section = document.getElementById(`section-${name}`);
            if (tab) tab.classList.add('active');
            if (section) section.classList.add('active');
        }

        function positionColorPool() {
            const chip = document.getElementById('color-chip');
            const pool = document.getElementById('color-pool');
            if (!chip || !pool) return;
            const chipRect = chip.getBoundingClientRect();
            const poolHeight = 160;
            let top = chipRect.bottom + 5;
            let left = chipRect.left;
            if (top + poolHeight > window.innerHeight - 10) {
                top = chipRect.top - poolHeight - 5;
            }
            if (left + 180 > window.innerWidth - 10) {
                left = window.innerWidth - 190;
            }
            left = Math.max(5, left);
            top = Math.max(5, top);
            pool.style.top = top + 'px';
            pool.style.left = left + 'px';
            pool.style.position = 'fixed';
        }

        function bindEvents() {
            const signal = abortController.signal;
            const overlay = document.getElementById('settings-overlay');
            if (!overlay) return;

            overlay.addEventListener('click', (e) => {
                const target = e.target;

                if (target.id === 'settings-close' || target.closest('#settings-close')) {
                    hide();
                    return;
                }
                const tab = target.closest('.settings-tab');
                if (tab) {
                    switchTab(tab.dataset.tab);
                    return;
                }
                if (target.id === 'color-chip' || target.closest('#color-chip')) {
                    const pool = document.getElementById('color-pool');
                    if (pool) {
                        pool.classList.toggle('show');
                        if (pool.classList.contains('show')) positionColorPool();
                    }
                    return;
                }
                const colorItem = target.closest('.color-pool-item');
                if (colorItem) {
                    const pool = document.getElementById('color-pool');
                    selectedColor = colorItem.dataset.color;
                    document.getElementById('color-chip').style.background = selectedColor;
                    if (pool) {
                        pool.querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
                        colorItem.classList.add('selected');
                        pool.classList.remove('show');
                    }
                    return;
                }
                if (target.id === 'btn-add-engine') {
                    handleAddEngine();
                    return;
                }
                if (target.id === 'btn-clear-form') {
                    resetForm();
                    return;
                }
                if (target.id === 'btn-reset-defaults') {
                    Dialog.show({
                        mode: 'confirm',
                        title: '确认还原默认设置？',
                        onConfirm: () => {
                            Config.save(JSON.parse(JSON.stringify(Config.defaults)));
                            location.reload();
                        }
                    });
                    return;
                }
            }, { signal });

            document.addEventListener('click', (e) => {
                const pool = document.getElementById('color-pool');
                const chip = document.getElementById('color-chip');
                if (pool && pool.classList.contains('show') && !pool.contains(e.target) && !chip?.contains(e.target)) {
                    pool.classList.remove('show');
                }
            }, { signal });

            document.addEventListener('click', function handleOutsideClick(e) {
                if (!visible) return;
                const panel = document.getElementById('settings-panel');
                const logo = document.getElementById('search-logo');
                if (panel && !panel.contains(e.target) && !(logo && logo.contains(e.target))) {
                    hide();
                }
            }, { signal });

            const toggle = document.getElementById('toggle-shortcuts');
            if (toggle) {
                toggle.addEventListener('change', (e) => {
                    Config.update('shortcutsVisible', e.target.checked);
                }, { signal });
            }

            EventBus.on('panel:show', (panelName) => {
                if (panelName !== 'settings') hide();
            });

            EventBus.on('engine:color-changed', applyColor);
        }

        function handleAddEngine() {
            const name = document.getElementById('eng-name').value.trim();
            let url = Utils.ensureUrl(document.getElementById('eng-url').value.trim());
            if (!name || !url) return;
            if (!Utils.validateEngineUrl(url)) {
                Dialog.show({
                    mode: 'alert',
                    title: 'URL 格式错误',
                    confirmText: '知道了'
                });
                return;
            }
            const engines = Config.get('searchEngines');
            if (editingIndex >= 0) engines[editingIndex] = { name, url, color: selectedColor };
            else engines.push({ name, url, color: selectedColor });
            Config.update('searchEngines', engines);
            refreshEngineList();
            resetForm();
        }

        return { init, show, hide, bindEvents };
    })();

    function registerMenus() {
        GM_registerMenuCommand(Utils.isHomepage() ? '🏠 退出主页' : '⭐ 设为主页', () => {
            const c = Config.load();
            const u = Utils.getCurrentUrl();
            c.homepage = c.homepage === u ? '' : u;
            Config.save(c);
            setTimeout(() => location.reload(), 300);
        });
    }

    function renderHomepage() {
        document.open();
        document.write(`<!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>主页</title>
        <style>
            * { margin:0; padding:0; box-sizing:border-box; }
            body { font-family:system-ui,-apple-system,sans-serif; background:#fff; color:#333; min-height:100vh; overflow:hidden; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; touch-action:manipulation; }
            input, textarea { user-select:text; }
        </style></head>
        <body>
            <div id="global-loader-container"></div>
            <div id="search-area"></div>
            <div id="shortcuts-area"></div>
            <div id="bookmarks-overlay"></div>
            <div id="settings-overlay"></div>
            <div id="dialog-container"></div>
        </body></html>`);
        document.close();

        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());
        document.addEventListener('gestureend', e => e.preventDefault());

        Loader.init();
        Dialog.initDialog();
        Search.init();
        Shortcuts.init();
        Bookmarks.init();
        Settings.init();
    }

    function init() {
        registerMenus();
        if (Utils.isHomepage()) renderHomepage();
    }
    init();
})();
