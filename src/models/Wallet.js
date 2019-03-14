/* wallet controller module */
require('../config/initializers/database');
const Account = require('./Account');
const Asset = require('./Asset');

const StellarNetwork  = require('./StellarNetwork');
const _stellar = new StellarNetwork();
const StellarSDK = require('stellar-sdk');
const TransactionHandler  = require('./TransactionHandler');
const _transactionHandler = new TransactionHandler();
const TransactionOperationBuilder = require('./TransactionOperationBuilder');

const Security = require ('../utils/Security');
const _security =  new Security();
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const fees = require('./fees.json');

const log4js = require('log4js');
const logger = log4js.getLogger('Wallet');
logger.level = process.env.LOG_LEVEL || 'debug';

const i18n = require('i18n');
const path = require('path');
i18n.configure({
    directory: path.join(__dirname, '/../locales')
});
const _ = require('lodash');

module.exports = class Wallet {
    /* Creating Account */
    async bootstrapAccountFromTestNetwork(user, description, passphrase, trustAuthorizationRequired, preAuthorizedTransactions, homeDomain) {
        logger.trace('bootstrapAccountFromTestNetwork entry', user);
        const keyPair = await _stellar.bootstrapTestAccount();

        const account = await this.registerAccount(user, description, keyPair.publicKey(), keyPair.secret(), passphrase, preAuthorizedTransactions);

        if (trustAuthorizationRequired || homeDomain) {
            // if either exists, we have an additional setOptions transaction
            const loadedAccount = await _stellar.loadAccount(keyPair.publicKey());
            let txOpBuilder = new TransactionOperationBuilder(loadedAccount);

            if (trustAuthorizationRequired) {
                let flagsOperation = await _transactionHandler.composeSetOptionsOperation_Flags(keyPair.publicKey(), 'setFlags', 'AuthRequiredFlag');
                await txOpBuilder.addOperation(flagsOperation);
            }

            if (homeDomain){
                let domainOperation = await _transactionHandler.composeSetOptionsOperation_HomeDomain(keyPair.publicKey(), homeDomain);
                await txOpBuilder.addOperation(domainOperation);
            }

            let stellarTransaction = await txOpBuilder.buildTransaction();
            await _transactionHandler.signTransaction(keyPair.publicKey(), keyPair.secret(), stellarTransaction.id);
        }

        const stellAccount = await this._mergeAccountFields(account, keyPair.publicKey());

        logger.trace('bootstrapAccountFromTestNetwork exit')
        return stellAccount;
    }

    async createAccountFromSource(user, description, sourceAcctPublicKey, sourceAcctSecret, passphrase, initialBalance, trustAuthorizationRequired, preAuthorizedTransactions, homeDomain) {
        logger.trace('createAccountFromSource entry', [user, description, sourceAcctPublicKey, sourceAcctSecret, passphrase, initialBalance, trustAuthorizationRequired, preAuthorizedTransactions]);

        const newAcctKeyPair = StellarSDK.Keypair.random();
        let stellAccount = await this.initializeExistingKeypair(user, description, sourceAcctPublicKey, sourceAcctSecret, '0', newAcctKeyPair.publicKey(), newAcctKeyPair.secret(), passphrase, initialBalance, preAuthorizedTransactions);

        if (trustAuthorizationRequired || homeDomain) {
            // if either exists, we have an additional setOptions transaction
            const loadedAccount = await _stellar.loadAccount(newAcctKeyPair.publicKey());
            let txOpBuilder = new TransactionOperationBuilder(loadedAccount);

            if (trustAuthorizationRequired) {
                let flagsOperation = await _transactionHandler.composeSetOptionsOperation_Flags(newAcctKeyPair.publicKey(), 'setFlags', 'AuthRequiredFlag');
                await txOpBuilder.addOperation(flagsOperation);
            }

            if (homeDomain){
                let domainOperation = await _transactionHandler.composeSetOptionsOperation_HomeDomain(newAcctKeyPair.publicKey(), homeDomain);
                await txOpBuilder.addOperation(domainOperation);
            }

            let stellarTransaction = await txOpBuilder.buildTransaction();
            await _transactionHandler.signTransaction(newAcctKeyPair.publicKey(), newAcctKeyPair.secret(), stellarTransaction.id);

            // reload deep copy of the account from stellar after transactions completed
            stellAccount = await this.getAccount(user,  newAcctKeyPair.publicKey(), false);
        }

        logger.trace('createAccountFromSource exit')
        return stellAccount;
    }

    async initializeExistingKeypair(user, description, sourceAcctPublicKey, sourceAcctSecret, sourceAcctSequenceNum, existingPublicKey, existingSecret, passphrase, initialBalance, preAuthorizedTransactions) {
        logger.trace('initializeExistingKeypair entry', [user, description, sourceAcctPublicKey, sourceAcctSecret, sourceAcctSequenceNum, existingPublicKey, existingSecret, passphrase, initialBalance, preAuthorizedTransactions]);
        const keypair = StellarSDK.Keypair.fromSecret(sourceAcctSecret);
        if (sourceAcctPublicKey!==keypair.publicKey()) {
            throw new Error(i18n.__('invalid.stellar.keypair'));
        }
        let sourceAcct;
        if (!sourceAcctSequenceNum || sourceAcctSequenceNum === '0') {
            sourceAcct = await _stellar.loadAccount(sourceAcctPublicKey);
        } else {
            sourceAcct = await _stellar.loadAccount(sourceAcctPublicKey, sourceAcctSequenceNum);
        }

        let createAccountTransaction = await _transactionHandler.setupCreateAccountTransaction(sourceAcct, sourceAcctPublicKey, existingPublicKey, initialBalance);

        logger.trace('stellarTransaction', createAccountTransaction.id);
        await _transactionHandler.signTransaction(sourceAcctPublicKey, sourceAcctSecret, createAccountTransaction.id);
        const account = await this.registerAccount(user, description, existingPublicKey, existingSecret, passphrase, preAuthorizedTransactions);

        const stellAccount = await this._mergeAccountFields(account, existingPublicKey);
        logger.trace('initializeExistingKeypair exit')
        return stellAccount;
    }


    /* Register Account */
    async registerAccount(user, description, accountPublicKey, accountSecret, passphrase, preAuthorizedTransactions) {
        logger.trace('registerAccount entry', user);

        const salt = crypto.randomBytes(128).toString('base64');
        const encryptedSecret = await _security.encrypt(accountSecret, passphrase, salt)
        var encryptedPassphrase = await bcrypt.hash(passphrase, 10);

        const account = new Account ({
            userId: user.id,
            tenantId: user.tenantId,
            email: user.email,
            description: description,
            public_key: accountPublicKey,
            salt: salt,
            encrypted_secret: encryptedSecret,
            passphrase: encryptedPassphrase,
            pre_authorize_transactions: preAuthorizedTransactions
        })

        await account.save();

        logger.trace('registerAccount exit', account);
        return account;
    }

    async getAccount(user, publicKey, shallowCopy) {
        logger.trace('getAccount entry', [user, publicKey, shallowCopy]);
        const account = await Account.findOne({ userId: user.id, public_key: publicKey });
        if (!account) {
            logger.trace('getAccount exit - not found');
            return account;
        }
        if(shallowCopy){
            logger.trace('getAccount exit');
            return account;
        }else{
            const stellAccount = await this._mergeAccountFields(account, publicKey);

            logger.trace('getAccount exit');
            return stellAccount;
        }
    }

    async getAccounts(user) {
        logger.trace('getAccounts entry', user);
        const accounts = await Account.find({ userId: user.id });
        let mergedAccounts = []
        for (const account of accounts) {
            const stellAccount = await this._mergeAccountFields(account, account.public_key);
            mergedAccounts.push(stellAccount);
        }
        logger.trace('getAccounts exit');
        return mergedAccounts;
    }

    async checkAuthorized(user, publicKey){
        logger.trace('checkAuthorized entry', [user, publicKey]);
        let authorized = false;
        if(user && user.id && publicKey){
            const account = await Account.findOne({ userId: user.id, public_key: publicKey });
            if (account) {
                authorized = true;
            }
        }
        logger.trace('checkAuthorized exit', authorized);
        return authorized;
    }

    async createAsset(user, assetCode, assetIssuer, description) {
        logger.trace('createAsset entry', user);
        const stellarAsset = await _stellar.createAsset(assetCode, assetIssuer);
        logger.trace('checkAuthorized stellarAsset created', stellarAsset);
        const asset = new Asset ({
            userId: user.id,
            tenantId: user.tenantId,
            email: user.email,
            asset_code: assetCode,
            asset_issuer: assetIssuer,
            description: description
        })
        const result = await asset.save();
        logger.trace('createAsset exit', [asset, result]);
        return asset;
    }
    async getAssets(user) {
        logger.trace('getAssets entry', user);
        const assets = await Asset.find({ tenantId: user.tenantId });
        logger.trace('getAssets exit', assets);
        return assets;
    }

    async _mergeAccountFields(account, publicKey){
        logger.trace('_mergeAccountFields entry', [account, publicKey]);
        const stellAccount = await _stellar.getAccountDetails(publicKey);
        _.forEach(account.toObject(), function(value, key) {
            if(key === '_id'){
                _.set(stellAccount, 'id', value);
            }else{
                _.set(stellAccount, key, value);
            }
        });
        logger.trace('_mergeAccountFields exit', [stellAccount]);
        return stellAccount;
    }

    async getFee(type){
        logger.trace('getFee entry', [type]);
        const result = fees[type];
        logger.trace('getFee exit', [result]);
        return result;
    }

};
