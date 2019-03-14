const mongoose = require('mongoose');

const AccountSchema = new mongoose.Schema({
    name: { type: String, default: 'account' },
    userId: {
        type: String,
        min: [4, 'user id too short'],
        required: [true, 'Missing required userId.']
    },
    tenantId: {
        type: String,
        min: [4, 'tenantId id too short'],
        required: [true, 'Missing required tenantId.']
    },
    email: {
        type: String,
        min: [4, 'email address too short'],
        required: [true, 'Missing required email.']
    },
    description: {
        min: [4, 'description is too short'],
        type: String,
        required: [true, 'Missing required  description.']
    },
    public_key: {
        type: String,
        min: [4, 'public key too short'],
        required: [true, 'Missing required public key.']
    },
    encrypted_secret: {
        type: String,
        min: [4, 'secret too short'],
        required: [true, 'Missing required secret.']
    },
    salt: {
        type: String,
        min: [4, 'salt too short'],
        required: [true, 'Missing required salt.']
    },
    passphrase: { type: String,  required: [true, 'Missing required passphrase.'] },
    thresholds: { type: String, select: false },
    balances: { type: String, select: false },
    signers: { type: String, select: false },
    pre_authorize_transactions: Boolean
},{
    read: 'nearest',
    usePushEach: true,
    timestamps: true
});

AccountSchema.set('autoIndex', true);
module.exports = mongoose.model('Account', AccountSchema);
