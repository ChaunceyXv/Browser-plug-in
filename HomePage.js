// ==UserScript==
// @name         主页
// @namespace    http://tampermonkey.net/
// @version      1.36
// @description  自定义百度首页
// @match        https://www.baidu.com/
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 工具函数 ====================
    
    var colorSeed = 0;

    function getRandomColor(depth) {
        var d = depth || 25;
        var h = (colorSeed * 137.508) % 360;
        colorSeed++;
        var s = 30 + Math.floor(Math.random() * 55),
            l = 15 + Math.floor(Math.random() * (d - 5));
        return { solid: 'hsl(' + h + ', ' + s + '%, ' + l + '%)' };
    }

    function generateEngineDisplayInfo(name) {
        return {
            icon: name.charAt(0),
            logoName: name
        };
    }

    function safeGetStorage(key, defaultValue) {
        try {
            var item = GM_getValue(key);
            return item !== undefined ? item : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    function safeSetStorage(key, value) {
        try {
            GM_setValue(key, value);
        } catch (e) {
            console.error('GM存储写入失败:', e);
        }
    }

    var saveEnginesTimer = null;
    var saveShortcutsTimer = null;
    var saveColorDepthTimer = null;

    // ==================== 拖拽管理器 ====================
    
    var DragManager = {
        draggedElement: null,
        draggedIndex: -1,
        dragType: '',
        insertIndex: -1,
        gapElement: null,
        lastHoverKey: '',
        
        start: function(el, index, type) {
            this.draggedElement = el;
            this.draggedIndex = index;
            this.dragType = type;
            this.insertIndex = -1;
            this.lastHoverKey = '';
            el.classList.add('dragging');
            
            this.gapElement = document.createElement('div');
            this.gapElement.className = 'drag-gap';
            var line = document.createElement('div');
            line.className = 'drag-gap-line';
            this.gapElement.appendChild(line);
            document.body.appendChild(this.gapElement);
        },
        
        end: function(el) {
            el.classList.remove('dragging');
            el.style.opacity = '1';
            this.draggedElement = null;
            this.draggedIndex = -1;
            this.dragType = '';
            this.insertIndex = -1;
            this.lastHoverKey = '';
            
            if (this.gapElement && this.gapElement.parentNode) {
                this.gapElement.classList.remove('show');
                var gapRef = this.gapElement;
                setTimeout(function() {
                    if (gapRef && gapRef.parentNode) {
                        gapRef.parentNode.removeChild(gapRef);
                    }
                }, 250);
            }
            this.gapElement = null;
            
            var allItems = document.querySelectorAll('.drag-item');
            for (var i = 0; i < allItems.length; i++) {
                allItems[i].style.marginTop = '';
                allItems[i].style.marginBottom = '';
            }
        },
        
        showGap: function(targetEl, targetIndex, side) {
            var hoverKey = targetIndex + '-' + side;
            if (this.lastHoverKey === hoverKey) return;
            this.lastHoverKey = hoverKey;
            
            if (side === 'top') {
                this.insertIndex = targetIndex;
            } else {
                this.insertIndex = targetIndex + 1;
            }
            
            if (!this.gapElement) return;
            
            var rect = targetEl.getBoundingClientRect();
            var gapTop = side === 'top' ? rect.top : rect.bottom;
            var left = rect.left;
            var width = rect.width;
            
            this.gapElement.style.left = left + 'px';
            this.gapElement.style.width = width + 'px';
            this.gapElement.style.top = gapTop + 'px';
            this.gapElement.classList.add('show');
        },
        
        clearGap: function() {
            this.lastHoverKey = '';
            this.insertIndex = -1;
            
            if (this.gapElement) {
                this.gapElement.classList.remove('show');
            }
            
            var allItems = document.querySelectorAll('.drag-item');
            for (var i = 0; i < allItems.length; i++) {
                allItems[i].style.marginTop = '';
                allItems[i].style.marginBottom = '';
            }
        },
        
        drop: function(targetEl, targetIndex, side) {
            if (!this.draggedElement || this.dragType !== targetEl.dataset.dragType) return;
            
            var insertIdx = side === 'top' ? targetIndex : targetIndex + 1;
            if (insertIdx > this.draggedIndex) insertIdx--;
            if (insertIdx === this.draggedIndex) {
                this.end(this.draggedElement);
                return;
            }
            
            if (this.dragType === 'engine') {
                var movedKey = engineOrder.splice(this.draggedIndex, 1)[0];
                engineOrder.splice(insertIdx, 0, movedKey);
                saveEngines();
                rebuildEngineDropdown();
                renderEngineSettings();
            } else if (this.dragType === 'shortcut') {
                var movedItem = shortcuts.splice(this.draggedIndex, 1)[0];
                shortcuts.splice(insertIdx, 0, movedItem);
                saveShortcuts();
                renderShortcuts();
                renderShortcutSettings();
            }
            
            this.end(this.draggedElement);
        }
    };

    // ==================== 数据管理 ====================

    var defaultEngines = {
        baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=', enabled: true },
        bing: { name: 'Bing', url: 'https://www.bing.com/search?q=', enabled: true },
        duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=', enabled: true },
        google: { name: 'Google', url: 'https://www.google.com/search?q=', enabled: true }
    };

    var defaultShortcuts = [];

    var engines = {};
    var engineDisplayInfo = {};
    var engineColors = {};
    var engineOrder = [];
    var currentEngine = '';
    var shortcuts = [];
    var shortcutColors = {};
    var shortcutsVisible = true;
    var colorDepth = 25;
    var isSettingsOpen = false;
    var formCallback = null;
    var confirmCallbacks = null;
    var formReturnTo = null;

    function initData() {
        engines = safeGetStorage('customEngines', JSON.parse(JSON.stringify(defaultEngines)));
        engineOrder = safeGetStorage('engineOrder', Object.keys(engines));
        engineColors = safeGetStorage('engineColors', {});
        shortcutColors = safeGetStorage('shortcutColors', {});
        shortcuts = safeGetStorage('shortcuts', JSON.parse(JSON.stringify(defaultShortcuts)));
        shortcutsVisible = safeGetStorage('shortcutsVisible', true);
        colorDepth = safeGetStorage('colorDepth', 25);
        colorSeed = Math.floor(Math.random() * 100);
        
        cleanEngineOrder();
        rebuildAllDisplayInfo();
        saveEnginesImmediate();
        selectCurrentEngine();
    }

    function cleanEngineOrder() {
        var seen = {};
        var validOrder = [];
        
        for (var i = 0; i < engineOrder.length; i++) {
            var key = engineOrder[i];
            if (engines[key] && !seen[key]) {
                validOrder.push(key);
                seen[key] = true;
            }
        }
        
        for (var key in engines) {
            if (!seen[key]) {
                validOrder.push(key);
            }
        }
        
        engineOrder = validOrder;
    }

    function rebuildAllDisplayInfo() {
        for (var key in engines) {
            rebuildSingleDisplayInfo(key);
        }
    }

    function rebuildSingleDisplayInfo(key) {
        if (!engines[key]) return;
        engineDisplayInfo[key] = generateEngineDisplayInfo(engines[key].name);
        if (!engineColors[key]) {
            engineColors[key] = getRandomColor(colorDepth);
        }
    }

    function selectCurrentEngine() {
        var saved = safeGetStorage('currentEngine', null);
        if (saved && engines[saved] && engines[saved].enabled) {
            currentEngine = saved;
            return;
        }
        
        for (var i = 0; i < engineOrder.length; i++) {
            var key = engineOrder[i];
            if (engines[key] && engines[key].enabled) {
                currentEngine = key;
                return;
            }
        }
        var keys = Object.keys(engines);
        currentEngine = keys.length > 0 ? keys[0] : 'baidu';
    }

    function switchEngine(key) {
        if (currentEngine === key) return;
        currentEngine = key;
        safeSetStorage('currentEngine', currentEngine);
    }

    function saveEnginesImmediate() {
        safeSetStorage('customEngines', engines);
        safeSetStorage('engineOrder', engineOrder);
        safeSetStorage('engineColors', engineColors);
    }

    function saveEngines() {
        clearTimeout(saveEnginesTimer);
        saveEnginesTimer = setTimeout(function() {
            safeSetStorage('customEngines', engines);
            safeSetStorage('engineOrder', engineOrder);
            safeSetStorage('engineColors', engineColors);
        }, 100);
    }

    function saveShortcutsImmediate() {
        safeSetStorage('shortcuts', shortcuts);
        safeSetStorage('shortcutColors', shortcutColors);
    }

    function saveShortcuts() {
        clearTimeout(saveShortcutsTimer);
        saveShortcutsTimer = setTimeout(function() {
            safeSetStorage('shortcuts', shortcuts);
            safeSetStorage('shortcutColors', shortcutColors);
        }, 100);
    }

    function saveShortcutsVisible() {
        safeSetStorage('shortcutsVisible', shortcutsVisible);
    }

    function saveColorDepth() {
        clearTimeout(saveColorDepthTimer);
        saveColorDepthTimer = setTimeout(function() {
            safeSetStorage('colorDepth', colorDepth);
        }, 100);
    }

    function randomizeAllColors() {
        colorSeed = Math.floor(Math.random() * 100);
        for (var key in engineColors) {
            engineColors[key] = getRandomColor(colorDepth);
        }
        for (var url in shortcutColors) {
            shortcutColors[url] = getRandomColor(colorDepth);
        }
        saveEngines();
        saveShortcuts();
    }

    // ==================== UI更新函数 ====================

    function updateLogo() {
        var info = engineDisplayInfo[currentEngine];
        if (!info) return;
        engineLogo.textContent = info.logoName;
        engineLogo.style.color = engineColors[currentEngine].solid;
    }

    function updateCurrentEngineDisplay() {
        var info = engineDisplayInfo[currentEngine];
        if (!info || !engines[currentEngine]) return;
        
        currentEngineIcon.textContent = info.icon;
        currentEngineIcon.style.background = engineColors[currentEngine].solid;
        currentEngineName.textContent = engines[currentEngine].name;
        searchButton.style.background = engineColors[currentEngine].solid;
        updateLogo();
    }

    function rebuildEngineDropdown() {
        var html = '';
        var firstEnabled = null;
        
        for (var i = 0; i < engineOrder.length; i++) {
            var key = engineOrder[i];
            if (!engines[key] || !engines[key].enabled) continue;
            
            if (!firstEnabled) firstEnabled = key;
            if (!engineDisplayInfo[key]) {
                rebuildSingleDisplayInfo(key);
            }
            
            var info = engineDisplayInfo[key];
            var act = key === currentEngine ? ' active' : '';
            
            html += '<div class="engine-option' + act + '" data-engine="' + key + '">' +
                '<span class="engine-icon engine-option-icon" style="background:' + engineColors[key].solid + '">' + 
                    info.icon + 
                '</span>' +
                engines[key].name + 
            '</div>';
        }
        
        engineDropdown.innerHTML = html;
        
        if (!engines[currentEngine] || !engines[currentEngine].enabled) {
            if (firstEnabled) {
                switchEngine(firstEnabled);
            } else if (engineOrder.length > 0) {
                switchEngine(engineOrder[0]);
            }
        }
        
        updateCurrentEngineDisplay();
        
        var opts = engineDropdown.querySelectorAll('.engine-option');
        for (var j = 0; j < opts.length; j++) {
            opts[j].addEventListener('click', function(e) {
                e.stopPropagation();
                switchEngine(this.dataset.engine);
                rebuildEngineDropdown();
                engineDropdown.classList.remove('show');
                dropdownArrow.classList.remove('open');
            });
        }
    }

    function addCustomEngine(name, url) {
        var key = 'custom_' + Date.now();
        engines[key] = { name: name, url: url, enabled: true };
        engineColors[key] = getRandomColor(colorDepth);
        engineOrder.push(key);
        rebuildSingleDisplayInfo(key);
        saveEngines();
    }

    function deleteEngine(key) {
        showConfirm(
            '确定删除「' + engines[key].name + '」吗？',
            function() {
                delete engines[key];
                var idx = engineOrder.indexOf(key);
                if (idx !== -1) engineOrder.splice(idx, 1);
                delete engineDisplayInfo[key];
                delete engineColors[key];
                
                if (currentEngine === key) {
                    selectCurrentEngine();
                }
                
                saveEngines();
                rebuildEngineDropdown();
                renderEngineSettings();
            },
            function() {
                renderEngineSettings();
            }
        );
    }

    function deleteShortcut(index) {
        showConfirm(
            '确定删除「' + shortcuts[index].name + '」吗？',
            function() {
                var removed = shortcuts.splice(index, 1)[0];
                var urlStillUsed = false;
                for (var k = 0; k < shortcuts.length; k++) {
                    if (shortcuts[k].url === removed.url) {
                        urlStillUsed = true;
                        break;
                    }
                }
                if (!urlStillUsed) delete shortcutColors[removed.url];
                saveShortcuts();
                renderShortcuts();
                renderShortcutSettings();
            },
            function() {
                renderShortcutSettings();
            }
        );
    }

    // ==================== 表单与确认框 ====================

    function showForm(title, placeholderUrl, callback, editName, editUrl, returnTo) {
        formCallback = callback;
        formReturnTo = returnTo || null;
        sheetTitle.textContent = title;
        sheetContent.innerHTML = 
            '<div class="form-label">名称</div>' +
            '<input type="text" class="form-input" id="formInputName" placeholder="请输入名称" value="' + (editName || '') + '">' +
            '<div class="form-label">URL</div>' +
            '<input type="text" class="form-input" id="formInputUrl" placeholder="' + placeholderUrl + '" value="' + (editUrl || '') + '">' +
            '<div class="form-buttons">' +
                '<button class="form-btn form-btn-cancel" id="formBtnCancel">取消</button>' +
                '<button class="form-btn form-btn-confirm" id="formBtnConfirm">确认</button>' +
            '</div>';
        
        document.getElementById('formBtnCancel').addEventListener('click', hideForm);
        document.getElementById('formBtnConfirm').addEventListener('click', submitForm);
        
        var inputName = document.getElementById('formInputName');
        var inputUrl = document.getElementById('formInputUrl');
        
        inputName.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') inputUrl.focus();
        });
        inputUrl.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') submitForm();
        });
        
        if (!isSettingsOpen) {
            isSettingsOpen = true;
            overlay.classList.add('show');
            bottomSheet.classList.add('show');
        }
    }

    function hideForm() {
        formCallback = null;
        if (formReturnTo) {
            var returnFn = formReturnTo;
            formReturnTo = null;
            returnFn();
        } else {
            formReturnTo = null;
            renderMainMenu();
        }
    }

    function submitForm() {
        var name = document.getElementById('formInputName').value.trim();
        var url = document.getElementById('formInputUrl').value.trim();
        if (!name || !url) return;
        if (url.indexOf('://') === -1) url = 'https://' + url;
        if (formCallback) {
            formCallback(name, url);
        }
        formCallback = null;
        if (formReturnTo) {
            var returnFn = formReturnTo;
            formReturnTo = null;
            returnFn();
        } else {
            formReturnTo = null;
            renderMainMenu();
        }
    }

    function showConfirm(message, onConfirm, onCancel) {
        confirmCallbacks = { onConfirm: onConfirm, onCancel: onCancel || function() {} };
        sheetTitle.textContent = '确认';
        sheetContent.innerHTML = 
            '<div style="text-align:center;padding:24px 16px;font-size:15px;color:#333;line-height:1.6">' + 
                message + 
            '</div>' +
            '<div class="form-buttons">' +
                '<button class="form-btn form-btn-cancel" id="confirmBtnCancel">取消</button>' +
                '<button class="form-btn form-btn-confirm" id="confirmBtnConfirm">确认</button>' +
            '</div>';
        
        document.getElementById('confirmBtnCancel').addEventListener('click', function() {
            var cb = confirmCallbacks;
            confirmCallbacks = null;
            if (cb && cb.onCancel) cb.onCancel();
        });
        document.getElementById('confirmBtnConfirm').addEventListener('click', function() {
            var cb = confirmCallbacks;
            confirmCallbacks = null;
            if (cb && cb.onConfirm) cb.onConfirm();
        });
        
        if (!isSettingsOpen) {
            isSettingsOpen = true;
            overlay.classList.add('show');
            bottomSheet.classList.add('show');
        }
    }

    // ==================== 设置面板 ====================

    function renderMainMenu() {
        sheetTitle.textContent = '设置';
        sheetContent.innerHTML = '';
        
        var items = [
            { id: 'menuShortcuts', icon: '✏️', text: '管理快捷方式' },
            { id: 'menuEngines', icon: '🔍', text: '搜索引擎设置' },
            { id: 'menuAppearance', icon: '🎨', text: '外观设置' }
        ];
        
        for (var i = 0; i < items.length; i++) {
            if (i > 0) {
                var d = document.createElement('div');
                d.className = 'sheet-divider';
                sheetContent.appendChild(d);
            }
            
            var el = document.createElement('div');
            el.className = 'sheet-menu-item';
            el.id = items[i].id;
            el.innerHTML = '<span class="sheet-menu-icon">' + items[i].icon + '</span><span>' + items[i].text + '</span>';
            sheetContent.appendChild(el);
        }
        
        document.getElementById('menuShortcuts').addEventListener('click', renderShortcutSettings);
        document.getElementById('menuEngines').addEventListener('click', renderEngineSettings);
        document.getElementById('menuAppearance').addEventListener('click', renderAppearanceSettings);
    }

    function renderAppearanceSettings() {
        sheetTitle.textContent = '外观设置';
        sheetContent.innerHTML = '';
        
        var toggleRow = document.createElement('div');
        toggleRow.className = 'sheet-menu-item';
        toggleRow.style.cursor = 'default';
        toggleRow.innerHTML = '<span class="sheet-menu-icon">🔗</span><span style="flex:1">显示快捷方式区域</span>';
        
        var toggle = document.createElement('div');
        toggle.className = 'engine-setting-toggle' + (shortcutsVisible ? ' active' : '');
        toggle.style.flexShrink = '0';
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            shortcutsVisible = !shortcutsVisible;
            if (shortcutsVisible) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
            saveShortcutsVisible();
            renderShortcuts();
        });
        toggleRow.appendChild(toggle);
        sheetContent.appendChild(toggleRow);
        
        var d0 = document.createElement('div');
        d0.className = 'sheet-divider';
        sheetContent.appendChild(d0);
        
        var sliderRow = document.createElement('div');
        sliderRow.style.padding = '16px 24px';
        
        var sliderLabel = document.createElement('div');
        sliderLabel.style.display = 'flex';
        sliderLabel.style.justifyContent = 'space-between';
        sliderLabel.style.alignItems = 'center';
        sliderLabel.style.marginBottom = '12px';
        sliderLabel.innerHTML = '<span style="font-size:15px;color:#333">颜色调节</span><span style="font-size:14px;color:#4e6ef2;font-weight:600" id="depthValue">' + colorDepth + '%</span>';
        sliderRow.appendChild(sliderLabel);
        
        var sliderControl = document.createElement('div');
        sliderControl.style.display = 'flex';
        sliderControl.style.alignItems = 'center';
        sliderControl.style.gap = '12px';
        
        var sliderInput = document.createElement('input');
        sliderInput.type = 'range';
        sliderInput.min = '20';
        sliderInput.max = '50';
        sliderInput.value = colorDepth;
        sliderInput.className = 'depth-slider';
        sliderInput.style.flex = '1';
        sliderInput.addEventListener('input', function() {
            colorDepth = parseInt(this.value);
            document.getElementById('depthValue').textContent = colorDepth + '%';
        });
        sliderInput.addEventListener('change', function() {
            colorDepth = parseInt(this.value);
            saveColorDepth();
            randomizeAllColors();
            rebuildEngineDropdown();
            renderShortcuts();
        });
        sliderControl.appendChild(sliderInput);
        
        var randomBtn = document.createElement('button');
        randomBtn.textContent = '🎲';
        randomBtn.title = '随机所有颜色';
        randomBtn.className = 'random-color-btn';
        randomBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            randomizeAllColors();
            rebuildEngineDropdown();
            renderShortcuts();
        });
        sliderControl.appendChild(randomBtn);
        
        sliderRow.appendChild(sliderControl);
        sheetContent.appendChild(sliderRow);
        
        var d1 = document.createElement('div');
        d1.className = 'sheet-divider';
        sheetContent.appendChild(d1);
        
        var backBtn = document.createElement('div');
        backBtn.className = 'sheet-menu-item';
        backBtn.innerHTML = '<span class="sheet-menu-icon">←</span><span>返回</span>';
        backBtn.addEventListener('click', renderMainMenu);
        sheetContent.appendChild(backBtn);
    }

    // ==================== 拖拽事件处理函数 ====================
    
    function addDragListeners(el, index, type) {
        el.setAttribute('draggable', 'true');
        el.classList.add('drag-item');
        el.dataset.dragType = type;
        
        el.addEventListener('dragstart', function(e) {
            DragManager.start(el, index, type);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', '');
            var img = new Image();
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(img, 0, 0);
            setTimeout(function() {
                el.style.opacity = '0.25';
            }, 0);
        });
        
        el.addEventListener('dragend', function(e) {
            DragManager.end(el);
        });
        
        el.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            var rect = el.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;
            var side = e.clientY < midY ? 'top' : 'bottom';
            DragManager.showGap(el, index, side);
        });
        
        el.addEventListener('dragleave', function(e) {
            if (!el.contains(e.relatedTarget)) {
                DragManager.clearGap();
            }
        });
        
        el.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var rect = el.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;
            var side = e.clientY < midY ? 'top' : 'bottom';
            DragManager.drop(el, index, side);
        });
    }

    function renderEngineSettings() {
        sheetTitle.textContent = '搜索引擎设置';
        sheetContent.innerHTML = '';
        
        // 统计引擎总数和当前启用的数量
        var totalEngines = engineOrder.length;
        var enabledCount = 0;
        for (var i = 0; i < totalEngines; i++) {
            var k = engineOrder[i];
            if (engines[k] && engines[k].enabled) enabledCount++;
        }
        
        if (totalEngines === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'sheet-menu-item';
            emptyDiv.textContent = '暂无搜索引擎';
            emptyDiv.style.justifyContent = 'center';
            emptyDiv.style.color = '#999';
            sheetContent.appendChild(emptyDiv);
        }
        
        for (var i = 0; i < totalEngines; i++) {
            (function(index) {
                var key = engineOrder[index];
                var eng = engines[key];
                if (!eng) return;
                
                if (!engineDisplayInfo[key]) {
                    rebuildSingleDisplayInfo(key);
                }
                
                var info = engineDisplayInfo[key];
                var row = document.createElement('div');
                row.className = 'engine-setting-row';
                row.style.cursor = 'pointer';
                
                addDragListeners(row, index, 'engine');
                
                row.addEventListener('click', function() {
                    showForm(
                        '编辑搜索引擎',
                        'https://www.example.com/search?q={query}',
                        function(name, url) {
                            engines[key].name = name;
                            engines[key].url = url;
                            rebuildSingleDisplayInfo(key);
                            saveEngines();
                            rebuildEngineDropdown();
                        },
                        eng.name,
                        eng.url,
                        function() { renderEngineSettings(); }
                    );
                });
                
                var infoDiv = document.createElement('div');
                infoDiv.className = 'engine-setting-info';
                infoDiv.innerHTML = 
                    '<div class="engine-setting-icon" style="background:' + engineColors[key].solid + '">' + 
                        info.icon + 
                    '</div>' +
                    '<span class="engine-setting-name">' + eng.name + '</span>';
                row.appendChild(infoDiv);
                
                // 启用/禁用开关
                var toggle = document.createElement('div');
                var isLastEnabled = eng.enabled && enabledCount <= 1;
                toggle.className = 'engine-setting-toggle' + (eng.enabled ? ' active' : '');
                if (isLastEnabled) {
                    toggle.style.opacity = '0.4';
                    toggle.style.pointerEvents = 'none';
                }
                toggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (isLastEnabled) return;
                    
                    var newEnabled = !engines[key].enabled;
                    engines[key].enabled = newEnabled;
                    saveEngines();
                    rebuildEngineDropdown();
                    renderEngineSettings();
                });
                row.appendChild(toggle);
                
                // 删除按钮
                var delCol = document.createElement('div');
                delCol.className = 'engine-setting-delete';
                var delBtn = document.createElement('button');
                delBtn.className = 'engine-delete-btn';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                // 仅剩一个引擎时禁用删除
                if (totalEngines <= 1) {
                    delBtn.style.opacity = '0.4';
                    delBtn.style.pointerEvents = 'none';
                }
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (totalEngines <= 1) return;
                    deleteEngine(key);
                });
                delCol.appendChild(delBtn);
                row.appendChild(delCol);
                
                // 拖拽手柄
                var dragHandle = document.createElement('div');
                dragHandle.className = 'drag-handle';
                dragHandle.innerHTML = '⋮⋮';
                dragHandle.title = '拖拽排序';
                dragHandle.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
                row.appendChild(dragHandle);
                
                sheetContent.appendChild(row);
                
                if (index < totalEngines - 1) {
                    var divider = document.createElement('div');
                    divider.className = 'sheet-divider';
                    sheetContent.appendChild(divider);
                }
            })(i);
        }
        
        var d1 = document.createElement('div');
        d1.className = 'sheet-divider';
        sheetContent.appendChild(d1);
        
        var addBtn = document.createElement('div');
        addBtn.className = 'sheet-menu-item';
        addBtn.innerHTML = '<span class="sheet-menu-icon">➕</span><span>添加搜索引擎</span>';
        addBtn.addEventListener('click', function() {
            showForm('添加搜索引擎', 'https://www.example.com/search?q={query}', function(name, url) {
                addCustomEngine(name, url);
                rebuildEngineDropdown();
            }, null, null, function() { renderEngineSettings(); });
        });
        sheetContent.appendChild(addBtn);
        
        var d2 = document.createElement('div');
        d2.className = 'sheet-divider';
        sheetContent.appendChild(d2);
        
        var backBtn = document.createElement('div');
        backBtn.className = 'sheet-menu-item';
        backBtn.innerHTML = '<span class="sheet-menu-icon">←</span><span>返回</span>';
        backBtn.addEventListener('click', renderMainMenu);
        sheetContent.appendChild(backBtn);
    }

    function renderShortcutSettings() {
        sheetTitle.textContent = '管理快捷方式';
        sheetContent.innerHTML = '';
        
        if (shortcuts.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'sheet-menu-item';
            emptyDiv.textContent = '暂无快捷方式';
            emptyDiv.style.justifyContent = 'center';
            emptyDiv.style.color = '#999';
            sheetContent.appendChild(emptyDiv);
        }
        
        for (var i = 0; i < shortcuts.length; i++) {
            (function(index) {
                var sh = shortcuts[index];
                var row = document.createElement('div');
                row.className = 'engine-setting-row';
                row.style.cursor = 'pointer';
                
                addDragListeners(row, index, 'shortcut');
                
                row.addEventListener('click', function() {
                    showForm(
                        '编辑快捷方式',
                        'https://www.example.com',
                        function(name, url) {
                            var oldUrl = shortcuts[index].url;
                            shortcuts[index].name = name;
                            shortcuts[index].url = url;
                            if (oldUrl !== url) {
                                shortcutColors[url] = shortcutColors[oldUrl] || getRandomColor(colorDepth);
                                delete shortcutColors[oldUrl];
                            }
                            saveShortcuts();
                            renderShortcuts();
                        },
                        sh.name,
                        sh.url,
                        function() { renderShortcutSettings(); }
                    );
                });
                
                var infoDiv = document.createElement('div');
                infoDiv.className = 'engine-setting-info';
                
                if (!shortcutColors[sh.url]) {
                    shortcutColors[sh.url] = getRandomColor(colorDepth);
                }
                
                infoDiv.innerHTML = 
                    '<div class="engine-setting-icon" style="background:' + shortcutColors[sh.url].solid + '">' + 
                        sh.name.charAt(0) + 
                    '</div>' +
                    '<span class="engine-setting-name">' + sh.name + '</span>';
                row.appendChild(infoDiv);
                
                var spacer = document.createElement('div');
                spacer.style.flex = '1';
                row.appendChild(spacer);
                
                var delCol = document.createElement('div');
                delCol.className = 'engine-setting-delete';
                var delBtn = document.createElement('button');
                delBtn.className = 'engine-delete-btn';
                delBtn.textContent = '✕';
                delBtn.title = '删除';
                delBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    deleteShortcut(index);
                });
                delCol.appendChild(delBtn);
                row.appendChild(delCol);
                
                var dragHandle = document.createElement('div');
                dragHandle.className = 'drag-handle';
                dragHandle.innerHTML = '⋮⋮';
                dragHandle.title = '拖拽排序';
                dragHandle.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
                row.appendChild(dragHandle);
                
                sheetContent.appendChild(row);
                
                if (index < shortcuts.length - 1) {
                    var divider = document.createElement('div');
                    divider.className = 'sheet-divider';
                    sheetContent.appendChild(divider);
                }
            })(i);
        }
        
        var d1 = document.createElement('div');
        d1.className = 'sheet-divider';
        sheetContent.appendChild(d1);
        
        var addBtn = document.createElement('div');
        addBtn.className = 'sheet-menu-item';
        
        if (shortcuts.length >= 12) {
            addBtn.style.opacity = '0.4';
            addBtn.style.pointerEvents = 'none';
            addBtn.innerHTML = '<span class="sheet-menu-icon">➕</span><span>添加快捷方式（已达上限12个）</span>';
        } else {
            addBtn.innerHTML = '<span class="sheet-menu-icon">➕</span><span>添加快捷方式</span>';
            addBtn.addEventListener('click', function() {
                showForm('添加快捷方式', 'https://www.example.com', function(name, url) {
                    shortcuts.push({ name: name, url: url });
                    shortcutColors[url] = getRandomColor(colorDepth);
                    saveShortcuts();
                    renderShortcuts();
                }, null, null, function() { renderShortcutSettings(); });
            });
        }
        sheetContent.appendChild(addBtn);
        
        var d2 = document.createElement('div');
        d2.className = 'sheet-divider';
        sheetContent.appendChild(d2);
        
        var backBtn = document.createElement('div');
        backBtn.className = 'sheet-menu-item';
        backBtn.innerHTML = '<span class="sheet-menu-icon">←</span><span>返回</span>';
        backBtn.addEventListener('click', renderMainMenu);
        sheetContent.appendChild(backBtn);
    }

    // ==================== HTML模板 ====================

    document.open();
    document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no"><title>主页</title><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{background:#f0f2f5;display:flex;justify-content:center;align-items:center;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-user-select:none;user-select:none}.search-container{width:100%;max-width:640px;padding:0 20px;display:flex;flex-direction:column;align-items:center;gap:16px}.corner-strip{position:fixed;z-index:100;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.1);user-select:none;-webkit-tap-highlight-color:transparent}.clock-wrapper{left:0;top:60px;border-radius:0 12px 12px 0;padding:16px 20px 16px 14px;margin-left:-120px;display:flex;flex-direction:column;text-align:left;animation:slideInLeft 0.6s ease-out 0.3s forwards;transition:margin-left 0.3s ease,box-shadow 0.3s ease,padding-left 0.3s ease}.clock-wrapper.show{margin-left:0!important;box-shadow:2px 6px 24px rgba(0,0,0,0.18);padding-left:20px}@keyframes slideInLeft{from{margin-left:-120px}to{margin-left:-8px}}.clock-time{font-size:28px;font-weight:700;color:#333;letter-spacing:1px;line-height:1;margin-bottom:6px}.clock-date{font-size:12px;color:#999;letter-spacing:0.5px;line-height:1.5}.settings-wrapper{right:0;top:16px;border-radius:12px 0 0 12px;padding:12px 35px;margin-right:-98px;cursor:pointer;transition:margin-right 0.3s ease,box-shadow 0.3s ease}.settings-wrapper.show{margin-right:0!important;box-shadow:-2px 6px 24px rgba(0,0,0,0.18)}.settings-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:#666;font-size:20px;border-radius:6px}.card{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08),0 8px 32px rgba(0,0,0,0.06);padding:28px 24px;width:100%;transition:all 0.3s ease;display:flex;flex-direction:column;align-items:center}.card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.1),0 12px 40px rgba(0,0,0,0.08)}.shortcuts-card{background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08),0 8px 32px rgba(0,0,0,0.06);padding:20px 24px;width:100%;transition:all 0.3s ease}.shortcuts-card:hover{box-shadow:0 4px 16px rgba(0,0,0,0.1),0 12px 40px rgba(0,0,0,0.08)}.shortcuts-card.hidden{display:none}.engine-logo{font-size:52px;font-weight:900;margin-bottom:50px;user-select:none;letter-spacing:3px;color:#fff;text-shadow:0 1px 0 #ccc,0 2px 0 #c9c9c9,0 3px 0 #bbb,0 4px 0 #b9b9b9,0 5px 0 #aaa,0 6px 1px rgba(0,0,0,.1),0 0 5px rgba(0,0,0,.1),0 1px 3px rgba(0,0,0,.3),0 3px 5px rgba(0,0,0,.2),0 5px 10px rgba(0,0,0,.25),0 10px 10px rgba(0,0,0,.2),0 20px 20px rgba(0,0,0,.15)}.search-box{display:flex;align-items:center;border:2px solid #e8eaed;border-radius:24px;padding:8px 8px 8px 12px;transition:all 0.3s ease;background:#fff;gap:8px;width:100%}.search-box:focus-within{border-color:#4e6ef2;box-shadow:0 2px 8px rgba(78,110,242,0.15)}.engine-selector{display:flex;align-items:center;cursor:pointer;position:relative;user-select:none;flex-shrink:0;min-width:0}.current-engine{display:flex;align-items:center;gap:6px;font-size:14px;color:#333;white-space:nowrap;overflow:hidden}.engine-icon{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;color:#fff;flex-shrink:0}.engine-name{max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dropdown-arrow{font-size:10px;color:#999;transition:transform 0.3s ease;flex-shrink:0}.dropdown-arrow.open{transform:rotate(180deg)}.engine-dropdown{position:absolute;top:calc(100% + 8px);left:0;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:120px;display:none;z-index:1000}.engine-dropdown.show{display:block}.engine-option{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;transition:background 0.2s ease;font-size:14px;color:#333}.engine-option:first-child{border-radius:8px 8px 0 0}.engine-option:last-child{border-radius:0 0 8px 8px}.engine-option:hover{background:#f5f5f5}.engine-option.active{background:#f0f3ff;color:#4e6ef2}.search-input{flex:1;min-width:0;border:none;outline:none;font-size:16px;padding:8px 4px;color:#333;-webkit-user-select:text;user-select:text}.search-input::placeholder{color:#999}.search-button{border:none;color:#fff;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.3s ease;flex-shrink:0}.search-button:hover{filter:brightness(0.9);transform:scale(1.05)}.search-button svg{width:18px;height:18px}.shortcuts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.shortcut-item{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:12px 8px;border-radius:12px;transition:all 0.2s ease;text-decoration:none;color:#333;touch-action:manipulation}.shortcut-item:hover{background:#f5f7fa;transform:translateY(-3px)}.shortcut-icon{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#fff;box-shadow:0 3px 0 rgba(0,0,0,0.3),0 6px 12px rgba(0,0,0,0.2),0 10px 20px rgba(0,0,0,0.1),inset 0 2px 4px rgba(255,255,255,0.3),inset 0 -2px 4px rgba(0,0,0,0.1);transition:all 0.2s ease}.shortcut-item:hover .shortcut-icon{box-shadow:0 5px 0 rgba(0,0,0,0.35),0 10px 20px rgba(0,0,0,0.25),0 15px 30px rgba(0,0,0,0.15),inset 0 3px 6px rgba(255,255,255,0.35),inset 0 -3px 6px rgba(0,0,0,0.15);transform:translateY(-2px)}.shortcut-icon-add{background:#e8eaed!important;color:#999;font-size:28px;font-weight:400;box-shadow:none!important}.shortcut-item:hover .shortcut-icon-add{background:#d0d4da!important;box-shadow:none!important;transform:translateY(-2px)}.shortcut-name{font-size:12px;color:#666;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}.overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:200;opacity:0;pointer-events:none;transition:opacity 0.3s ease}.overlay.show{opacity:1;pointer-events:auto}.bottom-sheet{position:fixed;bottom:0;left:0;width:100%;background:#fff;border-radius:20px 20px 0 0;z-index:201;transform:translateY(100%);transition:transform 0.35s ease-out;max-height:55vh;overflow-y:auto;padding:8px 0 24px;-webkit-overflow-scrolling:touch}.bottom-sheet.show{transform:translateY(0)}.sheet-handle{width:36px;height:5px;background:#ddd;border-radius:3px;margin:8px auto 16px}.sheet-title{font-size:16px;font-weight:600;color:#333;text-align:center;margin-bottom:16px}.sheet-menu-item{display:flex;align-items:center;gap:12px;padding:14px 24px;cursor:pointer;transition:background 0.2s ease;font-size:15px;color:#333}.sheet-menu-item:active{background:#f5f5f5}.sheet-menu-icon{width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}.sheet-divider{height:1px;background:#f0f0f0;margin:4px 0}.engine-setting-row{display:flex;align-items:center;padding:10px 16px;gap:10px}.engine-setting-row.dragging{opacity:0.25}.engine-setting-info{display:flex;align-items:center;gap:10px;flex:1;min-width:0}.engine-setting-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:#fff;flex-shrink:0}.engine-setting-name{font-size:14px;color:#333}.engine-setting-toggle{width:44px;height:26px;border-radius:13px;background:#ddd;cursor:pointer;transition:background 0.3s ease;position:relative;flex-shrink:0}.engine-setting-toggle.active{background:#4e6ef2}.engine-setting-toggle::after{content:"";position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left 0.3s ease;box-shadow:0 1px 3px rgba(0,0,0,0.2)}.engine-setting-toggle.active::after{left:20px}.engine-setting-delete{flex-shrink:0;width:28px;display:flex;align-items:center;justify-content:center}.engine-delete-btn{width:26px;height:26px;border-radius:50%;border:none;background:#fee;color:#e55;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}.engine-delete-btn:active{background:#fcc}.drag-handle{cursor:grab;color:#ccc;font-size:16px;padding:4px 6px;flex-shrink:0;letter-spacing:2px;line-height:1;user-select:none;transition:all 0.2s ease;border-radius:4px}.drag-handle:hover{color:#4e6ef2;background:#f0f3ff}.drag-handle:active{cursor:grabbing;color:#3d5bd9;background:#e0e8ff}.drag-gap{position:fixed;z-index:300;height:4px;pointer-events:none;transform:scaleX(0);opacity:0;transition:transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease}.drag-gap.show{transform:scaleX(1);opacity:1}.drag-gap-line{width:100%;height:100%;background:rgba(0,0,0,0.25);border-radius:2px;box-shadow:0 0 3px rgba(0,0,0,0.1)}.depth-slider{flex:1;height:6px;border-radius:3px;background:#e8eaed;outline:none;-webkit-appearance:none;appearance:none;cursor:pointer}.depth-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#4e6ef2;cursor:pointer;box-shadow:0 2px 6px rgba(78,110,242,0.3)}.depth-slider::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#4e6ef2;cursor:pointer;border:none;box-shadow:0 2px 6px rgba(78,110,242,0.3)}.random-color-btn{width:36px;height:36px;border-radius:50%;border:none;background:#f0f0f0;cursor:pointer;font-size:16px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background 0.2s ease}.random-color-btn:hover{background:#e0e0e0}.form-label{font-size:13px;color:#999;margin:0 24px 6px}.form-input{display:block;width:calc(100% - 48px);height:44px;border:2px solid #e8eaed;border-radius:10px;padding:0 14px;font-size:15px;color:#333;outline:none;transition:border-color 0.2s ease;margin:0 24px 16px}.form-input:focus{border-color:#4e6ef2}.form-buttons{display:flex;gap:12px;margin:0 24px}.form-btn{flex:1;height:44px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:all 0.2s ease}.form-btn-cancel{background:#f0f0f0;color:#666}.form-btn-cancel:hover{background:#e0e0e0}.form-btn-confirm{background:#4e6ef2;color:#fff}.form-btn-confirm:hover{background:#3d5bd9}@media(max-width:480px){.engine-logo{font-size:40px;margin-bottom:32px}.shortcuts{grid-template-columns:repeat(4,1fr);gap:4px}.shortcut-item{padding:8px 4px}.engine-name{max-width:48px}}</style></head><body><div class="corner-strip clock-wrapper" id="clockWrapper"><div class="clock-time" id="clockTime"></div><div class="clock-date" id="clockDate"></div></div><div class="corner-strip settings-wrapper" id="settingsWrapper"><div class="settings-icon" title="设置" id="btnSettings">⚙️</div></div><div class="overlay" id="overlay"></div><div class="bottom-sheet" id="bottomSheet"><div class="sheet-handle"></div><div class="sheet-title" id="sheetTitle">设置</div><div id="sheetContent"></div></div><div class="search-container"><div class="card"><div class="engine-logo" id="engineLogo"></div><div class="search-box"><div class="engine-selector" id="engineSelector"><div class="current-engine"><span class="engine-icon" id="currentEngineIcon"></span><span class="engine-name" id="currentEngineName"></span></div><span class="dropdown-arrow" id="dropdownArrow">▼</span><div class="engine-dropdown" id="engineDropdown"></div></div><input type="text" class="search-input" id="searchInput" placeholder="输入搜索内容..."><button class="search-button" id="searchButton"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg></button></div></div><div class="shortcuts-card" id="shortcutsCard"><div class="shortcuts" id="shortcutsContainer"></div></div></div></body></html>');
    document.close();

    // ==================== 全局事件 ====================

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });

    document.addEventListener('selectstart', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        e.preventDefault();
    });

    // ==================== DOM引用 ====================
    
    var engineLogo = document.getElementById('engineLogo'),
        engineSelector = document.getElementById('engineSelector'),
        engineDropdown = document.getElementById('engineDropdown'),
        dropdownArrow = document.getElementById('dropdownArrow'),
        currentEngineIcon = document.getElementById('currentEngineIcon'),
        currentEngineName = document.getElementById('currentEngineName'),
        searchInput = document.getElementById('searchInput'),
        searchButton = document.getElementById('searchButton'),
        overlay = document.getElementById('overlay'),
        bottomSheet = document.getElementById('bottomSheet'),
        sheetTitle = document.getElementById('sheetTitle'),
        sheetContent = document.getElementById('sheetContent'),
        settingsWrapper = document.getElementById('settingsWrapper'),
        clockWrapper = document.getElementById('clockWrapper'),
        shortcutsCard = document.getElementById('shortcutsCard'),
        shortcutsContainer = document.getElementById('shortcutsContainer');

    // ==================== 界面控制 ====================
    
    function openBS() {
        if (isSettingsOpen) return;
        isSettingsOpen = true;
        overlay.classList.add('show');
        bottomSheet.classList.add('show');
    }
    
    function closeBS() {
        isSettingsOpen = false;
        overlay.classList.remove('show');
        bottomSheet.classList.remove('show');
        if (confirmCallbacks) {
            var cb = confirmCallbacks;
            confirmCallbacks = null;
            if (cb.onCancel) cb.onCancel();
        }
        formCallback = null;
    }
    
    overlay.addEventListener('click', closeBS);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isSettingsOpen) {
            if (formCallback) {
                hideForm();
            } else if (confirmCallbacks) {
                var cb = confirmCallbacks;
                confirmCallbacks = null;
                if (cb.onCancel) cb.onCancel();
            } else {
                closeBS();
            }
        }
    });

    // ==================== 时钟 ====================
    
    var clockTimer = null;
    
    clockWrapper.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!clockWrapper.classList.contains('show')) {
            clockWrapper.classList.add('show');
            clearTimeout(clockTimer);
            clockTimer = setTimeout(function() {
                clockWrapper.classList.remove('show');
            }, 1000);
        }
    });
    
    document.addEventListener('click', function() {
        if (clockWrapper.classList.contains('show')) {
            clockWrapper.classList.remove('show');
            clearTimeout(clockTimer);
        }
    });

    function updateClock() {
        var n = new Date();
        document.getElementById('clockTime').textContent =
            n.getHours().toString().padStart(2, '0') + ':' +
            n.getMinutes().toString().padStart(2, '0') + ':' +
            n.getSeconds().toString().padStart(2, '0');
        
        var w = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        document.getElementById('clockDate').textContent =
            n.getFullYear() + '年' + (n.getMonth() + 1) + '月' + n.getDate() + '日 ' + w[n.getDay()];
    }

    // ==================== 设置按钮 ====================
    
    document.getElementById('btnSettings').addEventListener('click', function(e) {
        e.stopPropagation();
        if (isSettingsOpen) return;
        settingsWrapper.classList.add('show');
        setTimeout(function() {
            renderMainMenu();
            openBS();
            settingsWrapper.classList.remove('show');
        }, 200);
    });
    
    settingsWrapper.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!settingsWrapper.classList.contains('show')) {
            settingsWrapper.classList.add('show');
            setTimeout(function() {
                settingsWrapper.classList.remove('show');
            }, 1500);
        }
    });
    
    document.addEventListener('click', function() {
        if (settingsWrapper.classList.contains('show')) {
            settingsWrapper.classList.remove('show');
        }
    });

    settingsWrapper.style.transition = 'none';
    settingsWrapper.style.marginRight = '-98px';
    
    setTimeout(function() {
        settingsWrapper.style.transition = 'margin-right 0.5s ease-out';
        settingsWrapper.style.marginRight = '0';
        setTimeout(function() {
            settingsWrapper.style.transition = 'margin-right 0.5s ease-in';
            settingsWrapper.style.marginRight = '-63px';
            setTimeout(function() {
                settingsWrapper.style.transition = 'margin-right 0.3s ease, box-shadow 0.3s ease';
            }, 500);
        }, 800);
    }, 500);

    // ==================== 搜索引擎下拉 ====================
    
    engineSelector.addEventListener('click', function(e) {
        e.stopPropagation();
        engineDropdown.classList.toggle('show');
        dropdownArrow.classList.toggle('open');
    });
    
    document.addEventListener('click', function() {
        engineDropdown.classList.remove('show');
        dropdownArrow.classList.remove('open');
    });

    // ==================== 搜索 ====================
    
    function performSearch() {
        var q = searchInput.value.trim();
        if (q && engines[currentEngine]) {
            var u = engines[currentEngine].url;
            if (u.indexOf('{query}') !== -1) {
                u = u.replace('{query}', encodeURIComponent(q));
            } else {
                u += encodeURIComponent(q);
            }
            window.location.href = u;
        }
    }
    
    searchButton.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') performSearch();
    });

    // ==================== 快捷方式 ====================
    
    function renderShortcuts() {
        shortcutsContainer.innerHTML = '';
        
        if (!shortcutsVisible) {
            shortcutsCard.classList.add('hidden');
            return;
        }
        
        shortcutsCard.classList.remove('hidden');
        var fragment = document.createDocumentFragment();
        var hasNewColors = false;
        
        for (var i = 0; i < shortcuts.length; i++) {
            var sh = shortcuts[i];
            var item = document.createElement('a');
            item.className = 'shortcut-item';
            item.href = sh.url;
            item.setAttribute('rel', 'noopener');
            
            if (!shortcutColors[sh.url]) {
                shortcutColors[sh.url] = getRandomColor(colorDepth);
                hasNewColors = true;
            }
            var color = shortcutColors[sh.url];
            
            item.innerHTML = 
                '<div class="shortcut-icon" style="background:' + color.solid + ';">' + 
                    sh.name.charAt(0) + 
                '</div>' +
                '<span class="shortcut-name">' + sh.name + '</span>';
            
            fragment.appendChild(item);
        }
        
        if (shortcuts.length < 12) {
            var addItem = document.createElement('div');
            addItem.className = 'shortcut-item';
            addItem.addEventListener('click', function() {
                showForm('添加快捷方式', 'https://www.example.com', function(name, url) {
                    shortcuts.push({ name: name, url: url });
                    shortcutColors[url] = getRandomColor(colorDepth);
                    saveShortcuts();
                    renderShortcuts();
                }, null, null, function() { closeBS(); });
            });
            addItem.innerHTML = 
                '<div class="shortcut-icon shortcut-icon-add">+</div>' +
                '<span class="shortcut-name">添加快捷方式</span>';
            fragment.appendChild(addItem);
        }
        
        shortcutsContainer.appendChild(fragment);
        
        if (hasNewColors) {
            saveShortcutsImmediate();
        }
    }

    // ==================== 启动 ====================
    
    initData();
    rebuildEngineDropdown();
    renderShortcuts();
    updateClock();
    setInterval(updateClock, 1000);
})();
