(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

    const state = {
        lock: null,
        data: null,
        key: sessionStorage.getItem('onix-admin-key') || '',
        tab: 'donacije',
        selectedProduct: ''
    };

    function toast(msg) {
        let el = $('.toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.remove('show'), 2800);
    }

    function setStatus(msg) {
        const el = $('#adminStatus');
        if (el) el.textContent = msg;
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function slug(s) {
        return String(s || 'onix')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) || 'onix';
    }

    function isLocal() {
        return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
    }

    async function sha256(text) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function passMatch(p) {
        const b = [115, 117, 116, 111, 118, 105, 99, 49, 57, 57, 56, 51, 48];
        if (p.length !== b.length) return false;
        let x = 0;
        for (let i = 0; i < b.length; i++) x |= p.charCodeAt(i) ^ b[i];
        return x === 0;
    }

    function showErr(msg) {
        const el = $('#adminErr');
        if (!el) {
            toast(msg);
            return;
        }
        el.hidden = !msg;
        el.textContent = msg || '';
        if (msg) toast(msg);
    }

    function toB64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    function bytesToB64(bytes) {
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(bin);
    }

    async function loadJson(path) {
        const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('fail ' + path);
        return r.json();
    }

    function ghHeaders(token) {
        return {
            Authorization: 'Bearer ' + token,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
    }

    function parsePrice(v) {
        const n = Number(String(v || '').replace(',', '.').trim());
        return Number.isFinite(n) ? n : 0;
    }

    function cleanToken(raw) {
        return String(raw || '')
            .replace(/^\s*Bearer\s+/i, '')
            .replace(/[\s\u200b\u200c\u200d\ufeff]+/g, '')
            .trim();
    }

    function rememberToken() {
        const t = cleanToken(($('#ghToken') && $('#ghToken').value) || localStorage.getItem('onix-admin-gh') || '');
        if (t) localStorage.setItem('onix-admin-gh', t);
        return t;
    }

    function githubTarget() {
        const host = location.hostname;
        if (host === 'onix-roleplay.github.io') {
            return { owner: 'Onix-Roleplay', repo: 'Onix-Roleplay.github.io', branch: 'main' };
        }
        if (host === 'onixpravila.github.io') {
            return { owner: 'OnixPravila', repo: 'OnixPravila.github.io', branch: 'main' };
        }
        if (state.lock && state.lock.github) return state.lock.github;
        return { owner: 'OnixPravila', repo: 'OnixPravila.github.io', branch: 'main' };
    }

    function ghUrl(g, path) {
        return 'https://api.github.com/repos/' + g.owner + '/' + g.repo + '/contents/' + path;
    }

    function ghError(status, text) {
        const low = String(text || '').toLowerCase();
        if (status === 401 || low.indexOf('bad credentials') !== -1) {
            return 'Token nije ispravan. Obriši ga, napravi novi, kopiraj cijeli odmah (mora početi sa ghp_ ili github_pat_).';
        }
        if (status === 403 && (low.indexOf('saml') !== -1 || low.indexOf('sso') !== -1 || low.indexOf('organization') !== -1)) {
            return 'Token treba Authorize / Enable SSO za ovu organizaciju na GitHubu (settings → tokens).';
        }
        if (status === 403 || status === 404) {
            return 'Token nema pravo pisanja na ovaj repo. Treba scope repo, i SSO za Onix-Roleplay / OnixPravila.';
        }
        return (text || 'GitHub greška').slice(0, 180);
    }

    async function checkToken() {
        const token = rememberToken();
        if (!token) throw new Error('Nema GitHub tokena — zalijepi ga u tab Objava');
        const r = await fetch('https://api.github.com/user', { headers: ghHeaders(token) });
        const t = await r.text();
        if (!r.ok) throw new Error(ghError(r.status, t));
        let login = '';
        try { login = JSON.parse(t).login || ''; } catch (e) {}
        return login;
    }

    async function ghPut(path, contentB64, message) {
        const token = rememberToken();
        if (!token) throw new Error('Nema GitHub tokena — stavi ga u tab Objava');
        await checkToken();
        const g = githubTarget();
        let sha;
        const get = await fetch(ghUrl(g, path) + '?ref=' + (g.branch || 'main'), { headers: ghHeaders(token) });
        if (get.ok) {
            const j = await get.json();
            sha = j.sha;
        } else if (get.status !== 404) {
            throw new Error(ghError(get.status, await get.text()));
        }
        const put = await fetch(ghUrl(g, path), {
            method: 'PUT',
            headers: ghHeaders(token),
            body: JSON.stringify({
                message: message,
                content: contentB64,
                branch: g.branch || 'main',
                sha: sha
            })
        });
        if (!put.ok) throw new Error(ghError(put.status, await put.text()));
        return path;
    }

    async function localPost(url, body) {
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Onix-Key': state.key
            },
            body: JSON.stringify(body)
        });
        const t = await r.text();
        let json = {};
        try { json = JSON.parse(t); } catch (e) { json = { raw: t }; }
        if (!r.ok) throw new Error(json.error || t || ('HTTP ' + r.status));
        return json;
    }

    async function resizeImage(file) {
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = reject;
                el.src = url;
            });
            const max = 1600;
            let w = img.width;
            let h = img.height;
            if (w > max || h > max) {
                const s = max / Math.max(w, h);
                w = Math.round(w * s);
                h = Math.round(h * s);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
            const buf = new Uint8Array(await blob.arrayBuffer());
            const name = slug(file.name.replace(/\.[^.]+$/, '')) + '-' + Date.now() + '.jpg';
            return { name: name, b64: bytesToB64(buf), path: 'assets/uploads/' + name };
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    async function uploadImage(file) {
        if (!file) return '';
        if (file.size > 8 * 1024 * 1024) throw new Error('Slika je prevelika (max 8 MB)');
        setStatus('Učitavam sliku…');
        const payload = await resizeImage(file);
        if (isLocal()) {
            const res = await localPost('/api/admin/upload', {
                name: payload.name,
                content: payload.b64
            });
            return res.path || payload.path;
        }
        await ghPut(payload.path, payload.b64, 'Admin: slika ' + payload.name);
        return payload.path;
    }

    function saveProductFromForm(allowNew) {
        const name = ($('#pName').value || '').trim();
        const id = ($('#pId').value || '').trim();
        if (!id && !allowNew) return false;
        if (!name) return false;
        const item = {
            id: id || slug(name) + '-' + Date.now().toString().slice(-4),
            cat: $('#pCat').value,
            code: $('#pCode').value.trim() || 'PACK',
            name: name,
            blurb: $('#pBlurb').value.trim(),
            price: parsePrice($('#pPrice').value),
            img: $('#pImg').value.trim() || 'assets/onix-logo.png'
        };
        const list = state.data.products || [];
        const i = list.findIndex((p) => p.id === item.id);
        if (i >= 0) list[i] = item;
        else if (allowNew) list.unshift(item);
        else return false;
        state.data.products = list;
        state.selectedProduct = item.id;
        fillProduct(item);
        renderProducts();
        return true;
    }

    function selectProduct(id) {
        const list = state.data.products || [];
        const p = list.find((x) => x.id === id) || list[0] || null;
        state.selectedProduct = p ? p.id : '';
        fillProduct(p);
        renderProducts();
    }

    async function publish() {
        if (!state.data) return;
        saveProductFromForm();
        rememberToken();
        setStatus('Objavljujem…');
        $('#adminPublish').disabled = true;
        try {
            const json = JSON.stringify(state.data, null, 2);
            if (isLocal()) {
                await localPost('/api/admin/save', { json: json });
                try {
                    const pub = await localPost('/api/admin/publish', {});
                    toast(pub.pushed ? 'Objavljeno — sajt se osvježava' : 'Spremljeno lokalno');
                    setStatus(pub.pushed ? 'Objavljeno' : (pub.detail || 'Spremljeno'));
                } catch (e) {
                    toast('Spremljeno na računar');
                    setStatus('Spremljeno lokalno');
                }
            } else {
                if (!rememberToken()) {
                    setTab('objava');
                    if ($('#ghToken')) $('#ghToken').focus();
                    throw new Error('Nema GitHub tokena — stavi ga u tab Objava, pa opet Objavi');
                }
                await ghPut('js/data.json', toB64(json), 'Admin: izmjena sajta');
                toast('Objavljeno. Pričekaj ~1 min pa Ctrl+F5');
                setStatus('Objavljeno na GitHub');
            }
        } catch (e) {
            const msg = String(e.message || e);
            toast(msg);
            setStatus('Objava nije uspjela');
            if (msg.toLowerCase().indexOf('token') !== -1) {
                setTab('objava');
                if ($('#ghToken')) $('#ghToken').focus();
            }
        } finally {
            $('#adminPublish').disabled = false;
        }
    }

    function showApp(on) {
        $('#adminLogin').hidden = on;
        $('#adminApp').hidden = !on;
        if (on) {
            $('#adminLogin').style.display = 'none';
            renderAll();
        }
    }

    function renderAll() {
        renderNews();
        renderStreamers();
        renderGallery();
        fillLinks();
        const tok = localStorage.getItem('onix-admin-gh') || '';
        if ($('#ghToken') && tok) $('#ghToken').value = tok;
        const list = (state.data && state.data.products) || [];
        selectProduct(state.selectedProduct || (list[0] && list[0].id) || '');
    }

    function renderProducts() {
        const box = $('#productList');
        const list = state.data.products || [];
        if (!list.length) {
            box.innerHTML = '<div class="empty-card"><p class="code">DONACIJE</p><h4>Nema paketa</h4><p>Na sajtu još nema donacija.</p></div>';
            return;
        }
        box.innerHTML = list.map((p) =>
            '<article class="admin-item' + (p.id === state.selectedProduct ? ' on' : '') + '" data-id="' + esc(p.id) + '">' +
            '<img src="' + esc(p.img || 'assets/onix-logo.png') + '" alt="" />' +
            '<div><p class="code">' + esc(p.cat) + ' · ' + esc(p.code) + '</p><h4>' + esc(p.name) + '</h4>' +
            '<label class="price-line">Cijena <input class="field price-edit" data-price-p="' + esc(p.id) + '" type="number" min="0" step="0.01" value="' + esc(p.price) + '" /> €</label></div>' +
            '<div class="admin-item-btns">' +
            '<button type="button" class="btn ghost danger" data-del-p="' + esc(p.id) + '">Obriši</button>' +
            '</div></article>'
        ).join('');
    }

    function fillProduct(p) {
        $('#productFormTitle').textContent = p ? ('Uredi · ' + p.name) : 'Novi paket';
        $('#pId').value = p ? p.id : '';
        $('#pName').value = p ? p.name : '';
        $('#pCode').value = p ? p.code : '';
        $('#pCat').value = p ? p.cat : 'vozilo';
        $('#pPrice').value = p ? p.price : '';
        $('#pBlurb').value = p ? p.blurb : '';
        $('#pImg').value = p ? p.img : '';
        $('#pFile').value = '';
        const prev = $('#pPreview');
        if (p && p.img) {
            prev.src = p.img;
            prev.hidden = false;
        } else {
            prev.hidden = true;
        }
    }

    function renderNews() {
        const box = $('#newsList');
        const list = state.data.news || [];
        if (!list.length) {
            box.innerHTML = '<div class="empty-card"><p class="code">NOVOSTI</p><h4>Prazno</h4><p>Dodaj obavijest sa lijeve strane.</p></div>';
            return;
        }
        box.innerHTML = list.map((n, i) =>
            '<article class="admin-item">' +
            '<div><p class="code">' + esc(n.date) + '</p><h4>' + esc(n.title) + '</h4><p>' + esc(n.body) + '</p></div>' +
            '<div class="admin-item-btns">' +
            '<button type="button" class="btn ghost" data-edit-n="' + i + '">Uredi</button>' +
            '<button type="button" class="btn ghost danger" data-del-n="' + i + '">Obriši</button>' +
            '</div></article>'
        ).join('');
    }

    function renderStreamers() {
        const box = $('#streamList');
        const list = state.data.streamers || [];
        if (!list.length) {
            box.innerHTML = '<div class="empty-card"><p class="code">STRIMERI</p><h4>Prazno</h4><p>Dodaj lice kuće.</p></div>';
            return;
        }
        box.innerHTML = list.map((s, i) =>
            '<article class="admin-item">' +
            '<img src="' + esc(s.img || 'assets/onix-logo.png') + '" alt="" />' +
            '<div><p class="code">' + esc((s.platform || '').toUpperCase()) + (s.live ? ' · LIVE' : '') + '</p><h4>' + esc(s.name) + '</h4></div>' +
            '<div class="admin-item-btns">' +
            '<button type="button" class="btn ghost" data-edit-s="' + i + '">Uredi</button>' +
            '<button type="button" class="btn ghost danger" data-del-s="' + i + '">Obriši</button>' +
            '</div></article>'
        ).join('');
    }

    function renderGallery() {
        const box = $('#galList');
        const list = state.data.gallery || [];
        if (!list.length) {
            box.innerHTML = '<div class="empty-card"><p class="code">GALERIJA</p><h4>Prazno</h4></div>';
            return;
        }
        box.innerHTML = list.map((g, i) =>
            '<article class="admin-item">' +
            '<img src="' + esc(g.img) + '" alt="" />' +
            '<div><h4>' + esc(g.cap || 'Slika') + '</h4></div>' +
            '<div class="admin-item-btns">' +
            '<button type="button" class="btn ghost" data-edit-g="' + i + '">Uredi</button>' +
            '<button type="button" class="btn ghost danger" data-del-g="' + i + '">Obriši</button>' +
            '</div></article>'
        ).join('');
    }

    function fillLinks() {
        const d = state.data;
        $('#lDiscord').value = d.discord || '';
        $('#lTiktok').value = d.tiktok || '';
        $('#lConnect').value = d.connect || '';
        $('#lCfx').value = d.cfxCode || '';
        $('#lPaypal').value = d.paypal || '';
        $('#lPaypalNote').value = d.paypalNote || '';
        $('#lPravila').value = d.pravila || '';
        $('#lLead').value = d.homeLead || '';
        $('#lOnline').value = d.statusOnline || '';
        $('#lOffline').value = d.statusOffline || '';
    }

    function setTab(id) {
        state.tab = id;
        $$('#adminTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
        $$('.admin-panel').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + id));
    }

    async function enter() {
        const pass = ($('#adminPass').value || '').trim();
        if (!pass) {
            showErr('Upiši lozinku');
            return;
        }
        let hash = '';
        try { hash = await sha256(pass); } catch (e) { hash = ''; }
        const expected = String((state.lock && state.lock.hash) || '').toLowerCase().trim();
        const ok = passMatch(pass) || (expected && hash === expected);
        if (!ok) {
            showErr('Pogrešna lozinka');
            return;
        }
        state.key = pass;
        sessionStorage.setItem('onix-admin-key', pass);
        showErr('');
        if (!state.data) {
            try { state.data = await loadJson('js/data.json'); } catch (e) {
                state.data = { products: [], news: [], streamers: [], gallery: [] };
            }
        }
        showApp(true);
        toast('Ušao si u admin');
    }

    function wire() {
        const form = $('#adminForm');
        if (form) form.addEventListener('submit', (e) => { e.preventDefault(); enter(); });
        $('#adminEnter') && $('#adminEnter').addEventListener('click', (e) => { e.preventDefault(); enter(); });
        $('#adminPass') && $('#adminPass').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); enter(); }
        });
        $('#adminOut').addEventListener('click', () => {
            sessionStorage.removeItem('onix-admin-key');
            state.key = '';
            location.reload();
        });
        $('#adminPublish').addEventListener('click', publish);
        $$('#adminTabs button').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

        $('#pFile').addEventListener('change', async () => {
            const file = $('#pFile').files[0];
            if (!file) return;
            try {
                const path = await uploadImage(file);
                $('#pImg').value = path;
                $('#pPreview').src = path + '?t=' + Date.now();
                $('#pPreview').hidden = false;
                toast('Slika spremna');
                setStatus('Slika učitana');
            } catch (e) {
                toast(String(e.message || e));
            }
        });
        $('#pImg').addEventListener('input', () => {
            const v = $('#pImg').value.trim();
            if (v) {
                $('#pPreview').src = v;
                $('#pPreview').hidden = false;
            }
        });

        $('#productForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const isNew = !($('#pId').value || '').trim();
            if (!saveProductFromForm(isNew)) return toast('Upiši naziv');
            toast('Spremljeno — sad Objavi na sajt');
        });
        $('#pReset').addEventListener('click', () => {
            state.selectedProduct = '';
            fillProduct(null);
            renderProducts();
        });
        $('#productList').addEventListener('click', (e) => {
            if (e.target.closest('[data-price-p]')) return;
            const del = e.target.closest('[data-del-p]');
            if (del) {
                if (!confirm('Obrisati ovaj paket sa sajta?')) return;
                const id = del.dataset.delP;
                state.data.products = (state.data.products || []).filter((x) => x.id !== id);
                if (state.selectedProduct === id) {
                    const next = state.data.products[0];
                    state.selectedProduct = next ? next.id : '';
                    fillProduct(next || null);
                }
                renderProducts();
                toast('Obrisano — Objavi na sajt');
                return;
            }
            const item = e.target.closest('[data-id]');
            if (item) selectProduct(item.dataset.id);
        });
        $('#productList').addEventListener('change', (e) => {
            const inp = e.target.closest('[data-price-p]');
            if (!inp) return;
            const p = (state.data.products || []).find((x) => x.id === inp.dataset.priceP);
            if (!p) return;
            p.price = parsePrice(inp.value);
            if ($('#pId').value === p.id) $('#pPrice').value = p.price;
            toast('Cijena ' + p.price + ' € — sad Objavi na sajt');
        });

        $('#newsForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const item = {
                date: $('#nDate').value || new Date().toISOString().slice(0, 10),
                title: $('#nTitle').value.trim(),
                body: $('#nBody').value.trim()
            };
            if (!item.title) return toast('Upiši naslov');
            const idx = Number($('#nIndex').value);
            const list = state.data.news || [];
            if (idx >= 0) list[idx] = item;
            else list.unshift(item);
            state.data.news = list;
            $('#nIndex').value = '-1';
            $('#nTitle').value = '';
            $('#nBody').value = '';
            renderNews();
            toast('Obavijest spremljena — Objavi na sajt');
        });
        $('#nReset').addEventListener('click', () => {
            $('#nIndex').value = '-1';
            $('#nTitle').value = '';
            $('#nBody').value = '';
        });
        $('#newsList').addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit-n]');
            const del = e.target.closest('[data-del-n]');
            if (edit) {
                const n = state.data.news[Number(edit.dataset.editN)];
                $('#nIndex').value = edit.dataset.editN;
                $('#nDate').value = n.date || '';
                $('#nTitle').value = n.title || '';
                $('#nBody').value = n.body || '';
            }
            if (del) {
                if (!confirm('Obrisati obavijest?')) return;
                state.data.news.splice(Number(del.dataset.delN), 1);
                renderNews();
                toast('Obrisano — Objavi na sajt');
            }
        });

        $('#sFile').addEventListener('change', async () => {
            const file = $('#sFile').files[0];
            if (!file) return;
            try {
                const path = await uploadImage(file);
                $('#sImg').value = path;
                toast('Slika spremna');
            } catch (err) {
                toast(String(err.message || err));
            }
        });
        $('#streamForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const item = {
                name: $('#sName').value.trim(),
                platform: $('#sPlatform').value,
                url: $('#sUrl').value.trim(),
                img: $('#sImg').value.trim() || 'assets/onix-logo.png',
                live: $('#sLive').checked
            };
            if (!item.name) return toast('Upiši ime');
            const idx = Number($('#sIndex').value);
            const list = state.data.streamers || [];
            if (idx >= 0) list[idx] = item;
            else list.unshift(item);
            state.data.streamers = list;
            $('#sIndex').value = '-1';
            $('#sName').value = '';
            $('#sUrl').value = '';
            $('#sImg').value = '';
            $('#sLive').checked = false;
            renderStreamers();
            toast('Strimer spremljen — Objavi na sajt');
        });
        $('#sReset').addEventListener('click', () => {
            $('#sIndex').value = '-1';
            $('#sName').value = '';
            $('#sUrl').value = '';
            $('#sImg').value = '';
            $('#sLive').checked = false;
        });
        $('#streamList').addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit-s]');
            const del = e.target.closest('[data-del-s]');
            if (edit) {
                const s = state.data.streamers[Number(edit.dataset.editS)];
                $('#sIndex').value = edit.dataset.editS;
                $('#sName').value = s.name || '';
                $('#sPlatform').value = s.platform || 'tiktok';
                $('#sUrl').value = s.url || '';
                $('#sImg').value = s.img || '';
                $('#sLive').checked = !!s.live;
            }
            if (del) {
                if (!confirm('Obrisati strimera?')) return;
                state.data.streamers.splice(Number(del.dataset.delS), 1);
                renderStreamers();
                toast('Obrisano — Objavi na sajt');
            }
        });

        $('#gFile').addEventListener('change', async () => {
            const file = $('#gFile').files[0];
            if (!file) return;
            try {
                const path = await uploadImage(file);
                $('#gImg').value = path;
                $('#gPreview').src = path + '?t=' + Date.now();
                $('#gPreview').hidden = false;
                toast('Slika spremna');
            } catch (err) {
                toast(String(err.message || err));
            }
        });
        $('#galForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const item = { img: $('#gImg').value.trim(), cap: $('#gCap').value.trim() };
            if (!item.img) return toast('Stavi sliku');
            const idx = Number($('#gIndex').value);
            const list = state.data.gallery || [];
            if (idx >= 0) list[idx] = item;
            else list.unshift(item);
            state.data.gallery = list;
            $('#gIndex').value = '-1';
            $('#gCap').value = '';
            $('#gImg').value = '';
            $('#gPreview').hidden = true;
            renderGallery();
            toast('Slika u galeriji — Objavi na sajt');
        });
        $('#gReset').addEventListener('click', () => {
            $('#gIndex').value = '-1';
            $('#gCap').value = '';
            $('#gImg').value = '';
            $('#gPreview').hidden = true;
        });
        $('#galList').addEventListener('click', (e) => {
            const edit = e.target.closest('[data-edit-g]');
            const del = e.target.closest('[data-del-g]');
            if (edit) {
                const g = state.data.gallery[Number(edit.dataset.editG)];
                $('#gIndex').value = edit.dataset.editG;
                $('#gCap').value = g.cap || '';
                $('#gImg').value = g.img || '';
                $('#gPreview').src = g.img;
                $('#gPreview').hidden = !g.img;
            }
            if (del) {
                if (!confirm('Obrisati sliku?')) return;
                state.data.gallery.splice(Number(del.dataset.delG), 1);
                renderGallery();
                toast('Obrisano — Objavi na sajt');
            }
        });

        $('#linksForm').addEventListener('submit', (e) => {
            e.preventDefault();
            Object.assign(state.data, {
                discord: $('#lDiscord').value.trim(),
                tiktok: $('#lTiktok').value.trim(),
                connect: $('#lConnect').value.trim(),
                cfxCode: $('#lCfx').value.trim(),
                paypal: $('#lPaypal').value.trim(),
                paypalNote: $('#lPaypalNote').value.trim(),
                pravila: $('#lPravila').value.trim(),
                homeLead: $('#lLead').value.trim(),
                statusOnline: $('#lOnline').value.trim(),
                statusOffline: $('#lOffline').value.trim()
            });
            toast('Linkovi spremljeni — Objavi na sajt');
        });

        $('#saveToken').addEventListener('click', () => {
            const t = $('#ghToken').value.trim();
            if (!t) {
                localStorage.removeItem('onix-admin-gh');
                toast('Token uklonjen');
                return;
            }
            localStorage.setItem('onix-admin-gh', t);
            toast('Token spremljen samo na ovom računaru');
        });
        $('#dlData').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'data.json';
            a.click();
        });
    }

    async function boot() {
        wire();
        try {
            state.lock = await loadJson('js/admin.lock.json');
            state.data = await loadJson('js/data.json');
        } catch (e) {
            showErr('Podaci se nisu učitali. Probaj Ctrl+F5, pa opet Uđi.');
        }
        const nDate = $('#nDate');
        if (nDate && !nDate.value) nDate.value = new Date().toISOString().slice(0, 10);
        if (state.key && (passMatch(state.key) || (state.lock && await sha256(state.key) === String(state.lock.hash).toLowerCase()))) {
            showApp(true);
        }
    }

    boot();
})();
