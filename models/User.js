const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        phone: { type: String, default: '' },
        password: { type: String, required: true },
        balance: { type: Number, default: 0 },
        role: { type: String, enum: ['user', 'admin'], default: 'user' },
        virtualAccount: {
            accountNumber: String,
            accountName: String,
            bank: String,
            bankCode: String,
            reference: String
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
