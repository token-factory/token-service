const mongoose = require('mongoose');

const AssetSchema = new mongoose.Schema({
    name: { type: String, default: 'asset' },
    userId: {
        type: String,
        min: [4, 'user id is too short'],
        required: [true, 'Missing required userId.']
    },
    tenantId: {
        type: String,
        min: [4, 'tenant id is too short'],
        required: [true, 'Missing required tenant.']
    },
    email: {
        type: String,
        min: [4, 'email address is too short'],
        required: [true, 'Missing required email address.']
    },
    asset_code: {
        type: String,
        min: [3, 'asset code is too short'],
        required: [true, 'Missing required asset code.']
    },
    asset_issuer: {
        type: String,
        min: [4, 'asset issuer is too short'],
        required: [true, 'Missing required asset issuer.']
    },
    description: {
        type: String,
        min: [4, 'description of asset is too short'],
        required: [true, 'Missing required asset description.']
    }
},{
    read: 'nearest',
    usePushEach: true,
    timestamps: true
});
AssetSchema.index({ tenantId: 1, asset_code: 1,  asset_issuer: 1 }, {unique: true});
AssetSchema.set('autoIndex', true);

module.exports = mongoose.model('Asset', AssetSchema);
