const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Pack = require('../models/Pack');
const SiteSettings = require('../models/SiteSettings');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const category = String(req.query.category || '').trim().toLowerCase();
        const q = String(req.query.q || '').trim();
        const filter = { isActive: { $ne: false } };
        if (category) filter.category = new RegExp('^' + category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
        if (q) {
            filter.$or = [
                { title: new RegExp(q, 'i') },
                { category: new RegExp(q, 'i') },
                { description: new RegExp(q, 'i') }
            ];
        }
        const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
        res.json({
            products: products.map((p) => {
                const left = (p.stockItems || []).filter((s) => !s.sold).length;
                return {
                    _id: String(p._id),
                    id: String(p._id),
                    title: p.title,
                    category: p.category,
                    price: p.price,
                    description: p.description || '',
                    image: p.image || '',
                    stock: left,
                    piecesLeft: left
                };
            })
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load accounts' });
    }
});

router.get('/meta/categories', async (req, res) => {
    try {
        const cats = await Product.distinct('category', { isActive: { $ne: false } });
        let adminCats = [];
        try {
            const settings = await SiteSettings.findOne({ key: 'main' }).lean();
            adminCats = (settings && settings.categories) || [];
        } catch (_) { }
        const set = new Set([...(adminCats || []), ...(cats || []).filter(Boolean)]);
        res.json({ categories: [...set].sort() });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/packs', async (req, res) => {
    try {
        const kind = String(req.query.kind || '').toLowerCase().trim();
        const filter = { isActive: { $ne: false } };
        if (['working', 'tools', 'format'].includes(kind)) filter.kind = kind;
        const items = await Pack.find(filter).sort({ createdAt: -1 }).lean();
        res.json({
            items: items.map((it) => ({
                _id: String(it._id),
                id: String(it._id),
                kind: it.kind,
                title: it.title,
                price: it.price,
                description: it.description || '',
                pictureCount: it.pictureCount || 0,
                videoCount: it.videoCount || 0,
                formatText: it.formatText || '',
                previewImages: it.previewImages || [],
                coverImage: it.coverImage || '',
                deliveryLink: it.deliveryLink || ''
            }))
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load packs' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ error: 'Invalid id' });
        }
        const product = await Product.findById(id).lean();
        if (!product || product.isActive === false) {
            return res.status(404).json({ error: 'Account not found' });
        }
        const available = (product.stockItems || [])
            .filter((s) => !s.sold)
            .map((s, i) => ({
                id: String(s._id),
                index: i + 1,
                previewLink: s.previewLink || ''
            }));
        res.json({
            product: {
                _id: String(product._id),
                id: String(product._id),
                title: product.title,
                category: product.category,
                price: product.price,
                description: product.description || '',
                image: product.image || '',
                stock: available.length,
                accounts: available
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to load account' });
    }
});

module.exports = router;
