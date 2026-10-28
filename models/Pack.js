const mongoose = require('mongoose');

const packSchema = new mongoose.Schema(
    {
        kind: { type: String, enum: ['working', 'tools', 'format'], default: 'working' },
        title: { type: String, required: true },
        price: { type: Number, required: true },
        description: { type: String, default: '' },
        formatText: { type: String, default: '' },
        pictureCount: { type: Number, default: 0 },
        videoCount: { type: Number, default: 0 },
        previewImages: [{ type: String }],
        coverImage: { type: String, default: '' },
        deliveryLink: { type: String, default: '' },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Pack', packSchema);
