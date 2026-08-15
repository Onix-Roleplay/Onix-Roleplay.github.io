(function () {
    const cfg = window.ONIX || {};
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];

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

    function connectHref() {
        const c = String(cfg.connect || '').trim();
        if (!c) return '';
        if (c.startsWith('fivem://') || c.startsWith('http')) return c;
        if (c.includes('cfx.re/join')) return 'https://' + c.replace(/^https?:\/\//, '');
        if (/^[a-z0-9]+$/i.test(c) && c.length <= 12) return 'https://cfx.re/join/' + c;
        return 'fivem://connect/' + c;
    }

    async function loadContent() {
        try {
            const r = await fetch('js/data.json?t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) return;
            const data = await r.json();
            const fallback = window.ONIX || {};
            Object.assign(cfg, fallback, data);
            if (!cfg.products || !cfg.products.length) cfg.products = fallback.products || [];
            if (!cfg.discord) cfg.discord = fallback.discord;
            if (!cfg.paypal) cfg.paypal = fallback.paypal;
        } catch (e) {}
    }

    function applySocialLinks() {
        const map = { discord: cfg.discord, tiktok: cfg.tiktok, pravila: cfg.pravila };
        Object.keys(map).forEach((k) => {
            if (!map[k]) return;
            document.querySelectorAll('[data-link="' + k + '"]').forEach((a) => { a.href = map[k]; });
        });
        const lead = document.querySelector('[data-home="lead"]');
        if (lead && cfg.homeLead) lead.textContent = cfg.homeLead;
        setText('[data-live="connect"]', cfg.connect || 'cfx.re/join/lera5g7');
        const dashConnect = $('#dashConnect');
        if (dashConnect) dashConnect.textContent = cfg.cfxCode || cfg.connect || 'lera5g7';
        if (cfg.name) document.title = document.title.replace(/^ONIX(?: ROLEPLAY)?(?= —|$)/, cfg.name);
    }

    function paypalUrl(product, character) {
        const p = String(cfg.paypal || '').trim();
        if (!p) return '';
        const name = encodeURIComponent((product.name || 'ONIX ROLEPLAY') + (character ? ' — ' + character : ''));
        const amount = Number(product.price) || 0;
        if (/paypal\.me/i.test(p)) {
            const base = p.replace(/\/$/, '');
            const url = base.startsWith('http') ? base : 'https://' + base.replace(/^\/\//, '');
            return url + '/' + amount + 'EUR';
        }
        const email = p.replace(/^mailto:/, '');
        const custom = encodeURIComponent(character || '');
        return 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick' +
            '&business=' + encodeURIComponent(email) +
            '&item_name=' + name +
            '&item_number=' + encodeURIComponent(product.id || '') +
            '&amount=' + amount.toFixed(2) +
            '&currency_code=EUR' +
            '&no_shipping=1' +
            '&charset=utf-8' +
            '&custom=' + custom;
    }

    function renderNav(active) {
        const nav = $('nav.top');
        if (!nav) return;
        nav.innerHTML =
            '<a class="brand" href="index.html"><img src="assets/onix-logo.png" alt="ONIX ROLEPLAY" /><b>ONIX ROLEPLAY</b></a>' +
            '<button type="button" class="burger" id="burger" aria-label="Meni">☰</button>' +
            '<div class="links" id="navLinks">' +
            '<a class="' + (active === 'shop' ? 'active' : '') + '" href="shop.html">Trgovina</a>' +
            '<a class="' + (active === 'stream' ? 'active' : '') + '" href="streameri.html">Strimeri</a>' +
            '<a class="' + (active === 'rules' ? 'active' : '') + '" href="pravila.html">Pravila</a>' +
            '<a class="' + (active === 'dash' ? 'active' : '') + '" href="dashboard.html">Dashboard</a>' +
            (cfg.discord ? '<a class="ext" href="' + cfg.discord + '" target="_blank" rel="noreferrer">Discord</a>' : '') +
            (cfg.tiktok ? '<a class="ext" href="' + cfg.tiktok + '" target="_blank" rel="noreferrer">TikTok</a>' : '') +
            '</div>' +
            '<div class="nav-right">' +
            '<a class="btn dash" href="dashboard.html">Dashboard</a>' +
            (cfg.discord ? '<a class="btn ghost" href="' + cfg.discord + '" target="_blank" rel="noreferrer">Discord</a>' : '') +
            (cfg.tiktok ? '<a class="btn ghost" href="' + cfg.tiktok + '" target="_blank" rel="noreferrer">TikTok</a>' : '') +
            '<button type="button" class="btn gold" data-connect>Poveži se</button>' +
            '</div>';
        const burger = $('#burger');
        const links = $('#navLinks');
        if (burger && links) burger.addEventListener('click', () => links.classList.toggle('open'));
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function getSession() {
        try { return JSON.parse(localStorage.getItem('onix-house') || 'null'); } catch (e) { return null; }
    }

    function setSession(data) {
        localStorage.setItem('onix-house', JSON.stringify(data));
    }

    function clearSession() {
        localStorage.removeItem('onix-house');
    }

    function wireGlobal() {
        document.addEventListener('click', (e) => {
            const need = e.target.closest('[data-need]');
            if (need) {
                const k = need.getAttribute('data-need');
                if (k === 'discord') {
                    if (cfg.discord) window.open(cfg.discord, '_blank', 'noopener');
                    else toast('Stavi Discord link u js/config.js');
                    return;
                }
                if (k === 'tiktok') {
                    if (cfg.tiktok) window.open(cfg.tiktok, '_blank', 'noopener');
                    else toast('Stavi TikTok link u js/config.js');
                    return;
                }
                toast('Popuni polje u config.js');
            }
            if (e.target.closest('[data-connect]')) {
                const href = connectHref();
                if (!href) toast('Stavi IP ili cfx.re link u js/config.js');
                else window.location.href = href;
            }
        });

        const clock = $('.clock time');
        if (clock) {
            const tick = () => {
                const d = new Date();
                clock.textContent = d.toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            };
            tick();
            setInterval(tick, 1000);
        }

        if (window.matchMedia('(pointer: fine)').matches) {
            document.body.classList.add('has-cursor');
            const c = document.createElement('div');
            c.className = 'cursor';
            const r = document.createElement('div');
            r.className = 'cursor-ring';
            document.body.append(c, r);
            let x = 0, y = 0, rx = 0, ry = 0;
            window.addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; c.style.left = x + 'px'; c.style.top = y + 'px'; });
            const loop = () => {
                rx += (x - rx) * .18;
                ry += (y - ry) * .18;
                r.style.left = rx + 'px';
                r.style.top = ry + 'px';
                requestAnimationFrame(loop);
            };
            loop();
            document.addEventListener('pointerover', (e) => {
                if (e.target.closest('a,button,.card,.product')) c.classList.add('big');
            });
            document.addEventListener('pointerout', (e) => {
                if (e.target.closest('a,button,.card,.product')) c.classList.remove('big');
            });
        }
    }

    function setupGate() {
        const gate = $('.gate');
        const video = $('#intro');
        const gateVideo = $('#gateVideo');
        const bgm = $('#bgm');
        const soundBtn = $('#soundBtn');
        if (gateVideo) {
            gateVideo.muted = true;
            gateVideo.playsInline = true;
            const tryPlay = () => gateVideo.play().catch(() => {});
            tryPlay();
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) tryPlay();
            });
        }
        if (!gate) {
            if (video) { video.muted = true; video.play().catch(() => {}); }
            return;
        }
        let on = true;
        const onKey = (e) => {
            if (e.code !== 'Enter' && e.code !== 'Space') return;
            if (!document.body.contains(gate) || gate.classList.contains('hide')) return;
            e.preventDefault();
            start();
        };
        const start = () => {
            if (gate.classList.contains('hide')) return;
            gate.classList.add('hide');
            window.removeEventListener('keydown', onKey);
            if (gateVideo) gateVideo.pause();
            if (video) {
                video.muted = true;
                video.play().catch(() => {});
            }
            if (bgm) {
                bgm.volume = .18;
                bgm.play().catch(() => {});
            }
            setTimeout(() => gate.remove(), 900);
        };
        gate.addEventListener('pointerdown', start);
        window.addEventListener('keydown', onKey);
        if (location.hash === '#enter') start();
        if (soundBtn && bgm) {
            soundBtn.addEventListener('click', () => {
                on = !on;
                soundBtn.textContent = on ? 'Muzika · uklj' : 'Muzika · isklj';
                if (on) { bgm.volume = .18; bgm.play().catch(() => {}); }
                else bgm.pause();
            });
        }
    }

    function productById(id) {
        return (cfg.products || []).find((p) => p.id === id);
    }

    function openModal(product) {
        const modal = $('#buy');
        if (!modal || !product) return;
        const img = $('#buyImg');
        if (img) img.src = product.img || '';
        $('#buyCode').textContent = product.code;
        $('#buyName').textContent = product.name;
        $('#buyBlurb').textContent = product.blurb;
        $('#buyPrice').textContent = product.price + ' €';
        $('#buyNote').textContent = cfg.paypalNote || '';
        modal.dataset.id = product.id;
        modal.classList.add('open');
    }

    function closeModal() {
        const modal = $('#buy');
        if (modal) modal.classList.remove('open');
    }

    function pay() {
        const modal = $('#buy');
        const product = productById(modal && modal.dataset.id);
        if (!product) return;
        const character = ($('#buyChar') && $('#buyChar').value.trim()) || '';
        if (!character) {
            toast('Upiši ime karaktera (IC)');
            const field = $('#buyChar');
            if (field) field.focus();
            return;
        }
        const url = paypalUrl(product, character);
        if (!url) {
            toast('PayPal nije spojen');
            return;
        }
        window.open(url, '_blank', 'noopener');
        toast('PayPal otvoren — zatim ticket na Discord');
    }

    function renderReel() {
        const reel = $('#reel');
        if (!reel) return;
        const cars = (cfg.products || []).filter((p) => p.cat === 'vozilo');
        reel.innerHTML = cars.map((p) =>
            '<a class="card" href="shop.html#' + encodeURIComponent(p.id) + '">' +
            '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" />' +
            '<div class="meta"><p class="code">' + esc(p.code) + '</p><h4>' + esc(p.name) + '</h4><p class="price">' + esc(p.price) + ' €</p></div>' +
            '</a>'
        ).join('');
    }

    function renderOrgs() {
        const box = $('#orgPacks');
        if (!box) return;
        const list = (cfg.products || []).filter((p) => p.cat === 'org' || p.cat === 'premium');
        if (!list.length) {
            box.innerHTML = '<div class="pack"><p class="code">HOUSE</p><h4>Donacije</h4><p>Paketi za organizacije i premium dolaze ovdje kad ih postaviš.</p></div>';
            return;
        }
        box.innerHTML = list.slice(0, 3).map((p) =>
            '<a class="pack" href="shop.html#' + encodeURIComponent(p.id) + '"><p class="code">' + esc(p.code) + '</p><h4>' + esc(p.name) + '</h4><p>' + esc(p.blurb) + '</p><p class="price">' + esc(p.price) + ' €</p></a>'
        ).join('');
    }

    function renderShop() {
        const grid = $('#grid');
        if (!grid) return;
        let filter = 'sve';
        const draw = () => {
            const list = (cfg.products || []).filter((p) => filter === 'sve' || p.cat === filter);
            if (!list.length) {
                grid.innerHTML = '<div class="empty-card wide"><p class="kicker">Trgovina</p><h3>KATALOG SE POPUNJAVA</h3><p>Vozila, premium i donacije dodaješ u admin panelu, sa slikom i cijenom.</p></div>';
                return;
            }
            grid.innerHTML = list.map((p) =>
                '<button type="button" class="product" data-id="' + esc(p.id) + '">' +
                '<img src="' + esc(p.img) + '" alt="' + esc(p.name) + '" />' +
                '<div class="pad"><p class="code">' + esc(p.code) + '</p><h3>' + esc(p.name) + '</h3>' +
                '<div class="row"><span>' + esc(p.blurb) + '</span><b>' + esc(p.price) + ' €</b></div></div></button>'
            ).join('');
        };
        draw();
        $$('.chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                $$('.chip').forEach((c) => c.classList.remove('on'));
                chip.classList.add('on');
                filter = chip.dataset.filter;
                draw();
            });
        });
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.product');
            if (btn) openModal(productById(btn.dataset.id));
        });
        const hash = location.hash.replace('#', '');
        if (hash) {
            const p = productById(hash);
            if (p) openModal(p);
        }
    }

    function wireModal() {
        const modal = $('#buy');
        if (!modal) return;
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
        const x = $('#buyClose');
        if (x) x.addEventListener('click', closeModal);
        const payBtn = $('#buyPay');
        if (payBtn) payBtn.addEventListener('click', pay);
        window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    }

    function renderNews() {
        const box = $('#news');
        if (!box) return;
        const list = cfg.news || [];
        if (!list.length) {
            box.innerHTML = '<article class="empty-card"><p class="code">NOVOSTI</p><h4>Obavijesti dolaze ovdje</h4><p>Dodaješ ih u admin panelu. Izgled ostaje isti.</p></article>';
            return;
        }
        box.innerHTML = list.map((n) =>
            '<article><p class="code">' + esc(n.date) + '</p><h4>' + esc(n.title) + '</h4><p>' + esc(n.body) + '</p></article>'
        ).join('');
    }

    function renderGallery() {
        const box = $('#gallery');
        if (!box) return;
        const list = cfg.gallery || [];
        box.innerHTML = list.map((g) =>
            '<figure><img src="' + esc(g.img) + '" alt="' + esc(g.cap || '') + '" /><figcaption>' + esc(g.cap || '') + '</figcaption></figure>'
        ).join('');
    }

    function renderVideos() {
        const box = $('#videos');
        if (!box) return;
        const list = cfg.videos || [];
        box.innerHTML = list.map((v) =>
            '<article><video controls playsinline poster="' + esc(v.poster || '') + '" src="' + esc(v.src) + '"></video><h4>' + esc(v.title) + '</h4></article>'
        ).join('');
    }

    function renderStreamers() {
        const box = $('#streamers');
        if (!box) return;
        const list = cfg.streamers || [];
        const filter = box.dataset.filter || 'sve';
        const shown = list.filter((s) => filter === 'sve' || s.platform === filter);
        if (!list.length) {
            box.innerHTML = '<div class="empty-card wide"><p class="kicker">Kreatori</p><h3>MJESTA ČEKAJU</h3><p>Strimere dodaješ u admin panelu. Kick, YouTube, TikTok.</p></div>';
            return;
        }
        box.innerHTML = shown.map((s) =>
            '<a class="streamer" href="' + esc(s.url || '#') + '" target="_blank" rel="noreferrer">' +
            (s.img ? '<img src="' + esc(s.img) + '" alt="" />' : '<div class="ph"></div>') +
            '<div><p class="code">' + esc((s.platform || '').toUpperCase()) + (s.live ? ' · LIVE' : '') + '</p>' +
            '<h4>' + esc(s.name) + '</h4></div></a>'
        ).join('');
    }

    function bootDashboard() {
        const login = $('#dashLogin');
        const app = $('#dashApp');
        if (!login || !app) return;

        const paint = () => {
            const s = getSession();
            login.hidden = !!s;
            app.hidden = !s;
            if (!s) return;
            const name = s.name || 'Igrač';
            const ic = s.ic || '—';
            $('#dashHello').textContent = name;
            $('#dashIc').textContent = ic;
            $('#dashSince').textContent = s.since || new Date().toLocaleDateString('bs-BA');
            setPanel('pregled');
        };

        const discordLogin = () => {
            if (cfg.discord) window.open(cfg.discord, '_blank', 'noopener');
            const name = ($('#dashDiscord') && $('#dashDiscord').value.trim()) || 'ONIX član';
            const ic = ($('#dashCharacter') && $('#dashCharacter').value.trim()) || 'Karakter';
            setSession({ name: name, ic: ic, via: 'discord', since: new Date().toLocaleDateString('bs-BA') });
            paint();
            toast('Ušao si u kuću');
        };

        $('#dashEnter') && $('#dashEnter').addEventListener('click', discordLogin);
        $('#dashOut') && $('#dashOut').addEventListener('click', () => { clearSession(); paint(); });
        $$('[data-panel]').forEach((btn) => btn.addEventListener('click', () => setPanel(btn.dataset.panel)));
        paint();
    }

    function setText(sel, text) {
        $$(sel).forEach((el) => { el.textContent = text; });
    }

    async function loadLive() {
        const code = cfg.cfxCode || 'lera5g7';
        const invite = String(cfg.discord || 'wdUntyZzt').replace(/\/$/, '').split('/').pop();
        const out = {
            fivem: { online: false, clients: 0, max: 64, hostname: 'ONIX ROLEPLAY' },
            discord: { members: 0, online: 0, name: 'ONiX Roleplay' }
        };
        const grab = async (url) => {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error('fail');
            return r.json();
        };
        try {
            if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
                const local = await grab('/api/live');
                if (local && (local.fivem || local.discord)) {
                    paintLive(local);
                    return;
                }
            }
        } catch (e) {}
        try {
            const f = await grab('https://frontend.cfx-services.net/api/servers/single/' + code);
            const d = f.Data || f;
            out.fivem.online = true;
            out.fivem.clients = Number(d.clients) || 0;
            out.fivem.max = Number(d.svMaxclients || d.sv_maxclients) || 64;
            out.fivem.hostname = String(d.hostname || out.fivem.hostname).replace(/\^[0-9]/g, '');
        } catch (e) {
            try {
                const f = await grab('https://corsproxy.io/?' + encodeURIComponent('https://frontend.cfx-services.net/api/servers/single/' + code));
                const d = f.Data || f;
                out.fivem.online = true;
                out.fivem.clients = Number(d.clients) || 0;
                out.fivem.max = Number(d.svMaxclients || d.sv_maxclients) || 64;
                out.fivem.hostname = String(d.hostname || out.fivem.hostname).replace(/\^[0-9]/g, '');
            } catch (e2) {}
        }
        try {
            const inv = await grab('https://discord.com/api/v10/invites/' + invite + '?with_counts=true');
            out.discord.members = Number(inv.approximate_member_count) || 0;
            out.discord.online = Number(inv.approximate_presence_count) || 0;
            if (inv.guild && inv.guild.name) out.discord.name = inv.guild.name;
        } catch (e) {
            try {
                const inv = await grab('https://corsproxy.io/?' + encodeURIComponent('https://discord.com/api/v10/invites/' + invite + '?with_counts=true'));
                out.discord.members = Number(inv.approximate_member_count) || 0;
                out.discord.online = Number(inv.approximate_presence_count) || 0;
                if (inv.guild && inv.guild.name) out.discord.name = inv.guild.name;
            } catch (e2) {}
        }
        paintLive(out);
    }

    function paintLive(data) {
        const f = data.fivem || {};
        const d = data.discord || {};
        const fivemTxt = f.online
            ? ('FiveM · ' + f.clients + ' / ' + f.max)
            : 'FiveM · offline';
        const discTxt = d.members
            ? ('Discord · ' + d.online + ' online · ' + d.members + ' članova')
            : 'Discord';
        setText('[data-live="fivem"]', fivemTxt);
        setText('[data-live="discord"]', discTxt);
        setText('[data-live="host"]', f.hostname || 'ONIX ROLEPLAY');
        setText('[data-live="players"]', (f.clients || 0) + ' / ' + (f.max || 64));
        setText('[data-live="members"]', String(d.members || '—'));
        setText('[data-live="d-online"]', String(d.online || '—'));
        const status = $('.status');
        if (status) {
            const dot = status.querySelector('.dot');
            status.innerHTML = '';
            if (dot) status.appendChild(dot);
            const span = document.createElement('span');
            span.textContent = f.online
                ? (cfg.statusOnline || 'Server je na mreži')
                : (cfg.statusOffline || 'Server nije na mreži');
            status.appendChild(span);
            status.classList.toggle('off', !f.online);
        }
        const dashPlayers = $('#dashPlayers');
        if (dashPlayers) dashPlayers.textContent = (f.clients || 0) + ' / ' + (f.max || 64);
        const dashMembers = $('#dashMembers');
        if (dashMembers) dashMembers.textContent = String(d.members || '—');
        const dashOnline = $('#dashOnline');
        if (dashOnline) dashOnline.textContent = String(d.online || '—');
    }

    function setPanel(id) {
        $$('[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === id));
        $$('.d-panel').forEach((p) => p.classList.toggle('on', p.id === 'panel-' + id));
    }

    window.OnixSite = {
        async boot(page) {
            await loadContent();
            applySocialLinks();
            renderNav(page);
            wireGlobal();
            setupGate();
            renderReel();
            renderOrgs();
            renderShop();
            renderNews();
            renderGallery();
            renderVideos();
            renderStreamers();
            wireModal();
            if (page === 'dash') bootDashboard();
            loadLive();
            if (page === 'stream') {
                $$('[data-sfilter]').forEach((chip) => {
                    chip.addEventListener('click', () => {
                        $$('[data-sfilter]').forEach((c) => c.classList.remove('on'));
                        chip.classList.add('on');
                        const box = $('#streamers');
                        if (box) box.dataset.filter = chip.dataset.sfilter;
                        renderStreamers();
                    });
                });
            }
        }
    };
})();
