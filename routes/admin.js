const express = require('express');
const jwt = require('jsonwebtoken');
const Product = require('../models/Product');
const Pack = require('../models/Pack');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ablogs_dev_secret';

async function getAdminCreds() {
    let s = await SiteSettings.findOne({ key: 'main' });
    if (!s) {
        s = await SiteSettings.create({ key: 'main' });
    }
    return {
        username: s.adminUsername || process.env.ADMIN_USERNAME || 'Samuelthetrader',
        password: s.adminPassword || process.env.ADMIN_PASSWORD || 'jerofx',
        pin: s.adminPin || process.env.ADMIN_PIN || '4422',
        settingsPin: s.settingsPin || '7777',
        doc: s
    };
}

function adminAuth(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Admin login required' });
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        req.user = payload;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid admin session' });
    }
}

router.post('/login', async (req, res) => {
    try {
        const username = String(req.body.username || '').trim();
        const password = String(req.body.password || '');
        const pin = String(req.body.pin || '').trim();
        const creds = await getAdminCreds();
        if (username !== creds.username || password !== creds.password) {
            return res.status(401).json({ error: 'Wrong username or password' });
        }
        if (pin && pin !== creds.pin) {
            return res.status(401).json({ error: 'Wrong pin' });
        }
        const token = jwt.sign({ id: 'admin', role: 'admin', username: creds.username }, JWT_SECRET, {
            expiresIn: '7d'
        });
        res.json({ token, username: creds.username });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Login failed' });
    }
});

// Account settings — requires settings pin 7777
router.post('/account-settings', adminAuth, async (req, res) => {
    try {
        const settingsPin = String(req.body.settingsPin || '').trim();
        const creds = await getAdminCreds();
        if (settingsPin !== creds.settingsPin) {
            return res.status(403).json({ error: 'Wrong account settings pin' });
        }
        const s = creds.doc;
        if (req.body.username) s.adminUsername = String(req.body.username).trim();
        if (req.body.password) s.adminPassword = String(req.body.password);
        if (req.body.pin) s.adminPin = String(req.body.pin).trim();
        if (req.body.newSettingsPin) s.settingsPin = String(req.body.newSettingsPin).trim();
        await s.save();
        res.json({
            ok: true,
            username: s.adminUsername,
            message: 'Account settings updated. Use new login next time.'
        });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Update failed' });
    }
});

