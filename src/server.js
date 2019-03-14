// server.js
const log4js = require('log4js');
const logger = log4js.getLogger('server');
logger.level = process.env.LOG_LEVEL || 'debug';
const app = require('./app')



const port = 4001;
app.listen({ port: port }, () => logger.info(`App listening on <hostname>:${port}${app.path} !`))
