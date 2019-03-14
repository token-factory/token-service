const StellarSDK = require('stellar-sdk');
const uuidv4 = require('uuid/v4');

const StellarNetwork = require('./StellarNetwork');
const _stellarNetwork = new StellarNetwork();

const Transaction = require('./Transaction');

const log4js = require('log4js');
const logger = log4js.getLogger('TransactionOperationBuilder');
logger.level = process.env.LOG_LEVEL || 'debug';

const i18n = require('i18n');
const path = require('path');
i18n.configure({
    directory: path.join(__dirname, '/../locales')
});

module.exports = class TransactionOperationBuilder {

    constructor(transactionSourceAccount, optionalDescription) {
        this._transactionSourceAccount = transactionSourceAccount;
        this._stellarTransactionBuilder = new StellarSDK.TransactionBuilder(transactionSourceAccount).setTimeout(200);
        this._pendingTransactionId = uuidv4();
        this._operations = [];
        this._optionalDescription = optionalDescription;
    }

    async addOperation(operation) {
        logger.trace('addOperationToTransactionBuilder entry');

        this._operations.push(operation);
        await this._stellarTransactionBuilder.addOperation(operation);

        logger.trace('addOperationToTransactionBuilder exit');
        return this;
    }

    async addMemo(memo) {
        this._stellarTransactionBuilder.addMemo(memo);
    }

    async buildTransaction() {
        let stellarTransaction = this._stellarTransactionBuilder.build();
        const transaction = await this._persistNewTransaction(stellarTransaction);
        return transaction;
    }

    _determineThresholdOfOperation(operationFromXDR) {
        let thresholdCat = 'Medium';
        if (operationFromXDR.type === 'setOptions') {
            if (operationFromXDR.signer) {
                thresholdCat = 'High';
            } else if (operationFromXDR.masterWeight) {
                thresholdCat = 'High';
            } else if (operationFromXDR.lowThreshold) {
                thresholdCat = 'High';
            } else if (operationFromXDR.mediumThreshold) {
                thresholdCat = 'High';
            } else if (operationFromXDR.highThreshold) {
                thresholdCat = 'High';
            }
        } else if (operationFromXDR.type === 'accountMerge') {
            thresholdCat = 'High';
        } else if (operationFromXDR.type === 'bumpSequence') {
            thresholdCat = 'Low';
        } else if (operationFromXDR.type === 'allowTrust') {
            thresholdCat = 'Low';
        }

        return thresholdCat;
    }

    async _persistNewTransaction(stellarTransaction) {

        logger.trace('persistNewTransaction entry');
        const serializedXDR = stellarTransaction.toEnvelope().toXDR().toString('base64');
        const transaction = new Transaction({
            id: this._pendingTransactionId,
            source_acct: this._transactionSourceAccount.accountId(),
            xdr_representation: serializedXDR,
            submitted: false,
            hash: stellarTransaction.hash().toString('hex')
        });

        transaction._hasMediumThresholdOp = false;
        transaction._hasHighThresholdOp = false;
        transaction.operations = [];
        transaction.description = this._optionalDescription;

        this._transactionSourceAccount.signers.forEach(function (entry) {
            let signature = new Object();
            signature.public_key = entry.key;
            signature.signed = false;
            signature.weight = entry.weight;
            transaction.signatures.push(signature);
        });

        transaction.differentSourceOperationExists = false;

        for (let operation of this._operations) {
            const operationFromXDR = StellarSDK.Operation.fromXDRObject(operation);
            const operationSourceAccount = await _stellarNetwork.loadAccount(operationFromXDR.source);

            let thresholdCat = this._determineThresholdOfOperation(operationFromXDR);
            if (thresholdCat === 'Medium') {
                transaction._hasMediumThresholdOp = true;
            } else if (thresholdCat === 'High') {
                transaction._hasHighThresholdOp = true;
            }

            let operationToPersist = new Object();
            operationToPersist.op_type = operationFromXDR.type;
            operationToPersist.threshold_category = thresholdCat;
            operationToPersist.source_acct = operationFromXDR.source;
            operationToPersist.signatures = [];

            if (this._transactionSourceAccount.accountId() === operationFromXDR.source) {
                operationToPersist.sameSourceAccount = true;
                operationToPersist.needs_signatures = false;
            } else {
                transaction.differentSourceOperationExists = true;
                operationToPersist.sameSourceAccount = false;
                operationToPersist.needs_signatures = true;
            }

            operationSourceAccount.signers.forEach(function (entry) {
                let signature = new Object();
                signature.public_key = entry.key;
                signature.signed = false;
                signature.weight = entry.weight;
                operationToPersist.signatures.push(signature);
            });

            transaction.operations.push(operationToPersist);
        }

        let maxThresholdCategory = 'Low';
        if (transaction._hasHighThresholdOp) {
            maxThresholdCategory = 'High';
        } else if (transaction._hasMediumThresholdOp) {
            maxThresholdCategory = 'Medium';
        }

        transaction.threshold_category = maxThresholdCategory;
        await transaction.save();

        stellarTransaction = this._decorateStellarTransaction(stellarTransaction, transaction);
        logger.trace('persistNewTransaction exit', stellarTransaction.id);
        return stellarTransaction;
    }

    async _decorateStellarTransaction(stellarTransaction, persistedTransaction) {
        logger.trace('_decorateStellarTransaction entry', persistedTransaction.id);
        stellarTransaction.id = persistedTransaction.id;
        stellarTransaction.type = persistedTransaction.operations[0].op_type;
        stellarTransaction.source_acct = persistedTransaction.source_acct;
        stellarTransaction.xdr_representation = persistedTransaction.xdr_representation;
        stellarTransaction.description = persistedTransaction.description;
        stellarTransaction.submitted = persistedTransaction.submitted;
        stellarTransaction.error = persistedTransaction.error;
        stellarTransaction.signers = persistedTransaction.signatures;
        stellarTransaction.preAuthApprovers = persistedTransaction.approvers;
        stellarTransaction.createdAt = persistedTransaction.createdAt;
        stellarTransaction.hash = persistedTransaction.hash;
        stellarTransaction.operations = persistedTransaction.operations;
        logger.trace('_decorateStellarTransaction exit', persistedTransaction.id);
        return stellarTransaction;
    }
};
