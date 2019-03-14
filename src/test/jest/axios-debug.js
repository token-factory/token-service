const util = require('util');
const axios_debug = require('axios-debug-log')({
    request: function (debug, config) {
        let url = '';
        if(config){
            if(config.url){
                url = config.url
            }
        }
        debug('Axios Request ' + url, util.inspect(config) ) ;
        //console.log('Axios Request config', JSON.stringify(config));
    },
    response: function (debug, response) {
        debug(
            'Axios Response from ' + response.config.url,
            util.inspect(response )
        );
        // if(response){
        //     console.log('Axios Response object', util.inspect(response ) ) ;
        // }
    },
    error: function (debug, error) {
        // Read https://www.npmjs.com/package/axios#handling-errors for more info
        debug('Boom', error)
    }
})

module.exports = axios_debug;