router.get('/products', adminAuth, async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 }).lean();
        res.json({
            products: products.map((p) => ({
                id: String(p._id),
                title: p.title,
                category: p.category,
                price: p.price,
                description: p.description || '',
                image: p.image || '',
                stockLeft: (p.stockItems || []).filter((s) => !s.sold).length,
                stockTotal: (p.stockItems || []).length,
                isActive: p.isActive !== false
            }))
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

/** Create product + optional stock in one request */
router.post('/products', adminAuth, async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        let category = String(req.body.category || req.body.customCategory || 'other')
            .toLowerCase()
            .trim();
        if (category === 'add' || category === 'custom') {
            category = String(req.body.customCategory || 'other').toLowerCase().trim() || 'other';
        }
        const price = Number(req.body.price);
        if (!title || !(price >= 0)) return res.status(400).json({ error: 'Title and price required' });

        const stockLines = String(req.body.bulkLogins || req.body.loginDetails || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
        const previewLink = String(req.body.previewLink || '');
        const stockItems = stockLines.map((line) => ({
            loginDetails: line,
            previewLink,
            sold: false
        }));

        const product = await Product.create({
            title,
            category,
            price,
            description: req.body.description || '',
            image: req.body.image || '',
            isActive: true,
            stockItems
        });

        res.json({
            product: {
                id: String(product._id),
                title: product.title,
                category: product.category,
                price: product.price,
                stockLeft: stockItems.length
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Create failed' });
    }
});

router.post('/products/:id/stock', adminAuth, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ error: 'Not found' });
        const lines = String(req.body.bulkLogins || req.body.loginDetails || '')
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
        if (!lines.length) return res.status(400).json({ error: 'Add login lines' });
        const previewLink = String(req.body.previewLink || '');
        lines.forEach((line) => {
            product.stockItems.push({ loginDetails: line, previewLink, sold: false });
        });
        await product.save();
        res.json({
            added: lines.length,
            stockLeft: product.stockItems.filter((s) => !s.sold).length
        });
    } catch (e) {
        res.status(500).json({ error: 'Stock add failed' });
    }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

router.post('/packs', adminAuth, async (req, res) => {
    try {
        let kind = String(req.body.kind || 'working').toLowerCase();
        if (!['working', 'tools', 'format'].includes(kind)) kind = 'working';
        const title = String(req.body.title || '').trim();
        const price = Number(req.body.price) || 0;
        if (!title) return res.status(400).json({ error: 'Title required' });
        const previewImages = Array.isArray(req.body.previewImages)
            ? req.body.previewImages.filter(Boolean).slice(0, 3)
            : [];
        const item = await Pack.create({
            kind,
            title,
            price,
            description: req.body.description || '',
            pictureCount: Number(req.body.pictureCount) || 0,
            videoCount: Number(req.body.videoCount) || 0,
            formatText: String(req.body.formatText || ''),
            previewImages,
            coverImage: req.body.coverImage || previewImages[0] || '',
            deliveryLink: req.body.deliveryLink || req.body.telegramLink || '',
            isActive: true
        });
        res.json({ ok: true, item: { id: String(item._id), kind: item.kind, title: item.title, price: item.price } });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Create failed' });
    }
});

router.get('/packs', adminAuth, async (req, res) => {
    try {
        const items = await Pack.find().sort({ createdAt: -1 }).lean();
        res.json({
            items: items.map((it) => ({
                id: String(it._id),
                kind: it.kind,
                title: it.title,
                price: it.price,
                pictureCount: it.pictureCount || 0,
                videoCount: it.videoCount || 0,
                isActive: it.isActive !== false
            }))
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.delete('/packs/:id', adminAuth, async (req, res) => {
    try {
        await Pack.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});


async function getSettings() {
    let doc = await SiteSettings.findOne({ key: 'main' });
    if (!doc) doc = await SiteSettings.create({ key: 'main' });
    return doc;
}

router.get('/categories', adminAuth, async (req, res) => {
    try {
        const doc = await getSettings();
        const fromProducts = await Product.distinct('category');
        const set = new Set([...(doc.categories || []), ...(fromProducts || []).filter(Boolean)]);
        res.json({ categories: [...set].sort() });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/categories', adminAuth, async (req, res) => {
    try {
        const name = String(req.body.name || req.body.category || '')
            .toLowerCase()
            .trim();
        if (!name) return res.status(400).json({ error: 'Category name required' });
        const doc = await getSettings();
        if (!doc.categories.map((c) => c.toLowerCase()).includes(name)) {
            doc.categories.push(name);
            await doc.save();
        }
        res.json({ ok: true, categories: doc.categories });
    } catch (e) {
        res.status(500).json({ error: 'Failed to add category' });
    }
});

router.delete('/categories/:name', adminAuth, async (req, res) => {
    try {
        const name = decodeURIComponent(req.params.name).toLowerCase().trim();
        const doc = await getSettings();
        doc.categories = (doc.categories || []).filter((c) => c.toLowerCase() !== name);
        await doc.save();
        res.json({ ok: true, categories: doc.categories });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});


router.get('/stats', adminAuth, async (req, res) => {
    try {
        const User = require('../models/User');
        const Order = require('../models/Order');
        const Transaction = require('../models/Transaction');

        const [users, orders, completed, failed, depositAgg] = await Promise.all([
            User.countDocuments({}),
            Order.countDocuments({}),
            Order.countDocuments({ status: 'completed' }),
            Order.countDocuments({ status: 'failed' }),
            Transaction.aggregate([
                { $match: { type: 'deposit' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const totalFunded = (depositAgg[0] && depositAgg[0].total) || 0;

        res.json({
            totalFunded,
            users,
            orders,
            successfulOrders: completed,
            failedOrders: failed
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Stats failed' });
    }
});

module.exports = router;
