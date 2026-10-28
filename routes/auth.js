const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ablogs_dev_secret';

function sign(user) {
    return jwt.sign(
        { id: String(user._id), email: user.email, role: user.role || 'user' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

router.post('/signup', async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').toLowerCase().trim();
        const phone = String(req.body.phone || '').replace(/\D/g, '');
        const password = String(req.body.password || '');

        if (!name || !email || password.length < 6) {
            return res.status(400).json({ error: 'Name, email and password (6+ chars) required' });
        }
        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ error: 'Email already registered' });

        const hash = await bcrypt.hash(password, 10);
        const user = await User.create({ name, email, phone, password: hash });
        const token = sign(user);
        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone, balance: user.balance }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Signup failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const email = String(req.body.email || '').toLowerCase().trim();
        const password = String(req.body.password || '');
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
        const token = sign(user);
        res.json({
            token,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone, balance: user.balance }
        });
    } catch (e) {
        res.status(500).json({ error: 'Login failed' });
    }
});

module.exports = router;
