const mongoose = require('mongoose');

const stockItemSchema = new mongoose.Schema(
    {
        loginDetails: { type: String, default: '' },
        previewLink: { type: String, default: '' },
        sold: { type: Boolean, default: false },
        soldTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        soldAt: { type: Date }
    },
    { _id: true }
);

const productSchema = new mongoose.Schema(
    {
        title: { type: String, required: true },
        category: { type: String, required: true, lowercase: true, trim: true },
        price: { type: Number, required: true },
        description: { type: String, default: '' },
        image: { type: String, default: '' },
        isActive: { type: Boolean, default: true },
        stockItems: [stockItemSchema]
    },
    { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
