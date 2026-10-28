const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        type: { type: String, enum: ['log', 'pack'], default: 'log' },
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        pack: { type: mongoose.Schema.Types.ObjectId, ref: 'Pack' },
        title: { type: String, default: '' },
        amount: { type: Number, required: true },
        deliveryInfo: { type: String, default: '' },
        status: { type: String, enum: ['completed', 'pending', 'failed'], default: 'completed' }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
