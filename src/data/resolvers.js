// data/resolvers.js

const Wallet  = require('../models/Wallet');
const _wallet = new Wallet();
const StellarNetwork  = require('../models/StellarNetwork');
const _stellar = new StellarNetwork();
const TransactionHandler  = require('../models/TransactionHandler');
const _transactionHandler = new TransactionHandler();

const Security = require ('../utils/Security');
const _security =  new Security();
const bcrypt = require('bcrypt');

const log4js = require('log4js');
const logger = log4js.getLogger('resolvers');
logger.level = process.env.LOG_LEVEL || 'debug';

const i18n = require('i18n');
const path = require('path');
i18n.configure({
    directory: path.join(__dirname, '/../locales')
});

const { AuthenticationError, ApolloError } = require ('apollo-server');
const { GraphQLScalarType } = require('graphql');
const { Kind } = require('graphql/language');
const _ = require('lodash');
const validUrl = require('valid-url');

const resolvers = {
    History: {
        __resolveType(obj, context, info){
            if(obj.type === 'create_account'){
                return 'Create_Account';
            }
            if(obj.type === 'change_trust'){
                return 'Change_Trust';
            }
            if(obj.type === 'allow_trust'){
                return 'Allow_Trust';
            }
            if(obj.type === 'payment'){
                return 'Payment';
            }
            if(obj.type === 'manage_offer'){
                return 'Manage_Offer';
            }
            if(obj.type === 'set_options'){
                if(obj.signer_key || obj.signer_weight){
                    return 'Set_Signers';
                }else if(obj.clear_flags || obj.set_flags){
                    return 'Account_Flags';
                }else if(obj.home_domain){
                    return 'Home_Domain';
                }else{
                    return 'Set_Threshold';
                }
            }
            return null;
        },
    },
    Account: {
        __resolveType(obj, context, info){
            if(obj.tenantId){
                return 'TF_Account';
            }
            return 'Core_Account';
        },
    },
    Asset: {
        __resolveType(obj, context, info){
            if(obj.tenantId){
                return 'TF_Asset';
            }
            return 'Core_Asset';
        },
    },
    Query:{
        // Handle listing of accounts for single tenant
        async getAccounts (obj, args, { user } ) {
            logger.trace('getAccounts entry', user);
            const accounts = await _wallet.getAccounts(user)
            logger.trace('getAccounts exit', accounts);
            // return list of accounts for a tenant
            return accounts;
        },
        async getAccount (obj, args, { user } ) {
            logger.trace('getAccount entry', [args, user]);
            const account = await _wallet.getAccount(user, args.public_key)
            logger.trace('getAccount exit', account);
            return account;
        },
        async getInitiatedTransactions (obj, args, { user } ) {
            logger.trace('getInitiatedTransactions entry', [args.public_key]);
            const initiatedTransactions = await _transactionHandler.getInitiatedTransactions(args.public_key)
            logger.trace('getInitiatedTransactions exit');
            return initiatedTransactions;
        },
        async getTransactionsToSign (obj, args, { user } ) {
            logger.trace('getTransactionsToSign entry', [args.public_key]);
            const transactionsToSign = await _transactionHandler.getTransactionsToSign(args.public_key)
            logger.trace('getTransactionsToSign exit');
            return transactionsToSign;
        },
        // Handle listing of account balances for a tenant's public key
        async getOffers (obj, args, { user } ) {
            logger.trace('getOffers entry', [args, user]);
            const authorized = await _wallet.checkAuthorized(user, args.public_key)
            if(!authorized){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const offers = await _stellar.getOffers(args.public_key)
            logger.trace('getOffers exit', offers);
            // return list of account balances for a tenant's public key
            return offers;
        },
        // Handle listing of account balances for a tenant's public key
        async getBalances (obj, args, { user } ) {
            logger.trace('getBalances entry', [args, user]);
            const authorized = await _wallet.checkAuthorized(user, args.public_key)
            if(!authorized){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const balances = await _stellar.getBalances(args.public_key)
            logger.trace('getBalances exit', balances);
            // return list of account balances for a tenant's public key
            return balances;
        },
        async getHistory (obj, args, { user } ) {
            logger.trace('getHistory entry', [args, user]);
            const authorized = await _wallet.checkAuthorized(user, args.public_key)
            if(!authorized){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const balances = await _stellar.getHistory(args.public_key, args.type)
            logger.trace('getHistory exit', balances);
            // return history of the account for user's public key
            return balances;
        },
        // Handle listing of assets for single tenant
        async getAssets (obj, args, { user } ) {
            logger.trace('getAssets entry', user);
            const assets = await _wallet.getAssets(user)
            logger.trace('getAssets exit', assets);
            // return list of assets for a tenant
            return assets;
        },
        async getOrderbook(obj, args, { user } ) {
            logger.trace('getOrderBook entry', user);
            const orders = await _stellar.getOrderbook(args.sell_asset_code, args.sell_asset_issuer, args.buy_asset_code, args.buy_asset_issuer)
            logger.trace('getOrderBook exit', orders);
            // return list of orders that match buy and sell assets offers
            return orders;
        },
        async getFee (obj, args, { user } ) {
            logger.trace('getFee entry', [args, user]);
            const fee = await _wallet.getFee(args.type)
            logger.trace('getFee exit', fee);
            // return fee details for that fee type
            return fee;
        }

    },
    Mutation: {
        // Handle user Stellar account creation
        async createAccount (obj, args, { user } ) {
            logger.trace('createAccount entry', user);
            let trustAuthorizationRequired = false;
            if (args.trust_auth_required) {
                trustAuthorizationRequired = args.trust_auth_required;
            }
            let preAuthorizeTransactions = false;
            if (args.pre_authorize_transactions) {
                preAuthorizeTransactions = args.pre_authorize_transactions;
            }
            const domain = args.home_domain;
            if(domain && !validUrl.isUri(domain)){
                throw new ApolloError(i18n.__('create.account.fail.invalid.uri'))
            }

            const account = await _wallet.bootstrapAccountFromTestNetwork(user,args.description, args.passphrase, trustAuthorizationRequired, preAuthorizeTransactions, domain);
            if (!account) {
                throw new ApolloError(i18n.__('create.account.fail'))
            }
            logger.trace('createAccount exit', account);
            // return newly created account
            return account;
        },
        // Handle user Stellar account creation
        async createAccountFromSource (obj, args, { user } ) {
            logger.trace('createAccountFromSource entry', args);
            let trustAuthorizationRequired = false;
            if (args.trust_auth_required) {
                trustAuthorizationRequired = args.trust_auth_required;
            }
            let preAuthorizeTransactions = false;
            if (args.pre_authorize_transactions) {
                preAuthorizeTransactions = args.pre_authorize_transactions;
            }
            const domain = args.home_domain;
            if(domain && !validUrl.isUri(domain)){
                throw new ApolloError(i18n.__('create.account.fail.invalid.uri'))
            }

            const account = await _wallet.createAccountFromSource(user, args.description, args.source_public_key, args.source_secret, args.passphrase, args.initial_balance, trustAuthorizationRequired, preAuthorizeTransactions, domain);
            if (!account) {
                throw new ApolloError(i18n.__('create.account.fail'))
            }
            logger.trace('createAccountFromSource exit', account);
            // return newly created account
            return account;
        },
        async createAsset (obj, args, { user } ) {
            logger.trace('createAsset entry', [args, user]);
            const authorized = await _wallet.checkAuthorized(user, args.asset_issuer)
            if(!authorized){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const createAssetResult = await _wallet.createAsset(user, args.asset_code, args.asset_issuer, args.description)
            logger.trace('createAsset exit', createAssetResult);
            return createAssetResult;
        },
        async createAllowTrustTransaction  (obj, args, { user } ) {
            logger.trace('createAllowTrustTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.asset_issuer, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.asset_issuer);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            const createAllowTrustTransaction = await _transactionHandler.setupAllowTrustTransaction(loadedAccount, args.asset_issuer, args.asset_code, args.trustor_public_key, args.authorize_trust)
            logger.trace('createAllowTrustTransaction exit', createAllowTrustTransaction.hash);
            return createAllowTrustTransaction;
        },
        async createTrustTransaction  (obj, args, { user } ) {
            logger.trace('createTrustTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.trustor_public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.trustor_public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }

            const changeAssetTrustLevel = await _transactionHandler.setupChangeTrustTransaction(loadedAccount, args.trustor_public_key, args.asset_code, args.asset_issuer, args.limit)
            logger.trace('createTrustTransaction exit', changeAssetTrustLevel.hash);
            return changeAssetTrustLevel;
        },
        async createPayment (obj, args, { user } ) {
            logger.trace('createPayment entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.sender_public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.sender_public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }

            const createPaymentResult = await _transactionHandler.setupPaymentTransaction(loadedAccount,
                args.sender_public_key, args.receiver_public_key, args.asset_code, args.asset_issuer, args.amount)
            logger.trace('createPayment exit', createPaymentResult.hash);
            return createPaymentResult;
        },
        async createOffer (obj, args, { user } ) {
            logger.trace('createOffer entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }

            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            var createOfferTransaction = await _transactionHandler.createOfferTransaction(loadedAccount, args.public_key, '0', args.sell_asset_code, args.sell_asset_issuer, args.sell_amount, args.buy_asset_code, args.buy_asset_issuer, args.buy_amount);

            logger.trace('createOffer exit', args);
            return createOfferTransaction;
        },
        async updateOffer (obj, args, { user } ) {
            logger.trace('updateOffer entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            var createOfferTransaction = await _transactionHandler.createOfferTransaction(loadedAccount, args.public_key, args.offer_id, args.sell_asset_code, args.sell_asset_issuer, args.sell_amount, args.buy_asset_code, args.buy_asset_issuer, args.buy_amount);

            logger.trace('updateOffer exit', args);
            return createOfferTransaction;
        },
        async deleteOffer (obj, args, { user } ) {
            logger.trace('deleteOffer entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            var createOfferTransaction = await _transactionHandler.createOfferTransaction(loadedAccount, args.public_key, args.offer_id, args.sell_asset_code, args.sell_asset_issuer, '0', args.buy_asset_code, args.buy_asset_issuer, '0');
            logger.trace('deleteOffer exit', args);
            return createOfferTransaction;
        },
        async signTransaction (obj, args, { user } ) {
            logger.trace('signTransaction entry', [args, user]);
            const account = await _wallet.getAccount(user, args.public_key, true)
            if(!account){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const valid = await bcrypt.compare(args.passphrase, account.passphrase)
            if (!valid) {
                throw new AuthenticationError(i18n.__('incorrect.passphrase'))
            }
            const decryptedSecret = await _security.decrypt (account.encrypted_secret, args.passphrase, account.salt);
            const signTransactionResult = await _transactionHandler.signTransaction(args.public_key, decryptedSecret, args.transaction_id)
            logger.trace('signTransaction exit');
            return signTransactionResult;
        },
        async preAuthorizeTransaction (obj, args, { user } ) {
            logger.trace('preAuthorizeTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const valid = await bcrypt.compare(args.passphrase, accountFromDB.passphrase)
            if (!valid) {
                throw new AuthenticationError(i18n.__('incorrect.passphrase'))
            }
            const decryptedSecret = await _security.decrypt (accountFromDB.encrypted_secret, args.passphrase, accountFromDB.salt);
            const preAuthorizeTransactionResult = await _transactionHandler.preAuthorizeTransaction(args.public_key, decryptedSecret, args.transaction_id, args.final_approver);
            logger.trace('preAuthorizeTransaction exit');
            return preAuthorizeTransactionResult;
        },
        async submitPreAuthorizedTransaction (obj, args, { user } ) {
            logger.trace('submitPreAuthorizedTransaction entry', [args, user]);
            const preAuthorizeTransactionResult = await _transactionHandler.submitPreAuthorizedTransaction(args.transaction_id, args.final_approver);
            logger.trace('submitPreAuthorizedTransaction exit');
            return preAuthorizeTransactionResult;
        },
        async createSignerTransaction (obj, args, { user } ) {
            logger.trace('createSignerTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            const createSignerTransactionResult = await _transactionHandler.setupSetOptionsTransaction_Signer(loadedAccount, args.public_key, 'ed25519PublicKey', args.signer, args.weight);
            logger.trace('createSignerTransaction exit', createSignerTransactionResult.hash);
            return createSignerTransactionResult;
        },
        async createWeightThresholdTransaction (obj, args, { user } ) {
            logger.trace('createWeightThresholdTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            const createWeightThresholdTransactionResult = await _transactionHandler.setupSetOptionsTransaction_Weights(loadedAccount, args.public_key, args.weight, args.low, args.medium, args.high);
            logger.trace('createWeightThresholdTransaction exit', createWeightThresholdTransactionResult.hash);
            return createWeightThresholdTransactionResult;
        },
        async createFlagTransaction (obj, args, { user } ) {
            logger.trace('createFlagTransaction entry', [args, user]);
            const accountFromDB = await _wallet.getAccount(user, args.public_key, true)
            if(!accountFromDB){
                throw new AuthenticationError(i18n.__('user.not.authorized'))
            }
            const loadedAccount = await _stellar.loadAccount(args.public_key);
            if (accountFromDB.pre_authorize_transactions || args.pre_authorize_transaction) {
                loadedAccount.incrementSequenceNumber();
            }
            const createFlagTransactionResult = await _transactionHandler.setupSetOptionsTransaction_Flags(loadedAccount, args.public_key, args.flag_operation, args.flag_to_set);
            logger.trace('createFlagTransaction exit', createFlagTransactionResult.hash);
            return createFlagTransactionResult;
        }
    },
    Date: new GraphQLScalarType({
        name: 'Date',
        description: 'Date custom scalar type',
        parseValue(value) {
            return new Date(value); // value from the client
        },
        serialize(value) {
            if(_.isDate (value)){
                return value.getTime(); // value sent to the client
            }else{
                const tmpDate = Date.parse(value)
                return new Date(tmpDate).getTime();// value sent to the client
            }
        },
        parseLiteral(ast) {
            if (ast.kind === Kind.INT) {
                return parseInt(ast.value, 10); // ast value is always in string format
            }
            return null;
        }
    })
}

module.exports = resolvers
