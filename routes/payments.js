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

async function creditUser(user, amount, reference, note) {
    const amt = Number(amount);
    if (!user || !(amt > 0)) return { credited: false, reason: 'invalid' };
    const ref = String(reference || ('DEP_' + user._id + '_' + Date.now()));
    const exists = await Transaction.findOne({ reference: ref });
    if (exists) return { credited: false, reason: 'duplicate', balance: user.balance };
    user.balance = Number(user.balance || 0) + amt;
    await user.save();
    await Transaction.create({
        user: user._id,
        type: 'deposit',
        amount: amt,
        balanceAfter: user.balance,
        note: note || 'Wallet funding',
        reference: ref
    });
    return { credited: true, balance: user.balance };
}

function dig(obj, paths) {
    for (const path of paths) {
        let cur = obj;
        let ok = true;
        for (const key of path.split('.')) {
            if (cur == null) {
                ok = false;
                break;
            }
            cur = cur[key];
        }
        if (ok && cur !== undefined && cur !== null && cur !== '') return cur;
    }
    return '';
}

router.post('/webhook', async (req, res) => {
    try {
        const body = req.body || {};
        console.log('TransactPay webhook RAW', JSON.stringify(body).slice(0, 4000));

        const status = String(
            dig(body, [
                'status',
                'statusCode',
                'transactionStatus',
                'event',
                'payment_status',
                'data.status',
                'data.statusCode'
            ])
        ).toLowerCase();

        // TransactPay success: status "Success", statusCode "00"
        const failed =
            status &&
            /fail|failed|reject|declined|cancel|error/i.test(status) &&
            status !== '00' &&
            !/success/i.test(status);
        if (failed) {
            return res.status(200).json({ ok: true, skipped: 'failed status', status });
        }

        // Amount: TransactPay uses totalAmountCharged
        let amount = Number(
            dig(body, [
                'totalAmountCharged',
                'amount',
                'settled_amount',
                'transaction_amount',
                'paid_amount',
                'data.totalAmountCharged',
                'data.amount'
            ]) || 0
        );
        if (!amount && body.totalAmountCharged != null) {
            amount = Number(String(body.totalAmountCharged).replace(/,/g, ''));
        }
        if (!amount && body.amount != null) {
            amount = Number(String(body.amount).replace(/,/g, ''));
        }

        const accountNumber = String(
            dig(body, [
                'account_number',
                'accountNumber',
                'destinationAccountNUBAN',
                'virtualAccountNumber',
                'destinationAccountNumber',
                'data.account_number',
                'data.accountNumber',
                'data.destinationAccountNUBAN'
            ])
        ).replace(/\D/g, '');

        const reference = String(
            dig(body, [
                'paymentReference',
                'transactionReference',
                'reference',
                'sessionId',
                'session_id',
                'orderReference',
                'accountReference',
                'data.paymentReference',
                'data.reference'
            ])
        );

        const narration = String(dig(body, ['narration', 'Narration', 'data.narration']) || '');
        // We set Narration: "Ablogs wallet user@email.com" on VA create
        let emailFromNarration = '';
        const emailMatch = narration.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) emailFromNarration = emailMatch[0].toLowerCase();

        if (!(amount > 0)) {
            console.error('Webhook no amount', { keys: Object.keys(body) });
            return res.status(200).json({ ok: true, skipped: 'no amount' });
        }

        let user = null;

        // 1) by email in narration (most reliable for TransactPay Account Funding)
        if (emailFromNarration) {
            user = await User.findOne({ email: emailFromNarration });
            console.log('Webhook match email', emailFromNarration, !!user);
        }

        // 2) by virtual account number
        if (!user && accountNumber) {
            user = await User.findOne({ 'virtualAccount.accountNumber': accountNumber });
            if (!user) {
                const all = await User.find({ 'virtualAccount.accountNumber': { $exists: true, $ne: '' } }).limit(500);
                user =
                    all.find((u) =>
                        String(u.virtualAccount.accountNumber || '')
                            .replace(/\D/g, '')
                            .endsWith(accountNumber.slice(-10))
                    ) || null;
            }
        }

        // 3) by stored VA reference
        if (!user && reference) {
            user = await User.findOne({ 'virtualAccount.reference': reference });
            const parts = String(reference).split(/[_-]/);
            for (const part of parts) {
                if (part && part.length === 24) {
                    try {
                        user = await User.findById(part);
                    } catch (_) { }
                    if (user) break;
                }
            }
        }

        if (!user) {
            console.error('Webhook user not found', {
                accountNumber,
                reference,
                amount,
                emailFromNarration,
                narration: narration.slice(0, 120)
            });
            return res.status(200).json({
                ok: true,
                matched: false,
                accountNumber,
                reference,
                emailFromNarration
            });
        }

        const refKey =
            String(reference || accountNumber || emailFromNarration || 'NA') +
            '_' +
            amount +
            '_' +
            String(dig(body, ['sessionId', 'session_id', 'datePaymentConfirmed']) || '');

        const result = await creditUser(
            user,
            amount,
            refKey || 'WH_' + Date.now() + '_' + amount,
            'Wallet funding (webhook)'
        );
        console.log('Webhook credit result', {
            userId: String(user._id),
            email: user.email,
            amount,
            result
        });
        return res.status(200).json({ ok: true, matched: true, ...result });
    } catch (e) {
        console.error('Webhook error', e);
        return res.status(200).json({ ok: true });
    }
});

router.post('/admin-credit', async (req, res) => {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (!token) return res.status(401).json({ error: 'Admin login required' });
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const email = String(req.body.email || '').trim().toLowerCase();
        const accountNumber = String(req.body.accountNumber || '').replace(/\D/g, '');
        const amount = Number(req.body.amount || 0);
        if (!(amount > 0)) return res.status(400).json({ error: 'Amount required' });

        let user = null;
        if (email) user = await User.findOne({ email });
        if (!user && accountNumber) {
            user = await User.findOne({ 'virtualAccount.accountNumber': accountNumber });
        }
        if (!user) return res.status(404).json({ error: 'User not found' });

        const ref = 'MANUAL_' + Date.now() + '_' + amount;
        const result = await creditUser(user, amount, ref, 'Manual credit by admin');
        res.json({ ok: true, email: user.email, ...result });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Credit failed' });
    }
});

module.exports = router;
