const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
    {
        key: { type: String, default: 'main', unique: true },
        categories: {
            type: [String],
            default: [
                'tiktok', 'facebook', 'instagram', 'vpn', 'gmail', 'hotmail',
                'reddit', 'icloud', 'proxy', 'textplus', 'chatgpt'
            ]
        },
        adminUsername: { type: String, default: 'Samuelthetrader' },
        adminPassword: { type: String, default: 'jerofx' },
        adminPin: { type: String, default: '4422' },
        settingsPin: { type: String, default: '7777' },
        whatsappNumber: { type: String, default: '' },
        whatsappCommunity: { type: String, default: '' }
    },
    { timestamps: true }
);

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
