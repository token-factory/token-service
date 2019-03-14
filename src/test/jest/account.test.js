const chai = require('chai');
const assert = chai.assert;
const log4js = require('log4js');
const logger = log4js.getLogger('account.test');
logger.level = process.env.LOG_LEVEL || 'debug';
const jsonwebtoken = require('jsonwebtoken');
const Stellar = require('stellar-sdk');
const uuidv4 = require('uuid/v4');
const fees = require('../../models/fees.json');
const Wallet  = require('../../models/Wallet');
const _wallet = new Wallet();
const StellarNetwork  = require('../../models/StellarNetwork');
const _stellar = new StellarNetwork();

// application dependencies..
const app = require('../../app')
const mongoose = require('mongoose');
require('../../config/initializers/database');
require('./axios-debug')
const delay = require('delay');

const request = require('supertest');

describe('Account Tests', function () {
    let bearerToken;
    let bootstrapKeypair;
    let bootstrapPublicKey;
    let bootstrapSecret;
    let masterKeypair;
    let masterPublicKey;
    let masterSecret;
    let offeringFeeKey;
    let issuingFeeKey;
    let passphrase = 'rememberme';

    beforeAll(async(done) => {
        jest.setTimeout(50000);
        // return json web token
        bearerToken = jsonwebtoken.sign({
            tenantId: uuidv4(),
            id: uuidv4(),
            email: 'johndoe@example.com'
        },
        process.env.JWT_SECRET,{ expiresIn: '1D' })
        logger.info('Bearer token',bearerToken );

        if(process.env.STELLAR_NETWORK){
            masterKeypair = Stellar.Keypair.master();
        } else {
            // if not network specified, we default to testnet + friendbot
            masterKeypair = await _stellar.bootstrapTestAccount();
        }

        masterPublicKey = masterKeypair.publicKey();
        masterSecret = masterKeypair.secret();

        const masterAcct = await _stellar.loadAccount(masterPublicKey);
        let sourceAcctSequenceNum = Number(masterAcct.sequence);
        logger.trace('master acct sequence num starts ',sourceAcctSequenceNum);

        bootstrapKeypair = Stellar.Keypair.random();
        bootstrapPublicKey = bootstrapKeypair.publicKey();
        bootstrapSecret = bootstrapKeypair.secret();

        const user = {'id': uuidv4(), 'tenantId': uuidv4(), 'email': 'fee_collector@ibm.co'};

        try {
            const bootstrapTestAccount = await _wallet.initializeExistingKeypair(user, 'test bootstrap acct', masterPublicKey, masterSecret, sourceAcctSequenceNum, bootstrapPublicKey, bootstrapSecret, passphrase, '9000');
            logger.trace('init keypair for bootstrapTestAccount ',bootstrapTestAccount);
            sourceAcctSequenceNum = Number(sourceAcctSequenceNum) + Number(1);
            logger.trace('master acct sequence num post bootstrap ',sourceAcctSequenceNum);
        } catch (error) {
            logger.trace('init keypair error',error);
        }

        offeringFeeKey = fees['FEE_OFFER'].destination;
        issuingFeeKey = fees['FEE_ISSUANCE'].destination;

        let issuingFeeAccount;
        try{
            issuingFeeAccount = await _stellar.loadAccount(issuingFeeKey);
        }catch (error){
            // ignore
        }
        if (!issuingFeeAccount) {
            await _wallet.initializeExistingKeypair(user, 'issuing fee', masterPublicKey, masterSecret, sourceAcctSequenceNum, issuingFeeKey, 'SECRET_NOT_NEEDED', passphrase, '1000');
            sourceAcctSequenceNum = Number(sourceAcctSequenceNum) + Number(1);
        }
        logger.trace('master acct sequence num post issuing ',sourceAcctSequenceNum);

        let offeringFeeAccount;
        try{
            offeringFeeAccount = await _stellar.loadAccount(offeringFeeKey);
        }catch (error){
            // ignore
        }
        if (!offeringFeeAccount) {
            await _wallet.initializeExistingKeypair(user, 'offering fee', masterPublicKey, masterSecret, sourceAcctSequenceNum, offeringFeeKey, 'SECRET_NOT_NEEDED', passphrase, '1000');
            sourceAcctSequenceNum = Number(sourceAcctSequenceNum) + Number(1);
        }

        logger.trace('master acct sequence num post offering ',sourceAcctSequenceNum);
        done();
    });

    //CLEAN UP DB connection
    afterAll(async(done) => {
        mongoose.connection.close();
        done();
    });

    describe('Account flow including retrieving balances and history plus asset creation', () => {
        let public_key = '';
        it('Seed new account from source account', async(done) => {
            logger.info('Seed new account from source account', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"newly seeded account" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '"  initial_balance:"20") { ... on TF_Account { email tenantId public_key description thresholds {low_threshold} signers{weight} flags{auth_required}}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(newSeededAccount);
            assert.isNotNull(newSeededAccount.public_key);
            assert.isNotNull(newSeededAccount.description);
            assert.equal(1, newSeededAccount.signers.length);
            assert.equal(1, newSeededAccount.signers[0].weight);
            assert.equal(0, newSeededAccount.thresholds.low_threshold);
            assert.isNotNull(newSeededAccount.thresholds.master_weight);
            assert.isNotNull(newSeededAccount.signers[0].public_key);
            public_key = newSeededAccount.public_key;
            done();
        },30000);

        it('Retrieve newly created account', async(done) => {
            logger.info('Retrieve new account for source account', [public_key]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getAccount (public_key:"'+ public_key + '"){ ... on TF_Account { email description tenantId createdAt } public_key thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['getAccount']
            assert.isNotNull(newSeededAccount, 'Verify the retrieved account is not null');
            assert.isNotNull(newSeededAccount.public_key, 'Verify the retrieved public key is not null');
            assert.isNotNull(newSeededAccount.createdAt, 'Verify the retrieved account has a createdAt date');
            assert.equal(newSeededAccount.public_key, public_key, 'Verify public_key matches')
            assert.isNotNull(newSeededAccount.description, 'Verify the retrieved description is not null');
            assert.equal(newSeededAccount.description,'newly seeded account', 'Verify description matches')
            assert.isNotNull(newSeededAccount.thresholds, 'Verify the retrieved thresholds are not null');
            assert.isNotNull(newSeededAccount.signers, 'Verify the retrieved signers are not null');
            done();
        },30000);
        it('Get balances for account', async(done) => {
            logger.info('Get balance',public_key);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getBalances (public_key:"'+ public_key +
                    '") {network asset_code asset_issuer balance} }'} );
            const balance = JSON.parse(res.text)['data']['getBalances'];
            assert.isNotNull(balance );
            done();
        },15000)
        it('Get history for account', async(done) => {
            logger.info('Get history', public_key);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ public_key
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount transaction_hash} } }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            assert.equal(1, history.length);
            assert.equal('create_account', history[0].type);
            done();
        })

        it('Verify creation of asset', async(done) => {
            logger.info('Create asset', public_key);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ public_key+ '" asset_code:"AstroDollars"'+
                    'description:"Jetson dollars") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['data']['createAsset'];
            assert.equal(assetCreated.description,'Jetson dollars', 'Verify description matches')
            assert.isNotNull(assetCreated );
            done();
        })
        it('Verify creation of duplicate asset fails', async(done) => {
            logger.info('Create asset', public_key);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ public_key+ '" asset_code:"AstroDollars"'+
                    'description:"Jetson dollars") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['errors'][0]['message'];
            assert.isNotNull(assetCreated );
            done();
        })

        it('Verify list of assets returned', async(done) => {
            logger.info('Get Assets');
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getAssets { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt}  } }'} );
            const assets = JSON.parse(res.text)['data']['getAssets'];
            assert.isNotNull(assets );
            assert.equal(1, assets.length); // Verify we can retrieve the created asset
            assert.equal(assets[0].description,'Jetson dollars', 'Verify description matches')
            assert.equal(assets[0].asset_code,'AstroDollars', 'Verify asset code matches')
            assert.equal(assets[0].asset_issuer, public_key, 'Verify owner matches')
            done();
        })
    });

    describe('Get fees', () => {
        it('Get fees', async(done) => {
            logger.info('Get fees');
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getFee (type: "FEE_ISSUANCE") {name description rate type }}'} )
            const fee = JSON.parse(res.text)['data']['getFee']
            assert.isNotNull(fee );
            assert.isNotNull (fee.name);
            assert.isNotNull (fee.description);
            assert.isNotNull (fee.rate);
            assert.isNotNull (fee.type);
            done();
        },30000)
    });

    describe('Get accounts for tenant', () => {
        it('Get accounts', async(done) => {
            logger.info('Get accounts');
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getAccounts { ... on TF_Account { createdAt email description tenantId }  public_key  thresholds{low_threshold} signers{weight} flags{auth_required} }}'} )
            const accountsList = JSON.parse(res.text)['data']['getAccounts']
            assert.isNotNull(accountsList );
            assert.equal(1, accountsList.length);
            done();
        },30000)
    });

    describe('Create transaction for a given asset', () => {
        let trustorPublicKey='';
        let issuerPublicKey='';
        let transactionId = '';

        it('Create trustor account for new asset', async(done) => {
            logger.info('Create trustor account',[ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"trustorAccount" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const trustorAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(trustorAccountCreated);
            assert.isNotNull(trustorAccountCreated.description);
            assert.isNotNull(trustorAccountCreated.public_key);
            trustorPublicKey = trustorAccountCreated.public_key;
            done();
        },30000)

        it('Create issuer account for new asset', async(done) => {
            logger.info('Create issuer account', [ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"issuerAccount" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const issuerAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(issuerAccountCreated);
            assert.isNotNull(issuerAccountCreated.description);
            assert.isNotNull(issuerAccountCreated.public_key);
            issuerPublicKey = issuerAccountCreated.public_key;
            done();
        },30000)

        it('Trust Asset ', async(done) => {
            logger.info('Trust Asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createTrustTransaction (trustor_public_key:"' + trustorPublicKey + '" asset_issuer:"' + issuerPublicKey + '" asset_code:"Yellen" limit:"2000") {id}}'} );

            const trustAssetResult = JSON.parse(res.text)['data']['createTrustTransaction'];
            transactionId = trustAssetResult.id;
            assert.isNotNull(trustAssetResult);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + trustorPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)


        it('Create Payment of New Asset ', async(done) => {
            logger.info('Create Payment of New Asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createPayment (sender_public_key:"' + issuerPublicKey + '" receiver_public_key:"' + trustorPublicKey + '" asset_issuer:"' + issuerPublicKey + '" asset_code:"Yellen" amount:"2000") {id hash}}'} );
            const createPaymentResult = JSON.parse(res.text)['data']['createPayment'];
            transactionId = createPaymentResult.id;
            assert.isNotNull(createPaymentResult);
            assert.isNotNull(createPaymentResult.description);
            assert.isNotNull(createPaymentResult.hash);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create Signer Transaction ', async(done) => {
            logger.info('Set up Signer Options Transaction ', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation {  createSignerTransaction (public_key:"' + issuerPublicKey + '" signer:"' + trustorPublicKey + '" weight:1) {id hash}}'} );
            const createSignerTransactionResult = JSON.parse(res.text)['data']['createSignerTransaction'];
            transactionId = createSignerTransactionResult.id;
            assert.isNotNull(createSignerTransactionResult.hash);
            assert.isNotNull(createSignerTransactionResult.description);
            assert.isNotNull(createSignerTransactionResult);

            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        let xdr_representation ='';
        let paymentTransactionId = '';

        it('Create Payment Transaction ', async(done) => {
            logger.info('Create Payment Transaction', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createPayment (sender_public_key:"' + issuerPublicKey + '" receiver_public_key:"' + trustorPublicKey + '" asset_issuer:"' + issuerPublicKey + '" asset_code:"XLM" amount:"0.1") {id type source_acct xdr_representation  operations{op_type source_acct signatures{public_key signed}} }}'} );
            const createPaymentResult = JSON.parse(res.text)['data']['createPayment'];
            assert.isNotNull(createPaymentResult);
            assert.isNotNull(createPaymentResult.description);
            assert.isNotNull(createPaymentResult.operations[0].op_type);
            assert.equal(createPaymentResult.operations[0].source_acct, issuerPublicKey, 'Payment operation source key does not match');
            assert.equal(createPaymentResult.source_acct, issuerPublicKey, 'Payment transaction source key does not match');
            xdr_representation = createPaymentResult.xdr_representation;
            paymentTransactionId = createPaymentResult.id;
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, xdr_representation, paymentTransactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + paymentTransactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, paymentTransactionId, 'Transaction ID does not match');
            assert.notEqual(signTransactionResult.xdr_representation, xdr_representation, 'Serialized transaction should be different after signature');
            done();
        },30000)



        it('Get history for account with create payment', async(done) => {
            logger.info('Get history for account with create payment', [issuerPublicKey]);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ issuerPublicKey
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount memo transaction_hash} ... on Manage_Offer {buying_asset_type buying_asset_code buying_asset_issuer selling_asset_type selling_asset_code selling_asset_issuer amount offer_id price}} }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            assert.equal(6, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('payment', history[1].type);    // offer
            assert.equal('payment', history[2].type); // IBM fee charged for offers
            assert.isNotNull(history[1].amount);
            assert.equal('set_options', history[3].type);    // add signer
            assert.equal('payment', history[4].type);    // offer
            assert.isNotNull(history[4].amount);
            assert.equal('payment', history[5].type); // IBM fee charged for offers
            done();
        })

        it('Create account from source - trust auth required', async(done) => {
            logger.info('Create account from source - trust auth required', [ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"issuerAccount2" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400" trust_auth_required:true) { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required auth_revocable}}}'} );
            const issuerAccountCreated2 = JSON.parse(res.text)['data']['createAccountFromSource']
            logger.info('#result#', res.text);
            assert.isNotNull(issuerAccountCreated2);
            assert.isNotNull(issuerAccountCreated2.description);
            assert.isNotNull(issuerAccountCreated2.public_key);
            assert.equal(true, issuerAccountCreated2.flags.auth_required);
            assert.equal(true, issuerAccountCreated2.flags.auth_revocable);
            done();
        },30000)
    });


    describe('Set weight threshold options', () => {
        let issuerPublicKey = '';
        let trustorPublicKey = '';
        let transactionId = '';

        it('Create new issuer account from source account', async(done) => {
            logger.info('Seed new account from source account', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"issuer account" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(newSeededAccount);
            assert.isNotNull(newSeededAccount.public_key);
            issuerPublicKey = newSeededAccount.public_key;
            done();
        },30000);

        it('Create trustor account for new asset', async(done) => {
            logger.info('Create trustor account',[ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"trustorAccount" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const trustorAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(trustorAccountCreated);
            assert.isNotNull(trustorAccountCreated.description);
            assert.isNotNull(trustorAccountCreated.public_key);
            trustorPublicKey = trustorAccountCreated.public_key;
            done();
        },30000)

        it('Create weight threshold transaction ', async(done) => {
            logger.info('Create weight threshold transaction', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createWeightThresholdTransaction (public_key:"' + issuerPublicKey + '" weight:2 low:1 medium:1 high:2) {hash id}}'} );
            const setWeightThresholdOptionsResult = JSON.parse(res.text)['data']['createWeightThresholdTransaction'];
            assert.isNotNull(setWeightThresholdOptionsResult);
            assert.isNotNull(setWeightThresholdOptionsResult.description);
            assert.isNotNull(setWeightThresholdOptionsResult.hash);
            transactionId = setWeightThresholdOptionsResult.id;
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create Signer Transaction - Delete', async(done) => {
            logger.info('Set up Signer Options Transaction - Delete', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation {  createSignerTransaction (public_key:"' + issuerPublicKey + '" signer:"' + trustorPublicKey + '" weight:0) {id hash}}'} );
            const createSignerTransactionResult = JSON.parse(res.text)['data']['createSignerTransaction'];
            transactionId = createSignerTransactionResult.id;
            assert.isNotNull(createSignerTransactionResult);
            assert.isNotNull(createSignerTransactionResult.description);
            assert.isNotNull(createSignerTransactionResult.hash);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create Flag Transaction - set', async(done) => {
            logger.info('Set up Flag Options Transaction - Set Flags', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation {  createFlagTransaction (public_key:"' + issuerPublicKey + '" flag_operation:"setFlags" flag_to_set:"AuthRequiredFlag") {id hash}}'} );
            const createFlagTransactionResult = JSON.parse(res.text)['data']['createFlagTransaction'];
            transactionId = createFlagTransactionResult.id;
            assert.isNotNull(createFlagTransactionResult);
            assert.isNotNull(createFlagTransactionResult.description);
            assert.isNotNull(createFlagTransactionResult.hash);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create Flag Transaction - clear', async(done) => {
            logger.info('Set up Flag Options Transaction - Clear Flags', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation {  createFlagTransaction (public_key:"' + issuerPublicKey + '" flag_operation:"clearFlags" flag_to_set:"AuthRequiredFlag") {id hash}}'} );
            const createFlagTransactionResult = JSON.parse(res.text)['data']['createFlagTransaction'];
            transactionId = createFlagTransactionResult.id;
            assert.isNotNull(createFlagTransactionResult);
            assert.isNotNull(createFlagTransactionResult.description);
            assert.isNotNull(createFlagTransactionResult.hash);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)
    });

    describe('Create and Sign Offer', () => {
        let issuerPublicKey = '';
        let transactionId = '';

        it('Create new issuer account from source account', async(done) => {
            logger.info('Seed new account from source account', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"issuer account" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '" initial_balance:"2000") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(newSeededAccount);
            assert.isNotNull(newSeededAccount.public_key);
            issuerPublicKey = newSeededAccount.public_key;
            done();
        },30000);

        it('Verify creation of asset', async(done) => {
            logger.info('Create asset', issuerPublicKey);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ issuerPublicKey+ '" asset_code:"Bernanke"'+
                    'description:"Benji Bucks") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['data']['createAsset'];
            assert.equal(assetCreated.description,'Benji Bucks', 'Verify description matches')
            assert.isNotNull(assetCreated );
            done();
        })

        it('Create offer of asset ', async(done) => {
            logger.info('Create offer of asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createOffer (public_key:"' + issuerPublicKey + '" sell_asset_code:"Bernanke" sell_asset_issuer:"' + issuerPublicKey + '" sell_amount:"100" buy_asset_code:"XLM" buy_amount:"100") {id type source_acct description xdr_representation submitted}}'} );
            const createOfferResult = JSON.parse(res.text)['data']['createOffer'];
            assert.isNotNull(createOfferResult);
            assert.isNotNull(createOfferResult.description);
            transactionId = createOfferResult.id;
            done();
        },30000)

        it('Sign Offer ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create offer of asset ', async(done) => {
            logger.info('Create offer of asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createOffer (public_key:"' + issuerPublicKey + '" sell_asset_code:"Bernanke" sell_asset_issuer:"' + issuerPublicKey + '" sell_amount:"33" buy_asset_code:"XLM" buy_amount:"11") {id type source_acct description xdr_representation submitted}}'} );
            const createOfferResult = JSON.parse(res.text)['data']['createOffer'];
            assert.isNotNull(createOfferResult);
            transactionId = createOfferResult.id;
            done();
        },30000)

        it('Sign Offer ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get Orderbook for offers of that asset', async(done) => {
            logger.info('Get Orderbook', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getOrderbook (buy_asset_code:"Bernanke" buy_asset_issuer:"' + issuerPublicKey + '" sell_asset_code:"XLM"'
                    + ') { bids { price amount } asks { price amount} base {asset_code asset_type} counter {asset_code asset_type}  } }'} );
            const orderbook = JSON.parse(res.text)['data']['getOrderbook'];
            assert.isNotNull(orderbook);
            assert.equal(orderbook.counter.asset_code, 'Bernanke');
            assert.equal(orderbook.base.asset_type, 'native');
            done();
        })

        it('Get offers for account', async(done) => {
            logger.info('Get Offers', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getOffers (public_key:"'+ issuerPublicKey
                    + '") { id price amount selling {asset_code asset_type} buying {asset_code asset_type} } }'} );
            const offers = JSON.parse(res.text)['data']['getOffers'];
            assert.isNotNull(offers);
            assert.equal(offers.length, 2);
            assert.isNotNull(offers[0].id);
            assert.equal(offers[0].price, '1.0000000');
            assert.equal(offers[0].amount, '100.0000000');
            assert.equal(offers[0].selling.asset_code, 'Bernanke');
            assert.equal(offers[0].buying.asset_type, 'native');
            assert.equal(offers[1].price, '0.3333333');
            assert.equal(offers[1].amount, '33.0000000');
            assert.equal(offers[1].selling.asset_code, 'Bernanke');
            assert.equal(offers[1].buying.asset_type, 'native');
            done();
        })



        let buyerPublicKey = '';
        it('Create new buyer account from source account', async(done) => {
            logger.info('Seed new account from source account', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"buyer account" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"2000") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(newSeededAccount);
            assert.isNotNull(newSeededAccount.public_key);
            buyerPublicKey = newSeededAccount.public_key;
            done();
        },30000);

        it('Trust Asset ', async(done) => {
            logger.info('Trust Asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createTrustTransaction (trustor_public_key:"' + buyerPublicKey + '" asset_issuer:"' + issuerPublicKey + '" asset_code:"Bernanke" limit:"200000") {id}}'} );

            const trustAssetResult = JSON.parse(res.text)['data']['createTrustTransaction'];
            assert.isNotNull(trustAssetResult.description);
            transactionId = trustAssetResult.id;
            assert.isNotNull(trustAssetResult);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + buyerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Create offer to buy asset ', async(done) => {
            logger.info('Create offer of asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createOffer (public_key:"' + buyerPublicKey + '" buy_asset_code:"Bernanke" buy_asset_issuer:"' + issuerPublicKey + '" buy_amount:"100" sell_asset_code:"XLM" sell_amount:"100") {id type source_acct description xdr_representation submitted}}'} );
            const createOfferResult = JSON.parse(res.text)['data']['createOffer'];
            assert.isNotNull(createOfferResult);
            assert.isNotNull(createOfferResult.description);
            transactionId = createOfferResult.id;
            done();
        },30000)

        it('Sign Offer ', async(done) => {
            logger.info('Sign Transaction', [buyerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + buyerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)


        it('Get history for account with offers with orderbook ', async(done) => {
            logger.info('Get history with offers with orderbook', [buyerPublicKey]);
            await delay(5000); // give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ buyerPublicKey
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount transaction_hash} ... on Manage_Offer {buying_asset_type buying_asset_code buying_asset_issuer selling_asset_type selling_asset_code selling_asset_issuer amount offer_id price}} }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            assert.equal(4, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('change_trust', history[1].type);
            assert.equal('manage_offer', history[2].type);    // offer
            assert.equal('payment', history[3].type); // IBM fee charged for offers
            assert.isNotNull(history[3].amount);

            assert.isNotNull(history);
            done();
        })
    });

    describe('Create allow trust transaction for a given asset', () => {
        let trustorPublicKey='';
        let issuerPublicKey='';
        let transactionId = '';

        it('Create trustor account for new asset', async(done) => {
            logger.info('Create trustor account',[ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"trustorAccount" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const trustorAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(trustorAccountCreated);
            assert.isNotNull(trustorAccountCreated.description);
            assert.isNotNull(trustorAccountCreated.public_key);
            trustorPublicKey = trustorAccountCreated.public_key;
            done();
        },30000)

        it('Create issuer account for new asset', async(done) => {
            logger.info('Create issuer account', [ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"issuerAccount" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400" trust_auth_required: true) { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const issuerAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(issuerAccountCreated);
            assert.isNotNull(issuerAccountCreated.description);
            assert.isNotNull(issuerAccountCreated.public_key);
            issuerPublicKey = issuerAccountCreated.public_key;
            done();
        },30000)

        it('Verify creation of asset -- failure missing issuer', async(done) => {
            logger.info('Create asset - failure missing issuer', issuerPublicKey);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ '" asset_code:"LockDollars"'+
                    'description:"Locked down dollars") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['data']['createAsset'];
            assert.isNull(assetCreated );
            const result = JSON.parse(res.text)['errors'][0]['message'];
            const expectedResult = 'User is not authorized to access this public key';
            assert.isNotNull(result )
            assert.equal (result, expectedResult);
            done();
        })

        it('Verify creation of asset -- failure missing asset code', async(done) => {
            logger.info('Create asset - failure missing asset code', issuerPublicKey);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ issuerPublicKey+ '" asset_code:"" '+
                    'description:"Locked down dollars") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['data']['createAsset'];
            assert.isNull(assetCreated );
            const result = JSON.parse(res.text)['errors'][0]['message'];
            const expectedResult = 'Asset code is invalid (maximum alphanumeric, 12 characters at max)';// fails at Stellar layer
            assert.isNotNull(result )
            assert.equal (result, expectedResult);
            done();
        })


        it('Verify creation of asset', async(done) => {
            logger.info('Create asset', issuerPublicKey);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAsset (asset_issuer:"'+ issuerPublicKey+ '" asset_code:"LockDollars"'+
                    'description:"Locked down dollars") { asset_code asset_issuer ... on TF_Asset { description tenantId email createdAt updatedAt } } }'} );
            const assetCreated = JSON.parse(res.text)['data']['createAsset'];
            assert.equal(assetCreated.description,'Locked down dollars', 'Verify description matches')
            assert.isNotNull(assetCreated );
            done();
        })

        it('Trust Asset ', async(done) => {
            logger.info('Trust Asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createTrustTransaction (trustor_public_key:"' + trustorPublicKey + '" asset_issuer:"' + issuerPublicKey + '" asset_code:"LockDollars" limit:"200000") {id}}'} );

            const trustAssetResult = JSON.parse(res.text)['data']['createTrustTransaction'];
            transactionId = trustAssetResult.id;
            assert.isNotNull(trustAssetResult);
            assert.isNotNull(trustAssetResult.description);
            done();
        },30000)

        it('Sign Transaction Invalid Passphrase ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + trustorPublicKey + '" passphrase:"' + 'INVALID_PASSPHRASE' + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)
            const dataResult = signTransactionResult['data']['signTransaction'];
            assert.isNull(dataResult);
            const errorResult = signTransactionResult['errors'];
            assert.isNotNull(errorResult);
            assert.equal(errorResult[0].message, 'Transaction failed due to incorrect passphrase', 'Expected invalid passphrase');
            done();
        },30000)

        it('Get transactions to sign ', async(done) => {
            logger.info('Get Transactions To Sign', [trustorPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getTransactionsToSign (public_key:"' + trustorPublicKey + '") {id}}'} );
            const transactionsToSign = JSON.parse(res.text)['data']['getTransactionsToSign'];
            const transactionToSignId = transactionsToSign[0].id;
            assert.equal(transactionToSignId, transactionId);
            assert.isNotNull(transactionsToSign[0].type);
            assert.isNotNull(transactionsToSign[0].description);
            assert.isNotNull(transactionToSignId);
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + trustorPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Allow Trust Asset ', async(done) => {
            logger.info('Trust Asset', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAllowTrustTransaction (asset_issuer:"'+issuerPublicKey + '" asset_code:"LockDollars" trustor_public_key:"'+trustorPublicKey +'" authorize_trust: true ){id description} }'} );

            const trustAssetResult = JSON.parse(res.text)['data']['createAllowTrustTransaction'];
            assert.isNotNull(trustAssetResult);
            assert.isNotNull(trustAssetResult.description);
            transactionId = trustAssetResult.id;
            done();
        },30000)

        it('Sign Transaction ', async(done) => {
            logger.info('Sign Transaction', [issuerPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { signTransaction (public_key:"' + issuerPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId + '") {id type source_acct xdr_representation}}'} );
            const signTransactionResult = JSON.parse(res.text)['data']['signTransaction'];
            assert.isNotNull(signTransactionResult);
            assert.equal(signTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get history for account that enabled trusting of assets', async(done) => {
            logger.info('Get history for account that enabled trusting of assets', [issuerPublicKey]);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ issuerPublicKey
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount memo transaction_hash} ... on Manage_Offer {buying_asset_type buying_asset_code buying_asset_issuer selling_asset_type selling_asset_code selling_asset_issuer amount offer_id price} ... on Account_Flags {set_flags_s}... on Allow_Trust {authorize} } }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            assert.equal(3, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('set_options', history[1].type);    // add signer
            assert.equal('auth_required', history[1].set_flags_s[0]);    // set_flags_s: [ 'auth_required' ],
            assert.equal('auth_revocable', history[1].set_flags_s[1]);    // set_flags_s: [ 'auth_required' ],
            assert.equal('allow_trust', history[2].type);    // allowed trust
            assert.equal(true, history[2].authorize);    // allowed trust
            done();
        })

        it('Get initated transactions ', async(done) => {
            logger.info('Get Initated Transactions', [issuerPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getInitiatedTransactions (public_key:"' + issuerPublicKey + '") {id}}'} );
            const initatedTransactions = JSON.parse(res.text)['data']['getInitiatedTransactions'];
            const initiatedTransactionId = initatedTransactions[1].id; // second elemnt of array - 1st is setOptions for a flag
            assert.equal(initiatedTransactionId, transactionId);
            assert.isNotNull(initatedTransactions[0].createdAt);
            assert.isNotNull(initatedTransactions[1].createdAt);
            assert.isNotNull(initatedTransactions[0].type);
            assert.isNotNull(initatedTransactions[1].type);
            assert.isNotNull(initatedTransactions[0].description);
            assert.isNotNull(initatedTransactions[1].description);
            assert.isNotNull(initiatedTransactionId);
            done();
        },30000)
    });

    describe('Create an account that can only set up pre-authorized transactions for later submission', () => {
        let lockedDownPublicKey='';
        let transactionId = '';

        it('Create a new locked down account', async(done) => {
            logger.info('Create a new locked down account',[ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"lockedDownAcct" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400" pre_authorize_transactions: true) { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const lockedDownAccountCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(lockedDownAccountCreated);
            assert.isNotNull(lockedDownAccountCreated.description);
            assert.isNotNull(lockedDownAccountCreated.public_key);
            lockedDownPublicKey = lockedDownAccountCreated.public_key;
            done();
        },30000)

        it('Create Payment of XLM from Locked Down Acct ', async(done) => {
            logger.info('Create of XLM from Locked Down Acct', [lockedDownPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createPayment (sender_public_key:"' + lockedDownPublicKey + '" receiver_public_key:"' + bootstrapPublicKey + '" asset_code:"XLM" asset_issuer:"" amount:"2") {id hash}}'} );
            const createPaymentResult = JSON.parse(res.text)['data']['createPayment'];
            transactionId = createPaymentResult.id;
            assert.isNotNull(createPaymentResult);
            assert.isNotNull(createPaymentResult.hash);
            assert.isNotNull(createPaymentResult.description);
            done();
        },30000)

        it('Pre-Authorize Payment Transaction ', async(done) => {
            logger.info('Pre-Authorize Payment Transaction', [lockedDownPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { preAuthorizeTransaction (public_key:"' + lockedDownPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId  + '" final_approver:"' + bootstrapPublicKey + '") {id type source_acct xdr_representation}}'} );
            logger.info('Pre-Authorize Payment Transaction', res.text);
            const preAuthorizeTransactionResult = JSON.parse(res.text)['data']['preAuthorizeTransaction'];
            assert.isNotNull(preAuthorizeTransactionResult);
            assert.equal(preAuthorizeTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get transactions to approve for approver', async(done) => {
            logger.info('Get Transactions To Sign', [bootstrapPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getTransactionsToSign (public_key:"' + bootstrapPublicKey + '") {id}}'} );
            const transactionsToApprove = JSON.parse(res.text)['data']['getTransactionsToSign'];
            const transactionsToApproveId = transactionsToApprove[0].id;
            assert.equal(1, transactionsToApprove.length);
            assert.equal(transactionsToApproveId, transactionId);
            assert.isNotNull(transactionsToApprove[0].type);
            assert.isNotNull(transactionsToApprove[0].description);
            assert.isNotNull(transactionsToApprove[0].createdAt);
            assert.isNotNull(transactionsToApproveId);
            done();
        },30000)

        it('Submit Pre-Authorized Transaction ', async(done) => {
            logger.info('Submit Pre-Authorized Transaction', [transactionId]);
            await delay(5000);// make sure final approver has been saved to transaction table
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { submitPreAuthorizedTransaction (transaction_id:"' + transactionId + '" final_approver:"' + bootstrapPublicKey + '") {id type source_acct xdr_representation}}'} );
            const submitPreAuthorizedTransactionResult = JSON.parse(res.text)['data']['submitPreAuthorizedTransaction'];
            assert.isNotNull(submitPreAuthorizedTransactionResult);
            assert.equal(submitPreAuthorizedTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get history for account that pre-authorized transaction', async(done) => {
            logger.info('Get history', [lockedDownPublicKey]);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ lockedDownPublicKey
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount memo transaction_hash} ... on Set_Signers {memo signer_key} ... on Manage_Offer {buying_asset_type buying_asset_code buying_asset_issuer selling_asset_type selling_asset_code selling_asset_issuer amount offer_id price} ... on Account_Flags {set_flags_s}... on Allow_Trust {authorize} } }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            logger.info('Get history', [history]);
            assert.equal(3, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('set_options', history[1].type);    // add signer (pre-authorization)
            assert.equal('PreAuthTx signer', history[1].memo); // This pre-Auth transaction has a memo to indicate it
            assert.equal('payment', history[2].type);    // make payment that was pre-authorized
            done();
        })
    });


    describe('Create an account that will set up a pre-authorized transaction for later submission', () => {
        let accountThatWillPreAuthPublicKey='';
        let transactionId = '';

        it('Create a regular account', async(done) => {
            logger.info('Create a new locked down account',[ bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"lockedDownAcct" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase +  '" initial_balance:"400") { ... on TF_Account { email tenantId public_key description} thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const accountThatWillPreAuthCreated = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(accountThatWillPreAuthCreated);
            assert.isNotNull(accountThatWillPreAuthCreated.description);
            assert.isNotNull(accountThatWillPreAuthCreated.public_key);
            accountThatWillPreAuthPublicKey = accountThatWillPreAuthCreated.public_key;
            done();
        },30000)

        it('Create Pre-Authorizable Payment of XLM from Regular Acct ', async(done) => {
            logger.info('Create of XLM from Locked Down Acct', [accountThatWillPreAuthPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createPayment (sender_public_key:"' + accountThatWillPreAuthPublicKey + '" receiver_public_key:"' + bootstrapPublicKey + '" asset_code:"XLM" asset_issuer:"" amount:"2" pre_authorize_transaction:true) {id hash}}'} );
            const createPaymentResult = JSON.parse(res.text)['data']['createPayment'];
            transactionId = createPaymentResult.id;
            assert.isNotNull(createPaymentResult);
            assert.isNotNull(createPaymentResult.hash);
            done();
        },30000)

        it('Pre-Authorize Payment Transaction ', async(done) => {
            logger.info('Pre-Authorize Payment Transaction', [accountThatWillPreAuthPublicKey, transactionId]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { preAuthorizeTransaction (public_key:"' + accountThatWillPreAuthPublicKey + '" passphrase:"' + passphrase + '" transaction_id:"' + transactionId  + '" final_approver:"' + bootstrapPublicKey + '" ) {id type source_acct xdr_representation}}'} );
            logger.info('Pre-Authorize Payment Transaction', res.text);
            const preAuthorizeTransactionResult = JSON.parse(res.text)['data']['preAuthorizeTransaction'];
            assert.isNotNull(preAuthorizeTransactionResult);
            assert.equal(preAuthorizeTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get transactions to approve for approver', async(done) => {
            logger.info('Get Transactions To Sign', [bootstrapPublicKey]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getTransactionsToSign (public_key:"' + bootstrapPublicKey + '") {id}}'} );
            const transactionsToApprove = JSON.parse(res.text)['data']['getTransactionsToSign'];
            const transactionsToApproveId = transactionsToApprove[0].id;
            assert.equal(1, transactionsToApprove.length);
            assert.equal(transactionsToApproveId, transactionId);
            assert.isNotNull(transactionsToApprove[0].createdAt);
            assert.isNotNull(transactionsToApproveId);
            done();
        },30000)

        it('Submit Pre-Authorized Transaction ', async(done) => {
            logger.info('Submit Pre-Authorized Transaction', [transactionId]);
            await delay(5000);// make sure final approver has been saved to transaction table
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { submitPreAuthorizedTransaction (transaction_id:"' + transactionId + '" final_approver:"' + bootstrapPublicKey + '") {id type source_acct xdr_representation}}'} );
            const submitPreAuthorizedTransactionResult = JSON.parse(res.text)['data']['submitPreAuthorizedTransaction'];
            assert.isNotNull(submitPreAuthorizedTransactionResult);
            assert.equal(submitPreAuthorizedTransactionResult.id, transactionId, 'Transaction ID does not match');
            done();
        },30000)

        it('Get history for account that pre-authorized transaction', async(done) => {
            logger.info('Get history', [accountThatWillPreAuthPublicKey]);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ accountThatWillPreAuthPublicKey
                    + '") { id transaction_hash source_account type created_at ... on Create_Account {starting_balance} ... on Payment {amount memo transaction_hash} ... on Set_Signers {memo signer_key} ... on Manage_Offer {buying_asset_type buying_asset_code buying_asset_issuer selling_asset_type selling_asset_code selling_asset_issuer amount offer_id price} ... on Account_Flags {set_flags_s}... on Allow_Trust {authorize} } }'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            logger.info('Get history', [history]);
            assert.equal(3, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('set_options', history[1].type);    // add signer (pre-authorization)
            assert.equal('PreAuthTx signer', history[1].memo); // This pre-Auth transaction has a memo to indicate it
            assert.equal('payment', history[2].type);    // make payment that was pre-authorized
            done();
        })
    });

    describe('Account creation with home domain set', () => {
        let public_key='';
        it('Seed new account from source account with home domain set', async(done) => {
            logger.info('Seed new account from source account with home domain set', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"newly seeded account" home_domain:"http://test.com" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '"  initial_balance:"400") { ... on TF_Account { email tenantId public_key description home_domain thresholds{low_threshold} signers{weight} flags{auth_required}}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['createAccountFromSource']
            assert.isNotNull(newSeededAccount);
            assert.isNotNull(newSeededAccount.public_key);
            public_key = newSeededAccount.public_key;
            assert.equal('newly seeded account', newSeededAccount.description);
            assert.equal('http://test.com', newSeededAccount.home_domain, 'Verify the home domain is set');
            assert.equal(1, newSeededAccount.signers.length);
            assert.equal(1, newSeededAccount.signers[0].weight);
            assert.equal(0, newSeededAccount.thresholds.low_threshold);
            done();
        },30000);

        it('Retrieve newly created account', async(done) => {
            await delay(5000);// give chance for transactions to complete
            logger.info('Retrieve new account for source account', [public_key]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getAccount (public_key:"'+ public_key + '"){ ... on TF_Account { email description tenantId createdAt } public_key home_domain thresholds {low_threshold} signers{weight} flags{auth_required}}}'} );
            const newSeededAccount = JSON.parse(res.text)['data']['getAccount']
            assert.isNotNull(newSeededAccount, 'Verify the retrieved account is not null');
            assert.isNotNull(newSeededAccount.public_key, 'Verify the retrieved public key is not null');
            assert.isNotNull(newSeededAccount.createdAt, 'Verify the retrieved account has a createdAt date');
            assert.equal(newSeededAccount.public_key, public_key, 'Verify public_key matches')
            assert.isNotNull(newSeededAccount.description, 'Verify the retrieved description is not null');
            assert.equal(newSeededAccount.description,'newly seeded account', 'Verify description matches')
            assert.isNotNull(newSeededAccount.thresholds, 'Verify the retrieved thresholds are not null');
            assert.isNotNull(newSeededAccount.signers, 'Verify the retrieved signers are not null');
            assert.equal('http://test.com', newSeededAccount.home_domain, 'Verify the home domain is set');
            done();
        },30000);

        it('Failure attempt to create new account from source account with invalid home domain set', async(done) => {
            logger.info('Failure attempt to create new account from source account with invalid home domain set', [bootstrapPublicKey, bootstrapSecret]);
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' mutation { createAccountFromSource (description:"newly seeded account" home_domain:"foo" source_public_key:"' + bootstrapPublicKey + '" source_secret:"' + bootstrapSecret + '" passphrase:"' + passphrase + '"  initial_balance:"400") { ... on TF_Account { email tenantId public_key description home_domain thresholds{low_threshold} signers{weight} flags{auth_required}}}}'} );
            const signTransactionResult = JSON.parse(res.text)
            const dataResult = signTransactionResult['data']['createAccountFromSource'];
            assert.isNull(dataResult);
            const errorResult = signTransactionResult['errors'];
            assert.isNotNull(errorResult);
            assert.equal(errorResult[0].message, 'Failed to create account due to invalid home_domain', 'Expected invalid passphrase');
            done();
        },30000);

        it('Get history for account with home domain', async(done) => {
            logger.info('Retrieve new account for source account', [public_key]);
            await delay(5000);// give chance for transactions to complete
            const res = await request(app).post('/account')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .set('Authorization', 'Bearer ' + bearerToken)
                .send({'query':' { getHistory (public_key:"'+ public_key
                    + '") { id transaction_hash source_account type created_at ... on Home_Domain { home_domain } ... on Create_Account { starting_balance } }}'} );
            const history = JSON.parse(res.text)['data']['getHistory'];
            assert.isNotNull(history);
            assert.equal(2, history.length);
            assert.equal('create_account', history[0].type);
            assert.isNotNull(history[0].starting_balance);
            assert.equal('set_options', history[1].type);
            assert.isNotNull(history[1].home_domain);
            done();
        },30000);

    });
});
