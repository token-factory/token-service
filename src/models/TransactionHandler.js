const StellarSDK = require('stellar-sdk');

const StellarNetwork = require('./StellarNetwork');
const _stellarNetwork = new StellarNetwork();

const Transaction = require('./Transaction');
const TransactionOperationBuilder = require('./TransactionOperationBuilder');
const fees = require('./fees.json');


const log4js = require('log4js');
const logger = log4js.getLogger('TransactionHandler');
logger.level = process.env.LOG_LEVEL || 'debug';

const i18n = require('i18n');
const path = require('path');
i18n.configure({
    directory: path.join(__dirname, '/../locales')
});

module.exports = class TransactionHandler {

    async setupAllowTrustTransaction(transactionSourceAccount, assetIssuerPublicKey, assetCode, trustorPublicKey, authorizeTrueOrFalse) {
        logger.trace('setupAllowTrustTransaction entry', [assetIssuerPublicKey, assetCode, trustorPublicKey, authorizeTrueOrFalse]);
        let operation = await this.composeAllowTrustOperation(assetIssuerPublicKey, assetCode, trustorPublicKey, authorizeTrueOrFalse);
        const description = 'Allow Trust for ' + trustorPublicKey + ' of ' + assetIssuerPublicKey + ' ' + assetCode + ' = ' + authorizeTrueOrFalse;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        await txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupAllowTrustTransaction exit', [assetIssuerPublicKey, assetCode, trustorPublicKey, authorizeTrueOrFalse]);
        return stellarTransaction;
    }

    async setupChangeTrustTransaction(transactionSourceAccount, accountPublicKey, assetCode, assetIssuer, limit) {
        logger.trace('setupChangeTrustTransaction entry', [accountPublicKey, assetCode, assetIssuer, limit]);
        let operation = await this.composeChangeTrustOperation(accountPublicKey, assetCode, assetIssuer, limit);
        const description = 'Change Trust for ' + accountPublicKey + ' for ' + assetIssuer + ' ' + assetCode;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        await txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupChangeTrustTransaction exit', [accountPublicKey, assetCode, assetIssuer, limit]);
        return stellarTransaction;
    }

    async setupCreateAccountTransaction(transactionSourceAccount, sourceAcctPublicKey, newAcctPublicKey, initialBalance) {
        logger.trace('setupCreateAccountTransaction entry', [sourceAcctPublicKey, newAcctPublicKey, initialBalance]);
        let operation = await this.composeCreateAccountOperation(sourceAcctPublicKey, newAcctPublicKey, initialBalance);
        const description = 'Create Account ' + newAcctPublicKey + ' from ' + sourceAcctPublicKey;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        await txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupCreateAccountTransaction exit', [sourceAcctPublicKey, newAcctPublicKey, initialBalance]);
        return stellarTransaction;
    }

    async setupPaymentTransaction(transactionSourceAccount, senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount) {
        logger.trace('setupPaymentTransaction entry', [senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount]);
        let operation = await this.composePaymentOperation(senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount);
        const transDescription = 'Payment to ' + receiverPublicKey;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, transDescription);
        await txOpBuilder.addOperation(operation);
        if (assetIssuingAccount === senderPublicKey) {
            const fee = fees['FEE_ISSUANCE'];
            const feeOp = await this.composePaymentOperation(senderPublicKey, fee.destination, 'XLM', '', fee.rate);
            await txOpBuilder.addOperation(feeOp);
            await txOpBuilder.addMemo(StellarSDK.Memo.text('tx contains ' + fee.name));
        }
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupPaymentTransaction exit', [senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount]);
        return stellarTransaction;
    }

    async getOfferDescription(assetToSell, sellAmount, assetToBuy, buyAmount, offerId) {
        let offerDescription;
        if (sellAmount === '0') {
            offerDescription = 'Deleting offer ' + offerId;
        } else {
            // If offerId is empty or zero, this is a new offer. Otherwise it's an offer being updated.
            if ((!offerId) || (offerId === '0') || (offerId === 0)) {
                offerDescription = 'New offer to sell ' + sellAmount + ' ' + assetToSell.getCode() + ' for ' + buyAmount + ' ' + assetToBuy.getCode();
            } else {
                offerDescription = 'Updating offer ' + offerId + ' to sell ' + sellAmount + ' ' + assetToSell.getCode() + ' for ' + buyAmount + ' ' + assetToBuy.getCode();
            }
        }
        return offerDescription;
    }

    async setupManageOfferTransaction(transactionSourceAccount, publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount) {
        logger.trace('setupManageOfferTransaction entry', [publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount]);
        // NOTE: offerId should be zero(0/'0') for new offers being created and non-zero for updated/deleted offers

        let operation = await this.composeManageOfferOperation(publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount);

        let offerDescription = await this.getOfferDescription(assetToSell, sellAmount, assetToBuy, buyAmount, offerId);

        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, offerDescription);
        await txOpBuilder.addOperation(operation);

        // If offerId is empty or zero, this is a new offer and we charge a small fee.
        if ((!offerId) || (offerId === '0') || (offerId === 0)) {
            const fee = fees['FEE_OFFER'];
            const feeOp = await this.composePaymentOperation(publicKey, fee.destination, 'XLM', '', fee.rate);
            await txOpBuilder.addOperation(feeOp);
            await txOpBuilder.addMemo(StellarSDK.Memo.text('tx contains ' + fee.name));
        }

        const stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupManageOfferTransaction exit', [publicKey, offerId]);
        return stellarTransaction;
    }

    async setupSetOptionsTransaction_HomeDomain(transactionSourceAccount, accountPublicKey, homeDomain) {
        logger.trace('setupSetOptionsTransaction_HomeDomain entry', [accountPublicKey, homeDomain]);
        let operation = await this.composeSetOptionsOperation_HomeDomain(accountPublicKey, homeDomain);
        const description = 'Add home domain ' + homeDomain + ' to ' + accountPublicKey;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        await txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupSetOptionsTransaction_HomeDomain exit', [accountPublicKey, homeDomain]);
        return stellarTransaction;
    }

    async setupSetOptionsTransaction_Signer(transactionSourceAccount, accountPublicKey, signerType, signer, weight) {
        logger.trace('setupSetOptionsTransaction_Signer entry', [accountPublicKey, signer, weight]);
        let operation = await this.composeSetOptionsOperation_Signer(accountPublicKey, signerType, signer, weight);
        const description = 'Add Signer ' + signer + ' to ' + accountPublicKey;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        await txOpBuilder.addOperation(operation);

        if (signerType === 'preAuthTx') {
            await txOpBuilder.addMemo(StellarSDK.Memo.text('PreAuthTx signer'));
        }

        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupSetOptionsTransaction_Signer exit', [accountPublicKey, signer]);
        return stellarTransaction;
    }

    async setupSetOptionsTransaction_Weights(transactionSourceAccount, accountPublicKey, weight, low, medium, high) {
        logger.trace('setupSetOptionsTransaction_Weights entry', [accountPublicKey, weight, low, medium, high]);
        let operation = await this.composeSetOptionsOperation_Weights(accountPublicKey, weight, low, medium, high);
        const description = 'Set weights and thresholds for ' + accountPublicKey;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupSetOptionsTransaction_Weights exit', [accountPublicKey, weight, low, medium, high]);
        return stellarTransaction;
    }

    async setupSetOptionsTransaction_Flags(transactionSourceAccount, accountPublicKey, flagOperation, flagToSet) {
        logger.trace('setupSetOptionsTransaction_Flags entry', [accountPublicKey, flagOperation, flagToSet]);
        let operation = await this.composeSetOptionsOperation_Flags(accountPublicKey, flagOperation, flagToSet);
        const description = flagOperation + ' for ' + flagToSet;
        let txOpBuilder = new TransactionOperationBuilder(transactionSourceAccount, description);
        txOpBuilder.addOperation(operation);
        let stellarTransaction = await txOpBuilder.buildTransaction();
        logger.trace('setupSetOptionsTransaction_Flags exit', [accountPublicKey, flagOperation, flagToSet]);
        return stellarTransaction;
    }

    async createOfferTransaction(transactionSourceAccount, publicKey, offerId, sellAssetCode, sellAssetIssuer, sellAmount, buyAssetCode, buyAssetIssuer, buyAmount) {
        logger.trace('createOfferTransaction entry', [publicKey, sellAssetCode, sellAssetIssuer, sellAmount, buyAssetCode, buyAssetIssuer, buyAmount]);

        if (sellAmount < 0) {
            throw new Error(i18n.__('negative.sellAmount.data'));
        }
        if (buyAmount < 0) {
            throw new Error(i18n.__('negative.buyAmount.data'));
        }
        let assetToSell;
        let assetToBuy;
        if (sellAssetCode !== 'XLM') {
            assetToSell = new StellarSDK.Asset(sellAssetCode, sellAssetIssuer);
        } else {
            assetToSell = StellarSDK.Asset.native();
        }
        if (buyAssetCode !== 'XLM') {
            assetToBuy = new StellarSDK.Asset(buyAssetCode, buyAssetIssuer);
        } else {
            assetToBuy = StellarSDK.Asset.native();
        }

        const transaction = await this.setupManageOfferTransaction(transactionSourceAccount, publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount);

        logger.trace('createOfferTransaction exit', [publicKey, offerId, sellAssetCode, sellAssetIssuer, sellAmount, buyAssetCode, buyAssetIssuer, buyAmount]);
        return transaction;
    }

    async composeAllowTrustOperation(assetIssuerPublicKey, assetCode, trustorPublicKey, authorizeTrueOrFalse) {
        logger.trace('composeAllowTrustOperation entry', [assetIssuerPublicKey, assetCode, trustorPublicKey]);
        const allowTrustOperation = StellarSDK.Operation.allowTrust({
            source: assetIssuerPublicKey,
            trustor: trustorPublicKey,
            assetCode: assetCode,
            authorize: authorizeTrueOrFalse
        });

        logger.trace('composeAllowTrustOperation exit', [assetIssuerPublicKey, assetCode, trustorPublicKey]);
        return allowTrustOperation;
    }

    async composeChangeTrustOperation(accountPublicKey, assetCode, assetIssuer, limit) {
        logger.trace('composeChangeTrustOperation entry', [accountPublicKey, assetCode, assetIssuer, limit]);
        const asset = new StellarSDK.Asset(assetCode, assetIssuer);
        const changeTrustOperation = StellarSDK.Operation.changeTrust({
            source: accountPublicKey,
            asset: asset,
            limit: limit
        });

        logger.trace('composeChangeTrustOperation exit', [accountPublicKey, assetCode, assetIssuer, limit]);
        return changeTrustOperation;
    }

    async composeSetOptionsOperation_Weights(accountPublicKey, weight, low, medium, high) {
        logger.trace('composeSetOptionsOperation_Weights entry', [accountPublicKey, weight, low, medium, high]);
        const setOptionsOperation = StellarSDK.Operation.setOptions({
            source: accountPublicKey,
            masterWeight: weight,
            lowThreshold: low,
            medThreshold: medium,
            highThreshold: high
        })
        logger.trace('composeSetOptionsOperation_Weights exit', [accountPublicKey, weight, low, medium, high]);
        return setOptionsOperation;
    }

    async composeSetOptionsOperation_Flags(accountPublicKey, flagOperation, flagToSet) {
        logger.trace('composeSetOptionsOperation_Flags entry', [accountPublicKey, flagOperation, flagToSet]);
        let flag = null;
        if (flagToSet === 'AuthRequiredFlag') {
            flag = StellarSDK.AuthRequiredFlag | StellarSDK.AuthRevocableFlag
        } else if (flagToSet === 'AuthRequiredFlagOnly') {
            flag = StellarSDK.AuthRequiredFlag
        } else if (flagToSet === 'AuthImmutableFlag') {
            flag = StellarSDK.AuthImmutableFlag
        } else if (flagToSet === 'AuthRevocableFlag') {
            flag = StellarSDK.AuthRevocableFlag
        }
        const setOptionsOperation = StellarSDK.Operation.setOptions({
            source: accountPublicKey,
            [flagOperation]: flag
        })
        logger.trace('composeSetOptionsOperation_Flags exit', [accountPublicKey, flagOperation, flagToSet]);
        return setOptionsOperation;
    }

    async composeSetOptionsOperation_HomeDomain(accountPublicKey, homeDomain) {
        logger.trace('composeSetOptionsOperation_HomeDomain entry', [accountPublicKey, homeDomain]);
        const setOptionsOperation = StellarSDK.Operation.setOptions({
            source: accountPublicKey,
            homeDomain: homeDomain
        })
        logger.trace('composeSetOptionsOperation_HomeDomain exit', [accountPublicKey, homeDomain]);
        return setOptionsOperation;
    }

    async composeSetOptionsOperation_Signer(accountPublicKey, signerType, signer, weight) {
        logger.trace('composeSetOptionsOperation_Signer entry', [accountPublicKey, signerType, signer, weight]);
        const setOptionsOperation = StellarSDK.Operation.setOptions({
            source: accountPublicKey,
            signer: {
                [signerType]: signer,
                weight: weight
            }
        });
        logger.trace('composeSetOptionsOperation_Signer exit', [accountPublicKey, signerType, signer, weight]);
        return setOptionsOperation;
    }

    async composeCreateAccountOperation(sourceAcctPublicKey, newAcctPublicKey, initialBalance) {
        logger.trace('composeCreateAccountOperation entry', [sourceAcctPublicKey, newAcctPublicKey, initialBalance]);
        const createAccountOperation = StellarSDK.Operation.createAccount({
            source: sourceAcctPublicKey,
            destination: newAcctPublicKey,
            startingBalance: initialBalance
        });
        logger.trace('composeCreateAccountOperation exit', [sourceAcctPublicKey, newAcctPublicKey, initialBalance]);
        return createAccountOperation;
    }

    async composePaymentOperation(senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount) {
        logger.trace('composePaymentOperation entry', [senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount]);
        let asset;
        if (assetCode === 'XLM') {
            asset = StellarSDK.Asset.native();
        } else {
            asset = new StellarSDK.Asset(assetCode, assetIssuingAccount);
        }

        const paymentOperation = StellarSDK.Operation.payment({
            source: senderPublicKey,
            destination: receiverPublicKey,
            asset: asset,
            amount: amount
        });

        logger.trace('composePaymentOperation exit', [senderPublicKey, receiverPublicKey, assetCode, assetIssuingAccount, amount]);
        return paymentOperation;
    }

    async composeManageOfferOperation(publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount) {
        logger.trace('createManageOfferOperation entry', [publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount]);
        // NOTE: offerId should be zero(0/'0') for new offers being created and non-zero for updated/deleted offers

        let amount;
        let price;

        if (sellAmount === '0') {
            // If sell amount is zero, this has to be a delete offer, and we need a non-zero offerId.
            if ((!offerId) || (offerId === '0') || (offerId === 0)) {
                throw new Error(i18n.__('invalid.deleteOffer.data'));
            }

            price = '1';
            amount = '0';
        } else {
            price = (buyAmount / sellAmount).toFixed(10);
            amount = sellAmount;
        }

        let manageOfferOperation = StellarSDK.Operation.manageOffer({
            selling: assetToSell,
            buying: assetToBuy,
            amount: amount,
            price: price,
            offerId: offerId,
            source: publicKey
        })

        logger.trace('createManageOfferOperation exit', [publicKey, offerId, assetToSell, sellAmount, assetToBuy, buyAmount]);
        return manageOfferOperation;
    }

    async getInitiatedTransactions(publicKey) {
        logger.trace('getInitiatedTransactions entry', publicKey);
        let myTransactions = await Transaction.find({ source_acct: publicKey });
        let initiatedTransactions = []
        for (const myTransaction of myTransactions) {
            const stellarTransaction = await this._rehydrateStellarTransaction(myTransaction);
            initiatedTransactions.push(stellarTransaction);
        }
        logger.trace('getInitiatedTransactions exit');
        return initiatedTransactions;
    }

    async getTransactionsToSign(publicKey) {
        logger.trace('getTransactionsToSign entry', [publicKey]);
        const unsignedTransactions = await Transaction.find({submitted: false, $or:[{signatures: { $elemMatch: { public_key: publicKey, signed: false } }},{operations: { $elemMatch: {needs_signatures: true, signatures: { $elemMatch: { public_key: publicKey, signed: false }}}}}]});
        let decoratedTransactions = []
        for (const transaction of unsignedTransactions) {
            const stellarTransaction = await this._rehydrateStellarTransaction(transaction);
            decoratedTransactions.push(stellarTransaction);
        }
        const approverTransactions = await Transaction.find({submitted: false, approvers: { $elemMatch: { public_key: publicKey, signed: false } } });
        for (const transaction of approverTransactions) {
            const stellarTransaction = await this._rehydrateStellarTransaction(transaction);
            decoratedTransactions.push(stellarTransaction);
        }
        logger.trace('getTransactionsToSign exit', decoratedTransactions);
        return decoratedTransactions;
    }


    async _rehydrateStellarTransaction(persistedTransaction) {
        let stellarTransaction = this.deserializeTransaction(persistedTransaction.xdr_representation);
        stellarTransaction = await this._decorateStellarTransaction(stellarTransaction, persistedTransaction);
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

    serializeTransaction(transaction) {
        return transaction.toEnvelope().toXDR().toString('base64');
    }

    deserializeTransaction(base64XDR) {
        return new StellarSDK.Transaction(base64XDR);
    }

    determineThresholdRequired(stellarAccount, thresholdCat) {
        let thresholdRequired;

        if (thresholdCat === 'Low') {
            thresholdRequired = stellarAccount.thresholds.low_threshold;
        } else if (thresholdCat === 'Medium') {
            thresholdRequired = stellarAccount.thresholds.med_threshold;
        } else if (thresholdCat === 'High') {
            thresholdRequired = stellarAccount.thresholds.high_threshold;
        }

        return thresholdRequired;
    }

    async canTransactionBeSubmitted(myTransaction) {
        logger.trace('canTransactionBeSubmitted entry', myTransaction.id);
        let transactionCanBeSubmitted = false;
        let opsCanBeSubmitted = this.canOperationsBeSubmitted(myTransaction);
        if (opsCanBeSubmitted) {
            let signerWeightSum = 0;
            for (let signature of myTransaction.signatures) {
                if (signature.signed === true) {
                    signerWeightSum = signerWeightSum + signature.weight;
                }
            }

            const loadedAccount = await _stellarNetwork.loadAccount(myTransaction.source_acct);
            let thresholdRequired = this.determineThresholdRequired(loadedAccount, myTransaction.threshold_category);
            if (signerWeightSum >= thresholdRequired) {
                transactionCanBeSubmitted = true;
            }
        }

        logger.trace('canTransactionBeSubmitted exit', [myTransaction.id, transactionCanBeSubmitted]);
        return transactionCanBeSubmitted;
    }

    async canOperationsBeSubmitted(myTransaction) {
        let operationsCanBeSubmitted = true;

        if (myTransaction.differentSourceOperationExists) {
            let operationsForTransaction = myTransaction.operations;
            for (let operation of operationsForTransaction) {
                if (!operation.sameSourceAccount) {
                    let opHasSignatures = await this.doesOperationHaveSignatures(operation);
                    if (!opHasSignatures) {
                        operationsCanBeSubmitted = false;
                    } else {
                        operation.needs_signatures = false;
                    }
                }
            }
        }

        return operationsCanBeSubmitted;
    }

    async doesOperationHaveSignatures(myOperation) {
        logger.trace('doesOperationHaveSignatures entry', myOperation.id);
        const loadedAccount = await _stellarNetwork.loadAccount(myOperation.source_acct);

        let signerWeightSum = 0;
        let canBeSubmitted = false;
        for (let signature of myOperation.signatures) {
            if (signature.signed === true) {
                signerWeightSum = signerWeightSum + signature.weight;
            }
        }

        let thresholdRequired = this.determineThresholdRequired(loadedAccount, myOperation.threshold_category);
        if (signerWeightSum >= thresholdRequired) {
            canBeSubmitted = true;
        }

        logger.trace('doesOperationHaveSignatures exit', [myOperation.id, canBeSubmitted]);
        return canBeSubmitted;
    }

    async signTransaction(public_key, secret, transaction_id) {
        logger.trace('signTransaction entry', [public_key, transaction_id]);
        const signerKeyPair = StellarSDK.Keypair.fromSecret(secret);

        if (public_key !== signerKeyPair.publicKey()) {
            throw new Error(i18n.__('invalid.stellar.keypair'));
        }

        let myTransaction = await Transaction.findOne({ id: transaction_id });

        if (myTransaction.submitted === true) {
            throw new Error(i18n.__('transaction.already.submitted'));
        }

        let signerIsAuthorized = false;
        let alreadySigned = false;

        for (let signature of myTransaction.signatures) {
            if (signature.public_key === public_key) {
                signerIsAuthorized = true;
                if (signature.signed === true) {
                    alreadySigned = true;
                } else {
                    signature.signed = true;
                }
            }
        }

        for (let myOperation of myTransaction.operations) {
            for (let signature of myOperation.signatures) {
                if (signature.public_key === public_key) {
                    signerIsAuthorized = true;
                    if (signature.signed === true) {
                        alreadySigned = true;
                    } else {
                        signature.signed = true;
                    }
                }
            }
        }

        if (!signerIsAuthorized) {
            throw new Error(i18n.__('signer.not.authorized'));
        }

        let stellarTransaction = new StellarSDK.Transaction(myTransaction.xdr_representation);
        if (!alreadySigned) {
            stellarTransaction.sign(signerKeyPair);

            myTransaction.xdr_representation = this.serializeTransaction(stellarTransaction);
            myTransaction.save();
        }

        let submittable = await this.canTransactionBeSubmitted(myTransaction);
        // check all operations and check the overall transaction

        if (submittable) {
            try {
                logger.trace('submittable', myTransaction.xdr_representation);
                await _stellarNetwork.submitSerializedTransaction(myTransaction.xdr_representation);
                myTransaction.submitted = true;
            } catch (submissionError) {
                let errorResponseData = this._parseSubmissionError(submissionError);
                myTransaction.error = errorResponseData;
                myTransaction.save();
                logger.trace('submitSerializedTransaction error', errorResponseData);
                throw new Error(errorResponseData);
            }
        }

        myTransaction.save();

        stellarTransaction = await this._decorateStellarTransaction(new StellarSDK.Transaction(myTransaction.xdr_representation), myTransaction);
        logger.trace('signTransaction exit', [public_key, transaction_id, stellarTransaction.hash]);
        return stellarTransaction;
    }

    async preAuthorizeTransaction(publicKey, decryptedSecret, transactionId, finalApprover) {
        logger.trace('preAuthorizeTransaction entry', [publicKey, transactionId, finalApprover]);
        let myTransaction = await Transaction.findOne({ id: transactionId });
        let stellarTransaction = new StellarSDK.Transaction(myTransaction.xdr_representation);

        const accountForOptions = await _stellarNetwork.loadAccount(myTransaction.source_acct);

        let thresholdRequired = this.determineThresholdRequired(accountForOptions, myTransaction.threshold_category);

        let signerWeight = 1;
        if (thresholdRequired > 1) {
            signerWeight = thresholdRequired;
        }

        let addSignerTransaction = await this.setupSetOptionsTransaction_Signer(accountForOptions, myTransaction.source_acct, 'preAuthTx', stellarTransaction.hash(), signerWeight);
        await this.signTransaction(publicKey, decryptedSecret, addSignerTransaction.id);

        myTransaction = await Transaction.findOne({ id: transactionId });

        if (finalApprover) {
            let approver = new Object();
            approver.public_key = finalApprover;
            approver.signed = false;
            myTransaction.approvers.push(approver);
            await myTransaction.save();
        }

        stellarTransaction = await this._decorateStellarTransaction(new StellarSDK.Transaction(myTransaction.xdr_representation), myTransaction);
        logger.trace('preAuthorizeTransaction exit', [publicKey, transactionId, stellarTransaction.hash]);
        return stellarTransaction;
    }

    async submitPreAuthorizedTransaction(transactionId, finalApprover) {
        let myTransaction = await Transaction.findOne({ id: transactionId });

        let approverIsAuthorized = false;
        for (let approver of myTransaction.approvers) {
            if (approver.public_key === finalApprover) {
                approverIsAuthorized = true;
                approver.signed = true;
            }
        }

        if (!approverIsAuthorized) {
            throw new Error(i18n.__('approver.not.authorized'));
        }

        try {
            await _stellarNetwork.submitSerializedTransaction(myTransaction.xdr_representation);
            myTransaction.submitted = true;
            myTransaction.save();
        } catch (submissionError) {
            let errorResponseData = this._parseSubmissionError(submissionError);
            myTransaction.error = errorResponseData;
            myTransaction.save();
            logger.trace('submitSerializedTransaction error', errorResponseData);
            throw new Error(errorResponseData);
        }

        return myTransaction;
    }

    _parseSubmissionError(submissionError) {
        let errorResponseData = JSON.stringify(submissionError.message);
        if ((submissionError.response) && (submissionError.response.data)) {
            if ((submissionError.response.data.extras) && (submissionError.response.data.extras.result_codes)) {
                errorResponseData += JSON.stringify(submissionError.response.data.extras.result_codes);
            } else {
                errorResponseData += JSON.stringify(submissionError.response.data);
            }
        }
        return errorResponseData;
    }

};
