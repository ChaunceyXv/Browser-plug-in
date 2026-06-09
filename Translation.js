// ==UserScript==
// @name         全页翻译 (Via Edge 引擎)
// @namespace    https://via.browser/
// @version      11.24
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      edge.microsoft.com
// @connect      api.cognitive.microsofttranslator.com
// ==/UserScript==

(function() {
    'use strict';
    if (window.__t) return;
    window.__t = true;

    GM_addStyle('#via-trans-btn{position:fixed;bottom:80px;right:20px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#999;color:#fff;font-size:14px;font-weight:bold;border:none;box-shadow:0 4px 12px rgba(0,0,0,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;-webkit-user-select:none}');

    const btn = Object.assign(document.createElement('button'), {
        id: 'via-trans-btn',
        textContent: '译'
    });
    document.body.appendChild(btn);

    const BATCH_SIZE = 25;
    const CONCURRENT = 4;
    const TRANSLATED_ATTR = 'data-via-t';

    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA',
        'CODE', 'PRE', 'KBD', 'VAR', 'SAMP',
        'IFRAME', 'OBJECT', 'EMBED', 'CANVAS',
        'SVG', 'MATH', 'VIDEO', 'AUDIO'
    ]);

    const history = [];
    const historySet = new WeakSet();

    let token = null, tokenPromise = null;

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

    function translateBatch(batch) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans&textType=html',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                data: JSON.stringify(batch),
                timeout: 15000,
                onload(r) {
                    if (r.status === 200) {
                        try {
                            resolve(JSON.parse(r.responseText).map(item => item.translations[0].text));
                        } catch(e) {
                            resolve(null);
                        }
                    } else {
                        token = null;
                        tokenPromise = null;
                        resolve(null);
                    }
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
        let el = node.parentElement;
        while (el) {
            if (SKIP_TAGS.has(el.nodeName)) return false;
            el = el.parentElement;
        }
        return true;
    }

    function addToHistory(node, translated) {
        history.push({ node: node, original: node.nodeValue, translated: translated });
        historySet.add(node);
        const el = node.parentElement;
        if (el && el.setAttribute) el.setAttribute(TRANSLATED_ATTR, '1');
    }

    function collectAllTextNodes(root) {
        const nodes = [];
        const stack = [root];
        while (stack.length) {
            const el = stack.pop();
            if (el.shadowRoot) stack.push(el.shadowRoot);
            for (let child = el.firstChild; child; child = child.nextSibling) {
                if (child.nodeType === Node.TEXT_NODE) {
                    if (child.nodeValue.trim() && isUntranslated(child) && isSafeNode(child)) nodes.push(child);
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    stack.push(child);
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

    async function translateNodes(nodes, showProgress) {
        if (!nodes.length) return true;

        const batches = [];
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
            batches.push({
                index: i,
                nodes: nodes.slice(i, i + BATCH_SIZE),
                body: nodes.slice(i, i + BATCH_SIZE).map(n => ({ Text: n.nodeValue }))
            });
        }

        let translatedCount = 0;
        let allSuccess = true;

        for (let i = 0; i < batches.length; i += CONCURRENT) {
            const chunk = batches.slice(i, i + CONCURRENT);
            const results = await Promise.all(chunk.map(b => translateBatch(b.body)));

            for (let k = 0; k < chunk.length; k++) {
                const result = results[k];
                if (!result) {
                    allSuccess = false;
                    break;
                }
                for (let j = 0; j < result.length; j++) {
                    const node = chunk[k].nodes[j];
                    addToHistory(node, result[j]);
                    node.nodeValue = result[j];
                }
                translatedCount += result.length;
            }

            if (!allSuccess) break;

            if (showProgress) {
                btn.textContent = Math.round((translatedCount / nodes.length) * 100) + '%';
            }
        }

        if (showProgress) btn.textContent = '译';
        return allSuccess;
    }

    function switchToOriginal() {
        if (!history.length) return;
        for (const item of history) item.node.nodeValue = item.original;
        document.querySelectorAll('[' + TRANSLATED_ATTR + ']').forEach(el => el.removeAttribute(TRANSLATED_ATTR));
        btn.style.background = '#999';
    }

    function switchToTranslated() {
        if (!history.length) return;
        for (const item of history) {
            item.node.nodeValue = item.translated;
            const el = item.node.parentElement;
            if (el && el.setAttribute) el.setAttribute(TRANSLATED_ATTR, '1');
        }
        btn.style.background = '#0078d4';
    }

    let observer = null, pendingNodes = [], debounceTimer = null, isOriginal = false;

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() && isUntranslated(node) && isSafeNode(node)) {
                        pendingNodes.push(node);
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        pendingNodes.push(...collectAllTextNodes(node));
                    }
                }
            }
            if (pendingNodes.length > 0) {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(async () => {
                    const nodes = [...pendingNodes];
                    pendingNodes = [];
                    if (isOriginal) return;
                    await translateNodes(nodes, false);
                }, 500);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // 三指快速点击
    let gestureStartTime = 0;
    let gestureMoved = false;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length === 3) {
            gestureStartTime = Date.now();
            gestureMoved = false;
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (e.touches.length >= 3) gestureMoved = true;
    }, { passive: true });

    document.addEventListener('touchend', async (e) => {
        if (e.touches.length === 0 && !gestureMoved && Date.now() - gestureStartTime < 500) {
            if (btn.disabled) return;

            // 已有译文 → 切换原文/译文
            if (history.length) {
                if (isOriginal) {
                    switchToTranslated();
                    isOriginal = false;
                    startObserver();
                } else {
                    switchToOriginal();
                    isOriginal = true;
                }
                return;
            }

            // 无译文 → 翻译
            doTranslate();
        }
    });

    async function doTranslate() {
        btn.disabled = true;
        btn.style.background = '#f39c12';
        btn.textContent = '...';

        if (!await getToken()) {
            btn.style.background = '#e74c3c';
            btn.textContent = '译';
            btn.disabled = false;
            return;
        }

        const nodes = collectAllTextNodes(document.body);
        nodes.push(...collectIframeNodes());

        if (!nodes.length) {
            btn.style.background = '#0078d4';
            btn.textContent = '译';
            btn.disabled = false;
            startObserver();
            return;
        }

        const success = await translateNodes(nodes, true);
        btn.style.background = success ? '#0078d4' : '#e74c3c';
        btn.disabled = false;
        isOriginal = false;
        startObserver();
    }

    // 长按按钮切换
    let longPressTimer = null, isLongPress = false;

    btn.addEventListener('pointerdown', () => {
        isLongPress = false;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            if (history.length) {
                if (isOriginal) {
                    switchToTranslated();
                    isOriginal = false;
                } else {
                    switchToOriginal();
                    isOriginal = true;
                }
            }
        }, 600);
    });

    btn.addEventListener('pointerup', () => clearTimeout(longPressTimer));
    btn.addEventListener('pointerleave', () => clearTimeout(longPressTimer));

    btn.addEventListener('click', async () => {
        if (isLongPress) return;
        if (btn.disabled) return;
        if (isOriginal && history.length) {
            switchToTranslated();
            isOriginal = false;
            startObserver();
            return;
        }
        doTranslate();
    });
})();
