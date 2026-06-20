// ==UserScript==
// @name         网页翻译助手
// @namespace    https://example.com/translator
// @version      1.0.0
// @description  选中文字后点击按钮翻译，或一键翻译整页内容
// @author       You
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      translate.googleapis.com
// @connect      api.mymemory.translated.net
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    const SOURCE_LANG_KEY = 'trans_src_lang';
    const TARGET_LANG_KEY = 'trans_tgt_lang';
    const ENGINE_KEY = 'trans_engine';

    const sourceLang = GM_getValue(SOURCE_LANG_KEY, 'auto');
    const targetLang = GM_getValue(TARGET_LANG_KEY, 'zh-CN');
    const engine = GM_getValue(ENGINE_KEY, 'mymemory');

    const commonLangs = [
        { code: 'auto', name: '自动检测' },
        { code: 'zh-CN', name: '简体中文' },
        { code: 'zh-TW', name: '繁体中文' },
        { code: 'en', name: '英语' },
        { code: 'ja', name: '日语' },
        { code: 'ko', name: '韩语' },
        { code: 'fr', name: '法语' },
        { code: 'de', name: '德语' },
        { code: 'ru', name: '俄语' },
        { code: 'es', name: '西班牙语' },
        { code: 'pt', name: '葡萄牙语' },
        { code: 'it', name: '意大利语' }
    ];

    const engines = [
        { key: 'mymemory', name: 'MyMemory (免费)' },
        { key: 'google', name: 'Google (免 API key)' }
    ];

    GM_addStyle(`
        #trans-panel {
            position: fixed;
            z-index: 2147483647;
            background: #1f2937;
            color: #f3f4f6;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.25);
            padding: 10px 12px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: none;
            max-width: 320px;
            line-height: 1.5;
        }
        #trans-panel .trans-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        #trans-panel .trans-title span {
            font-weight: 600;
            color: #f9fafb;
        }
        #trans-panel .trans-close {
            cursor: pointer;
            background: transparent;
            border: 0;
            color: #9ca3af;
            font-size: 16px;
            line-height: 1;
            padding: 2px 4px;
        }
        #trans-panel .trans-close:hover { color: #fff; }
        #trans-panel .trans-body {
            max-height: 260px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
        }
        #trans-panel .trans-loading {
            color: #9ca3af;
            font-style: italic;
        }
        #trans-panel .trans-error {
            color: #fca5a5;
        }
        #trans-panel .trans-source {
            color: #9ca3af;
            font-size: 11px;
            margin-top: 4px;
        }

        #trans-bar {
            position: fixed;
            z-index: 2147483646;
            right: 16px;
            bottom: 16px;
            background: #111827;
            color: #f9fafb;
            padding: 8px 10px;
            border-radius: 8px;
            box-shadow: 0 8px 20px rgba(0,0,0,0.25);
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #trans-bar select, #trans-bar button {
            font-size: 12px;
            padding: 4px 6px;
            border-radius: 6px;
            border: 1px solid #374151;
            background: #1f2937;
            color: #f9fafb;
            cursor: pointer;
        }
        #trans-bar button:hover { background: #374151; }
    `);

    const panel = document.createElement('div');
    panel.id = 'trans-panel';
    panel.innerHTML = `
        <div class="trans-title">
            <span>翻译结果</span>
            <button class="trans-close" title="关闭">×</button>
        </div>
        <div class="trans-body">请选中文字后点击"翻译"。</div>
        <div class="trans-source"></div>
    `;
    document.documentElement.appendChild(panel);

    const bar = document.createElement('div');
    bar.id = 'trans-bar';
    bar.innerHTML = `
        <select title="翻译引擎"></select>
        <select title="源语言"></select>
        <span>→</span>
        <select title="目标语言"></select>
        <button title="翻译选中文字">翻译所选</button>
        <button title="翻译整页可见文本">翻译整页</button>
    `;
    document.documentElement.appendChild(bar);

    const [engineSelect, srcSelect, tgtSelect, btnSel, btnPage] = bar.children;

    function fillLangOptions(select, current) {
        commonLangs.forEach(({ code, name }) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = `${name} (${code})`;
            if (code === current) opt.selected = true;
            select.appendChild(opt);
        });
    }

    engines.forEach(({ key, name }) => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = name;
        if (key === engine) opt.selected = true;
        engineSelect.appendChild(opt);
    });

    fillLangOptions(srcSelect, sourceLang);
    fillLangOptions(tgtSelect, targetLang);

    engineSelect.addEventListener('change', () => GM_setValue(ENGINE_KEY, engineSelect.value));
    srcSelect.addEventListener('change', () => GM_setValue(SOURCE_LANG_KEY, srcSelect.value));
    tgtSelect.addEventListener('change', () => GM_setValue(TARGET_LANG_KEY, tgtSelect.value));

    panel.querySelector('.trans-close').addEventListener('click', hidePanel);
    document.addEventListener('mousedown', (e) => {
        if (!panel.contains(e.target)) hidePanel();
    });

    function showPanel(x, y, html, rawText) {
        panel.style.display = 'block';
        const body = panel.querySelector('.trans-body');
        const src = panel.querySelector('.trans-source');
        body.innerHTML = html;
        src.textContent = rawText ? `原文：${rawText.slice(0, 80)}${rawText.length > 80 ? '…' : ''}` : '';
        const rect = panel.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left = x + 8;
        let top = y + 16;
        if (left + rect.width > vw - 8) left = vw - rect.width - 8;
        if (top + rect.height > vh - 8) top = y - rect.height - 16;
        if (top < 8) top = 8;
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    }

    function hidePanel() {
        panel.style.display = 'none';
    }

    function getSelectedText() {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return '';
        return sel.toString().trim();
    }

    function translateSelected() {
        const text = getSelectedText();
        if (!text) {
            alert('请先选中要翻译的文字。');
            return;
        }
        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom;
        showPanel(x, y, '<span class="trans-loading">正在翻译…</span>', text);
        translate(text, srcSelect.value, tgtSelect.value, engineSelect.value)
            .then((result) => {
                showPanel(x, y, escapeHtml(result.translated), text);
            })
            .catch((err) => {
                showPanel(x, y, `<span class="trans-error">翻译失败：${escapeHtml(err.message || err)}</span>`, text);
            });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));
    }

    btnSel.addEventListener('click', translateSelected);
    btnPage.addEventListener('click', translatePage);

    GM_registerMenuCommand('翻译选中文字', translateSelected);
    GM_registerMenuCommand('翻译整页可见文本', translatePage);

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
            e.preventDefault();
            translateSelected();
        }
    });

    function translate(text, from, to, eng) {
        if (!text) return Promise.resolve({ translated: '' });
        if (eng === 'google') {
            return translateByGoogle(text, from, to);
        }
        return translateByMyMemory(text, from, to);
    }

    function translateByGoogle(text, from, to) {
        const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' +
            encodeURIComponent(from) + '&tl=' + encodeURIComponent(to) +
            '&dt=t&q=' + encodeURIComponent(text);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const sentences = data[0] || [];
                        const translated = sentences.map((s) => s[0]).filter(Boolean).join('');
                        if (!translated) return reject(new Error('未返回翻译结果'));
                        resolve({ translated });
                    } catch (e) {
                        reject(new Error('解析响应失败：' + (res.responseText || '').slice(0, 120)));
                    }
                },
                onerror: (err) => reject(new Error('网络错误：' + (err && err.error))),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    function translateByMyMemory(text, from, to) {
        const langpair = `${from === 'auto' ? 'autodetect' : from}|${to}`;
        const url = 'https://api.mymemory.translated.net/get?q=' +
            encodeURIComponent(text) + '&langpair=' + encodeURIComponent(langpair);
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                headers: { Accept: 'application/json' },
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const translated = data && data.responseData && data.responseData.translatedText;
                        if (!translated) return reject(new Error((data && data.responseDetails) || '未返回翻译结果'));
                        resolve({ translated });
                    } catch (e) {
                        reject(new Error('解析响应失败：' + (res.responseText || '').slice(0, 120)));
                    }
                },
                onerror: (err) => reject(new Error('网络错误：' + (err && err.error))),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    function isVisible(el) {
        if (!el || el.nodeType !== 1) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
        const tag = el.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') return false;
        if (el.id === 'trans-panel' || el.id === 'trans-bar') return false;
        return true;
    }

    function collectTextNodes(root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                if (!node.parentElement) return NodeFilter.FILTER_REJECT;
                return isVisible(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const nodes = [];
        let cur;
        while ((cur = walker.nextNode())) nodes.push(cur);
        return nodes;
    }

    function translatePage() {
        const nodes = collectTextNodes(document.body);
        if (!nodes.length) {
            alert('未找到可见文本节点。');
            return;
        }
        btnPage.disabled = true;
        btnPage.textContent = '翻译中…';

        const chunks = [];
        let buffer = [];
        let bufferLen = 0;
        nodes.forEach((n) => {
            const text = n.nodeValue;
            if (bufferLen + text.length > 450) {
                chunks.push({ text: buffer.join('\n'), nodes: buffer.slice() });
                buffer = [];
                bufferLen = 0;
            }
            buffer.push(text);
            bufferLen += text.length;
        });
        if (buffer.length) chunks.push({ text: buffer.join('\n'), nodes: buffer.slice() });

        const from = srcSelect.value;
        const to = tgtSelect.value;
        const eng = engineSelect.value;

        (async () => {
            for (const chunk of chunks) {
                try {
                    const { translated } = await translate(chunk.text, from, to, eng);
                    const lines = translated.split('\n');
                    chunk.nodes.forEach((n, idx) => {
                        const replacement = lines[idx];
                        if (replacement != null) n.nodeValue = replacement;
                    });
                } catch (e) {
                    console.warn('翻译失败：', e);
                }
            }
            btnPage.disabled = false;
            btnPage.textContent = '翻译整页';
        })();
    }
})();
