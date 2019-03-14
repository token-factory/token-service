const config = require('../../config.js');
const mongoose = require('mongoose');
const path = require('path');

let authString=""
if(config.db_user_name && config.db_password ){
  authString = authString.concat(config.db_user_name,':',config.db_password, '@');
} 
const str="";
let dbURL = str.concat('mongodb://', authString, config.db_service_name, ':', config.dp_service_port ,'/',config.db_name)
// if (config.db_replicaset_key){
//   dbURL = dbURL.concat ('?replicaSet=', config.db_replicaset_key);
// }

console.log('dbURL', dbURL);
mongoose.connect(dbURL,{ 
    useCreateIndex: true,
    useNewUrlParser: true
  },
  function(err, db) {
    if (err) {
      console.log('database is not connected : ' + dbURL);
      console.log(err);
    } else {
      console.log('connected!!');
    }
  }
);