// ==UserScript==
// @name         全页翻译 (Via Edge 引擎)
// @namespace    https://via.browser/
// @version      18.3
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      edge.microsoft.com
// @connect      api.cognitive.microsofttranslator.com
// ==/UserScript==

(function() {
    'use strict';
    if (window.__t) return;
    window.__t = true;

    GM_addStyle(`
#via-trans-btn{position:fixed;bottom:80px;right:20px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#999;color:#fff;font-size:14px;font-weight:bold;border:none;box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}
#via-trans-btn.hidden{display:none}
.via-bi{display:block;margin-top:6px;color:#5a8fb4;font-size:.92em;line-height:1.6;padding-left:8px;border-left:2px solid rgba(74,158,255,0.3)}
@media(prefers-color-scheme:dark){.via-bi{color:#7babc8;border-left-color:rgba(100,160,220,0.25)}}
`);

    const btn = Object.assign(document.createElement('button'), {
        id: 'via-trans-btn',
        textContent: '译'
    });
    document.body.appendChild(btn);

    if (GM_getValue('btnHidden', false)) btn.classList.add('hidden');

    const CONCURRENT = 8;
    const TRANSLATED_ATTR = 'data-via-t';

    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'NOSCRIPT',
        'CODE', 'PRE', 'KBD', 'VAR', 'SAMP',
        'IFRAME', 'OBJECT', 'EMBED', 'CANVAS',
        'SVG', 'MATH', 'VIDEO', 'AUDIO',
        'TITLE'
    ]);

    const history = [];
    const historySet = new WeakSet();

    let token = null, tokenPromise = null;
    let gestureEnabled = GM_getValue('gestureEnabled', true);
    
    // 按网站存储的辅助函数
    function getSiteKey() {
        return window.location.hostname;
    }
    
    function getSitePref(key, defaultValue) {
        const siteKey = getSiteKey();
        const all = GM_getValue(key + '_sites', {});
        return all[siteKey] !== undefined ? all[siteKey] : defaultValue;
    }
    
    function setSitePref(key, value) {
        const siteKey = getSiteKey();
        const all = GM_getValue(key + '_sites', {});
        all[siteKey] = value;
        GM_setValue(key + '_sites', all);
    }
    
    let strictMode = getSitePref('strictMode', false);
    let autoMode = getSitePref('autoMode', false);
    let bilingualMode = getSitePref('bilingualMode', false);
    let bilingualSelector = getSitePref('bilingualSelector', 'P');

    function getToken() {
        if (token) return Promise.resolve(token);
        if (tokenPromise) return tokenPromise;
        tokenPromise = new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://edge.microsoft.com/translate/auth',
                timeout: 5000,
                onload(r) { token = r.status === 200 ? r.responseText : null; resolve(token); },
                onerror() { tokenPromise = null; resolve(null); },
                ontimeout() { tokenPromise = null; resolve(null); }
            });
        });
        return tokenPromise;
    }

    getToken();

    function translateBatch(body) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans&textType=html',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                data: JSON.stringify(body),
                timeout: 15000,
                onload(r) {
                    if (r.status === 200) {
                        try { resolve(JSON.parse(r.responseText).map(item => item.translations[0].text)); }
                        catch(e) { resolve(null); }
                    } else { token = null; tokenPromise = null; resolve(null); }
                },
                onerror() { resolve(null); },
                ontimeout() { resolve(null); }
            });
        });
    }

    function isUntranslated(node) {
        return !historySet.has(node);
    }

    function isSafeNode(node) {
        if (strictMode) return true;
        let el = node.parentElement;
        while (el) {
            if (SKIP_TAGS.has(el.nodeName)) return false;
            el = el.parentElement;
        }
        return true;
    }

    function isVisible(node) {
        if (strictMode) return true;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el) return true;
        try {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;
        } catch(e) {}
        return true;
    }

    function addToHistory(node, original, translated) {
        history.push({ node: node, original: original, translated: translated });
        historySet.add(node);
    }

    function markTranslated(node) {
        const el = node._textarea ? node.el : node._input ? node.el : node._ph ? node.el : node._img ? node.el : node._svg ? node.el : node.parentElement;
        if (el && el.setAttribute) el.setAttribute(TRANSLATED_ATTR, '1');
    }

    function getNodeText(node) {
        if (node._textarea) return node.el.value;
        if (node._input) return node.el.value;
        if (node._ph) return node.el.placeholder;
        if (node._img) return node.el.alt;
        if (node._svg) return node.el.textContent;
        return node.nodeValue;
    }

    function setNodeText(node, text) {
        if (node._textarea) node.el.value = text;
        else if (node._input) node.el.value = text;
        else if (node._ph) node.el.placeholder = text;
        else if (node._img) node.el.alt = text;
        else if (node._svg) node.el.textContent = text;
        else node.nodeValue = text;
    }

    function removeBilingual() {
        document.querySelectorAll('.via-bi').forEach(el => el.remove());
    }

    function rebuildBilingual() {
        removeBilingual();
        if (!bilingualSelector) return;
        const groups = new Map();
        for (const item of history) {
            if (item.node._textarea || item.node._input || item.node._ph || item.node._img || item.node._svg) continue;
            let el = item.node.parentElement;
            while (el && el !== document.body) {
                try {
                    if (el.matches && el.matches(bilingualSelector)) {
                        if (!groups.has(el)) groups.set(el, []);
                        groups.get(el).push(item);
                        break;
                    }
                } catch(e) {}
                el = el.parentElement;
            }
        }
        const bilingualNodes = new Set();
        for (const [el, items] of groups) {
            let combinedTranslated = '';
            for (const item of items) {
                setNodeText(item.node, item.original);
                combinedTranslated += (combinedTranslated ? ' ' : '') + item.translated;
                bilingualNodes.add(item.node);
            }
            const div = document.createElement('div');
            div.className = 'via-bi';
            div.setAttribute('data-via-bi', '1');
            div.textContent = combinedTranslated;
            el.appendChild(div);
        }
        for (const item of history) {
            if (!bilingualNodes.has(item.node)) {
                setNodeText(item.node, item.translated);
            }
        }
    }

    function collectAllTextNodes(root) {
        const nodes = [];
        const stack = [root];
        while (stack.length) {
            const el = stack.pop();
            if (el.hasAttribute && el.hasAttribute('data-via-bi')) continue;
            if (el.shadowRoot) stack.push(el.shadowRoot);
            for (let child = el.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === Node.TEXT_NODE) {
                    if (child.nodeValue.trim() && isUntranslated(child) && isSafeNode(child) && isVisible(child)) {
                        nodes.push(child);
                    }
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.hasAttribute && child.hasAttribute('data-via-bi')) continue;
                    const tag = child.nodeName;
                    if (tag === 'TEXTAREA' && isUntranslated(child) && child.value.trim() && isVisible(child)) {
                        nodes.push({ _textarea: true, el: child });
                    } else if (tag === 'INPUT' && isUntranslated(child) && child.value.trim() && isVisible(child)) {
                        nodes.push({ _input: true, el: child });
                    } else if ((tag === 'INPUT' || tag === 'TEXTAREA') && isUntranslated(child) && child.placeholder && child.placeholder.trim() && isVisible(child)) {
                        nodes.push({ _ph: true, el: child });
                    } else if (tag === 'IMG' && isUntranslated(child) && child.alt && child.alt.trim() && isVisible(child)) {
                        nodes.push({ _img: true, el: child });
                    } else if (tag === 'text' && isUntranslated(child) && child.textContent && child.textContent.trim() && isVisible(child)) {
                        nodes.push({ _svg: true, el: child });
                    } else {
                        stack.push(child);
                    }
                }
            }
        }
        return nodes;
    }

    function collectIframeNodes() {
        const nodes = [];
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                const doc = iframe.contentDocument || iframe.contentWindow.document;
                if (doc && doc.body) nodes.push(...collectAllTextNodes(doc.body));
            } catch(e) {}
        }
        return nodes;
    }

    function makeBatches(nodes, batchSize) {
        const batches = [];
        for (let i = 0; i < nodes.length; i += batchSize) {
            batches.push(nodes.slice(i, i + batchSize));
        }
        return batches;
    }

    async function translateNodes(nodes, showProgress) {
        if (!nodes.length) return true;

        let batchSize = 50;
        let translatedCount = 0;

        if (showProgress) {
            btn.style.background = '#f39c12';
        }

        while (true) {
            const batches = makeBatches(nodes.slice(translatedCount), batchSize);
            if (!batches.length) break;

            let roundOK = true;

            for (let i = 0; i < batches.length; i += CONCURRENT) {
                const chunk = batches.slice(i, i + CONCURRENT);
                const results = await Promise.all(
                    chunk.map(b => translateBatch(
                        b.map(n => ({ Text: getNodeText(n) }))
                    ))
                );

                for (let k = 0; k < chunk.length; k++) {
                    if (!results[k]) { roundOK = false; break; }
                    for (let j = 0; j < results[k].length; j++) {
                        const node = chunk[k][j];
                        const original = getNodeText(node);
                        addToHistory(node, original, results[k][j]);
                        setNodeText(node, results[k][j]);
                        markTranslated(node);
                    }
                    translatedCount += results[k].length;
                }

                if (!roundOK) break;

                if (showProgress) {
                    btn.textContent = Math.round((translatedCount / nodes.length) * 100) + '%';
                }
            }

            if (roundOK) break;

            if (batchSize > 1) {
                batchSize = Math.floor(batchSize / 2);
                continue;
            }

            if (showProgress) {
                btn.textContent = '译';
                btn.style.background = '#e74c3c';
            }
            return false;
        }

        if (showProgress) {
            btn.textContent = '译';
            btn.style.background = '#0078d4';
        }
        return true;
    }

    function switchToOriginal() {
        if (!history.length) return;
        removeBilingual();
        for (const item of history) setNodeText(item.node, item.original);
        document.querySelectorAll('[' + TRANSLATED_ATTR + ']').forEach(el => el.removeAttribute(TRANSLATED_ATTR));
        btn.style.background = '#999';
    }

    function switchToTranslated() {
        if (!history.length) return;
        removeBilingual();
        for (const item of history) {
            setNodeText(item.node, item.translated);
            markTranslated(item.node);
        }
        btn.style.background = '#0078d4';
    }

    function switchToBilingual() {
        if (!history.length) return;
        rebuildBilingual();
        btn.style.background = '#0078d4';
    }

    let observer = null, debounceTimer = null, isOriginal = false, isTranslating = false;

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(() => {
            if (isOriginal || isTranslating) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(async () => {
                if (isOriginal || isTranslating) return;
                const nodes = collectAllTextNodes(document.body);
                if (nodes.length > 0) {
                    isTranslating = true;
                    const success = await translateNodes(nodes, false);
                    if (bilingualMode && success) rebuildBilingual();
                    isTranslating = false;
                }
            }, 800);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    async function doTranslate() {
        btn.disabled = true;
        isTranslating = true;
        btn.style.background = '#f39c12';
        btn.textContent = '...';

        if (!await getToken()) {
            btn.style.background = '#e74c3c';
            btn.textContent = '译';
            btn.disabled = false;
            isTranslating = false;
            return;
        }

        const nodes = collectAllTextNodes(document.body);
        nodes.push(...collectIframeNodes());

        if (!nodes.length) {
            btn.style.background = '#0078d4';
            btn.textContent = '译';
            btn.disabled = false;
            isTranslating = false;
            startObserver();
            return;
        }

        const success = await translateNodes(nodes, true);
        if (bilingualMode && success) rebuildBilingual();
        btn.style.background = success ? '#0078d4' : '#e74c3c';
        btn.disabled = false;
        isOriginal = false;
        isTranslating = false;
        startObserver();
    }

    let gestureStartTime = 0, gestureMoved = false;

    document.addEventListener('touchstart', (e) => {
        if (!gestureEnabled) return;
        if (e.touches.length === 3) { gestureStartTime = Date.now(); gestureMoved = false; }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!gestureEnabled) return;
        if (e.touches.length >= 3) gestureMoved = true;
    }, { passive: true });

    document.addEventListener('touchend', async (e) => {
        if (!gestureEnabled) return;
        if (e.touches.length === 0 && !gestureMoved && Date.now() - gestureStartTime < 500) {
            if (btn.disabled) return;
            if (history.length) {
                if (isOriginal) {
                    bilingualMode ? switchToBilingual() : switchToTranslated();
                    isOriginal = false; startObserver();
                } else {
                    switchToOriginal(); isOriginal = true;
                }
                return;
            }
            doTranslate();
        }
    });

    btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        if (isOriginal && history.length) {
            bilingualMode ? switchToBilingual() : switchToTranslated();
            isOriginal = false; startObserver(); return;
        }
        doTranslate();
    });

    let menuIds = {};

    function registerMenus() {
        Object.values(menuIds).forEach(id => { try { GM_unregisterMenuCommand(id); } catch(e) {} });
        menuIds = {};

        menuIds.translate = GM_registerMenuCommand('1. 翻译网页', () => {
            if (btn.disabled) return;
            if (isOriginal && history.length) {
                bilingualMode ? switchToBilingual() : switchToTranslated();
                isOriginal = false; startObserver(); return;
            }
            doTranslate();
        });

        menuIds.original = GM_registerMenuCommand('2. 原文/译文', () => {
            if (!history.length) return;
            if (isOriginal) {
                bilingualMode ? switchToBilingual() : switchToTranslated();
                isOriginal = false; startObserver();
            } else {
                switchToOriginal(); isOriginal = true;
            }
        });

        menuIds.strict = GM_registerMenuCommand(strictMode ? '3. 严格翻译模式' : '3. 标准翻译模式', () => {
            strictMode = !strictMode;
            setSitePref('strictMode', strictMode);
            registerMenus();
        });

        menuIds.auto = GM_registerMenuCommand(autoMode ? '4. 自动翻译开启' : '4. 自动翻译关闭', () => {
            autoMode = !autoMode;
            setSitePref('autoMode', autoMode);
            registerMenus();
        });

        menuIds.bilingual = GM_registerMenuCommand(bilingualMode ? '5. 双语对照开启' : '5. 双语对照关闭', () => {
            bilingualMode = !bilingualMode;
            setSitePref('bilingualMode', bilingualMode);
            if (history.length) {
                if (isOriginal) {
                    // do nothing
                } else {
                    if (bilingualMode) {
                        switchToBilingual();
                    } else {
                        switchToTranslated();
                    }
                }
            }
            registerMenus();
        });

        menuIds.selector = GM_registerMenuCommand('6. 设置双语选择器', () => {
            const newSel = prompt('输入CSS选择器（如 .comment, article）：', bilingualSelector);
            if (newSel !== null) {
                bilingualSelector = newSel.trim();
                setSitePref('bilingualSelector', bilingualSelector);
                if (bilingualMode && history.length && !isOriginal) rebuildBilingual();
                registerMenus();
            }
        });

        menuIds.gesture = GM_registerMenuCommand(gestureEnabled ? '7. 三指手势开启' : '7. 三指手势关闭', () => {
            gestureEnabled = !gestureEnabled;
            GM_setValue('gestureEnabled', gestureEnabled);
            registerMenus();
        });

        menuIds.btn = GM_registerMenuCommand(btn.classList.contains('hidden') ? '8. 显示按钮' : '8. 隐藏按钮', () => {
            btn.classList.toggle('hidden');
            GM_setValue('btnHidden', btn.classList.contains('hidden'));
            registerMenus();
        });
    }

    registerMenus();

    if (autoMode) {
        if (document.readyState === 'complete') {
            doTranslate();
        } else {
            window.addEventListener('load', () => doTranslate());
        }
    }
})();
