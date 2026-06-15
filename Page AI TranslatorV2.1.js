// ==UserScript==
// @name         Page AI Translator
// @namespace    https://github.com/opqit/page-ai-translator
// @version      2.1.0
// @description  悬浮按钮一键翻译网页，支持 AI(DeepSeek/OpenAI) 和微软翻译(免费)，开箱即用。
// @author       Operit
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.deepseek.com
// @connect      api.openai.com
// @connect      api-edge.cognitive.microsofttranslator.com
// @connect      edge.microsoft.com
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // 0. STORAGE
    // ============================================================
    var store = {
        get: function (key, fallback) {
            try {
                if (typeof GM_getValue !== 'undefined') {
                    var v = GM_getValue(key);
                    return v !== undefined && v !== null ? v : fallback;
                }
            } catch (_) { }
            try {
                var v = localStorage.getItem('via_tr_' + key);
                return v !== null ? JSON.parse(v) : fallback;
            } catch (_) { return fallback; }
        },
        set: function (key, val) {
            try {
                if (typeof GM_setValue !== 'undefined') { GM_setValue(key, val); return; }
            } catch (_) { }
            try { localStorage.setItem('via_tr_' + key, JSON.stringify(val)); } catch (_) { }
        }
    };

    var cfg = {
        engine: store.get('engine', 'ai'),       // 'ai' | 'microsoft'
        apiKey: store.get('apiKey', ''),
        apiBase: store.get('apiBase', 'https://api.deepseek.com/v1'),
        model: store.get('model', 'deepseek-chat'),
        mode: store.get('mode', 'cover'),         // 'cover' | 'append'
        btnX: store.get('btnX', null),
        btnY: store.get('btnY', null)
    };

    function saveCfg() {
        store.set('engine', cfg.engine);
        store.set('apiKey', cfg.apiKey);
        store.set('apiBase', cfg.apiBase);
        store.set('model', cfg.model);
        store.set('mode', cfg.mode);
        store.set('btnX', cfg.btnX);
        store.set('btnY', cfg.btnY);
    }

    // ============================================================
    // 1. SHADOW DOM & STYLES
    // ============================================================
    var host = document.createElement('div');
    host.id = 'via-tr-host';
    var root = host.attachShadow({ mode: 'open' });

    var styleEl = document.createElement('style');
    styleEl.textContent = '\
        :host { all:initial; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; font-size:14px; color:#1a1a2e; line-height:1.5; -webkit-tap-highlight-color:transparent; }\
        .fab { position:fixed; z-index:2147483647; width:48px; height:48px; border-radius:16px; background:#fff; box-shadow:0 2px 14px 0 rgba(0,0,0,.12),0 0 0 1px rgba(0,0,0,.04); display:flex; align-items:center; justify-content:center; cursor:pointer; user-select:none; touch-action:none; transition:box-shadow .2s,transform .15s; font-size:20px; }\
        .fab:active { transform:scale(.92); box-shadow:0 1px 6px 0 rgba(0,0,0,.10); }\
        .fab.spinning { animation:fab-spin .8s linear infinite; }\
        @keyframes fab-spin { to { transform:rotate(360deg); } }\
        .overlay { position:fixed; inset:0; z-index:2147483646; background:rgba(0,0,0,.38); backdrop-filter:blur(2px); -webkit-backdrop-filter:blur(2px); animation:fade-in .2s; }\
        @keyframes fade-in { from { opacity:0; } to { opacity:1; } }\
        .panel { position:fixed; inset:0; z-index:2147483647; display:flex; flex-direction:column; background:#f8f9fc; animation:slide-up .25s cubic-bezier(.16,1,.3,1); }\
        @keyframes slide-up { from { transform:translateY(8%); opacity:0; } to { transform:translateY(0); opacity:1; } }\
        .panel-header { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:16px 20px; padding-top:max(16px,env(safe-area-inset-top)); background:#fff; border-bottom:1px solid #eef0f5; }\
        .panel-header h2 { margin:0; font-size:17px; font-weight:620; color:#1a1a2e; }\
        .panel-close { width:32px; height:32px; border-radius:10px; border:none; background:#f0f1f5; color:#666; font-size:18px; cursor:pointer; display:flex; align-items:center; justify-content:center; }\
        .panel-close:active { background:#e0e1e6; }\
        .panel-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:20px; padding-bottom:max(20px,calc(env(safe-area-inset-bottom)+20px)); }\
        .panel-footer { flex-shrink:0; padding:14px 20px; padding-bottom:max(14px,env(safe-area-inset-bottom)); background:#fff; border-top:1px solid #eef0f5; display:flex; gap:10px; }\
        .field { margin-bottom:18px; }\
        .field label { display:block; margin-bottom:6px; font-size:13px; font-weight:550; color:#555; text-transform:uppercase; letter-spacing:.04em; }\
        .field input,.field select { width:100%; box-sizing:border-box; padding:12px 14px; border:1.5px solid #e0e3eb; border-radius:12px; font-size:15px; background:#fff; color:#1a1a2e; transition:border-color .15s,box-shadow .15s; -webkit-appearance:none; appearance:none; outline:none; }\
        .field input:focus,.field select:focus { border-color:#6c5ce7; box-shadow:0 0 0 3px rgba(108,92,231,.12); }\
        .field select { background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath d=\'M3 4.5l3 3 3-3\' fill=\'none\' stroke=\'%23999\' stroke-width=\'1.5\' stroke-linecap=\'round\'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:right 14px center; padding-right:36px; }\
        .row { display:flex; gap:8px; align-items:flex-end; }\
        .row .field { flex:1; margin-bottom:0; }\
        .btn { padding:12px 18px; border-radius:12px; border:none; font-size:14px; font-weight:580; cursor:pointer; transition:all .15s; white-space:nowrap; display:flex; align-items:center; justify-content:center; gap:6px; }\
        .btn:active { transform:scale(.97); }\
        .btn-primary { flex:1; background:#6c5ce7; color:#fff; box-shadow:0 4px 14px rgba(108,92,231,.25); }\
        .btn-primary:active { background:#5a4bd1; }\
        .btn-secondary { flex:1; background:#f0f1f5; color:#555; }\
        .btn-secondary:active { background:#e0e1e6; }\
        .btn-sm { padding:12px 16px; font-size:13px; border-radius:12px; background:#f0f1f5; color:#555; border:none; cursor:pointer; font-weight:550; transition:all .15s; }\
        .btn-sm:active { background:#e0e1e6; }\
        .status { font-size:12px; margin-top:4px; color:#999; min-height:18px; }\
        .hint { margin-top:20px; padding:14px 16px; background:#f0f1f8; border-radius:12px; font-size:13px; color:#666; line-height:1.6; }\
        .hint strong { color:#6c5ce7; }\
        .ai-fields { display:none; }\
        .ai-fields.show { display:block; }\
        .toast { position:fixed; bottom:32px; left:50%; transform:translateX(-50%); z-index:2147483648; padding:12px 24px; border-radius:14px; background:#1a1a2e; color:#fff; font-size:14px; font-weight:520; box-shadow:0 8px 30px rgba(0,0,0,.18); animation:toast-in .3s cubic-bezier(.16,1,.3,1); pointer-events:none; }\
        @keyframes toast-in { from { opacity:0; transform:translateX(-50%) translateY(12px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }\
        .toast.success { background:#00b894; }\
        .toast.error { background:#e17055; }\
    ';
    root.appendChild(styleEl);

    // ============================================================
    // 2. FLOATING BUTTON
    // ============================================================
    var btn = document.createElement('div');
    btn.className = 'fab';
    btn.textContent = '\uD83C\uDF10';
    var bx = cfg.btnX != null ? cfg.btnX : Math.max(16, window.innerWidth - 64);
    var by = cfg.btnY != null ? cfg.btnY : Math.max(80, window.innerHeight * 0.65);
    btn.style.left = bx + 'px';
    btn.style.top = by + 'px';
    root.appendChild(btn);

    var dragOn = false, hasMoved = false, startX, startY, origX, origY, longTimer;

    function getXY(e) {
        var t = e.touches ? e.touches[0] : e;
        return { x: t.clientX, y: t.clientY };
    }

    btn.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        var p = getXY(e);
        dragOn = true; hasMoved = false;
        startX = p.x; startY = p.y;
        origX = parseInt(btn.style.left); origY = parseInt(btn.style.top);
        longTimer = setTimeout(function () {
            if (!hasMoved) { dragOn = false; openSettings(); }
        }, 500);
    });

    btn.addEventListener('pointermove', function (e) {
        if (!dragOn) return;
        var p = getXY(e);
        if (Math.abs(p.x - startX) > 4 || Math.abs(p.y - startY) > 4) { hasMoved = true; clearTimeout(longTimer); }
        btn.style.left = Math.max(0, Math.min(window.innerWidth - 48, origX + p.x - startX)) + 'px';
        btn.style.top = Math.max(0, Math.min(window.innerHeight - 48, origY + p.y - startY)) + 'px';
    });

    btn.addEventListener('pointerup', function () {
        if (!dragOn) return;
        dragOn = false; clearTimeout(longTimer);
        if (hasMoved) { cfg.btnX = parseInt(btn.style.left); cfg.btnY = parseInt(btn.style.top); saveCfg(); }
        else { performTranslate(); }
    });

    btn.addEventListener('pointercancel', function () { dragOn = false; clearTimeout(longTimer); });

    // ============================================================
    // 3. TOAST
    // ============================================================
    function toast(msg, type) {
        var el = document.createElement('div');
        el.className = 'toast' + (type ? ' ' + type : '');
        el.textContent = msg;
        root.appendChild(el);
        setTimeout(function () { el.remove(); }, 2200);
    }

    // ============================================================
    // 4. API: GM_xmlhttpRequest wrapper
    // ============================================================
    function gmRequest(method, url, headers, body, timeout) {
        timeout = timeout || 30000;
        return new Promise(function (resolve, reject) {
            var opts = {
                method: method, url: url,
                headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
                timeout: timeout,
                onload: function (resp) {
                    try {
                        var data = JSON.parse(resp.responseText);
                        if (resp.status >= 200 && resp.status < 300) resolve(data);
                        else reject(new Error((data && data.error && data.error.message) || 'HTTP ' + resp.status));
                    } catch (e) { reject(new Error('Invalid response')); }
                },
                onerror: function () { reject(new Error('Network error')); },
                ontimeout: function () { reject(new Error('Timeout')); }
            };
            if (body) opts.data = JSON.stringify(body);
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest(opts);
            } else {
                var fo = { method: method, headers: opts.headers };
                if (body) fo.body = opts.data;
                fetch(url, fo).then(function (r) { return r.json(); }).then(resolve).catch(reject);
            }
        });
    }

    // ============================================================
    // 5. MICROSOFT TRANSLATOR (free, no key needed)
    // ============================================================
    var msToken = null, msTokenExpiry = 0;

    async function getMsToken() {
        if (msToken && Date.now() < msTokenExpiry) return msToken;
        return new Promise(function (resolve, reject) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://edge.microsoft.com/translate/auth',
                timeout: 10000,
                onload: function (r) {
                    if (r.status === 200) {
                        msToken = r.responseText;
                        msTokenExpiry = Date.now() + 8 * 60000; // token lasts ~10 min
                        resolve(msToken);
                    } else reject(new Error('MS auth failed: ' + r.status));
                },
                onerror: function () { reject(new Error('MS auth network error')); },
                ontimeout: function () { reject(new Error('MS auth timeout')); }
            });
        });
    }

    async function translateViaMicrosoft(texts) {
        var token = await getMsToken();
        // Microsoft supports array of texts in one call
        var body = texts.map(function (t) { return { Text: t }; });
        var url = 'https://api-edge.cognitive.microsofttranslator.com/translate?from=&to=zh-Hans&api-version=3.0&includeSentenceLength=true';
        var data = await gmRequest('POST', url, { 'Authorization': 'Bearer ' + token }, body, 15000);
        return data.map(function (item) { return item.translations[0].text; });
    }

    // ============================================================
    // 6. AI TRANSLATOR (DeepSeek / OpenAI compatible)
    // ============================================================
    async function translateViaAI(texts) {
        var systemPrompt = 'You are a translator. Translate the following text(s) to Chinese. Return ONLY a JSON array of strings, one per input text. No explanations, no markdown.';
        var body = {
            model: cfg.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: JSON.stringify(texts) }
            ],
            temperature: 0,
            max_tokens: 4096
        };
        var url = cfg.apiBase.replace(/\/+$/, '') + '/chat/completions';
        var data = await gmRequest('POST', url, { 'Authorization': 'Bearer ' + cfg.apiKey }, body, 30000);
        var content = data.choices[0].message.content.trim();
        content = content.replace(/```json|```/g, '').trim();
        try { return JSON.parse(content); }
        catch (_) { return [content]; }
    }

    async function translateBatch(texts) {
        if (cfg.engine === 'microsoft') return translateViaMicrosoft(texts);
        else return translateViaAI(texts);
    }

    // ============================================================
    // 7. MODEL LIST FETCH (AI only)
    // ============================================================
    async function fetchModels(apiBase, apiKey) {
        var url = apiBase.replace(/\/+$/, '') + '/models';
        var data = await gmRequest('GET', url, { 'Authorization': 'Bearer ' + apiKey }, null, 15000);
        return (data.data || []).map(function (m) { return m.id; }).sort();
    }

    // ============================================================
    // 8. TRANSLATION ENGINE — group by block, translate whole sentences
    // ============================================================
    var translationCache = new Map();
    var isTranslating = false;

    var IGNORE_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'SVG', 'IFRAME', 'CANVAS', 'IMG', 'AUDIO', 'VIDEO']);
    var BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'ASIDE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'FIGCAPTION', 'DT', 'DD', 'SUMMARY', 'LEGEND', 'LABEL']);

    function isBlock(el) {
        return BLOCK_TAGS.has(el.tagName);
    }

    function findBlockAncestor(el) {
        var cur = el;
        while (cur && cur !== document.body) {
            if (isBlock(cur)) return cur;
            cur = cur.parentElement;
        }
        return el; // fallback to self
    }

    function shouldTranslate(node) {
        if (node.nodeType !== Node.TEXT_NODE) return false;
        var text = node.nodeValue.trim();
        if (text.length < 2 || /^\d+$/.test(text)) return false;
        var parent = node.parentElement;
        if (!parent) return false;
        if (IGNORE_TAGS.has(parent.tagName)) return false;
        if (parent.closest('.via-tr-done')) return false;
        try {
            var s = getComputedStyle(parent);
            if (s.display === 'none' || s.visibility === 'hidden') return false;
        } catch (_) { }
        return true;
    }

    /** Group text nodes by their block ancestor, merge into full sentences */
    function collectBlocks() {
        var blockMap = new Map();
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while (node = walker.nextNode()) {
            if (!shouldTranslate(node)) continue;
            var parent = node.parentElement;
            var block = findBlockAncestor(parent);
            if (!blockMap.has(block)) blockMap.set(block, []);
            blockMap.get(block).push(node);
        }

        // Build blocks with merged text
        var blocks = [];
        blockMap.forEach(function (nodes, block) {
            var fullText = '';
            nodes.forEach(function (n) { fullText += n.nodeValue; });
            fullText = fullText.trim();
            if (fullText.length > 1) {
                blocks.push({ block: block, nodes: nodes, text: fullText });
            }
        });
        return blocks;
    }

    function applyBlockTranslation(blockData, translation) {
        var block = blockData.block;
        block.classList.add('via-tr-done');

        if (cfg.mode === 'cover') {
            // Replace: keep first text node with translation, clear others
            var first = blockData.nodes[0];
            for (var i = 1; i < blockData.nodes.length; i++) {
                blockData.nodes[i].nodeValue = '';
            }
            first.nodeValue = translation;
        } else {
            // Append: insert translation element after the block
            var span = document.createElement('div');
            span.className = 'via-tr-done';
            span.style.cssText = 'display:block;color:#6c5ce7;font-size:.92em;margin:4px 0 8px;padding:6px 10px;border-left:3px solid #6c5ce7;background:rgba(108,92,231,.04);border-radius:0 8px 8px 0;';
            span.textContent = '\u21B3 ' + translation;
            if (block.nextSibling) {
                block.parentNode.insertBefore(span, block.nextSibling);
            } else {
                block.parentNode.appendChild(span);
            }
        }
    }

    async function performTranslate() {
        if (isTranslating) return;
        if (cfg.engine === 'ai' && !cfg.apiKey) {
            toast('请先设置 AI API Key，或切换到微软翻译（长按按钮进入设置）', 'error');
            return;
        }
        isTranslating = true;
        btn.classList.add('spinning');
        btn.textContent = '\u23F3';

        try {
            var blocks = collectBlocks();
            if (blocks.length === 0) {
                toast('未找到可翻译的内容', 'error');
                return;
            }

            // Deduplicate blocks by text
            var uncached = [];
            var seen = new Set();
            blocks.forEach(function (bd) {
                if (translationCache.has(bd.text)) {
                    applyBlockTranslation(bd, translationCache.get(bd.text));
                } else if (!seen.has(bd.text)) {
                    seen.add(bd.text);
                    uncached.push(bd);
                }
            });

            // Batch translate
            var BATCH_SIZE = cfg.engine === 'microsoft' ? 8 : 5;
            for (var i = 0; i < uncached.length; i += BATCH_SIZE) {
                var batch = uncached.slice(i, i + BATCH_SIZE);
                var texts = batch.map(function (b) { return b.text; });
                try {
                    var results = await translateBatch(texts);
                    texts.forEach(function (t, idx) {
                        var trans = results[idx] || t;
                        translationCache.set(t, trans);
                    });
                    batch.forEach(function (bd) {
                        var trans = translationCache.get(bd.text);
                        if (trans && trans !== bd.text) applyBlockTranslation(bd, trans);
                    });
                } catch (err) {
                    console.error('[VIA Translator] batch error:', err);
                }
                var pct = Math.round((i + batch.length) / uncached.length * 100);
                btn.textContent = pct + '%';
            }

            btn.textContent = '\u2705';
            toast('翻译完成', 'success');
        } catch (err) {
            console.error('[VIA Translator]', err);
            toast('翻译失败: ' + err.message, 'error');
        } finally {
            isTranslating = false;
            btn.classList.remove('spinning');
            setTimeout(function () { btn.textContent = '\uD83C\uDF10'; }, 1800);
        }
    }

    // ============================================================
    // 9. SETTINGS PANEL
    // ============================================================
    function openSettings() {
        var ex = root.querySelector('.panel');
        if (ex) { ex.remove(); var ov = root.querySelector('.overlay'); if (ov) ov.remove(); return; }

        var overlay = document.createElement('div');
        overlay.className = 'overlay';
        root.appendChild(overlay);

        var panel = document.createElement('div');
        panel.className = 'panel';
        panel.innerHTML = '\
            <div class="panel-header">\
                <h2>\u2699\uFE0F 翻译设置</h2>\
                <button class="panel-close" id="vt-close">\u2715</button>\
            </div>\
            <div class="panel-body">\
                <div class="field">\
                    <label>\uD83D\uDE80 翻译引擎</label>\
                    <select id="vt-engine">\
                        <option value="ai"' + (cfg.engine === 'ai' ? ' selected' : '') + '>AI 翻译 (DeepSeek / OpenAI)</option>\
                        <option value="microsoft"' + (cfg.engine === 'microsoft' ? ' selected' : '') + '>微软翻译 (免费 · 开箱即用)</option>\
                    </select>\
                </div>\
                <div class="ai-fields' + (cfg.engine === 'ai' ? ' show' : '') + '" id="vt-ai-fields">\
                    <div class="field">\
                        <label>\uD83D\uDD11 API 密钥</label>\
                        <input type="password" id="vt-key" value="' + esc(cfg.apiKey) + '" placeholder="sk-xxxxxxxxxxxxxxxx">\
                    </div>\
                    <div class="field">\
                        <label>\uD83C\uDF10 API 地址</label>\
                        <input type="text" id="vt-base" value="' + esc(cfg.apiBase) + '" placeholder="https://api.deepseek.com/v1">\
                    </div>\
                    <div class="field">\
                        <label>\uD83E\uDD16 模型</label>\
                        <div class="row">\
                            <div class="field">\
                                <select id="vt-model">\
                                    <option value="' + esc(cfg.model) + '">' + esc(cfg.model) + '</option>\
                                </select>\
                            </div>\
                            <button class="btn-sm" id="vt-fetch">获取列表</button>\
                        </div>\
                        <div class="status" id="vt-model-status"></div>\
                    </div>\
                </div>\
                <div class="field">\
                    <label>\uD83D\uDCDD 翻译模式</label>\
                    <select id="vt-mode">\
                        <option value="cover"' + (cfg.mode === 'cover' ? ' selected' : '') + '>覆盖模式 — 直接替换原文</option>\
                        <option value="append"' + (cfg.mode === 'append' ? ' selected' : '') + '>双语模式 — 原文下方显示译文</option>\
                    </select>\
                </div>\
                <div class="hint">\
                    <strong>\uD83D\uDCA1 使用说明</strong><br>\
                    单击按钮 → 翻译页面<br>\
                    长按按钮 → 打开设置<br>\
                    拖动按钮 → 调整位置<br>\
                    微软翻译：免费，无需配置，开箱即用<br>\
                    AI 翻译：需配置 API Key，质量更优\
                </div>\
            </div>\
            <div class="panel-footer">\
                <button class="btn btn-primary" id="vt-save">\uD83D\uDCBE 保存</button>\
                <button class="btn btn-secondary" id="vt-cancel">取消</button>\
            </div>\
        ';
        root.appendChild(panel);

        var close = function () { panel.remove(); overlay.remove(); };

        panel.querySelector('#vt-close').onclick = close;
        panel.querySelector('#vt-cancel').onclick = close;
        overlay.onclick = close;

        // Engine toggle: show/hide AI fields
        panel.querySelector('#vt-engine').onchange = function () {
            var aiFields = panel.querySelector('#vt-ai-fields');
            if (this.value === 'ai') aiFields.classList.add('show');
            else aiFields.classList.remove('show');
        };

        // Fetch models
        panel.querySelector('#vt-fetch').onclick = async function () {
            var base = panel.querySelector('#vt-base').value.trim();
            var key = panel.querySelector('#vt-key').value.trim();
            var sel = panel.querySelector('#vt-model');
            var st = panel.querySelector('#vt-model-status');
            if (!base || !key) { st.textContent = '\u26A0 请先填写 API 地址和密钥'; st.style.color = '#e17055'; return; }
            st.textContent = '\u23F3 正在获取...'; st.style.color = '#6c5ce7';
            try {
                var models = await fetchModels(base, key);
                sel.innerHTML = '';
                models.forEach(function (m) {
                    var opt = document.createElement('option');
                    opt.value = m; opt.textContent = m;
                    if (m === cfg.model) opt.selected = true;
                    sel.appendChild(opt);
                });
                st.textContent = '\u2705 共 ' + models.length + ' 个可用模型';
                st.style.color = '#00b894';
            } catch (err) {
                st.textContent = '\u274C ' + err.message;
                st.style.color = '#e17055';
            }
        };

        // Save
        panel.querySelector('#vt-save').onclick = function () {
            cfg.engine = panel.querySelector('#vt-engine').value;
            cfg.apiKey = panel.querySelector('#vt-key').value.trim();
            cfg.apiBase = panel.querySelector('#vt-base').value.trim().replace(/\/+$/, '');
            cfg.model = panel.querySelector('#vt-model').value;
            cfg.mode = panel.querySelector('#vt-mode').value;
            saveCfg();
            close();
            toast('设置已保存', 'success');
        };
    }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;');
    }

    // ============================================================
    // 10. INIT
    // ============================================================
    document.body.appendChild(host);
    console.log('%c\uD83C\uDF10 Page AI Translator v2.1 %c已就绪  | 引擎: ' + (cfg.engine === 'microsoft' ? '微软翻译' : 'AI') + ' | 模式: ' + (cfg.mode === 'cover' ? '覆盖' : '双语'), 'color:#6c5ce7;font-weight:bold;', 'color:#666;');
})();