const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'ablogs_dev_secret';
const TP_PUBLIC = process.env.TRANSACTPAY_PUBLIC_KEY || '';
const TP_ENC = process.env.TRANSACTPAY_ENCRYPTION_KEY || '';
const TP_BASE = 'https://payment-api-service.transactpay.ai';

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

function loadNodeRSA() {
    const mod = require('node-rsa');
    if (typeof mod === 'function') return mod;
    if (mod && typeof mod.default === 'function') return mod.default;
    if (mod && typeof mod.NodeRSA === 'function') return mod.NodeRSA;
    throw new Error('node-rsa load failed');
}

function encryptPayload(obj) {
    const NodeRSA = loadNodeRSA();
    let keyData = TP_ENC;
    try {
        const decoded = Buffer.from(TP_ENC, 'base64').toString('utf8');
        if (decoded.includes('Modulus') || decoded.includes('RSAKeyValue')) keyData = decoded;
    } catch (_) { }

    const key = new NodeRSA();
    if (String(keyData).includes('Modulus')) {
        const modMatch = String(keyData).match(/<Modulus>([^<]+)<\/Modulus>/i);
        const expMatch = String(keyData).match(/<Exponent>([^<]+)<\/Exponent>/i);
        if (modMatch && expMatch) {
            key.importKey(
                {
                    n: Buffer.from(modMatch[1], 'base64'),
                    e: Buffer.from(expMatch[1], 'base64')
                },
                'components-public'
            );
        } else {
            key.importKey(keyData, 'pkcs8-public');
        }
    } else if (String(keyData).includes('BEGIN')) {
        key.importKey(keyData, 'pkcs8-public');
    } else {
        key.importKey(keyData, 'pkcs8-public');
    }
    key.setOptions({ encryptionScheme: 'pkcs1' });
    return key.encrypt(JSON.stringify(obj), 'base64');
}

router.get('/virtual-account', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const va = user.virtualAccount || {};
        if (!va.accountNumber) return res.json({ virtualAccount: null });
        res.json({
            virtualAccount: {
                accountNumber: va.accountNumber,
                accountName: va.accountName || user.name || '',
                bank: va.bank || '',
                bankCode: va.bankCode || '',
                reference: va.reference || ''
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed' });
    }
});

router.post('/virtual-account', auth, async (req, res) => {
    try {
        if (!TP_PUBLIC || !TP_ENC) {
            return res.status(500).json({ error: 'TransactPay keys missing on server' });
        }
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.virtualAccount && String(user.virtualAccount.accountNumber || '').trim()) {
            return res.json({
                reused: true,
                virtualAccount: {
                    accountNumber: user.virtualAccount.accountNumber,
                    accountName: user.virtualAccount.accountName || user.name || '',
                    bank: user.virtualAccount.bank || '',
                    bankCode: user.virtualAccount.bankCode || '',
                    reference: user.virtualAccount.reference || ''
                }
            });
        }

        const phone = String(req.body.phone || user.phone || '').replace(/\D/g, '');
        if (phone.length < 10) {
            return res.status(400).json({ error: 'Valid phone number required' });
        }
        user.phone = phone;
        await user.save();

        const alias = 'ABLOGS_' + user._id.toString().slice(-8);
        const reference = 'VA_' + user._id.toString() + '_' + Date.now();
        const payload = {
            Alias: alias,
            Reference: reference,
            Narration: 'Ablogs wallet ' + user.email
        };

        const encrypted = encryptPayload(payload);
        const response = await axios.post(
            TP_BASE + '/payment/virtual-account/generate',
            { data: encrypted },
            {
                headers: {
                    'api-key': TP_PUBLIC,
                    encryption: 'RSA',
                    'Content-Type': 'application/json'
                },
                timeout: 30000,
                validateStatus: () => true
            }
        );

        const data = response.data || {};
        if (response.status >= 400 || data.status === false) {
            console.error('TransactPay VA error', response.status, data);
            return res.status(502).json({
                error: data.message || 'Could not generate deposit account',
                detail: data
            });
        }

        const accountNumber = String(
            data.accountNumber || data.account_number || data.data?.accountNumber || ''
        ).trim();
        const accountName = String(
            data.accountName || data.account_name || data.data?.accountName || user.name || ''
        ).trim();
        const bank = String(data.bank || data.bank_name || data.data?.bank || '').trim();
        const bankCode = String(data.bankCode || data.bank_code || data.data?.bankCode || '').trim();

        if (!accountNumber) {
            console.error('VA empty', JSON.stringify(data).slice(0, 1500));
            return res.status(502).json({
                error: 'Gateway returned empty account number. Check TransactPay keys.',
                detail: data
            });
        }

        const va = { accountNumber, accountName, bank, bankCode, reference };
        user.virtualAccount = va;
        await user.save();
        res.json({ reused: false, virtualAccount: va });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Virtual account failed' });
    }
});

router.post('/webhook', async (req, res) => {
    try {
        const body = req.body || {};
        console.log('TransactPay webhook', JSON.stringify(body).slice(0, 800));
        const status = String(body.status || body.event || body.data?.status || '').toLowerCase();
        const reference =
            body.reference ||
            body.orderReference ||
            body.data?.reference ||
            body.accountReference ||
            '';
        const amount = Number(body.amount || body.data?.amount || 0);

        if (reference && amount > 0 && /success|paid|completed|credit/i.test(status + ' success')) {
            // Match by VA reference suffix or stored reference
            const users = await User.find({ 'virtualAccount.reference': reference });
            let user = users[0];
            if (!user && reference.includes('_')) {
                const parts = reference.split('_');
                if (parts[1] && parts[1].length === 24) {
                    user = await User.findById(parts[1]);
                }
            }
            if (user) {
                const exists = await Transaction.findOne({ reference: String(reference) + '_' + amount });
                if (!exists) {
                    user.balance = Number(user.balance) + amount;
                    await user.save();
                    await Transaction.create({
                        user: user._id,
                        type: 'deposit',
                        amount,
                        balanceAfter: user.balance,
                        note: 'Wallet funding',
                        reference: String(reference) + '_' + amount
                    });
                }
            }
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(200).json({ ok: true });
    }
});

module.exports = router;
