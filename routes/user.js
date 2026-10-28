const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
const Pack = require('../models/Pack');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ablogs_dev_secret';

function auth(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Login required' });
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid session' });
    }
}

router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                balance: user.balance
            }
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/dashboard', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        const orderCount = await Order.countDocuments({ user: user._id });
        const recentOrders = await Order.find({ user: user._id }).sort({ createdAt: -1 }).limit(5);
        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                balance: user.balance
            },
            orderCount,
            recentOrders
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get('/orders', auth, async (req, res) => {
    try {
        const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(100);
        res.json({ orders });
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post('/buy-log', auth, async (req, res) => {
    try {
        const product = await Product.findById(req.body.productId);
        if (!product || product.isActive === false) {
            return res.status(404).json({ error: 'Account not found' });
        }
        let item = null;
        if (req.body.stockItemId) {
            item = product.stockItems.id(req.body.stockItemId);
            if (!item || item.sold) return res.status(400).json({ error: 'That piece is sold out' });
        } else {
            item = product.stockItems.find((s) => !s.sold);
        }
        if (!item) return res.status(400).json({ error: 'Out of stock' });

        const user = await User.findById(req.user.id);
        if (Number(user.balance) < Number(product.price)) {
            return res.status(400).json({ error: 'Insufficient balance. Fund your wallet.' });
        }

        user.balance = Number(user.balance) - Number(product.price);
        await user.save();

        item.sold = true;
        item.soldTo = user._id;
        item.soldAt = new Date();
        await product.save();

        const order = await Order.create({
            user: user._id,
            type: 'log',
            product: product._id,
            title: product.title,
            amount: product.price,
            deliveryInfo: JSON.stringify({
                loginDetails: item.loginDetails || '',
                previewLink: item.previewLink || ''
            }),
            status: 'completed'
        });

        await Transaction.create({
            user: user._id,
            type: 'purchase',
            amount: product.price,
            balanceAfter: user.balance,
            note: 'Log: ' + product.title,
            reference: 'LOG_' + order._id
        });

        res.json({
            ok: true,
            balance: user.balance,
            order: {
                id: order._id,
                title: product.title,
                amount: product.price,
                loginDetails: item.loginDetails || '',
                previewLink: item.previewLink || ''
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Purchase failed' });
    }
});

router.post('/buy-pack', auth, async (req, res) => {
    try {
        const pack = await Pack.findById(req.body.packId);
        if (!pack || pack.isActive === false) return res.status(404).json({ error: 'Pack not found' });
        const user = await User.findById(req.user.id);
        if (Number(user.balance) < Number(pack.price)) {
            return res.status(400).json({ error: 'Insufficient balance. Fund your wallet.' });
        }
        user.balance = Number(user.balance) - Number(pack.price);
        await user.save();

        const order = await Order.create({
            user: user._id,
            type: 'pack',
            pack: pack._id,
            title: pack.title,
            amount: pack.price,
            deliveryInfo: JSON.stringify({
                deliveryLink: pack.deliveryLink || '',
                formatText: pack.formatText || '',
                kind: pack.kind
            }),
            status: 'completed'
        });

        await Transaction.create({
            user: user._id,
            type: 'purchase',
            amount: pack.price,
            balanceAfter: user.balance,
            note: 'Pack: ' + pack.title,
            reference: 'PACK_' + order._id
        });

        res.json({
            ok: true,
            balance: user.balance,
            deliveryLink: pack.deliveryLink || '',
            formatText: pack.formatText || '',
            message: 'Purchase successful'
        });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Purchase failed' });
    }
});

router.put('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        // name, email, phone stay read-only; password only
        if (req.body.password && String(req.body.password).length >= 6) {
            user.password = await bcrypt.hash(String(req.body.password), 10);
            await user.save();
            return res.json({ ok: true, message: 'Password updated' });
        }
        res.json({
            ok: true,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone, balance: user.balance }
        });
    } catch (e) {
        res.status(500).json({ error: 'Update failed' });
    }
});

module.exports = router;
