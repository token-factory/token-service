const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    id: String,
    name: { type: String, default: 'transaction' },
    threshold_category: String,
    source_acct: String,
    xdr_representation: String,
    description: String,
    submitted: Boolean,
    error: String,
    signatures: [{ public_key: String, signed: Boolean, weight: Number, signed_date: Date }],
    approvers: [{ public_key: String, signed: Boolean, signed_date: Date }],
    hash: String,
    differentSourceOperationExists: Boolean,
    operations: [{
        op_type: String,
        threshold_category: String,
        source_acct: String,
        needs_signatures: Boolean,
        signatures: [{ public_key: String, signed: Boolean, weight: Number, signed_date: Date }],
        sameSourceAccount: Boolean
    }]
},{
    read: 'nearest',
    usePushEach: true,
    timestamps: true
});

module.exports = mongoose.model('Transaction', TransactionSchema);
