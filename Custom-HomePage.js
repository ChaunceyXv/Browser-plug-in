// ==UserScript==
// @name         Custom HomePage
// @namespace    https://github.com/user/Custom-HomePage
// @version      1.9.1
// @description  自定义主页
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
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
 *                 · 编辑模式：删除、编辑、拖拽排序、占位添加
 *   Bookmarks   — 书签面板（默认隐藏，从底部滑入，点击 Logo 触发）
 *   Settings    — 设置面板（默认隐藏，从底部滑入，长按 Logo 触发）
 *   Loader      — 全局加载指示器（右上角跳动圆点，自动触发）
 *
 * 【渲染机制】
 *   - renderHomepage() 只提供 4 个空容器 + 1 个快捷方式弹窗容器，禁止在此处添加任何模块样式或逻辑
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
 *   - 优先引用移动端特性，禁止引用 PC 端特性（如 wheel 事件、Ctrl 快捷键等）
 *   - 规范注释为框架永久组成部分，禁止删除或遗漏，每次输出完整代码必须包含
 *   - 每次代码改动后，如有规范变更必须更新本注释
 * ============================================================
 */

(function() {
    'use strict';

    // 仅在顶层窗口运行
    if (window.top !== window.self) return;

    // ========== 全局常量 ==========
    const COLOR_POOL = [
        '#008373', '#2932E1', '#DE5833', '#4285F4',
        '#EA4335', '#1A73E8', '#1DA1F2', '#333333',
        '#FF6B35', '#7B1FA2', '#00ACC1', '#FFB300'
    ];

    // ========== 数据层 ==========
    const Storage = {
        get(key, fallback) {
            return GM_getValue(key, fallback);
        },
        set(key, value) {
            GM_setValue(key, value);
        }
    };

    // ========== 配置管理 ==========
    const Config = {
        KEY: 'homepage_config',
        VERSION: 4,
        _afterSave: null,

        // 默认配置（所有持久化字段必须在此声明）
        defaults: {
            version: 4,
            homepage: '',
            shortcutsVisible: true,
            searchEngines: [
                { name: 'Bing',       url: 'https://www.bing.com/search?q=', color: '#008373' },
                { name: 'Baidu',      url: 'https://www.baidu.com/s?wd=',      color: '#2932E1' },
                { name: 'Google',     url: 'https://www.google.com/search?q=', color: '#4285F4' },
                { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=',       color: '#DE5833' }
            ],
            defaultEngine: 'Bing',
            bookmarkRoot: {
                id: 'root',
                title: '书签栏',
                type: 'folder',
                expanded: true,
                collapsible: false,
                color: '#333333',
                children: [
                    {
                        id: 'f1',
                        title: '常用',
                        type: 'folder',
                        expanded: true,
                        color: '#008373',
                        children: [
                            { id: 'b1', title: 'GitHub', type: 'bookmark', url: 'https://github.com', color: '#333333' },
                            { id: 'b2', title: 'Google', type: 'bookmark', url: 'https://www.google.com', color: '#4285F4' }
                        ]
                    },
                    {
                        id: 'f2',
                        title: '工具',
                        type: 'folder',
                        expanded: false,
                        color: '#DE5833',
                        children: [
                            {
                                id: 'f3',
                                title: '设计资源',
                                type: 'folder',
                                expanded: false,
                                color: '#7B1FA2',
                                children: [
                                    { id: 'b5', title: 'Figma',    type: 'bookmark', url: 'https://figma.com',    color: '#1A73E8' },
                                    { id: 'b6', title: 'Dribbble', type: 'bookmark', url: 'https://dribbble.com', color: '#EA4335' }
                                ]
                            },
                            { id: 'b3', title: '翻译',          type: 'bookmark', url: 'https://translate.google.com',   color: '#1DA1F2' },
                            { id: 'b4', title: '开发者文档',   type: 'bookmark', url: 'https://developer.mozilla.org',    color: '#FF6B35' }
                        ]
                    },
                    { id: 'b7', title: 'YouTube', type: 'bookmark', url: 'https://youtube.com', color: '#FF0000' }
                ]
            },
            shortcuts: [
                { id: 's1', title: 'GitHub',  url: 'https://github.com',          color: '#333333' },
                { id: 's2', title: 'YouTube', url: 'https://youtube.com',         color: '#FF0000' },
                { id: 's3', title: 'Gmail',   url: 'https://mail.google.com',     color: '#EA4335' },
                { id: 's4', title: '地图',    url: 'https://maps.google.com',     color: '#4285F4' },
                { id: 's5', title: '翻译',    url: 'https://translate.google.com', color: '#1A73E8' },
                { id: 's6', title: 'Twitter', url: 'https://twitter.com',         color: '#1DA1F2' }
            ],
            webdav: {
                url: '',
                username: '',
                password: '',
                remotePath: 'homepage-config.json',
                autoSync: false,
                lastSyncTime: 0,
                lastUploadTime: 0,
                lastDownloadTime: 0
            }
        },

        // 加载配置（含版本迁移）
        load() {
            const stored = Storage.get(this.KEY, {});
            const savedVersion = stored.version || 0;

            // 版本一致，直接用
            if (savedVersion === this.VERSION) {
                return stored;
            }

            // 需要迁移
            const migrated = this.migrate(stored, savedVersion);
            migrated.version = this.VERSION;
            Storage.set(this.KEY, migrated);
            return migrated;
        },

        // 配置迁移（从 fromVersion 升到当前版本）
        migrate(data, fromVersion) {
            let result = { ...data };

            // v0 → v1：补全所有缺失的顶层字段
            if (fromVersion < 1) {
                result = Object.assign({}, this.defaults, result);
                // bookmarkRoot 单独处理：用户有就用用户的，没有用默认
                if (!result.bookmarkRoot) {
                    result.bookmarkRoot = JSON.parse(JSON.stringify(this.defaults.bookmarkRoot));
                }
            }

            // v1 → v2：新增 webdav 配置
            if (fromVersion < 2) {
                if (!result.webdav) {
                    result.webdav = JSON.parse(JSON.stringify(this.defaults.webdav));
                }
            }

            // v2 → v3：webdav 新增 autoSync、lastSyncTime
            if (fromVersion < 3) {
                if (!result.webdav) {
                    result.webdav = JSON.parse(JSON.stringify(this.defaults.webdav));
                } else {
                    if (result.webdav.autoSync === undefined) result.webdav.autoSync = false;
                    if (result.webdav.lastSyncTime === undefined) result.webdav.lastSyncTime = 0;
                }
            }

            // v3 → v4：webdav 新增 lastUploadTime、lastDownloadTime
            if (fromVersion < 4) {
                if (!result.webdav) {
                    result.webdav = JSON.parse(JSON.stringify(this.defaults.webdav));
                } else {
                    if (result.webdav.lastUploadTime === undefined) result.webdav.lastUploadTime = 0;
                    if (result.webdav.lastDownloadTime === undefined) result.webdav.lastDownloadTime = 0;
                }
            }

            return result;
        },

        // 保存配置
        save(config) {
            Storage.set(this.KEY, config);
            if (this._afterSave) {
                try { this._afterSave(); } catch (e) {}
            }
        }
    };

    // ========== 工具函数 ==========
    const Utils = {
        // 获取当前完整 URL
        getCurrentUrl() {
            return window.location.href;
        },

        // 判断当前页面是否为设定的主页
        isHomepage() {
            const c = Config.load();
            return c.homepage !== '' && c.homepage === this.getCurrentUrl();
        },

        // 截断字符串并添加省略号
        truncate(str, max) {
            return str.length > max ? str.slice(0, max) + '...' : str;
        },

        // 从全局颜色池随机取一个颜色
        randomColor() {
            return COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];
        },

        // 补全 URL 协议（若缺失则添加 https://）
        ensureUrl(url) {
            if (!url) return url;
            if (/^https?:\/\//i.test(url)) return url;
            return 'https://' + url;
        },

        // 生成唯一 ID
        generateId() {
            return 'n' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        },

        // 格式化时间戳为友好格式
        formatTime(timestamp) {
            if (!timestamp) return '从未';
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            const day = 24 * 60 * 60 * 1000;

            if (diff < 60 * 1000) return '刚刚';
            if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + '分钟前';
            if (diff < day) return Math.floor(diff / 3600000) + '小时前';
            if (diff < 2 * day) return '昨天';
            if (diff < 7 * day) return Math.floor(diff / day) + '天前';

            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            if (y === now.getFullYear()) {
                return m + '-' + d + ' ' + hh + ':' + mm;
            }
            return y + '-' + m + '-' + d;
        }
    };

    // ========== 全局加载指示器（Loader） ==========
    const Loader = {
        init() {
            // 在捕获阶段监听点击事件，当点击带有 data-url 属性的元素时显示加载动画
            document.addEventListener('click', (e) => {
                // 忽略一些特殊按钮的点击
                if (e.target.closest('.tree-menu-btn') ||
                    e.target.closest('.context-menu') ||
                    e.target.closest('.dialog-overlay') ||
                    e.target.closest('.shortcut-dialog-overlay') ||
                    e.target.closest('.shortcut-item.editing') ||
                    e.target.closest('.shortcut-delete') ||
                    e.target.closest('.shortcut-item.placeholder')) {
                    return;
                }
                const link = e.target.closest('[data-url]');
                if (link) {
                    document.getElementById('global-loader')?.classList.add('show');
                }
            }, true);

            // 表单提交时也显示加载动画
            document.addEventListener('submit', () => {
                document.getElementById('global-loader')?.classList.add('show');
            }, true);

            // 页面即将离开时显示加载动画
            window.addEventListener('beforeunload', () => {
                document.getElementById('global-loader')?.classList.add('show');
            });
        }
    };

    // ========== 通用弹窗组件（Dialog） ==========
    // 仅用于书签编辑、添加等场景，快捷方式弹窗使用独立的 Shortcuts Dialog
    const Dialog = {
        // 显示带输入框的弹窗
        show(title, value, placeholder, confirmText, cancelText, urlValue, showUrl) {
            const overlay   = document.getElementById('dialog-overlay');
            const titleEl   = document.getElementById('dialog-title');
            const inputWrap = document.getElementById('dialog-input-wrap');
            const inputEl   = document.getElementById('dialog-input');
            const urlWrap   = document.getElementById('dialog-url-wrap');
            const urlEl     = document.getElementById('dialog-url');
            const confirmBtn = document.getElementById('dialog-confirm');
            const cancelBtn  = document.getElementById('dialog-cancel');

            if (!overlay) return;

            titleEl.textContent = title;
            inputWrap.style.display = '';
            inputEl.value = value || '';
            inputEl.placeholder = placeholder || '';

            if (showUrl) {
                urlWrap.style.display = '';
                urlEl.value = urlValue || 'https://';
            } else {
                urlWrap.style.display = 'none';
            }

            confirmBtn.textContent = confirmText || '确定';
            cancelBtn.textContent = cancelText || '取消';
            overlay.classList.add('show');
            inputEl.focus();
        },

        // 隐藏弹窗
        hide() {
            const overlay = document.getElementById('dialog-overlay');
            if (overlay) overlay.classList.remove('show');
        },

        // 显示仅带确认按钮的确认框（用于删除确认等）
        confirm(title, callback) {
            const overlay   = document.getElementById('dialog-overlay');
            const titleEl   = document.getElementById('dialog-title');
            const inputWrap = document.getElementById('dialog-input-wrap');
            const urlWrap   = document.getElementById('dialog-url-wrap');
            const confirmBtn = document.getElementById('dialog-confirm');
            const cancelBtn  = document.getElementById('dialog-cancel');

            if (!overlay) return;

            titleEl.textContent = title;
            inputWrap.style.display = 'none';
            urlWrap.style.display = 'none';
            confirmBtn.textContent = '确定';
            cancelBtn.textContent = '取消';
            overlay.classList.add('show');
        },

        // 获取输入框的值
        getValue() {
            const inputEl = document.getElementById('dialog-input');
            return inputEl ? inputEl.value : '';
        },

        // 获取 URL 输入框的值
        getUrlValue() {
            const urlEl = document.getElementById('dialog-url');
            return urlEl ? urlEl.value : '';
        }
    };

    // ========== 搜索模块 ==========
    const Search = {
        currentEngine: null,
        engines: [],
        dropdownVisible: false,
        longPressTimer: null,

        // 渲染搜索区域 HTML（包含内联样式）
        render() {
            const c = Config.load();
            this.engines = c.searchEngines;
            this.currentEngine = this.engines.find(e => e.name === c.defaultEngine) || this.engines[0];
            const displayName = Utils.truncate(this.currentEngine.name, 6);

            return `
                <style>
                    #search-area {
                        position: absolute;
                        top: 30%;
                        left: 50%;
                        transform: translateX(-50%);
                        width: 80%;
                        z-index: 1;
                    }
                    .search-logo {
                        display: inline-block;
                        text-align: center;
                        margin-bottom: 40px;
                        font-size: 48px;
                        font-weight: 700;
                        color: var(--engine-color);
                        transition: color .2s;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        user-select: none;
                        -webkit-user-select: none;
                    }
                    @keyframes glow-pulse {
                        0%   { box-shadow: 0 0 8px 0 var(--engine-color-33), 0 0 16px 0 var(--engine-color-1a); }
                        50%  { box-shadow: 0 0 16px 0 var(--engine-color-33), 0 0 28px 0 var(--engine-color-1a); }
                        100% { box-shadow: 0 0 8px 0 var(--engine-color-33), 0 0 16px 0 var(--engine-color-1a); }
                    }
                    .search-box {
                        display: flex;
                        align-items: center;
                        background: transparent;
                        border: 2px solid #e0e0e0;
                        border-radius: 12px;
                        overflow: visible;
                        position: relative;
                        transition: border-color .2s;
                        width: 100%;
                        min-width: 280px;
                    }
                    .search-box:focus-within {
                        border-color: var(--engine-color);
                        animation: glow-pulse 3s ease-in-out infinite;
                    }
                    .search-engine-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        height: 44px;
                        padding: 0 10px;
                        cursor: pointer;
                        flex-shrink: 0;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .search-engine-icon {
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        background: var(--engine-color);
                        color: #fff;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 16px;
                        font-weight: 600;
                        flex-shrink: 0;
                    }
                    .search-engine-name {
                        font-size: 13px;
                        color: #666;
                        white-space: nowrap;
                    }
                    .search-engine-arrow {
                        font-size: 10px;
                        color: #e0e0e0;
                        line-height: 1;
                        transition: color .2s;
                    }
                    .search-box:focus-within .search-engine-arrow {
                        color: var(--engine-color);
                    }
                    .search-engine-dropdown {
                        position: absolute;
                        top: 48px;
                        left: 0;
                        background: #fff;
                        border: 1px solid #e0e0e0;
                        border-radius: 12px;
                        box-shadow: 0 4px 16px rgba(0,0,0,.12);
                        z-index: 50;
                        display: none;
                        padding: 6px 0;
                        white-space: nowrap;
                    }
                    .search-engine-dropdown.show {
                        display: block;
                    }
                    .search-engine-option {
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px 14px 10px 10px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 14px;
                    }
                    .search-engine-option:active {
                        background: #f0f0f0;
                    }
                    .search-engine-option .engine-icon {
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-size: 16px;
                        font-weight: 600;
                        flex-shrink: 0;
                    }
                    .search-engine-option .engine-name {
                        color: #333;
                    }
                    #search-input {
                        flex: 1;
                        border: none;
                        background: transparent;
                        padding: 14px 8px;
                        font-size: 16px;
                        color: #333;
                        outline: none;
                        min-width: 0;
                    }
                    .search-submit-btn {
                        width: 44px;
                        height: 44px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        flex-shrink: 0;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .search-submit-btn svg {
                        width: 20px;
                        height: 20px;
                        stroke: #e0e0e0;
                        fill: none;
                        stroke-width: 2;
                        transition: stroke .2s;
                    }
                    .search-box:focus-within .search-submit-btn svg {
                        stroke: var(--engine-color);
                    }
                </style>

                <div style="text-align:center">
                    <div class="search-logo" id="search-logo">${this.currentEngine.name}</div>
                </div>
                <div class="search-box" id="search-box">
                    <div class="search-engine-btn" id="engine-btn">
                        <div class="search-engine-icon" id="engine-icon">${this.currentEngine.name.charAt(0)}</div>
                        <span class="search-engine-name" id="engine-name">${displayName}</span>
                        <span class="search-engine-arrow">&#9660;</span>
                    </div>
                    <div class="search-engine-dropdown" id="engine-dropdown">
                        ${this.engines.map(e => `
                            <div class="search-engine-option" data-engine="${e.name}">
                                <div class="engine-icon" style="background:${e.color}">${e.name.charAt(0)}</div>
                                <span class="engine-name">${e.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <input type="text" id="search-input" enterkeyhint="go">
                    <div class="search-submit-btn" id="search-submit">
                        <svg viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="7"/>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        </svg>
                    </div>
                </div>`;
        },

        // 初始化搜索模块
        init() {
            const container = document.getElementById('search-area');
            if (container) {
                container.innerHTML = this.render();
                this.applyEngineColors();
                this.bindEvents();
            }
        },

        // 应用当前搜索引擎颜色到 CSS 变量
        applyEngineColors() {
            const color = this.currentEngine.color;
            const area = document.getElementById('search-area');
            if (area) {
                area.style.setProperty('--engine-color', color);
                area.style.setProperty('--engine-color-33', color + '33');
                area.style.setProperty('--engine-color-1a', color + '1a');
            }
            const loader = document.getElementById('global-loader');
            if (loader) {
                loader.style.setProperty('--loader-color', color);
            }
        },

        // 获取当前引擎颜色（供其他模块使用）
        getCurrentColor() {
            return this.currentEngine ? this.currentEngine.color : '#008373';
        },

        // 刷新搜索引擎下拉列表（当设置中增删引擎后调用）
        refreshDropdown() {
            const c = Config.load();
            this.engines = c.searchEngines;
            this.currentEngine = this.engines.find(e => e.name === c.defaultEngine) || this.engines[0];

            const dropdown = document.getElementById('engine-dropdown');
            if (dropdown) {
                dropdown.innerHTML = this.engines.map(e => `
                    <div class="search-engine-option" data-engine="${e.name}">
                        <div class="engine-icon" style="background:${e.color}">${e.name.charAt(0)}</div>
                        <span class="engine-name">${e.name}</span>
                    </div>
                `).join('');

                dropdown.querySelectorAll('.search-engine-option').forEach(option => {
                    option.addEventListener('click', () => {
                        const name = option.dataset.engine;
                        this.currentEngine = this.engines.find(e => e.name === name);
                        document.getElementById('engine-icon').textContent = this.currentEngine.name.charAt(0);
                        document.getElementById('engine-icon').style.background = this.currentEngine.color;
                        document.getElementById('engine-name').textContent = Utils.truncate(this.currentEngine.name, 6);
                        document.getElementById('search-logo').textContent = this.currentEngine.name;
                        document.getElementById('search-logo').style.color = this.currentEngine.color;
                        this.applyEngineColors();
                        dropdown.classList.remove('show');
                        document.getElementById('engine-btn').querySelector('.search-engine-arrow').innerHTML = '&#9660;';
                        this.dropdownVisible = false;

                        const cfg = Config.load();
                        cfg.defaultEngine = name;
                        Config.save(cfg);
                        document.getElementById('search-input').focus();
                    });
                });
            }

            // 同步更新显示区域
            const engineIcon = document.getElementById('engine-icon');
            const engineName = document.getElementById('engine-name');
            const searchLogo = document.getElementById('search-logo');

            if (engineIcon) {
                engineIcon.style.background = this.currentEngine.color;
                engineIcon.textContent = this.currentEngine.name.charAt(0);
            }
            if (engineName) {
                engineName.textContent = Utils.truncate(this.currentEngine.name, 6);
            }
            if (searchLogo) {
                searchLogo.textContent = this.currentEngine.name;
                searchLogo.style.color = this.currentEngine.color;
            }
        },

        // 绑定搜索相关事件
        bindEvents() {
            const engineBtn    = document.getElementById('engine-btn');
            const dropdown     = document.getElementById('engine-dropdown');
            const searchInput  = document.getElementById('search-input');
            const submitBtn    = document.getElementById('search-submit');
            const engineIcon   = document.getElementById('engine-icon');
            const engineName   = document.getElementById('engine-name');
            const searchLogo   = document.getElementById('search-logo');
            const arrowEl      = engineBtn.querySelector('.search-engine-arrow');

            // 长按 Logo 打开设置
            searchLogo.addEventListener('touchstart', () => {
                this.longPressTimer = setTimeout(() => Settings.show(), 500);
            });
            searchLogo.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
            searchLogo.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

            // 点击 Logo 打开书签面板
            searchLogo.addEventListener('click', () => {
                Bookmarks.refreshColors();
                Bookmarks.show();
            });

            // 切换引擎下拉菜单
            engineBtn.addEventListener('click', () => {
                this.dropdownVisible = !this.dropdownVisible;
                dropdown.classList.toggle('show', this.dropdownVisible);
                if (arrowEl) {
                    arrowEl.innerHTML = this.dropdownVisible ? '&#9650;' : '&#9660;';
                }
            });

            // 下拉菜单中的引擎选择
            dropdown.querySelectorAll('.search-engine-option').forEach(option => {
                option.addEventListener('click', () => {
                    const name = option.dataset.engine;
                    this.currentEngine = this.engines.find(e => e.name === name);
                    engineIcon.textContent = this.currentEngine.name.charAt(0);
                    engineIcon.style.background = this.currentEngine.color;
                    engineName.textContent = Utils.truncate(this.currentEngine.name, 6);
                    searchLogo.textContent = this.currentEngine.name;
                    searchLogo.style.color = this.currentEngine.color;
                    this.applyEngineColors();

                    this.dropdownVisible = false;
                    dropdown.classList.remove('show');
                    if (arrowEl) arrowEl.innerHTML = '&#9660;';

                    const cfg = Config.load();
                    cfg.defaultEngine = name;
                    Config.save(cfg);
                    searchInput.focus();
                });
            });

            // 点击外部关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (this.dropdownVisible &&
                    !engineBtn.contains(e.target) &&
                    !dropdown.contains(e.target)) {
                    this.dropdownVisible = false;
                    dropdown.classList.remove('show');
                    if (arrowEl) arrowEl.innerHTML = '&#9660;';
                }
            });

            // 执行搜索
            const doSearch = () => {
                const query = searchInput.value.trim();
                if (query && this.currentEngine) {
                    window.location.href = this.currentEngine.url + encodeURIComponent(query);
                }
            };

            submitBtn.addEventListener('click', doSearch);
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    doSearch();
                }
            });
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    doSearch();
                }
            });
        }
    };

    // ========== 快捷方式模块 ==========
    const Shortcuts = {
        COLS: 4,
        ROWS: 3,
        editing: false,
        longPressTimer: null,
        dragSrcIndex: -1,
        pendingAction: null,

        // 渲染快捷方式区域
        render() {
            const c = Config.load();
            const shortcuts = c.shortcuts || [];
            const maxItems = this.ROWS * this.COLS;
            const items = [];

            for (let i = 0; i < maxItems; i++) {
                if (i < shortcuts.length) {
                    const s = shortcuts[i];
                    items.push(`
                        <div class="shortcut-item ${this.editing ? 'editing' : ''}"
                             data-index="${i}"
                             data-id="${s.id}"
                             data-url="${this.editing ? '' : s.url}"
                             draggable="${this.editing ? 'true' : 'false'}">
                            <div class="shortcut-icon" style="background:${s.color}">
                                ${s.title.charAt(0)}
                                ${this.editing ? `<span class="shortcut-delete" data-index="${i}">✕</span>` : ''}
                            </div>
                            <span class="shortcut-title">${s.title}</span>
                        </div>
                    `);
                } else if (i === shortcuts.length && this.editing && shortcuts.length < maxItems) {
                    // 占位添加按钮
                    items.push(`
                        <div class="shortcut-item placeholder" data-action="add">
                            <div class="shortcut-icon placeholder-icon">+</div>
                            <span class="shortcut-title">添加</span>
                        </div>
                    `);
                } else {
                    items.push('<div class="shortcut-item empty"></div>');
                }
            }

            return `
                <style>
                    #shortcuts-area {
                        position: absolute;
                        top: calc(30% + 180px);
                        left: 50%;
                        transform: translateX(-50%);
                        width: 80%;
                        display: ${c.shortcutsVisible !== false ? 'grid' : 'none'};
                        grid-template-columns: repeat(${this.COLS}, 1fr);
                        grid-template-rows: repeat(${this.ROWS}, auto);
                        gap: 24px 8px;
                        justify-items: center;
                    }
                    .shortcut-item {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        gap: 10px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        text-decoration: none;
                        width: 72px;
                        position: relative;
                    }
                    .shortcut-item.empty {
                        pointer-events: none;
                    }
                    .shortcut-item.editing .shortcut-icon {
                        animation: wiggle .3s ease-in-out infinite alternate;
                    }
                    @keyframes wiggle {
                        0%   { transform: rotate(-1deg); }
                        100% { transform: rotate(1deg); }
                    }
                    .shortcut-item:active .shortcut-icon {
                        transform: scale(.92);
                    }
                    .shortcut-item.dragging {
                        opacity: .4;
                    }
                    .shortcut-icon {
                        width: 56px;
                        height: 56px;
                        border-radius: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-size: 26px;
                        font-weight: 600;
                        flex-shrink: 0;
                        transition: transform .15s;
                        position: relative;
                    }
                    .shortcut-delete {
                        position: absolute;
                        top: -6px;
                        right: -6px;
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        background: var(--engine-color, #008373);
                        color: #fff;
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        z-index: 2;
                        line-height: 1;
                    }
                    .placeholder-icon {
                        background: #e0e0e0 !important;
                        color: #999 !important;
                        font-size: 28px;
                    }
                    .shortcut-title {
                        font-size: 11px;
                        color: #666;
                        text-align: center;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 72px;
                    }
                    .shortcut-dialog-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,.5);
                        z-index: 300;
                        display: none;
                        align-items: center;
                        justify-content: center;
                    }
                    .shortcut-dialog-overlay.show {
                        display: flex;
                    }
                    .shortcut-dialog-box {
                        background: #fff;
                        border-radius: 14px;
                        padding: 20px;
                        width: 80%;
                        max-width: 340px;
                        box-shadow: 0 8px 30px rgba(0,0,0,.2);
                    }
                    .shortcut-dialog-title {
                        font-size: 16px;
                        font-weight: 600;
                        color: #333;
                        margin-bottom: 16px;
                        text-align: center;
                    }
                    .shortcut-dialog-input-wrap {
                        margin-bottom: 10px;
                    }
                    .shortcut-dialog-input {
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 14px;
                        color: #333;
                        outline: none;
                        background: #f9f9f9;
                    }
                    .shortcut-dialog-input:focus {
                        border-color: var(--engine-color, #008373);
                    }
                    .shortcut-dialog-color-wrap {
                        margin-bottom: 10px;
                    }
                    .shortcut-dialog-color-label {
                        font-size: 12px;
                        color: #999;
                        margin-bottom: 6px;
                    }
                    .shortcut-dialog-color-pool {
                        display: grid;
                        grid-template-columns: repeat(6, 1fr);
                        gap: 6px;
                    }
                    .shortcut-dialog-color-item {
                        width: 100%;
                        aspect-ratio: 1;
                        border-radius: 6px;
                        cursor: pointer;
                        border: 2px solid transparent;
                    }
                    .shortcut-dialog-color-item.selected {
                        border-color: #333;
                    }
                    .shortcut-dialog-buttons {
                        display: flex;
                        gap: 10px;
                        margin-top: 6px;
                    }
                    .shortcut-dialog-btn {
                        flex: 1;
                        padding: 10px;
                        border: none;
                        border-radius: 8px;
                        font-size: 14px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .shortcut-dialog-btn-cancel {
                        background: #f0f0f0;
                        color: #666;
                    }
                    .shortcut-dialog-btn-confirm {
                        background: var(--engine-color, #008373);
                        color: #fff;
                    }
                </style>
                ${items.join('')}`;
        },

        // 初始化快捷方式模块
        init() {
            const container = document.getElementById('shortcuts-area');
            if (container) {
                container.innerHTML = this.render();
            }
            // 注入独立弹窗到全局容器
            const dialogContainer = document.getElementById('shortcuts-dialog-container');
            if (dialogContainer) {
                dialogContainer.innerHTML = `
                    <div class="shortcut-dialog-overlay" id="shortcut-dialog-overlay">
                        <div class="shortcut-dialog-box">
                            <div class="shortcut-dialog-title" id="shortcut-dialog-title"></div>
                            <div class="shortcut-dialog-input-wrap">
                                <input class="shortcut-dialog-input" id="shortcut-dialog-input" placeholder="名称">
                            </div>
                            <div class="shortcut-dialog-input-wrap">
                                <input class="shortcut-dialog-input" id="shortcut-dialog-url" placeholder="URL">
                            </div>
                            <div class="shortcut-dialog-color-wrap">
                                <div class="shortcut-dialog-color-label">图标颜色</div>
                                <div class="shortcut-dialog-color-pool" id="shortcut-dialog-color-pool"></div>
                            </div>
                            <div class="shortcut-dialog-buttons">
                                <button class="shortcut-dialog-btn shortcut-dialog-btn-cancel" id="shortcut-dialog-cancel">取消</button>
                                <button class="shortcut-dialog-btn shortcut-dialog-btn-confirm" id="shortcut-dialog-confirm">确定</button>
                            </div>
                        </div>
                    </div>`;
            }
            this.bindEvents();
            this.initDialog();
        },

        // 初始化快捷方式弹窗事件
        initDialog() {
            const overlay = document.getElementById('shortcut-dialog-overlay');
            if (!overlay) return;

            overlay.addEventListener('click', (e) => e.stopPropagation());

            document.getElementById('shortcut-dialog-confirm').addEventListener('click', () => this.executePending());
            document.getElementById('shortcut-dialog-cancel').addEventListener('click', () => {
                this.pendingAction = null;
                this.hideDialog();
            });

            const inputEl = document.getElementById('shortcut-dialog-input');
            const urlEl   = document.getElementById('shortcut-dialog-url');
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    urlEl.focus();
                }
            });
            urlEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executePending();
                }
            });
        },

        // 显示快捷方式编辑弹窗
        showDialog(title, value, urlValue, colorValue) {
            const overlay = document.getElementById('shortcut-dialog-overlay');
            const titleEl = document.getElementById('shortcut-dialog-title');
            const inputEl = document.getElementById('shortcut-dialog-input');
            const urlEl   = document.getElementById('shortcut-dialog-url');
            const colorPoolEl = document.getElementById('shortcut-dialog-color-pool');

            if (!overlay) return;

            titleEl.textContent = title;
            inputEl.value = value || '';
            urlEl.value = urlValue || 'https://';

            colorPoolEl.innerHTML = COLOR_POOL.map(c =>
                `<div class="shortcut-dialog-color-item ${c === colorValue ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`
            ).join('');

            colorPoolEl.querySelectorAll('.shortcut-dialog-color-item').forEach(item => {
                item.addEventListener('click', () => {
                    colorPoolEl.querySelectorAll('.shortcut-dialog-color-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                });
            });

            overlay.classList.add('show');
            inputEl.focus();
        },

        hideDialog() {
            const overlay = document.getElementById('shortcut-dialog-overlay');
            if (overlay) overlay.classList.remove('show');
        },

        getDialogValue() {
            const el = document.getElementById('shortcut-dialog-input');
            return el ? el.value : '';
        },

        getDialogUrl() {
            const el = document.getElementById('shortcut-dialog-url');
            return el ? el.value : '';
        },

        getDialogColor() {
            const selected = document.querySelector('#shortcut-dialog-color-pool .shortcut-dialog-color-item.selected');
            return selected ? selected.dataset.color : COLOR_POOL[0];
        },

        // 绑定快捷方式区域事件
        bindEvents() {
            const container = document.getElementById('shortcuts-area');
            if (!container) return;

            // 长按进入编辑模式
            container.addEventListener('touchstart', (e) => {
                const item = e.target.closest('.shortcut-item:not(.empty):not(.placeholder)');
                if (!item || this.editing) return;
                this.longPressTimer = setTimeout(() => {
                    this.editing = true;
                    this.init();
                }, 500);
            });
            container.addEventListener('touchend', () => clearTimeout(this.longPressTimer));
            container.addEventListener('touchmove', () => clearTimeout(this.longPressTimer));

            // 点击外部退出编辑模式
            document.addEventListener('click', (e) => {
                if (!this.editing) return;
                const area = document.getElementById('shortcuts-area');
                const dialog = document.getElementById('shortcut-dialog-overlay');
                if (area && !area.contains(e.target) && !(dialog && dialog.contains(e.target))) {
                    this.editing = false;
                    this.init();
                }
            });

            // 处理点击事件（打开 URL、删除、添加、编辑）
            container.addEventListener('click', (e) => {
                if (!this.editing) {
                    const item = e.target.closest('.shortcut-item:not(.empty)');
                    if (item) {
                        const url = item.dataset.url;
                        if (url) window.location.href = url;
                    }
                    return;
                }

                // 删除按钮
                const delBtn = e.target.closest('.shortcut-delete');
                if (delBtn) {
                    e.stopPropagation();
                    const idx = parseInt(delBtn.dataset.index);
                    const cfg = Config.load();
                    cfg.shortcuts.splice(idx, 1);
                    Config.save(cfg);
                    this.init();
                    return;
                }

                // 添加占位
                const placeholder = e.target.closest('.shortcut-item.placeholder');
                if (placeholder) {
                    this.pendingAction = { action: 'add' };
                    this.showDialog('添加快捷方式', '', 'https://', Utils.randomColor());
                    return;
                }

                // 编辑现有快捷方式
                const item = e.target.closest('.shortcut-item.editing');
                if (item && !e.target.closest('.shortcut-delete')) {
                    const idx = parseInt(item.dataset.index);
                    const cfg = Config.load();
                    const s = cfg.shortcuts[idx];
                    if (s) {
                        this.pendingAction = { action: 'edit', index: idx };
                        this.showDialog('编辑快捷方式', s.title, s.url, s.color);
                    }
                }
            });

            // 拖拽排序
            container.addEventListener('dragstart', (e) => {
                if (!this.editing) return;
                const item = e.target.closest('.shortcut-item.editing');
                if (!item) return;
                this.dragSrcIndex = parseInt(item.dataset.index);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            container.addEventListener('dragend', (e) => {
                const item = e.target.closest('.shortcut-item');
                if (item) item.classList.remove('dragging');
                container.querySelectorAll('.shortcut-item').forEach(el => el.classList.remove('dragging'));
            });

            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            });

            container.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!this.editing || this.dragSrcIndex < 0) return;
                const target = e.target.closest('.shortcut-item.editing');
                if (!target) return;
                const targetIndex = parseInt(target.dataset.index);
                if (this.dragSrcIndex === targetIndex) return;

                const cfg = Config.load();
                const [moved] = cfg.shortcuts.splice(this.dragSrcIndex, 1);
                cfg.shortcuts.splice(targetIndex, 0, moved);
                Config.save(cfg);
                this.init();
                this.dragSrcIndex = -1;
            });
        },

        // 执行弹窗中的待处理操作（添加或编辑）
        executePending() {
            const pa = this.pendingAction;
            if (!pa) return;

            const title = this.getDialogValue().trim();
            const url   = this.getDialogUrl().trim();
            const color = this.getDialogColor();
            if (!title || !url) return;

            const cfg = Config.load();
            const shortcuts = cfg.shortcuts || [];

            if (pa.action === 'add') {
                if (shortcuts.length >= this.ROWS * this.COLS) return;
                shortcuts.push({
                    id: Utils.generateId(),
                    title,
                    url: Utils.ensureUrl(url),
                    color
                });
            } else if (pa.action === 'edit') {
                const s = shortcuts[pa.index];
                if (s) {
                    s.title = title;
                    s.url   = Utils.ensureUrl(url);
                    s.color = color;
                }
            }

            cfg.shortcuts = shortcuts;
            Config.save(cfg);
            this.pendingAction = null;
            this.hideDialog();
            this.init();
        },

        show() {
            const el = document.getElementById('shortcuts-area');
            if (el) el.style.display = 'grid';
        },

        hide() {
            const el = document.getElementById('shortcuts-area');
            if (el) el.style.display = 'none';
        }
    };

    // ========== 书签模块 ==========
    const Bookmarks = {
        visible: false,
        _initialized: false,
        dragInfo: null,
        contextMenuId: null,
        pendingAction: null,
        searchKeyword: '',

        // 对节点子项排序：文件夹在前，书签在后
        sortChildren(nodes) {
            if (!nodes) return;
            nodes.sort((a, b) => {
                if (a.type === b.type) return 0;
                return a.type === 'folder' ? -1 : 1;
            });
            nodes.forEach(node => {
                if (node.children) this.sortChildren(node.children);
            });
        },

        // 按 URL 查找书签节点（返回 { node, parentArray, index } 或 null）
        findBookmarkByUrl(tree, url) {
            for (let i = 0; i < tree.length; i++) {
                const node = tree[i];
                if (node.type === 'bookmark' && node.url === url) {
                    return { node, parentArray: tree, index: i };
                }
                if (node.children && node.children.length > 0) {
                    const result = this.findBookmarkByUrl(node.children, url);
                    if (result) return result;
                }
            }
            return null;
        },

        // 高亮搜索关键词
        highlight(text, keyword) {
            if (!keyword) return text;
            const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
            if (idx < 0) return text;
            return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + keyword.length) + '</mark>' + text.slice(idx + keyword.length);
        },

        // 递归搜索匹配的书签（返回书签节点数组）
        searchBookmarks(nodes, keyword) {
            const results = [];
            const kw = keyword.toLowerCase();
            const search = (list) => {
                for (const node of list) {
                    if (node.type === 'bookmark') {
                        if (node.title.toLowerCase().includes(kw) ||
                            (node.url && node.url.toLowerCase().includes(kw))) {
                            results.push(node);
                        }
                    }
                    if (node.children && node.children.length > 0) {
                        search(node.children);
                    }
                }
            };
            search(nodes);
            return results;
        },

        // 构建搜索结果 HTML
        buildSearchResults(keyword) {
            const root = Config.load().bookmarkRoot;
            const results = this.searchBookmarks(root.children || [], keyword);
            if (results.length === 0) {
                return `<div class="search-empty">没有找到匹配的书签</div>`;
            }
            return results.map(node => {
                const color = node.color || Utils.randomColor();
                return `
                    <div class="tree-node" data-id="${node.id}" data-type="bookmark" data-url="${node.url || ''}" draggable="true">
                        <div class="tree-row bookmark" style="padding-left:32px">
                            <span class="bm-icon" style="background:${color}">${node.title.charAt(0)}</span>
                            <span class="tree-title">${this.highlight(node.title, keyword)}</span>
                            <span class="tree-url">${this.highlight(node.url || '', keyword)}</span>
                            <span class="tree-menu-btn" data-id="${node.id}">⋮</span>
                        </div>
                    </div>`;
            }).join('');
        },

        // 添加书签到根目录
        addBookmarkToRoot(title, url, color) {
            const cfg = Config.load();
            const root = cfg.bookmarkRoot;
            if (!root.children) root.children = [];
            const newBookmark = {
                id: Utils.generateId(),
                title,
                type: 'bookmark',
                url: Utils.ensureUrl(url),
                color: color || Utils.randomColor()
            };
            root.children.push(newBookmark);
            root.expanded = true;
            this.sortChildren(root.children);
            Config.save(cfg);
            return newBookmark;
        },

        // 按 URL 删除书签（返回被删除的节点，找不到返回 null）
        deleteBookmarkByUrl(url) {
            const cfg = Config.load();
            const found = this.findBookmarkByUrl(cfg.bookmarkRoot.children, url);
            if (!found) return null;
            found.parentArray.splice(found.index, 1);
            Config.save(cfg);
            return found.node;
        },
        // 递归构建书签树 HTML
        buildTreeNode(node, depth) {
            const isFolder = node.type === 'folder';
            const isExpanded = node.expanded !== false;
            const indent = depth * 20;
            const color = node.color || Utils.randomColor();
            const isRoot = node.id === 'root';

            if (isFolder) {
                const children = node.children ? [...node.children] : [];
                children.sort((a, b) => {
                    if (a.type === b.type) return 0;
                    return a.type === 'folder' ? -1 : 1;
                });
                const childrenHTML = children.length > 0
                    ? children.map(c => this.buildTreeNode(c, depth + 1)).join('')
                    : `<div class="tree-empty" style="padding-left:${indent + 32}px">空</div>`;

                return `
                    <div class="tree-node" data-id="${node.id}" data-type="folder" ${isRoot ? '' : 'draggable="true"'}>
                        <div class="tree-row folder" style="padding-left:${indent}px" data-id="${node.id}">
                            <span class="tree-arrow ${isRoot ? 'hidden' : ''} ${isExpanded ? 'expanded' : ''}" data-id="${node.id}">▶</span>
                            <span class="tree-icon">📁</span>
                            <span class="tree-title">${node.title}</span>
                            <span class="tree-menu-btn" data-id="${node.id}">⋮</span>
                        </div>
                        <div class="tree-children ${isExpanded ? '' : 'collapsed'}" data-id="${node.id}">
                            ${childrenHTML}
                        </div>
                    </div>`;
            } else {
                return `
                    <div class="tree-node" data-id="${node.id}" data-type="bookmark" data-url="${node.url || ''}" draggable="true">
                        <div class="tree-row bookmark" style="padding-left:${indent + 32}px">
                            <span class="bm-icon" style="background:${color}">${node.title.charAt(0)}</span>
                            <span class="tree-title">${node.title}</span>
                            <span class="tree-url">${node.url || ''}</span>
                            <span class="tree-menu-btn" data-id="${node.id}">⋮</span>
                        </div>
                    </div>`;
            }
        },

        // 渲染完整书签面板及关联元素
        render() {
            const root = Config.load().bookmarkRoot;
            this.sortChildren(root.children);
            const treeHTML = this.buildTreeNode(root, 0);

            return `
                <style>
                    #bookmarks-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        pointer-events: none;
                        z-index: 100;
                    }
                    #bookmarks-panel {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        width: 100%;
                        height: 70%;
                        background: #fff;
                        border-radius: 16px 16px 0 0;
                        box-shadow: 0 -4px 20px rgba(0,0,0,.15);
                        z-index: 101;
                        transform: translateY(100%);
                        transition: transform .3s ease-out;
                        display: flex;
                        flex-direction: column;
                        pointer-events: auto;
                    }
                    #bookmarks-panel.show {
                        transform: translateY(0);
                    }
                    .bookmarks-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 16px 20px 8px;
                        border-bottom: 1px solid #f0f0f0;
                        flex-shrink: 0;
                        flex-direction: column;
                        gap: 10px;
                    }
                    .bookmarks-header-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                    }
                    .bookmarks-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #333;
                    }
                    .bookmarks-close {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        border-radius: 50%;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 20px;
                        color: #999;
                    }
                    .bookmarks-close:active {
                        background: #f0f0f0;
                    }
                    .bookmarks-search-wrap {
                        width: 100%;
                        position: relative;
                    }
                    .bookmarks-search-input {
                        width: 100%;
                        padding: 8px 12px 8px 32px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 14px;
                        color: #333;
                        outline: none;
                        background: #f9f9f9;
                        box-sizing: border-box;
                    }
                    .bookmarks-search-input:focus {
                        border-color: var(--bm-color, #008373);
                        background: #fff;
                    }
                    .bookmarks-search-icon {
                        position: absolute;
                        left: 10px;
                        top: 50%;
                        transform: translateY(-50%);
                        font-size: 14px;
                        color: #ccc;
                        pointer-events: none;
                    }
                    .bookmarks-search-clear {
                        position: absolute;
                        right: 8px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 20px;
                        height: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        color: #ccc;
                        font-size: 14px;
                        border-radius: 50%;
                    }
                    .bookmarks-search-clear:active {
                        background: #f0f0f0;
                    }
                    .bookmarks-list {
                        flex: 1;
                        overflow-y: auto;
                        padding: 8px 0;
                        -webkit-overflow-scrolling: touch;
                    }
                    .search-empty {
                        padding: 40px 20px;
                        text-align: center;
                        color: #ccc;
                        font-size: 14px;
                    }
                    .tree-title mark,
                    .tree-url mark {
                        background: #ffe066;
                        color: #333;
                        padding: 0 2px;
                        border-radius: 2px;
                    }
                    .tree-node.dragging {
                        opacity: .4;
                    }
                    .tree-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 16px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 15px;
                        min-height: 44px;
                    }
                    .tree-row:active {
                        background: #f5f5f5;
                    }
                    .tree-arrow {
                        width: 20px;
                        height: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        color: var(--bm-color, #999);
                        transition: transform .2s, color .2s;
                        flex-shrink: 0;
                    }
                    .tree-arrow.hidden {
                        visibility: hidden;
                    }
                    .tree-arrow.expanded {
                        transform: rotate(90deg);
                    }
                    .tree-icon {
                        width: 35px;
                        height: 35px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 28px;
                        flex-shrink: 0;
                    }
                    .bm-icon {
                        width: 28px;
                        height: 28px;
                        border-radius: 6px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-size: 14px;
                        font-weight: 600;
                        flex-shrink: 0;
                    }
                    .tree-title {
                        color: #333;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        flex-shrink: 0;
                    }
                    .tree-url {
                        font-size: 11px;
                        color: #999;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        max-width: 120px;
                        flex-shrink: 1;
                        margin-left: 4px;
                    }
                    .tree-menu-btn {
                        width: 28px;
                        height: 28px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        border-radius: 50%;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 16px;
                        color: #ccc;
                        flex-shrink: 0;
                        letter-spacing: 1px;
                        font-weight: 700;
                        margin-left: auto;
                    }
                    .tree-menu-btn:active {
                        background: #f0f0f0;
                    }
                    .context-menu {
                        position: fixed;
                        background: #fff;
                        border: 1px solid #e0e0e0;
                        border-radius: 10px;
                        box-shadow: 0 4px 16px rgba(0,0,0,.15);
                        z-index: 200;
                        padding: 6px 0;
                        min-width: 140px;
                        display: none;
                    }
                    .context-menu.show {
                        display: block;
                    }
                    .context-menu-item {
                        padding: 10px 16px;
                        font-size: 14px;
                        color: #333;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .context-menu-item:active {
                        background: #f0f0f0;
                    }
                    .context-menu-item.danger {
                        color: #e55;
                    }
                    .context-menu-item.disabled {
                        color: #ccc;
                        pointer-events: none;
                    }
                    .tree-children.collapsed {
                        display: none;
                    }
                    .tree-empty {
                        padding: 8px 16px;
                        color: #ccc;
                        font-size: 13px;
                    }
                    .dialog-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        background: rgba(0,0,0,.5);
                        z-index: 300;
                        display: none;
                        align-items: center;
                        justify-content: center;
                    }
                    .dialog-overlay.show {
                        display: flex;
                    }
                    .dialog-box {
                        background: #fff;
                        border-radius: 14px;
                        padding: 20px;
                        width: 80%;
                        max-width: 340px;
                        box-shadow: 0 8px 30px rgba(0,0,0,.2);
                    }
                    .dialog-title {
                        font-size: 16px;
                        font-weight: 600;
                        color: #333;
                        margin-bottom: 16px;
                        text-align: center;
                    }
                    .dialog-input-wrap {
                        margin-bottom: 10px;
                    }
                    .dialog-input {
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 14px;
                        color: #333;
                        outline: none;
                        background: #f9f9f9;
                    }
                    .dialog-input:focus {
                        border-color: var(--engine-color, #008373);
                    }
                    .dialog-buttons {
                        display: flex;
                        gap: 10px;
                        margin-top: 6px;
                    }
                    .dialog-btn {
                        flex: 1;
                        padding: 10px;
                        border: none;
                        border-radius: 8px;
                        font-size: 14px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .dialog-btn-cancel {
                        background: #f0f0f0;
                        color: #666;
                    }
                    .dialog-btn-confirm {
                        background: var(--engine-color, #008373);
                        color: #fff;
                    }
                </style>

                <div id="bookmarks-panel">
                    <div class="bookmarks-header">
                        <div class="bookmarks-header-row">
                            <span class="bookmarks-title">书签</span>
                            <span class="bookmarks-close" id="bookmarks-close">✕</span>
                        </div>
                        <div class="bookmarks-search-wrap">
                            <span class="bookmarks-search-icon">🔍</span>
                            <input type="text" class="bookmarks-search-input" id="bookmarks-search" placeholder="搜索书签...">
                            <span class="bookmarks-search-clear" id="bookmarks-search-clear" style="display:none">✕</span>
                        </div>
                    </div>
                    <div class="bookmarks-list" id="bookmarks-list">${treeHTML}</div>
                </div>
                <div class="context-menu" id="context-menu"></div>
                <div class="dialog-overlay" id="dialog-overlay">
                    <div class="dialog-box">
                        <div class="dialog-title" id="dialog-title"></div>
                        <div class="dialog-input-wrap" id="dialog-input-wrap">
                            <input class="dialog-input" id="dialog-input">
                        </div>
                        <div class="dialog-input-wrap" id="dialog-url-wrap" style="display:none">
                            <input class="dialog-input" id="dialog-url" placeholder="URL">
                        </div>
                        <div class="dialog-buttons">
                            <button class="dialog-btn dialog-btn-cancel" id="dialog-cancel">取消</button>
                            <button class="dialog-btn dialog-btn-confirm" id="dialog-confirm">确定</button>
                        </div>
                    </div>
                </div>`;
        },

        init() {
            if (this._initialized) return;
            const container = document.getElementById('bookmarks-overlay');
            if (container) container.innerHTML = this.render();
            this.refreshColors();
            this.bindEvents();
            this.initDialog();
            this._initialized = true;
        },

        // 应用当前引擎颜色
        refreshColors() {
            const color = Search.getCurrentColor();
            const panel = document.getElementById('bookmarks-panel');
            if (panel) panel.style.setProperty('--bm-color', color);
            const overlay = document.getElementById('dialog-overlay');
            if (overlay) overlay.style.setProperty('--engine-color', color);
        },

        show() {
            const panel = document.getElementById('bookmarks-panel');
            const overlay = document.getElementById('bookmarks-overlay');
            if (panel) {
                this.refreshColors();
                panel.classList.add('show');
                this.visible = true;
            }
            if (overlay) overlay.style.pointerEvents = 'auto';
        },

        hide() {
            const panel = document.getElementById('bookmarks-panel');
            const overlay = document.getElementById('bookmarks-overlay');
            if (panel) {
                panel.classList.remove('show');
                this.visible = false;
                this.closeContextMenu();
            }
            if (overlay) overlay.style.pointerEvents = 'none';
        },

        toggleFolder(id) {
            if (id === 'root') return;
            const cfg = Config.load();
            const root = cfg.bookmarkRoot;

            const toggleNode = (nodes) => {
                for (const node of nodes) {
                    if (node.id === id && node.type === 'folder') {
                        node.expanded = !node.expanded;
                        return true;
                    }
                    if (node.children && toggleNode(node.children)) return true;
                }
                return false;
            };

            toggleNode(root.children);
            Config.save(cfg);

            const childrenEl = document.querySelector(`.tree-children[data-id="${id}"]`);
            const arrowEl = document.querySelector(`.tree-arrow[data-id="${id}"]`);
            if (childrenEl) childrenEl.classList.toggle('collapsed');
            if (arrowEl) arrowEl.classList.toggle('expanded');
        },

        // 在树中查找节点及其父数组和索引
        findNode(tree, id) {
            for (let i = 0; i < tree.length; i++) {
                if (tree[i].id === id) {
                    return { node: tree[i], parentArray: tree, index: i };
                }
                if (tree[i].children) {
                    const result = this.findNode(tree[i].children, id);
                    if (result) return result;
                }
            }
            return null;
        },

        closeContextMenu() {
            const cm = document.getElementById('context-menu');
            if (cm) cm.classList.remove('show');
            this.contextMenuId = null;
        },

        showContextMenu(e, id, type) {
            e.stopPropagation();
            const cm = document.getElementById('context-menu');
            if (!cm) return;

            this.contextMenuId = id;
            const cfg = Config.load();
            const shortcuts = cfg.shortcuts || [];
            const maxSlots = Shortcuts.COLS * Shortcuts.ROWS;

            let items = '';

            if (type === 'root') {
                items = `
                    <div class="context-menu-item" data-action="add-folder">添加文件夹</div>
                    <div class="context-menu-item" data-action="add-bookmark">添加书签</div>`;
            } else if (type === 'folder') {
                items = `
                    <div class="context-menu-item" data-action="edit">编辑</div>
                    <div class="context-menu-item danger" data-action="delete">删除</div>
                    <div class="context-menu-item" data-action="add-folder">添加文件夹</div>
                    <div class="context-menu-item" data-action="add-bookmark">添加书签</div>`;
            } else {
                const nodeEl = document.querySelector(`.tree-node[data-id="${id}"]`);
                const url = nodeEl ? nodeEl.dataset.url : '';
                const isInShortcuts = shortcuts.some(s => s.url === url);
                const isFull = shortcuts.length >= maxSlots;

                let shortcutLabel = '添加快捷方式';
                let shortcutClass = '';
                if (isInShortcuts) {
                    shortcutLabel = '移除快捷方式';
                    shortcutClass = 'danger';
                } else if (isFull) {
                    shortcutLabel = '快捷方式已满';
                    shortcutClass = 'disabled';
                }

                items = `
                    <div class="context-menu-item" data-action="edit">编辑</div>
                    <div class="context-menu-item danger" data-action="delete">删除</div>
                    <div class="context-menu-item ${shortcutClass}" data-action="add-shortcut">${shortcutLabel}</div>`;
            }

            cm.innerHTML = items;
            cm.classList.add('show');
            cm.style.left = Math.min(e.clientX, window.innerWidth - 150) + 'px';
            cm.style.top = Math.min(e.clientY, window.innerHeight - 160) + 'px';

            cm.querySelectorAll('.context-menu-item:not(.disabled)').forEach(item => {
                item.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const action = item.dataset.action;
                    const savedId = this.contextMenuId;
                    this.closeContextMenu();
                    this.contextMenuId = savedId;
                    this.handleContextAction(action);
                });
            });
        },

        handleContextAction(action) {
            const id = this.contextMenuId;
            if (!id) return;

            const cfg = Config.load();
            const rootChildren = cfg.bookmarkRoot.children;
            const found = id === 'root'
                ? { node: cfg.bookmarkRoot, parentArray: null, index: -1 }
                : this.findNode(rootChildren, id);

            if (!found) return;

            this.pendingAction = { action, found, cfg };

            switch (action) {
                case 'edit':
                    if (found.node.type === 'bookmark') {
                        Dialog.show('编辑书签', found.node.title, '名称', '保存', '取消', found.node.url || '', true);
                    } else {
                        Dialog.show('编辑', found.node.title, '名称', '保存', '取消');
                    }
                    break;
                case 'delete':
                    Dialog.confirm('确定删除？');
                    break;
                case 'add-folder':
                    Dialog.show('添加文件夹', '', '文件夹名称', '添加', '取消');
                    break;
                case 'add-bookmark':
                    Dialog.show('添加书签', '', '书签名称', '添加', '取消', 'https://', true);
                    break;
                case 'add-shortcut':
                    this.executePending();
                    break;
            }
        },

        executePending() {
            const { action, found, cfg } = this.pendingAction || {};
            if (!action) return;

            const title = Dialog.getValue().trim();
            const urlValue = Dialog.getUrlValue().trim();

            switch (action) {
                case 'edit':
                    if (!title) return;
                    found.node.title = title;
                    if (found.node.type === 'bookmark' && urlValue) {
                        found.node.url = Utils.ensureUrl(urlValue);
                    }
                    Config.save(cfg);
                    this.refreshPanel();
                    break;
                case 'delete':
                    found.parentArray.splice(found.index, 1);
                    Config.save(cfg);
                    this.refreshPanel();
                    break;
                case 'add-folder':
                    if (!title) return;
                    if (!found.node.children) found.node.children = [];
                    found.node.children.push({
                        id: Utils.generateId(),
                        title,
                        type: 'folder',
                        expanded: true,
                        color: Utils.randomColor(),
                        children: []
                    });
                    found.node.expanded = true;
                    Config.save(cfg);
                    this.refreshPanel();
                    break;
                case 'add-bookmark':
                    if (!title) return;
                    if (!found.node.children) found.node.children = [];
                    found.node.children.push({
                        id: Utils.generateId(),
                        title,
                        type: 'bookmark',
                        url: Utils.ensureUrl(urlValue),
                        color: Utils.randomColor()
                    });
                    found.node.expanded = true;
                    Config.save(cfg);
                    this.refreshPanel();
                    break;
                case 'add-shortcut':
                    if (found.node.type === 'bookmark') {
                        const shortcuts = cfg.shortcuts || [];
                        const maxSlots = Shortcuts.COLS * Shortcuts.ROWS;
                        const existingIndex = shortcuts.findIndex(s => s.url === found.node.url);
                        if (existingIndex >= 0) {
                            shortcuts.splice(existingIndex, 1);
                        } else if (shortcuts.length >= maxSlots) {
                            break;
                        } else {
                            shortcuts.push({
                                id: Utils.generateId(),
                                title: found.node.title,
                                url: found.node.url,
                                color: found.node.color || Utils.randomColor()
                            });
                        }
                        cfg.shortcuts = shortcuts;
                        Config.save(cfg);
                        Shortcuts.init();
                    }
                    break;
            }

            this.pendingAction = null;
            Dialog.hide();
        },

        initDialog() {
            const overlay   = document.getElementById('dialog-overlay');
            const confirmBtn = document.getElementById('dialog-confirm');
            const cancelBtn  = document.getElementById('dialog-cancel');
            const inputEl    = document.getElementById('dialog-input');
            const urlEl      = document.getElementById('dialog-url');

            if (overlay) overlay.addEventListener('click', (e) => e.stopPropagation());
            if (confirmBtn) confirmBtn.addEventListener('click', () => this.executePending());
            if (cancelBtn) cancelBtn.addEventListener('click', () => {
                this.pendingAction = null;
                Dialog.hide();
            });
            if (inputEl) inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (urlEl && urlEl.offsetParent !== null) {
                        urlEl.focus();
                    } else {
                        this.executePending();
                    }
                }
            });
            if (urlEl) urlEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.executePending();
                }
            });
        },

        bindEvents() {
            const closeBtn = document.getElementById('bookmarks-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.hide());

            // 搜索框
            const searchInput = document.getElementById('bookmarks-search');
            const searchClear = document.getElementById('bookmarks-search-clear');
            if (searchInput) {
                let debounceTimer = null;
                searchInput.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => {
                        this.doSearch(searchInput.value);
                    }, 150);
                });
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        searchInput.value = '';
                        this.doSearch('');
                    }
                });
            }
            if (searchClear) {
                searchClear.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    this.doSearch('');
                    if (searchInput) searchInput.focus();
                });
            }

            const listEl = document.getElementById('bookmarks-list');
            if (!listEl) return;

            // 点击事件：菜单、文件夹切换、打开书签
            listEl.addEventListener('click', (e) => {
                const menuBtn = e.target.closest('.tree-menu-btn');
                if (menuBtn) {
                    const nodeEl = menuBtn.closest('.tree-node');
                    const nodeType = nodeEl ? nodeEl.dataset.type : 'bookmark';
                    const isRoot = menuBtn.dataset.id === 'root';
                    if (nodeType === 'bookmark') e.stopPropagation();
                    this.showContextMenu(e, menuBtn.dataset.id, isRoot ? 'root' : nodeType);
                    return;
                }

                const row = e.target.closest('.tree-row');
                if (!row) return;
                const id = row.dataset.id;

                if (row.classList.contains('folder')) {
                    this.toggleFolder(id);
                } else if (row.classList.contains('bookmark')) {
                    const node = e.target.closest('.tree-node');
                    const url = node ? node.dataset.url : null;
                    if (url) window.location.href = url;
                }
            });

            // 全局关闭右键菜单
            document.addEventListener('click', (e) => {
                const cm = document.getElementById('context-menu');
                if (cm && cm.classList.contains('show') && !cm.contains(e.target)) {
                    this.closeContextMenu();
                }
            }, true);

            // 拖拽排序
            listEl.addEventListener('dragstart', (e) => {
                const node = e.target.closest('.tree-node[draggable="true"]');
                if (!node) return;
                this.dragInfo = { id: node.dataset.id };
                node.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            listEl.addEventListener('dragend', (e) => {
                const node = e.target.closest('.tree-node');
                if (node) node.classList.remove('dragging');
                this.dragInfo = null;
            });

            listEl.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.dragInfo) e.dataTransfer.dropEffect = 'move';
            });

            listEl.addEventListener('drop', (e) => {
                e.preventDefault();
                if (!this.dragInfo) return;

                const target = e.target.closest('.tree-node');
                const cfg = Config.load();
                const rootChildren = cfg.bookmarkRoot.children;
                const src = this.findNode(rootChildren, this.dragInfo.id);
                if (!src) return;

                // 拖拽到根目录或空白处
                if (!target || target.dataset.id === 'root') {
                    src.parentArray.splice(src.index, 1);
                    rootChildren.push(src.node);
                    Config.save(cfg);
                    this.refreshPanel();
                    this.dragInfo = null;
                    return;
                }

                if (target.dataset.id === this.dragInfo.id) return;
                const tgt = this.findNode(rootChildren, target.dataset.id);
                if (!tgt) return;

                // 防止将文件夹拖入自身内部
                if (src.node.type === 'folder') {
                    let isDescendant = false;
                    const check = (node, id) => {
                        if (node.id === id) { isDescendant = true; return; }
                        if (node.children) node.children.forEach(c => check(c, id));
                    };
                    check(src.node, tgt.node.id);
                    if (isDescendant) return;
                }

                src.parentArray.splice(src.index, 1);

                if (tgt.node.type === 'folder') {
                    if (!tgt.node.children) tgt.node.children = [];
                    tgt.node.children.push(src.node);
                    tgt.node.expanded = true;
                } else {
                    const insertIndex = tgt.parentArray.indexOf(tgt.node);
                    tgt.parentArray.splice(insertIndex, 0, src.node);
                }

                Config.save(cfg);
                this.refreshPanel();
                this.dragInfo = null;
            });

            // 点击面板外部关闭
            document.addEventListener('click', (e) => {
                if (!this.visible) return;
                const panel = document.getElementById('bookmarks-panel');
                const cm = document.getElementById('context-menu');
                const logo = document.getElementById('search-logo');
                if (panel && !panel.contains(e.target) && !(cm && cm.contains(e.target))) {
                    if (logo && logo.contains(e.target)) return;
                    this.hide();
                }
            });
        },

        // 执行搜索
        doSearch(keyword) {
            this.searchKeyword = keyword;
            const container = document.getElementById('bookmarks-list');
            const clearBtn = document.getElementById('bookmarks-search-clear');
            if (!container) return;

            if (!keyword.trim()) {
                const root = Config.load().bookmarkRoot;
                this.sortChildren(root.children);
                container.innerHTML = this.buildTreeNode(root, 0);
                if (clearBtn) clearBtn.style.display = 'none';
            } else {
                container.innerHTML = this.buildSearchResults(keyword.trim());
                if (clearBtn) clearBtn.style.display = 'flex';
            }
        },

        // 刷新面板视图（保留当前状态）
        refreshPanel() {
            const container = document.getElementById('bookmarks-list');
            if (!container) return;
            if (this.searchKeyword) {
                container.innerHTML = this.buildSearchResults(this.searchKeyword);
            } else {
                const root = Config.load().bookmarkRoot;
                this.sortChildren(root.children);
                container.innerHTML = this.buildTreeNode(root, 0);
            }
            this.refreshColors();
        }
    };

    // ========== WebDAV 同步模块 ==========
    const WebDAV = {
        // 获取完整的远程文件 URL
        getFullUrl() {
            const cfg = Config.load();
            let base = cfg.webdav.url || '';
            const path = cfg.webdav.remotePath || 'homepage-config.json';
            if (base && !base.endsWith('/')) base += '/';
            return base + path;
        },

        // 获取 Basic Auth 头
        getAuthHeader() {
            const cfg = Config.load();
            const user = cfg.webdav.username || '';
            const pass = cfg.webdav.password || '';
            return 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
        },

        // 从 GM_xmlhttpRequest 错误对象中提取错误信息
        extractError(err) {
            if (!err) return '未知错误';
            if (typeof err === 'string') return err;
            if (err.error) return err.error;
            if (err.statusText) return err.statusText;
            if (err.message) return err.message;
            if (err.responseText) return err.responseText.slice(0, 200);
            return '网络请求失败';
        },

        // 用 GM_xmlhttpRequest 发请求（绕开 CORS）
        request(method, body) {
            return new Promise((resolve, reject) => {
                const url = this.getFullUrl();
                const headers = { 'Authorization': this.getAuthHeader() };
                if (body) headers['Content-Type'] = 'application/json';

                GM_xmlhttpRequest({
                    method: method,
                    url: url,
                    headers: headers,
                    data: body,
                    timeout: 15000,
                    onload: (res) => resolve(res),
                    onerror: (err) => {
                        const msg = this.extractError(err);
                        reject(new Error(msg));
                    },
                    ontimeout: () => reject(new Error('请求超时（15秒）'))
                });
            });
        },

        // 测试连接（先用 HEAD，失败则用 GET 重试）
        async testConnection() {
            const cfg = Config.load();
            if (!cfg.webdav.url) {
                return { success: false, message: '请填写 WebDAV 地址' };
            }
            try {
                let res;
                try {
                    res = await this.request('HEAD');
                } catch (headErr) {
                    res = await this.request('GET');
                }
                if (res.status >= 200 && res.status < 300) {
                    return { success: true, message: '连接成功' };
                }
                if (res.status === 404) {
                    return { success: true, message: '连接成功（文件不存在）' };
                }
                if (res.status === 401 || res.status === 403) {
                    return { success: false, message: '认证失败：请检查用户名和密码' };
                }
                return { success: false, message: '连接失败：' + res.status + ' ' + (res.statusText || '') };
            } catch (e) {
                return { success: false, message: '网络错误：' + e.message };
            }
        },

        // 上传配置到 WebDAV
        async upload() {
            const cfg = Config.load();
            if (!cfg.webdav.url) {
                return { success: false, message: '请填写 WebDAV 地址' };
            }
            try {
                const json = JSON.stringify(cfg, null, 2);
                const res = await this.request('PUT', json);
                if (res.status >= 200 && res.status < 300) {
                    const c = Config.load();
                    c.webdav.lastUploadTime = Date.now();
                    c.webdav.lastSyncTime = c.webdav.lastUploadTime;
                    Storage.set(Config.KEY, c);
                    return { success: true, message: '上传成功' };
                }
                if (res.status === 401 || res.status === 403) {
                    return { success: false, message: '认证失败：请检查用户名和密码' };
                }
                return { success: false, message: '上传失败：' + res.status + ' ' + (res.statusText || '') };
            } catch (e) {
                return { success: false, message: '网络错误：' + e.message };
            }
        },

        // 从 WebDAV 下载配置
        async download() {
            const cfg = Config.load();
            if (!cfg.webdav.url) {
                return { success: false, message: '请填写 WebDAV 地址' };
            }
            try {
                const res = await this.request('GET');
                if (res.status === 404) {
                    return { success: false, message: '远程文件不存在' };
                }
                if (res.status === 401 || res.status === 403) {
                    return { success: false, message: '认证失败：请检查用户名和密码' };
                }
                if (res.status < 200 || res.status >= 300) {
                    return { success: false, message: '下载失败：' + res.status + ' ' + (res.statusText || '') };
                }
                const data = JSON.parse(res.responseText);
                if (typeof data !== 'object' || data === null) {
                    return { success: false, message: '远程文件格式错误' };
                }
                const migrated = Config.migrate(data, data.version || 0);
                migrated.version = Config.VERSION;
                migrated.webdav.lastDownloadTime = Date.now();
                migrated.webdav.lastSyncTime = migrated.webdav.lastDownloadTime;
                Config.save(migrated);
                return { success: true, message: '下载成功' };
            } catch (e) {
                if (e instanceof SyntaxError) {
                    return { success: false, message: '远程文件不是有效的 JSON' };
                }
                return { success: false, message: '下载失败：' + e.message };
            }
        },

        // 自动同步相关
        _syncTimer: null,
        _syncing: false,

        // 触发自动上传（防抖，避免频繁请求）
        triggerAutoUpload() {
            const cfg = Config.load();
            if (!cfg.webdav.autoSync || !cfg.webdav.url) return;
            if (this._syncing) return;

            clearTimeout(this._syncTimer);
            this._syncTimer = setTimeout(() => {
                this.autoUpload();
            }, 2000);
        },

        // 执行自动上传（静默，不打扰用户）
        async autoUpload() {
            const cfg = Config.load();
            if (!cfg.webdav.autoSync || !cfg.webdav.url) return;
            if (this._syncing) return;

            this._syncing = true;
            try {
                const json = JSON.stringify(cfg, null, 2);
                const res = await this.request('PUT', json);
                if (res.status >= 200 && res.status < 300) {
                    const c = Config.load();
                    c.webdav.lastUploadTime = Date.now();
                    c.webdav.lastSyncTime = c.webdav.lastUploadTime;
                    Storage.set(Config.KEY, c);
                }
            } catch (e) {
                // 静默失败，不打扰用户
            } finally {
                this._syncing = false;
            }
        },

        // 启动时检查远程更新（页面加载时调用）
        async checkRemoteUpdate() {
            const cfg = Config.load();
            if (!cfg.webdav.autoSync || !cfg.webdav.url) return null;

            try {
                const res = await this.request('GET');
                if (res.status === 404) return null;
                if (res.status < 200 || res.status >= 300) return null;

                const data = JSON.parse(res.responseText);
                if (typeof data !== 'object' || data === null) return null;

                const remoteTime = data.webdav?.lastSyncTime || 0;
                const localTime = cfg.webdav.lastSyncTime || 0;

                // 远程比本地新，下载覆盖
                if (remoteTime > localTime) {
                    const migrated = Config.migrate(data, data.version || 0);
                    migrated.version = Config.VERSION;
                    migrated.webdav.lastDownloadTime = Date.now();
                    migrated.webdav.lastSyncTime = migrated.webdav.lastDownloadTime;
                    Config.save(migrated);
                    return { updated: true, message: '已从远程同步配置' };
                }
                return { updated: false };
            } catch (e) {
                return null;
            }
        }
    };

    // ========== 设置模块 ==========
    const Settings = {
        visible: false,
        _initialized: false,
        selectedColor: COLOR_POOL[0],
        editingIndex: -1,

        render() {
            const cfg = Config.load();
            return `
                <style>
                    #settings-overlay {
                        position: fixed;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        pointer-events: none;
                        z-index: 100;
                    }
                    #settings-panel {
                        position: fixed;
                        bottom: 0;
                        left: 0;
                        width: 100%;
                        height: 70%;
                        background: #fff;
                        border-radius: 16px 16px 0 0;
                        box-shadow: 0 -4px 20px rgba(0,0,0,.15);
                        z-index: 101;
                        transform: translateY(100%);
                        transition: transform .3s ease-out;
                        display: flex;
                        flex-direction: column;
                        pointer-events: auto;
                    }
                    #settings-panel.show {
                        transform: translateY(0);
                    }
                    .settings-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 16px 20px;
                        border-bottom: 1px solid #f0f0f0;
                        flex-shrink: 0;
                    }
                    .settings-title {
                        font-size: 18px;
                        font-weight: 600;
                        color: #333;
                    }
                    .settings-close {
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        border-radius: 50%;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 20px;
                        color: #999;
                    }
                    .settings-close:active {
                        background: #f0f0f0;
                    }
                    .settings-content {
                        display: flex;
                        flex: 1;
                        overflow: hidden;
                    }
                    .settings-tabs {
                        width: 100px;
                        flex-shrink: 0;
                        overflow-y: auto;
                        border-right: 1px solid #f0f0f0;
                        padding: 8px 0;
                        -webkit-overflow-scrolling: touch;
                    }
                    .settings-tab {
                        padding: 14px 12px;
                        font-size: 13px;
                        color: #999;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        border-left: 2px solid transparent;
                        transition: color .2s, border-color .2s;
                        text-align: center;
                    }
                    .settings-tab.active {
                        color: var(--engine-color, #008373);
                        border-left-color: var(--engine-color, #008373);
                        background: #f9f9f9;
                    }
                    .settings-body {
                        flex: 1;
                        overflow-y: auto;
                        padding: 16px;
                        -webkit-overflow-scrolling: touch;
                    }
                    .settings-section {
                        display: none;
                    }
                    .settings-section.active {
                        display: block;
                    }
                    .engine-form {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 16px;
                        padding-left: 12px;
                    }
                    .color-picker-wrapper {
                        position: relative;
                        flex-shrink: 0;
                    }
                    .color-chip {
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .color-pool {
                        position: absolute;
                        top: 40px;
                        left: 0;
                        background: #fff;
                        border: 1px solid #e0e0e0;
                        border-radius: 10px;
                        box-shadow: 0 4px 16px rgba(0,0,0,.12);
                        padding: 6px;
                        display: none;
                        z-index: 10;
                        max-height: 160px;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 4px;
                    }
                    .color-pool.show {
                        display: grid;
                    }
                    .color-pool-item {
                        width: 32px;
                        height: 32px;
                        border-radius: 6px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .color-pool-item.selected {
                        outline: 2px solid #333;
                        outline-offset: 1px;
                    }
                    .engine-form input {
                        padding: 8px 10px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 13px;
                        color: #333;
                        outline: none;
                        background: #f9f9f9;
                    }
                    .engine-form input:focus {
                        border-color: var(--engine-color, #008373);
                    }
                    #eng-name { flex: .6; min-width: 50px; }
                    #eng-url  { flex: 2.4; min-width: 120px; }
                    .engine-form-btn {
                        padding: 8px 14px;
                        border: none;
                        border-radius: 8px;
                        font-size: 13px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        flex-shrink: 0;
                    }
                    .btn-add { background: var(--engine-color, #008373); color: #fff; }
                    .btn-clear { background: #f0f0f0; color: #666; }
                    .engine-list {
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .engine-list-item {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 10px 12px;
                        background: #f9f9f9;
                        border-radius: 10px;
                        cursor: pointer;
                        -webkit-tap-highlight-color: transparent;
                        border-top: 2px solid transparent;
                        border-bottom: 2px solid transparent;
                        transition: border-color .15s;
                    }
                    .engine-list-item:active {
                        background: #eee;
                    }
                    .engine-list-icon {
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #fff;
                        font-size: 16px;
                        font-weight: 600;
                        flex-shrink: 0;
                    }
                    .engine-list-info {
                        flex: 1;
                        min-width: 0;
                    }
                    .engine-list-name {
                        font-size: 14px;
                        color: #333;
                        font-weight: 500;
                    }
                    .engine-list-url {
                        font-size: 11px;
                        color: #999;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .engine-list-delete {
                        width: 28px;
                        height: 28px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        border-radius: 50%;
                        -webkit-tap-highlight-color: transparent;
                        font-size: 16px;
                        color: #ccc;
                        flex-shrink: 0;
                    }
                    .engine-list-delete:active {
                        background: #fee;
                        color: #e55;
                    }
                    .drag-handle {
                        cursor: grab;
                        color: #ccc;
                        font-size: 14px;
                        flex-shrink: 0;
                        padding-left: 4px;
                    }
                    .drag-handle:active {
                        cursor: grabbing;
                    }
                    .settings-item {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 14px 0;
                        border-bottom: 1px solid #f5f5f5;
                    }
                    .settings-label {
                        font-size: 15px;
                        color: #333;
                    }
                    .settings-desc {
                        font-size: 12px;
                        color: #999;
                        margin-top: 2px;
                    }
                    .settings-btn {
                        padding: 8px 18px;
                        border: none;
                        border-radius: 8px;
                        font-size: 14px;
                        cursor: pointer;
                        background: var(--engine-color, #008373);
                        color: #fff;
                        flex-shrink: 0;
                        -webkit-tap-highlight-color: transparent;
                    }
                    .settings-btn:active {
                        opacity: .8;
                    }
                    .settings-btn-secondary {
                        background: #f0f0f0;
                        color: #333;
                    }
                    .settings-btn-danger {
                        background: #e55;
                    }
                    .settings-item-column {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 8px;
                    }
                    .settings-item-column .settings-label {
                        font-size: 14px;
                    }
                    .settings-input {
                        width: 100%;
                        padding: 10px 12px;
                        border: 1px solid #e0e0e0;
                        border-radius: 8px;
                        font-size: 14px;
                        box-sizing: border-box;
                        outline: none;
                        transition: border-color .2s;
                    }
                    .settings-input:focus {
                        border-color: var(--engine-color, #008373);
                    }
                    .toggle-switch {
                        position: relative;
                        display: inline-block;
                        width: 48px;
                        height: 28px;
                        flex-shrink: 0;
                    }
                    .toggle-switch input {
                        opacity: 0;
                        width: 0;
                        height: 0;
                    }
                    .toggle-slider {
                        position: absolute;
                        cursor: pointer;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: #e0e0e0;
                        border-radius: 28px;
                        transition: background .3s;
                    }
                    .toggle-slider:before {
                        content: "";
                        position: absolute;
                        height: 22px;
                        width: 22px;
                        left: 3px;
                        bottom: 3px;
                        background: #fff;
                        border-radius: 50%;
                        transition: transform .3s;
                    }
                    .toggle-switch input:checked + .toggle-slider {
                        background: var(--engine-color, #008373);
                    }
                    .toggle-switch input:checked + .toggle-slider:before {
                        transform: translateX(20px);
                    }
                </style>

                <div id="settings-panel">
                    <div class="settings-header">
                        <span class="settings-title">设置</span>
                        <span class="settings-close" id="settings-close">✕</span>
                    </div>
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
                                    <div class="color-picker-wrapper">
                                        <div class="color-chip" id="color-chip" style="background:${this.selectedColor}"></div>
                                        <div class="color-pool" id="color-pool">
                                            ${COLOR_POOL.map(c => `<div class="color-pool-item ${c === this.selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}"></div>`).join('')}
                                        </div>
                                    </div>
                                    <input type="text" id="eng-name" placeholder="名称">
                                    <input type="text" id="eng-url" placeholder="URL">
                                    <button class="engine-form-btn btn-add" id="btn-add-engine">添加</button>
                                    <button class="engine-form-btn btn-clear" id="btn-clear-form">清空</button>
                                </div>
                                <div class="engine-list" id="engine-list"></div>
                            </div>
                            <div class="settings-section" id="section-appearance">
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">快捷方式模块</div>
                                        <div class="settings-desc">显示或隐藏主页上的快捷方式图标</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-shortcuts" ${cfg.shortcutsVisible !== false ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                            </div>
                            <div class="settings-section" id="section-toolbar"><p style="color:#999;text-align:center;margin-top:40px;">工具栏 — 开发中...</p></div>
                            <div class="settings-section" id="section-webdav">
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">自动同步</div>
                                        <div class="settings-desc">配置变更后自动上传，页面加载时自动检查更新</div>
                                        <div class="settings-desc" id="autosync-time" style="font-size:11px;color:#999;margin-top:2px;">上次同步：从未</div>
                                    </div>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="toggle-webdav-autosync">
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="settings-item settings-item-column">
                                    <div class="settings-label">WebDAV 地址</div>
                                    <input type="text" class="settings-input" id="webdav-url" placeholder="https://dav.example.com/">
                                </div>
                                <div class="settings-item settings-item-column">
                                    <div class="settings-label">用户名</div>
                                    <input type="text" class="settings-input" id="webdav-username" placeholder="用户名">
                                </div>
                                <div class="settings-item settings-item-column">
                                    <div class="settings-label">密码</div>
                                    <input type="password" class="settings-input" id="webdav-password" placeholder="密码">
                                </div>
                                <div class="settings-item settings-item-column">
                                    <div class="settings-label">远程文件名</div>
                                    <input type="text" class="settings-input" id="webdav-path" placeholder="homepage-config.json">
                                </div>
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">连接状态</div>
                                        <div class="settings-desc" id="webdav-status">未测试</div>
                                    </div>
                                    <button class="settings-btn settings-btn-secondary" id="btn-webdav-test">测试</button>
                                </div>
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">上传配置</div>
                                        <div class="settings-desc">将当前配置上传到 WebDAV</div>
                                        <div class="settings-desc" id="upload-time" style="font-size:11px;color:#999;margin-top:2px;">上次上传：从未</div>
                                    </div>
                                    <button class="settings-btn" id="btn-webdav-upload">上传</button>
                                </div>
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">下载配置</div>
                                        <div class="settings-desc">从 WebDAV 下载并覆盖当前配置</div>
                                        <div class="settings-desc" id="download-time" style="font-size:11px;color:#999;margin-top:2px;">上次下载：从未</div>
                                    </div>
                                    <button class="settings-btn settings-btn-secondary" id="btn-webdav-download">下载</button>
                                </div>
                            </div>
                            <div class="settings-section" id="section-profile">
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">导出配置</div>
                                        <div class="settings-desc">将当前配置保存为 JSON 文件</div>
                                    </div>
                                    <button class="settings-btn" id="btn-export">导出</button>
                                </div>
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">导入配置</div>
                                        <div class="settings-desc">从 JSON 文件恢复配置（将覆盖当前配置）</div>
                                    </div>
                                    <label class="settings-btn settings-btn-secondary" for="import-file">导入</label>
                                    <input type="file" id="import-file" accept=".json" style="display:none">
                                </div>
                            </div>
                            <div class="settings-section" id="section-reset">
                                <div class="settings-item">
                                    <div>
                                        <div class="settings-label">还原默认设置</div>
                                        <div class="settings-desc">清空所有自定义数据，恢复为初始状态</div>
                                    </div>
                                    <button class="settings-btn settings-btn-danger" id="btn-reset">还原</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        },

        init() {
            if (this._initialized) return;
            const container = document.getElementById('settings-overlay');
            if (container) container.innerHTML = this.render();
            this.applyTabColor();
            this.bindEvents();
            this.refreshEngineList();
            this._initialized = true;
        },

        applyTabColor() {
            const color = Search.getCurrentColor();
            const panel = document.getElementById('settings-panel');
            if (panel) panel.style.setProperty('--engine-color', color);
        },

        refreshEngineList() {
            const cfg = Config.load();
            const listEl = document.getElementById('engine-list');
            if (!listEl) return;

            listEl.innerHTML = cfg.searchEngines.map((eng, i) => `
                <div class="engine-list-item" draggable="true" data-index="${i}">
                    <div class="engine-list-icon" style="background:${eng.color}">${eng.name.charAt(0)}</div>
                    <div class="engine-list-info">
                        <div class="engine-list-name">${eng.name}</div>
                        <div class="engine-list-url">${eng.url}</div>
                    </div>
                    <div class="engine-list-delete" data-index="${i}">✕</div>
                    <div class="drag-handle">⋮⋮</div>
                </div>
            `).join('');

            let dragSrcIndex = -1;

            listEl.querySelectorAll('.engine-list-item').forEach(item => {
                item.addEventListener('dragstart', (e) => {
                    dragSrcIndex = parseInt(item.dataset.index);
                    item.style.opacity = '0.4';
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.style.opacity = '1';
                    listEl.querySelectorAll('.engine-list-item').forEach(el => {
                        el.style.opacity = '1';
                        el.style.borderTop = '';
                        el.style.borderBottom = '';
                    });
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const target = e.target.closest('.engine-list-item');
                    if (target && target !== item) {
                        const rect = target.getBoundingClientRect();
                        const mid = rect.top + rect.height / 2;
                        target.style.borderTop = e.clientY < mid ? '2px solid var(--engine-color)' : '';
                        target.style.borderBottom = e.clientY >= mid ? '2px solid var(--engine-color)' : '';
                    }
                });

                item.addEventListener('dragleave', (e) => {
                    const target = e.target.closest('.engine-list-item');
                    if (target) {
                        target.style.borderTop = '';
                        target.style.borderBottom = '';
                    }
                });

                item.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const target = e.target.closest('.engine-list-item');
                    if (!target || !target.dataset.index) return;
                    const targetIndex = parseInt(target.dataset.index);
                    if (dragSrcIndex === targetIndex) return;

                    const c = Config.load();
                    const [moved] = c.searchEngines.splice(dragSrcIndex, 1);
                    c.searchEngines.splice(targetIndex, 0, moved);
                    Config.save(c);
                    this.refreshEngineList();
                    Search.refreshDropdown();
                });

                // 点击编辑
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.engine-list-delete') || e.target.closest('.drag-handle')) return;
                    const idx = parseInt(item.dataset.index);
                    const eng = cfg.searchEngines[idx];
                    document.getElementById('eng-name').value = eng.name;
                    document.getElementById('eng-url').value = eng.url;
                    this.selectedColor = eng.color;
                    document.getElementById('color-chip').style.background = eng.color;
                    document.getElementById('color-pool').querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
                    const pick = document.getElementById('color-pool').querySelector(`[data-color="${eng.color}"]`);
                    if (pick) pick.classList.add('selected');
                    this.editingIndex = idx;
                    document.getElementById('btn-add-engine').textContent = '更新';
                });
            });

            listEl.querySelectorAll('.engine-list-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(btn.dataset.index);
                    const c = Config.load();
                    c.searchEngines.splice(idx, 1);
                    Config.save(c);
                    this.refreshEngineList();
                    this.resetForm();
                    Search.refreshDropdown();
                });
            });
        },

        resetForm() {
            document.getElementById('eng-name').value = '';
            document.getElementById('eng-url').value = '';
            this.selectedColor = COLOR_POOL[0];
            document.getElementById('color-chip').style.background = this.selectedColor;
            document.getElementById('color-pool').querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
            const pick = document.getElementById('color-pool').querySelector(`[data-color="${this.selectedColor}"]`);
            if (pick) pick.classList.add('selected');
            this.editingIndex = -1;
            document.getElementById('btn-add-engine').textContent = '添加';
        },

        show() {
            const panel = document.getElementById('settings-panel');
            const overlay = document.getElementById('settings-overlay');
            if (panel) {
                this.applyTabColor();
                panel.classList.add('show');
                this.visible = true;
            }
            if (overlay) overlay.style.pointerEvents = 'auto';
            this.refreshEngineList();
            const toggle = document.getElementById('toggle-shortcuts');
            if (toggle) toggle.checked = Config.load().shortcutsVisible !== false;
            this.refreshWebdavTimes();
        },

        // 刷新 WebDAV 时间显示
        refreshWebdavTimes() {
            const cfg = Config.load();
            const autosyncEl = document.getElementById('autosync-time');
            const uploadEl = document.getElementById('upload-time');
            const downloadEl = document.getElementById('download-time');
            if (autosyncEl) autosyncEl.textContent = '上次同步：' + Utils.formatTime(cfg.webdav.lastSyncTime);
            if (uploadEl) uploadEl.textContent = '上次上传：' + Utils.formatTime(cfg.webdav.lastUploadTime);
            if (downloadEl) downloadEl.textContent = '上次下载：' + Utils.formatTime(cfg.webdav.lastDownloadTime);
        },

        hide() {
            const panel = document.getElementById('settings-panel');
            const overlay = document.getElementById('settings-overlay');
            if (panel) {
                panel.classList.remove('show');
                this.visible = false;
            }
            if (overlay) overlay.style.pointerEvents = 'none';
        },

        // 导出配置为 JSON 文件
        exportConfig() {
            const cfg = Config.load();
            const json = JSON.stringify(cfg, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `homepage-config-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        // 导入配置（传入 JSON 字符串，验证后应用）
        importConfig(jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                // 基本校验：必须是对象
                if (typeof data !== 'object' || data === null) {
                    return { success: false, message: '配置格式错误' };
                }
                // 保存前先过一遍 Config 的迁移逻辑，补全缺失字段
                const tempKey = Config.KEY + '_temp';
                Storage.set(tempKey, data);
                const migrated = Config.migrate(data, data.version || 0);
                migrated.version = Config.VERSION;
                Storage.set(Config.KEY, migrated);
                Storage.set(tempKey, undefined);
                return { success: true };
            } catch (e) {
                return { success: false, message: '解析失败：' + e.message };
            }
        },

        // 还原为默认配置
        resetToDefault() {
            const defaults = JSON.parse(JSON.stringify(Config.defaults));
            defaults.version = Config.VERSION;
            Config.save(defaults);
        },

        switchTab(tabName) {
            document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
            const tab = document.querySelector(`.settings-tab[data-tab="${tabName}"]`);
            const section = document.getElementById(`section-${tabName}`);
            if (tab) tab.classList.add('active');
            if (section) section.classList.add('active');
        },

        bindEvents() {
            document.getElementById('settings-close').addEventListener('click', () => this.hide());

            const tabs = document.getElementById('settings-tabs');
            tabs.addEventListener('click', (e) => {
                const tab = e.target.closest('.settings-tab');
                if (!tab) return;
                this.switchTab(tab.dataset.tab);
            });

            const colorChip = document.getElementById('color-chip');
            const colorPool = document.getElementById('color-pool');
            if (colorChip && colorPool) {
                colorChip.addEventListener('click', () => colorPool.classList.toggle('show'));
                colorPool.addEventListener('click', (e) => {
                    const item = e.target.closest('.color-pool-item');
                    if (!item) return;
                    const color = item.dataset.color;
                    this.selectedColor = color;
                    colorChip.style.background = color;
                    colorPool.querySelectorAll('.color-pool-item').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    colorPool.classList.remove('show');
                });
                document.addEventListener('click', (e) => {
                    if (!colorChip.contains(e.target) && !colorPool.contains(e.target)) {
                        colorPool.classList.remove('show');
                    }
                });
            }

            document.getElementById('btn-add-engine').addEventListener('click', () => {
                const name = document.getElementById('eng-name').value.trim();
                let url = Utils.ensureUrl(document.getElementById('eng-url').value.trim());
                const color = this.selectedColor;
                if (!name || !url) return;
                const cfg = Config.load();
                if (this.editingIndex >= 0) {
                    cfg.searchEngines[this.editingIndex] = { name, url, color };
                } else {
                    cfg.searchEngines.push({ name, url, color });
                }
                Config.save(cfg);
                this.refreshEngineList();
                this.resetForm();
                Search.refreshDropdown();
            });

            document.getElementById('btn-clear-form').addEventListener('click', () => this.resetForm());

            const toggleShortcuts = document.getElementById('toggle-shortcuts');
            if (toggleShortcuts) {
                toggleShortcuts.addEventListener('change', () => {
                    const cfg = Config.load();
                    cfg.shortcutsVisible = toggleShortcuts.checked;
                    Config.save(cfg);
                    if (toggleShortcuts.checked) {
                        Shortcuts.show();
                    } else {
                        Shortcuts.hide();
                    }
                });
            }

            // 导出配置
            const btnExport = document.getElementById('btn-export');
            if (btnExport) {
                btnExport.addEventListener('click', () => this.exportConfig());
            }

            // 导入配置
            const importFile = document.getElementById('import-file');
            if (importFile) {
                importFile.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const result = confirm('导入配置将覆盖当前所有设置，确定继续吗？');
                        if (!result) {
                            importFile.value = '';
                            return;
                        }
                        const res = this.importConfig(ev.target.result);
                        if (res.success) {
                            alert('导入成功，页面即将刷新');
                            setTimeout(() => location.reload(), 300);
                        } else {
                            alert(res.message);
                        }
                        importFile.value = '';
                    };
                    reader.readAsText(file);
                });
            }

            // 还原默认设置
            const btnReset = document.getElementById('btn-reset');
            if (btnReset) {
                btnReset.addEventListener('click', () => {
                    const result = confirm('确定要还原为默认设置吗？所有自定义数据将被清空！');
                    if (!result) return;
                    this.resetToDefault();
                    alert('已还原默认设置，页面即将刷新');
                    setTimeout(() => location.reload(), 300);
                });
            }

            // WebDAV：自动同步开关
            const toggleAutoSync = document.getElementById('toggle-webdav-autosync');
            if (toggleAutoSync) {
                const cfg = Config.load();
                toggleAutoSync.checked = cfg.webdav.autoSync === true;
                toggleAutoSync.addEventListener('change', () => {
                    const c = Config.load();
                    c.webdav.autoSync = toggleAutoSync.checked;
                    Config.save(c);
                });
            }

            // WebDAV：输入框自动保存
            const webdavFields = ['webdav-url', 'webdav-username', 'webdav-password', 'webdav-path'];
            const webdavKeys = { 'webdav-url': 'url', 'webdav-username': 'username', 'webdav-password': 'password', 'webdav-path': 'remotePath' };
            webdavFields.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const cfg = Config.load();
                el.value = cfg.webdav[webdavKeys[id]] || '';
                el.addEventListener('input', () => {
                    const c = Config.load();
                    c.webdav[webdavKeys[id]] = el.value;
                    Config.save(c);
                });
            });

            // WebDAV：测试连接
            const btnTest = document.getElementById('btn-webdav-test');
            if (btnTest) {
                btnTest.addEventListener('click', async () => {
                    const statusEl = document.getElementById('webdav-status');
                    if (statusEl) statusEl.textContent = '测试中...';
                    const res = await WebDAV.testConnection();
                    if (statusEl) {
                        statusEl.textContent = res.message;
                        statusEl.style.color = res.success ? '#008373' : '#e55';
                    }
                });
            }

            // WebDAV：上传
            const btnUpload = document.getElementById('btn-webdav-upload');
            if (btnUpload) {
                btnUpload.addEventListener('click', async () => {
                    btnUpload.disabled = true;
                    btnUpload.textContent = '上传中...';
                    const res = await WebDAV.upload();
                    alert(res.message);
                    btnUpload.disabled = false;
                    btnUpload.textContent = '上传';
                    if (res.success) this.refreshWebdavTimes();
                });
            }

            // WebDAV：下载
            const btnDownload = document.getElementById('btn-webdav-download');
            if (btnDownload) {
                btnDownload.addEventListener('click', async () => {
                    const result = confirm('下载配置将覆盖当前所有设置，确定继续吗？');
                    if (!result) return;
                    btnDownload.disabled = true;
                    btnDownload.textContent = '下载中...';
                    const res = await WebDAV.download();
                    alert(res.message);
                    if (res.success) {
                        setTimeout(() => location.reload(), 300);
                    } else {
                        btnDownload.disabled = false;
                        btnDownload.textContent = '下载';
                    }
                });
            }

            // 点击外部关闭设置面板
            document.addEventListener('click', (e) => {
                if (!this.visible) return;
                const panel = document.getElementById('settings-panel');
                const logo = document.getElementById('search-logo');
                if (panel && !panel.contains(e.target)) {
                    if (logo && logo.contains(e.target)) return;
                    this.hide();
                }
            });
        }
    };

    // ========== 菜单注册 ==========
    function registerMenus() {
        GM_registerMenuCommand(
            Utils.isHomepage() ? '🏠 退出主页' : '⭐ 设为主页',
            () => {
                const c = Config.load();
                const u = Utils.getCurrentUrl();
                c.homepage = c.homepage === u ? '' : u;
                Config.save(c);
                setTimeout(() => location.reload(), 300);
            }
        );

        const currentUrl = Utils.getCurrentUrl();
        const cfg = Config.load();
        const isInBookmarks = Bookmarks.findBookmarkByUrl(
            cfg.bookmarkRoot.children || [],
            currentUrl
        ) !== null;

        GM_registerMenuCommand(
            isInBookmarks ? '🔖 删除书签' : '📑 添加书签',
            () => {
                const url = Utils.getCurrentUrl();
                const title = document.title || url;
                const config = Config.load();
                const exists = Bookmarks.findBookmarkByUrl(
                    config.bookmarkRoot.children || [],
                    url
                );

                if (exists) {
                    Bookmarks.deleteBookmarkByUrl(url);
                } else {
                    Bookmarks.addBookmarkToRoot(title, url);
                }
                setTimeout(() => location.reload(), 300);
            }
        );
    }
    // ========== 渲染主页（仅生成框架，不包含模块样式或逻辑） ==========
    function renderHomepage() {
        document.open();
        document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
                <title>主页</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: system-ui, -apple-system, sans-serif;
                        background: #fff;
                        color: #333;
                        min-height: 100vh;
                        overflow: hidden;
                        -webkit-user-select: none;
                        user-select: none;
                        -webkit-touch-callout: none;
                        touch-action: manipulation;
                    }
                    #global-loader {
                        position: fixed;
                        top: 16px;
                        right: 16px;
                        display: flex;
                        gap: 6px;
                        z-index: 999;
                        opacity: 0;
                        pointer-events: none;
                        transition: opacity .2s;
                    }
                    #global-loader.show { opacity: 1; }
                    .loader-dot {
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        background: var(--loader-color, #008373);
                        animation: dot-bounce .6s ease-in-out infinite;
                    }
                    .loader-dot:nth-child(1) { animation-delay: 0s; }
                    .loader-dot:nth-child(2) { animation-delay: .15s; }
                    .loader-dot:nth-child(3) { animation-delay: .3s; }
                    @keyframes dot-bounce {
                        0%, 100% { transform: translateY(0); }
                        50%      { transform: translateY(-8px); }
                    }
                </style>
            </head>
            <body>
                <div id="global-loader">
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                </div>
                <div id="search-area"></div>
                <div id="shortcuts-area"></div>
                <div id="shortcuts-dialog-container"></div>
                <div id="bookmarks-overlay"></div>
                <div id="settings-overlay"></div>
            </body>
            </html>
        `);
        document.close();

        // 禁止移动端长按菜单和手势缩放
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('gesturechange', e => e.preventDefault());
        document.addEventListener('gestureend', e => e.preventDefault());

        // 初始化各模块
        Loader.init();
        Search.init();
        Shortcuts.init();
        Bookmarks.init();
        Settings.init();

        // 设置 WebDAV 自动同步 hook
        Config._afterSave = () => WebDAV.triggerAutoUpload();

        // 检查远程更新
        WebDAV.checkRemoteUpdate().then(result => {
            if (result && result.updated) {
                setTimeout(() => location.reload(), 500);
            }
        });
    }

    // ========== 入口 ==========
    function init() {
        registerMenus();
        if (Utils.isHomepage()) {
            renderHomepage();
        }
    }

    init();
})();
