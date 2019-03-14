const path = require('path');

const config = {
  // Database config
  db_service_name: process.env.MONGO_SERVICE_NAME || 'localhost',
  dp_service_port: '27017',
  db_name: process.env.MONGO_DB_NAME || 'token-factory',
  db_user_name:  process.env.MONGO_USER || false,
  db_password: process.env.MONGO_PWD || false,
  db_replicaset_key: process.env.MONGO_RS_KEY || false
};

module.exports = config;