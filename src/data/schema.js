// data/schema.js

const { gql } = require('apollo-server-express');


// Define our schema using the GraphQL schema language
const typeDefs = gql`
  scalar Date

  type Thresholds {
    "Master key signing weight for the account"
    master_weight: Int
    "Signing weight for low threshold transactions on the account"
    low_threshold: Int
    "Signing weight for medium threshold transactions on the account"
    med_threshold: Int
    "Signing weight for high threshold transactions on the account"
    high_threshold: Int
  }
  type Signer {
    "Public key that uniquely identifies the account"
    public_key: String
    "Signing weight set on the account for that public key"
    weight: Int
    "TODO"
    key: String
    "TODO"
    type: String
    "Flag to indicate if master key weight"
    master: Boolean
  }
  enum Flag_Type{
    "With this setting, none of the following authorization flags can be changed."
    auth_immutable
    "With this setting, an anchor must approve anyone who wants to hold its asset."
    auth_required
    "With this setting, an anchor can set the authorize flag of an existing trustline to freeze the assets held by an asset holder."
    auth_revocable
  }
  type Flags {
    "With this setting, an anchor must approve anyone who wants to hold its asset."
    auth_required: Boolean
    "With this setting, an anchor can set the authorize flag of an existing trustline to freeze the assets held by an asset holder."
    auth_revocable: Boolean
    "With this setting, none of the following authorization flags can be changed."
    auth_immutable: Boolean
  }

  type TF_Account implements Account {
    id: ID!
    "Email address for user.  Will be used as display name of user and for login"
    email: String!
    "Tenant id that the user is a member of"
    tenantId: String!
    "The description of the account"
    description: String
    "Public key that uniquely identifies the account"
    public_key: String!
    "Thresholds for the account"
    thresholds: Thresholds!
    "Asset balances for the account"
    balances: [Balance]!
    "Signers for the account"
    signers: [Signer]!
    "Accounts may optionally have a home domain specified. This allows an account to specify where is the main provider for that account."
    home_domain: String
    "Flags for the account"
    flags: Flags!
    "Creation date of the account"
    createdAt: Date!
    "Last modified date of the account"
    updatedAt: Date!
  }

  type Core_Account implements Account {
    "Public key that uniquely identifies the account"
    public_key: String!
    "Thresholds for the account"
    thresholds: Thresholds!
    "Asset balances for the account"
    balances: [Balance]!
    "Signers for the account"
    signers: [Signer]!
    "Accounts may optionally have a home domain specified. This allows an account to specify where is the main provider for that account."
    home_domain: String
    "Flags for the account"
    flags: Flags!
  }

  interface Account {
    "Public key that uniquely identifies the account"
    public_key: String!
    "Thresholds for the account"
    thresholds: Thresholds
    "Asset balances for the account"
    balances: [Balance]
    "Signers for the account"
    signers: [Signer]
    "Accounts may optionally have a home domain specified. This allows an account to specify where is the main provider for that account."
    home_domain: String
    "Flags for the account"
    flags: Flags
  }

  type Core_Asset implements Asset {
    "Public key of the asset issuer (creator)"
    asset_issuer: String
    "Alphanumeric class that identifies the asset type"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
  }

  type TF_Asset implements Asset {
    "Public key of the asset issuer (creator)"
    asset_issuer: String
    "Alphanumeric class that identifies the asset type"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
    "The description of the asset"
    description: String
    "Email address for user.  Will be used as display name of user and for login"
    email: String!
    "Tenant id that the user is a member of"
    tenantId: String!
    "Creation date of the asset"
    createdAt: Date!
    "Last modified date of the asset"
    updatedAt: Date!
  }

  interface Asset {
    "Public key of the asset issuer (creator)"
    asset_issuer: String
    "Alphanumeric class that identifies the asset type"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
  }

  type Set_Signers implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when signer was added"
    created_at: Date!
    "Signer public key"
    signer_key: String!
    "Memo attached to the transaction"
    memo: String
    "Signer weight"
    signer_weight: Int!
  }

  type Set_Threshold implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the threshold was added"
    created_at: Date!
    "Master key signing weight for the account"
    master_key_weight: Int!
    "Signing weight for low threshold transactions on the account"
    low_threshold: Int!
    "Signing weight for medium threshold transactions on the account"
    med_threshold: Int!
    "Signing weight for high threshold transactions on the account"
    high_threshold: Int!
  }
  type Create_Account implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the account was created"
    created_at: Date!
    "Starting balance of the account"
    starting_balance: String!
    "Public key from where the funds were loaded from"
    funder: String!
    "TODO"
    account: String!
  }
  type Allow_Trust implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the change trust was created"
    created_at: Date!
    "Type of asset"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
    "Public key of the acount that issued the asset"
    asset_issuer: String
    "Trustors public key"
    trustor: String!
    "Trustee public key"
    trustee: String!
    "Enabling or disabling the allowing of trust for a given asset"
    authorize: Boolean!
  }

  type Change_Trust implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the change trust was created"
    created_at: Date!
    "Type of asset"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
    "Public key of the acount that issued the asset"
    asset_issuer: String
    "Trustline limit for the asset"
    limit: String!
    "Trustors public key"
    trustor: String!
    "Trustee public key"
    trustee: String!
  }
  type Payment implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the payment was created"
    created_at: Date!
    "Type of asset"
    asset_type: String!
    "Alphanumeric code that uniquely identifies the asset"
    asset_code: String
    "Public key of the acount that issued the asset"
    asset_issuer: String
    "Public key of the sender of the payment"
    from: String!
    "Public key of the receiver of the payment"
    to: String!
    "Amount of the payment"
    amount: String!
    "Memo attached to the transaction"
    memo: String
  }
  type Manage_Offer implements History{
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when this operation took place"
    created_at: Date!
    "Offer Id passed in. Zero signifies a new offer."
    offer_id: String!
    "Type of Asset being offered for sale"
    selling_asset_type: String!
    "Code of Asset being offered for sale"
    selling_asset_code: String
    "Issuer of Asset being offered for sale"
    selling_asset_issuer: String
    "Type of Asset being bought"
    buying_asset_type: String!
    "Code of Asset being bought"
    buying_asset_code: String
    "Issuer of Asset being bought"
    buying_asset_issuer: String
    "Amount of asset being offered for sale"
    amount: String!
    "Price of asset being offered for sale"
    price: String!
  }

  type Account_Flags implements  History {
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the history record was created"
    created_at: Date!
    clear_flags: [Int]
    clear_flags_s: [Flag_Type]
    set_flags: [Int]
    set_flags_s: [Flag_Type]
  }

  type Home_Domain implements History {
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the history record was created"
    created_at: Date!
    "Home domain for the account"
    home_domain: String!
  }

  interface History {
    id: ID!
    "Transaction id that this operation is part of"
    transaction_hash: String!
    "Public key for the source account"
    source_account: String!
    "Type of history"
    type: String!
    "Timestamp when the history record was created"
    created_at: Date!
  }
  type Signature {
    "Public key that uniquely identifies the account"
    public_key: String!
    "Flag to indicate the transaction has been signed"
    signed: Boolean!
    "Timestamp when the transaction was signed"
    signed_date: Date
  }
  type Transaction {
    id: ID!
    type: String
    "Public key for the source account"
    source_acct: String!
    xdr_representation: String!
    description: String
    submitted: Boolean
    hash: String
    ledger: String
    signers: [Signature]
    preAuthApprovers: [Signature]
    createdAt: Date!
    operations: [Operation]
  }
  type Operation {
    "Type of Stellar operation"
    op_type: String
    "Public key for the source account"
    source_acct: String!
    description: String
    signatures: [Signature]
  }
  type Balance {
    network: String
    asset_code: String
    asset_issuer: String
    balance: String
    buying_liabilities: String
    selling_liabilities: String
    asset_type: String
  }
  type Offer {
    "Offer id for the given offer"
    id: String!
    "Price for the offer"
    price: String!
    "Number of assets including in the offer"
    amount: String!
    "Active asset sale offers"
    selling: Asset
    "Active asset buy offers"
    buying: Asset
  }

  type Offer_Quote {
    "Price for the offer"
    price: String!
    "Number of assets including in the offer"
    amount: String!
  }
  type Orderbook {
    "Open purchase offers for a given asset"
    bids: [Offer_Quote]
    "Open sell offers for a given asset"
    asks: [Offer_Quote]
    "Asset being offered"
    base: Asset
    "Asset being asked for in exchange"
    counter: Asset
  }

  type Fee{
    "Name of the fee"
    name: String!
    "Description of the fee"
    description: String!
    "Amount the fee will be charged"
    rate: String!
    "Asset that will be used to cover the fee"
    type: String!
  }

  type Query {
    "Query to retrieve list of accounts"
    getAccounts: [Account]

    "Query to retrieve a single account"
    getAccount(
      "Public key that uniquely identifies the account"
      public_key: String!
    ): Account

    "Query to retrieve account balances for a single account"
    getBalances(
      "Public key that uniquely identifies the account"
      public_key: String!
    ): [Balance]

    "Query to retrieve list of assets"
    getAssets: [Asset]

    "Query to retrieve account history for a single account"
    getHistory(
      "Public key that uniquely identifies the account"
      public_key: String!
      "Filter for retrieving specific history types"
      type: String
    ): [History]

    "Query to retrieve active offers for a single account"
    getOffers(
      "Public key that uniquely identifies the account"
      public_key: String!
    ): [Offer]


    "Query to retrieve account history for a single account"
    getOrderbook(
      "Code of Asset being offered for sale"
      sell_asset_code: String!
      "Issuer of Asset being offered for sale"
      sell_asset_issuer: String
      "Type of Asset being bought"
      buy_asset_code: String!
      "Issuer of Asset being bought"
      buy_asset_issuer: String
    ): Orderbook

    "Query to retrieve list of in process transactions for an account"
    getInitiatedTransactions(
      "Public key that uniquely identifies the account"
      public_key: String!
    ): [Transaction]

    "Query to retrieve list of in transactions to sign for an account"
    getTransactionsToSign(
      "Public key that uniquely identifies the account"
      public_key: String!
    ): [Transaction]

    "Query to retrieve details about a given fee"
    getFee(
      "Unique identifier to retrieve the Fee"
      type: String!
    ): Fee

  }
  type Mutation {
    "Create a new account"
    createAccount(
      "The description of the account"
      description: String
      "User provided passphrase used to encrypt/decrypt secret during transactions"
      passphrase: String!
      "Set the flag requiring other trustors to be authorized before trusting this account's assets"
      trust_auth_required: Boolean
      "Set the flag requiring this account to use pre-authorized transactions"
      pre_authorize_transactions: Boolean
      "Set the home domain for the account"
      home_domain: String
    ): Account

    "Create a new account from an existing Account"
    createAccountFromSource(
      "The description of the account"
      description: String
      "Public Key of the source account"
      source_public_key: String!
      "Secret of the source account"
      source_secret: String!
      "User provided passphrase used to encrypt/decrypt secret during transactions"
      passphrase: String!
      "Initial balance to seed the account with"
      initial_balance: String!
      "Set the flag requiring other trustors to be authorized before trusting this account's assets"
      trust_auth_required: Boolean
      "Set the flag requiring this account to use pre-authorized transactions"
      pre_authorize_transactions: Boolean
      "Set the home domain for the account"
      home_domain: String
    ): Account

    "Create a new asset owned by an existing Account"
    createAsset(
      "Alphanumeric code that uniquely identifies the asset"
      asset_code: String!
      "Public key of the asset issuer (creator)"
      asset_issuer: String!
      "The description of the asset"
      description: String
    ): Asset

    "Initiate a signer transaction"
    createSignerTransaction(
      "Public key of the owner of the account"
      public_key: String!
      "Public key of the signer to add to the account"
      signer: String!
      "Weight assigned to the added signer for transactions on this account"
      weight: Int!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for establishing thresholds and weights for account transactions"
    createWeightThresholdTransaction(
      "Public key of the owner of the account"
      public_key: String!
      "Master key signing weight for the account"
      weight: Int!
      "Signing weight for low threshold transactions on the account"
      low: Int!
      "Signing weight for medium threshold transactions on the account"
      medium: Int!
      "Signing weight for high threshold transactions on the account"
      high: Int!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Create a payment for a given account"
    createPayment(
      "Public key of the owner of the account"
      sender_public_key: String!
      "Public key of the recipient of the poyment"
      receiver_public_key: String!
      "Alphanumeric code that uniquely identifies the asset"
      asset_code: String!
      "Public key of the issuer of the asset"
      asset_issuer: String!
      "Amount of the asset to distribute"
      amount: String!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for allowing trust of a given asset"
    createAllowTrustTransaction(
      "Public key of the issuer of the asset"
      asset_issuer: String!
      "Alphanumeric code that uniquely identifies the asset"
      asset_code: String!
      "Public key of the trustor of the asset"
      trustor_public_key: String!
      "Boolean indicating whether or not to allow (revoke) trust"
      authorize_trust: Boolean!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for establishing trust for a given asset"
    createTrustTransaction(
      "Public key of the owner of the account"
      trustor_public_key: String!
      "Alphanumeric code that uniquely identifies the asset"
      asset_code: String!
      "Public key of the issuer of the asset"
      asset_issuer: String!
      "Maximum amount of the asset to trust"
      limit: String!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for creating an offer to buy/sell/exchange an asset"
    createOffer(
      "Public key of the account"
      public_key: String!
      "Alphanumeric code that identifies the asset being sold"
      sell_asset_code: String!
      "Public key issuer of the asset being offered for sale"
      sell_asset_issuer: String
      "Amount of the asset being offered for sale"
      sell_amount: String!
      "Alphanumeric code that identifies the asset being bought"
      buy_asset_code: String!
      "Public key issuer of the asset being bought"
      buy_asset_issuer: String
      "Amount of the asset being bought"
      buy_amount: String!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for updating an existing offer to buy/sell/exchange an asset"
    updateOffer(
      "Public key of the account"
      public_key: String!
      "Offer ID of the existing offer that is being updated"
      offer_id: String!
      "Alphanumeric code that identifies the asset being sold"
      sell_asset_code: String!
      "Public key issuer of the asset being offered for sale"
      sell_asset_issuer: String
      "Amount of the asset being offered for sale"
      sell_amount: String!
      "Alphanumeric code that identifies the asset being bought"
      buy_asset_code: String!
      "Public key issuer of the asset being bought"
      buy_asset_issuer: String
      "Amount of the asset being bought"
      buy_amount: String!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    "Initiate a transaction for deleting an existing offer to buy/sell/exchange an asset"
    deleteOffer(
      "Public key of the account"
      public_key: String!
      "Offer ID of the existing offer that is being deleted"
      offer_id: String!
      "Alphanumeric code that identifies the asset being sold"
      sell_asset_code: String!
      "Public key issuer of the asset being offered for sale"
      sell_asset_issuer: String
      "Alphanumeric code that identifies the asset being bought"
      buy_asset_code: String!
      "Public key issuer of the asset being bought"
      buy_asset_issuer: String
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    createFlagTransaction(
      "Public key of the account"
      public_key: String!
      "Flag operation"
      flag_operation: String!
      "Flag to set"
      flag_to_set: String!
      "Optional flag making this a pre-authorized transaction"
      pre_authorize_transaction: Boolean
    ): Transaction

    signTransaction(
      "Public key of the owner of the transaction"
      public_key: String!
      "User provided passphrase used to decrypt account secret during transactions"
      passphrase: String!
      "Transaction id that uniquely identifies the transaction to sign"
      transaction_id: String!
    ): Transaction

    preAuthorizeTransaction(
      "Public key of the owner of the transaction"
      public_key: String!
      "User provided passphrase used to decrypt account secret during transactions"
      passphrase: String!
      "Transaction id that uniquely identifies the transaction to pre-authorize"
      transaction_id: String!
      "Public key of approver that can perform final submission of pre-authorized transaction"
      final_approver: String!
    ): Transaction

    submitPreAuthorizedTransaction(
      "Transaction id that uniquely identifies the pre-authorized transaction to submit"
      transaction_id: String!
      "Public key of approver performing final submission of pre-authorized transaction"
      final_approver: String!
    ): Transaction
  }
`;

module.exports = typeDefs
