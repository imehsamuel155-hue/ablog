require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payments');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5080;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ablogs';
const pages = path.join(__dirname, 'public', 'pages');

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '20mb' }));

app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/user', userRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

function sendPage(res, name) {
    res.sendFile(path.join(pages, name));
}

app.get('/', (req, res) => sendPage(res, 'login.html'));
app.get('/login', (req, res) => sendPage(res, 'login.html'));
app.get('/signup', (req, res) => sendPage(res, 'signup.html'));
app.get('/dashboard', (req, res) => sendPage(res, 'dashboard.html'));
app.get('/accounts', (req, res) => sendPage(res, 'accounts.html'));
app.get('/account', (req, res) => sendPage(res, 'account.html'));
app.get('/history', (req, res) => sendPage(res, 'history.html'));
app.get('/working-pictures', (req, res) => sendPage(res, 'working-pictures.html'));
app.get('/tools', (req, res) => sendPage(res, 'tools.html'));
app.get('/format', (req, res) => sendPage(res, 'format.html'));
app.get('/wallet', (req, res) => sendPage(res, 'wallet.html'));
app.get('/profile', (req, res) => sendPage(res, 'profile.html'));
app.get('/admin', (req, res) => sendPage(res, 'admin.html'));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Ablogs API' }));

app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    sendPage(res, 'login.html');
});

mongoose
    .connect(MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected');
        app.listen(PORT, () => console.log('Ablogs running on port', PORT));
    })
    .catch((err) => {
        console.error('MongoDB error', err.message);
        process.exit(1);
    });
