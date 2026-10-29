const App = (function () {
    function token() {
        return localStorage.getItem('ablogs_token') || '';
    }
    function requireAuth() {
        if (!token()) {
            location.href = '/login';
            return false;
        }
        return true;
    }
    function apiBase() {
        const b = typeof window.ABLOGS_API === 'string' ? window.ABLOGS_API.replace(/\/$/, '') : '';
        return b;
    }
    async function api(path, opts = {}) {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
        if (token()) headers.Authorization = 'Bearer ' + token();
        const url = path.startsWith('http') ? path : apiBase() + path;
        const res = await fetch(url, Object.assign({}, opts, { headers }));
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    const PURCHASE_LABELS = ['Purchase', 'Buy now', 'Get account', 'Order now', 'Purchase randomly', 'Grab deal'];
    function randomPurchaseLabel() {
        return PURCHASE_LABELS[Math.floor(Math.random() * PURCHASE_LABELS.length)];
    }
    function showPageLoader(label) {
        let el = document.getElementById('pageLoader');
        if (!el) {
            el = document.createElement('div');
            el.id = 'pageLoader';
            el.className = 'page-loader';
            el.innerHTML = '<img src="/images/agblogs-logo.jpg" alt="Ablogs" /><p>' + (label || 'Please wait…') + '</p>';
            document.body.appendChild(el);
        } else {
            el.style.display = 'flex';
            const p = el.querySelector('p');
            if (p) p.textContent = label || 'Please wait…';
        }
    }
    function hidePageLoader() {
        const el = document.getElementById('pageLoader');
        if (el) el.remove();
    }
    function money(n) {
        return '₦' + Number(n || 0).toLocaleString();
    }
    function escape(s) {
        return String(s || '').replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }
    function toast(msg) {
        let t = document.getElementById('toast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'toast';
            t.className = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2800);
    }
    function wireDrawer() {
        const drawer = document.getElementById('drawer');
        document.getElementById('btnMenu')?.addEventListener('click', () => drawer?.classList.add('open'));
        document.getElementById('drawerDim')?.addEventListener('click', () => drawer?.classList.remove('open'));
        document.getElementById('navLogout')?.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.clear();
            location.href = '/login';
        });
    }

    async function initLogin() {
        if (token()) return (location.href = '/dashboard');
        const form = document.getElementById('loginForm');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type=submit]');
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            if (btn) {
                btn.disabled = true;
                btn.textContent = '......';
            }
            try {
                const d = await api('/api/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({ email, password })
                });
                localStorage.setItem('ablogs_token', d.token);
                localStorage.setItem('ablogs_user', JSON.stringify(d.user));
                location.href = '/dashboard';
            } catch (err) {
                toast(err.message || 'Login failed');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Login';
                }
            }
        });
    }

    async function initSignup() {
        if (token()) return (location.href = '/dashboard');
        const form = document.getElementById('signupForm');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type=submit]');
            const body = {
                name: document.getElementById('name').value.trim(),
                email: document.getElementById('email').value.trim(),
                phone: document.getElementById('phone').value.trim(),
                password: document.getElementById('password').value
            };
            if (btn) {
                btn.disabled = true;
                btn.textContent = '......';
            }
            try {
                const d = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) });
                localStorage.setItem('ablogs_token', d.token);
                localStorage.setItem('ablogs_user', JSON.stringify(d.user));
                location.href = '/dashboard';
            } catch (err) {
                toast(err.message || 'Signup failed');
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Create account';
                }
            }
        });
    }


    async function showWelcomeModal() {
        if (document.getElementById('welcomeModal')) return;
        let community = '';
        let number = '';
        try {
            const base = (window.ABLOGS_API || '').replace(/\/$/, '');
            const pub = await fetch(base + '/api/admin/site-public').then((r) => r.json());
            community = pub.whatsappCommunity || '';
            number = (pub.whatsappNumber || '').replace(/\D/g, '');
        } catch (_) { }
        if (!community) community = 'https://chat.whatsapp.com/JdTW56VIf5GFo0Rzr5GQoE';
        const waMsg = number ? ('https://wa.me/' + number) : community;
        const overlay = document.createElement('div');
        overlay.id = 'welcomeModal';
        overlay.className = 'welcome-overlay';
        overlay.innerHTML = `
      <div class="welcome-card">
        <button type="button" class="welcome-close" id="welcomeClose">×</button>
        <img src="/images/agblogs-logo.jpg" alt="Ablogs" class="welcome-logo" />
        <h2>Welcome to Ablogs Marketplace</h2>
        <p><strong>Your Trusted Logs Store</strong></p>
        <p class="muted" style="text-align:left;">Stay Connected:<br/>
        - Need help? Reach us on WhatsApp for fast support<br/>
        - Join our community for updates, offers, and deals<br/>
        - We're here to make your log purchases quick and hassle-free</p>
        <p class="muted" style="font-size:.8rem;word-break:break-all;">Join community:<br/>${community}</p>
        <a class="btn" href="${community}" target="_blank" rel="noopener" style="display:block;text-align:center;margin-bottom:8px;background:#0d9488!important;">Join community</a>
        <a class="btn" href="${waMsg}" target="_blank" rel="noopener" style="display:block;text-align:center;background:#22c55e!important;">Message us on WhatsApp</a>
      </div>`;
        document.body.appendChild(overlay);
        document.getElementById('welcomeClose').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    async function initDashboard() {
        if (!requireAuth()) return;
        document.getElementById('btnLogout')?.addEventListener('click', () => {
            localStorage.clear();
            location.href = '/login';
        });
        try {
            const d = await api('/api/user/dashboard');
            const u = d.user;
            localStorage.setItem('ablogs_user', JSON.stringify(u));
            const first = (u.name || 'User').split(' ')[0];
            const el = document.getElementById('userFirst');
            if (el) el.textContent = first;
            const bal = document.getElementById('walletBal');
            if (bal) bal.textContent = money(u.balance);
            try {
                localStorage.setItem('ablogs_user_cache', JSON.stringify({ first: first, balance: u.balance }));
            } catch (_) { }
            const oc = document.getElementById('orderCount');
            if (oc) oc.textContent = d.orderCount || 0;
            const stLife = document.getElementById('stLife');
            if (stLife) stLife.textContent = money(d.lifetimeDeposit || d.totalFunded || 0);
            const stOrders = document.getElementById('stOrders');
            if (stOrders) stOrders.textContent = String(d.orderCount || 0);
            const stFunded = document.getElementById('stFunded');
            if (stFunded) stFunded.textContent = money(d.totalFunded || d.lifetimeDeposit || 0);
            // whatsapp community link
            try {
                const pub = await fetch((window.ABLOGS_API || '').replace(/\/$/, '') + '/api/admin/site-public').then((r) => r.json());
                const wa = document.getElementById('waCommunityLink');
                if (wa && pub.whatsappCommunity) {
                    wa.href = pub.whatsappCommunity;
                    wa.style.display = '';
                    wa.target = '_blank';
                }
            } catch (_) { }
            if (oc) oc.textContent = d.orderCount || 0;
        } catch (e) {
            if (/Login|session/i.test(e.message)) {
                localStorage.clear();
                location.href = '/login';
            }
        }
    }

    async function initAccounts() {
        if (!requireAuth()) return;
        showPageLoader('Loading accounts…');
        const market = document.getElementById('acctMarket');
        let balance = 0;
        let all = [];

        const ICONS = {
            tiktok: '🎵', facebook: '📘', instagram: '📸', vpn: '🔒',
            gmail: '📧', hotmail: '✉️', reddit: '🤖', icloud: '☁️',
            proxy: '🌐', mail: '📧', textplus: '💬', chatgpt: '🤖', other: '📦'
        };
        function iconFor(cat, title) {
            const t = ((cat || '') + ' ' + (title || '')).toLowerCase();
            for (const k of Object.keys(ICONS)) if (t.includes(k)) return ICONS[k];
            return '📦';
        }
        function sectionLabel(cat) {
            const c = String(cat || 'other').trim();
            return (c.toUpperCase() + (c.toLowerCase().includes('account') ? '' : ' ACCOUNTS')).replace(/\s+/g, ' ');
        }

        function render(list) {
            if (!market) return;
            if (!list.length) {
                hidePageLoader();
                market.innerHTML = '<p class="muted">No logs yet — admin must add products</p>';
                return;
            }
            const groups = {};
            list.forEach((p) => {
                const cat = (p.category || 'other').toLowerCase();
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(p);
            });
            const order = Object.keys(groups).sort();
            market.innerHTML = order
                .map((cat) => {
                    const cards = groups[cat]
                        .map((p) => {
                            const left = Number(p.piecesLeft != null ? p.piecesLeft : p.stock) || 0;
                            const sold = left <= 0;
                            const ico = p.image
                                ? '<img src="' + escape(p.image) + '" alt="" />'
                                : iconFor(p.category, p.title);
                            return `
            <div class="prod-card">
              <div class="prod-top">
                <div class="prod-ico">${ico}</div>
                <div class="prod-body">
                  <h3>${escape(p.title)}</h3>
                  <div class="prod-meta">
                    <span class="prod-price">${money(p.price)}</span>
                    <span class="prod-pcs">${left}pcs</span>
                  </div>
                </div>
              </div>
              <div class="prod-actions">
                <a class="btn-out" href="/account?id=${p._id || p.id}" class="btn-view-acc">View account</a>
                <button type="button" class="btn-buy ${sold ? 'sold' : ''}" data-id="${p._id || p.id}" data-price="${p.price}" ${sold ? 'disabled' : ''}>
                  ${sold ? 'Sold out' : randomPurchaseLabel()}
                </button>
              </div>
            </div>`;
                        })
                        .join('');
                    return `<div class="section-title">${escape(sectionLabel(cat))}</div>${cards}`;
                })
                .join('');

            market.querySelectorAll('.btn-share').forEach((btn) => {
                btn.onclick = () => {
                    const text = btn.getAttribute('data-share') || 'Ablogs log';
                    if (navigator.share) navigator.share({ title: text, text }).catch(() => { });
                    else {
                        navigator.clipboard?.writeText(text);
                        toast('Copied');
                    }
                };
            });
            market.querySelectorAll('.btn-buy:not(.sold)').forEach((btn) => {
                btn.onclick = async () => {
                    const price = Number(btn.getAttribute('data-price'));
                    if (balance < price) return toast('Fund your wallet first');
                    btn.disabled = true;
                    btn.textContent = '......';
                    try {
                        const r = await api('/api/user/buy-log', {
                            method: 'POST',
                            body: JSON.stringify({ productId: btn.getAttribute('data-id') })
                        });
                        balance = Number(r.balance);
                        const bp = document.getElementById('balPill');
                        if (bp) bp.textContent = money(balance);
                        const wb = document.getElementById('walletBal');
                        if (wb) wb.textContent = money(balance);
                        toast('Purchased — opening Order History'); setTimeout(() => { location.href = '/history'; }, 600);
                        if (r.order?.loginDetails) {
                            try {
                                await navigator.clipboard.writeText(r.order.loginDetails);
                                toast('Login details copied');
                            } catch (_) { }
                        }
                        // refresh list stock
                        const data = await api('/api/products');
                        all = data.products || [];
                        applyFilter();
                    } catch (e) {
                        toast(e.message);
                        btn.disabled = false;
                        btn.textContent = randomPurchaseLabel();
                    }
                };
            });
        }

        function applyFilter() {
            const q = (document.getElementById('searchAcct')?.value || '').toLowerCase();
            const cat = (document.getElementById('filterCat')?.value || '').toLowerCase();
            let list = all;
            if (cat) list = list.filter((p) => (p.category || '').toLowerCase() === cat);
            if (q) list = list.filter((p) => (p.title + ' ' + p.category + ' ' + (p.description || '')).toLowerCase().includes(q));
            render(list);
        }

        try {
            const dash = await api('/api/user/dashboard');
            balance = Number(dash.user.balance || 0);
            const bp = document.getElementById('balPill');
            if (bp) bp.textContent = money(balance);
            const wb = document.getElementById('walletBal');
            if (wb) wb.textContent = money(balance);
            const data = await api('/api/products');
            all = data.products || [];
            const sel = document.getElementById('filterCat');
            if (sel) {
                let cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
                try {
                    const meta = await api('/api/products/meta/categories');
                    (meta.categories || []).forEach((c) => { if (c && !cats.includes(c)) cats.push(c); });
                } catch (_) { }
                cats.sort();
                sel.innerHTML = '<option value="">All categories</option>';
                cats.forEach((c) => {
                    const o = document.createElement('option');
                    o.value = c;
                    o.textContent = c.charAt(0).toUpperCase() + c.slice(1);
                    sel.appendChild(o);
                });
                sel.onchange = applyFilter;
            }
            document.getElementById('searchAcct')?.addEventListener('input', applyFilter);
            applyFilter();
        } catch (e) {
            if (market) market.innerHTML = '<p class="muted">Could not load</p>';
        }
    }

    async function initAccount() {
        if (!requireAuth()) return;
        showPageLoader('Loading account…');
        const id = new URLSearchParams(location.search).get('id') || '';
        const box = document.getElementById('detailBox');
        if (!id) {
            if (box) box.innerHTML = '<p class="muted">No account selected</p>';
            return;
        }
        try {
            const dash = await api('/api/user/dashboard');
            let balance = Number(dash.user.balance || 0);
            const bp = document.getElementById('balPill');
            if (bp) bp.textContent = money(balance);
            const wb = document.getElementById('walletBal');
            if (wb) wb.textContent = money(balance);
            const d = await api('/api/products/' + encodeURIComponent(id));
            const p = d.product;
            const accounts = p.accounts || [];
            box.innerHTML = `
        <div class="card">
          <h2>${escape(p.title)}</h2>
          <p class="muted">${escape(p.category)} · ${money(p.price)} · ${p.stock} left</p>
          <p>${escape(p.description || '')}</p>
        </div>
        <div class="card">
          <strong>Available pieces</strong>
          <div id="pieceList">
            ${accounts.length
                    ? accounts
                        .map(
                            (a) => `
              <div class="list-row row-between">
                <span>#${a.index}${a.previewLink ? ' · <a href="' + escape(a.previewLink) + '" target="_blank" rel="noopener">View</a>' : ''}</span>
                <button type="button" class="btn-out btn-buy" data-sid="${a.id}" data-price="${p.price}">Buy</button>
              </div>`
                        )
                        .join('')
                    : '<p class="muted">Out of stock</p>'
                }
          </div>
        </div>`;
            box.querySelectorAll('.btn-buy').forEach((btn) => {
                btn.onclick = async () => {
                    if (balance < Number(btn.dataset.price)) return toast('Fund your wallet first');
                    btn.disabled = true;
                    btn.textContent = '......';
                    try {
                        const r = await api('/api/user/buy-log', {
                            method: 'POST',
                            body: JSON.stringify({ productId: p._id || p.id, stockItemId: btn.dataset.sid })
                        });
                        balance = Number(r.balance);
                        if (bp) bp.textContent = money(balance);
                        toast('Purchased — opening Order History'); setTimeout(() => { location.href = '/history'; }, 600);
                        btn.textContent = 'Bought';
                        if (r.order?.loginDetails) alert('Login details:\n' + r.order.loginDetails);
                    } catch (e) {
                        toast(e.message);
                        btn.disabled = false;
                        btn.textContent = 'Buy';
                    }
                };
            });
        } catch (e) {
            if (box) box.innerHTML = '<p class="muted">' + escape(e.message) + '</p>';
        }
    }

    async function initHistory() {
        if (!requireAuth()) return;
        showPageLoader('Loading history…');
        const box = document.getElementById('historyBox');
        try {
            const d = await api('/api/user/orders');
            const orders = d.orders || [];
            if (!box) return;
            hidePageLoader();
            box.innerHTML =
                orders
                    .map((o, idx) => {
                        let delivery = '';
                        let link = '';
                        let formatText = '';
                        try {
                            const info = JSON.parse(o.deliveryInfo || '{}');
                            delivery = info.loginDetails || '';
                            link = info.deliveryLink || info.previewLink || '';
                            formatText = info.formatText || '';
                        } catch (_) {
                            delivery = o.deliveryInfo || '';
                        }
                        const payload = delivery || formatText || link;
                        return `<div class="list-row">
              <strong>${escape(o.title || o.type)}</strong>
              <div class="muted">${new Date(o.createdAt).toLocaleString()} · ${money(o.amount)}</div>
              ${payload ? `<div class="login-delivery" id="ord-${idx}">${escape(payload)}</div>
              <button type="button" class="btn-out btn-copy" data-idx="${idx}" style="margin-top:8px;width:auto;">Copy login</button>` : ''}
            </div>`;
                    })
                    .join('') || '<p class="muted">No orders yet</p>';
            box.querySelectorAll('.btn-copy').forEach((btn) => {
                btn.onclick = async () => {
                    const el = document.getElementById('ord-' + btn.getAttribute('data-idx'));
                    const text = el ? el.textContent : '';
                    try {
                        await navigator.clipboard.writeText(text);
                        toast('Login copied');
                    } catch (_) {
                        toast(text);
                    }
                };
            });
        } catch (e) {
            if (box) box.innerHTML = '<p class="muted">Could not load</p>';
        }
    }

    async function initPacks(kind) {
        if (!requireAuth()) return;
        showPageLoader('Loading packs…');
        const k = kind || 'working';
        const grid = document.getElementById('packGrid');
        showPageLoader('Please wait…');
        if (grid) grid.innerHTML = '<p class="muted">Please wait…</p>';
        try {
            const dash = await api('/api/user/dashboard');
            let balance = Number(dash.user.balance || 0);
            const bp = document.getElementById('balPill');
            if (bp) bp.textContent = money(balance);
            const wb = document.getElementById('walletBal');
            if (wb) wb.textContent = money(balance);
            const d = await api('/api/products/packs?kind=' + encodeURIComponent(k));
            const items = d.items || [];
            if (!grid) return;
            showPageLoader('Please wait…');
            if (grid) grid.innerHTML = '<p class="muted">Please wait…</p>';
            // load
            grid.innerHTML =
                items
                    .map((it) => {
                        const imgs = (it.previewImages && it.previewImages.length
                            ? it.previewImages
                            : it.coverImage
                                ? [it.coverImage]
                                : []
                        ).slice(0, 3);
                        const meta = [];
                        if (it.pictureCount) meta.push(it.pictureCount + ' pics');
                        if (it.videoCount) meta.push(it.videoCount + ' videos');
                        return `<div class="card">
              <div class="preview-row">
                ${imgs.map((src) => `<img src="${escape(src)}" alt="" />`).join('') || '<span class="muted">No preview</span>'}
              </div>
              <h3 style="margin:0 0 6px;">${escape(it.title)}</h3>
              ${meta.length ? `<p class="muted" style="margin:0 0 8px;">${escape(meta.join(' · '))}</p>` : ''}
              <div class="row-between">
                <strong>${money(it.price)}</strong>
                <button type="button" class="btn-out btn-buy-pack" data-id="${it._id || it.id}" data-price="${it.price}">Buy</button>
              </div>
            </div>`;
                    })
                    .join('') || '<p class="muted">No packs yet</p>';
            grid.querySelectorAll('.btn-buy-pack').forEach((btn) => {
                btn.onclick = async () => {
                    if (balance < Number(btn.dataset.price)) return toast('Fund your wallet first');
                    btn.disabled = true;
                    btn.textContent = '......';
                    try {
                        const r = await api('/api/user/buy-pack', {
                            method: 'POST',
                            body: JSON.stringify({ packId: btn.dataset.id })
                        });
                        balance = Number(r.balance);
                        if (bp) bp.textContent = money(balance);
                        toast(r.message || 'Purchased'); setTimeout(() => { location.href = '/history'; }, 600);
                        if (r.deliveryLink) setTimeout(() => window.open(r.deliveryLink, '_blank'), 400);
                        else if (r.formatText) toast('Format saved to History — open to copy');
                        btn.textContent = 'Bought';
                    } catch (e) {
                        toast(e.message);
                        btn.disabled = false;
                        btn.textContent = 'Buy';
                    }
                };
            });
        } catch (e) {
            if (grid) grid.innerHTML = '<p class="muted">Could not load</p>';
        }
    }

    async function initWallet() {
        if (!requireAuth()) return;
        try {
            const dash = await api('/api/user/dashboard');
            const bal = document.getElementById('walletBal');
            if (bal) bal.textContent = money(dash.user.balance);
            if (dash.user.phone) {
                const ph = document.getElementById('vaPhone');
                if (ph && !ph.value) ph.value = dash.user.phone;
            }
            const saved = await api('/api/payments/virtual-account');
            if (saved.virtualAccount?.accountNumber) showVa(saved.virtualAccount);
        } catch (_) { }

        function showVa(va) {
            const box = document.getElementById('vaBox');
            if (!box) return;
            box.style.display = 'block';
            box.innerHTML = `
        <p><strong>Account name:</strong> ${escape(va.accountName || '')}</p>
        <p><strong>Account number:</strong> <span style="font-size:1.2rem;font-weight:800;letter-spacing:1px;">${escape(va.accountNumber || '')}</span></p>
        <p><strong>Bank:</strong> ${escape(va.bank || '')}</p>
        <p class="muted">This account is permanent for your login. Transfer any amount — wallet credits after confirmation.</p>`;
        }

        document.getElementById('btnCreateVA')?.addEventListener('click', async () => {
            const btn = document.getElementById('btnCreateVA');
            const phone = (document.getElementById('vaPhone')?.value || '').trim();
            if (!phone || phone.replace(/\D/g, '').length < 10) return toast('Enter a valid phone number');
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = '......';
            try {
                const r = await api('/api/payments/virtual-account', {
                    method: 'POST',
                    body: JSON.stringify({ phone })
                });
                const va = r.virtualAccount;
                if (!va?.accountNumber) throw new Error(r.error || 'Empty account from gateway');
                showVa(va);
                toast(r.reused ? 'Your permanent deposit account' : 'Deposit account ready');
            } catch (e) {
                toast(e.message || 'Could not get account');
            } finally {
                btn.disabled = false;
                btn.textContent = prev;
            }
        });
    }

    async function initProfile() {
        if (!requireAuth()) return;
        try {
            const d = await api('/api/user/me');
            const u = d.user;
            document.getElementById('pName').value = u.name || '';
            document.getElementById('pEmail').value = u.email || '';
            document.getElementById('pPhone').value = u.phone || '';
        } catch (_) { }
        document.getElementById('btnSavePass')?.addEventListener('click', async () => {
            const password = document.getElementById('pPass').value;
            if (!password || password.length < 6) return toast('Password must be 6+ characters');
            try {
                await api('/api/user/profile', { method: 'PUT', body: JSON.stringify({ password }) });
                toast('Password updated');
                document.getElementById('pPass').value = '';
            } catch (e) {
                toast(e.message);
            }
        });
    }


    async function initTransactions() {
        if (!requireAuth()) return;
        showPageLoader('Loading transactions…');
        const box = document.getElementById('txBox');
        try {
            const d = await api('/api/user/transactions');
            const items = d.items || [];
            hidePageLoader();
            box.innerHTML = items.length
                ? items.map((t) => `
          <div class="list-row">
            <strong>${escape(t.type || 'tx')}</strong>
            <div class="muted">${new Date(t.createdAt).toLocaleString()}</div>
            <div style="margin-top:4px;">${money(t.amount)} · bal ${money(t.balanceAfter)}</div>
            ${t.note ? `<div class="muted" style="font-size:.8rem;">${escape(t.note)}</div>` : ''}
          </div>`).join('')
                : '<p class="muted">No transactions yet</p>';
        } catch (e) {
            if (box) box.innerHTML = '<p class="muted">' + escape(e.message) + '</p>';
        }
    }

    return {
        initLogin,
        initSignup,
        initDashboard,
        initAccounts,
        initAccount,
        initHistory,
        initTransactions,
        initPacks,
        initWallet,
        initProfile,
        toast,
        api
    };
})();
