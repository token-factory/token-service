const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const schema = require('./data/schema.js')
const jwt = require('express-jwt')
const resolvers = require('./data/resolvers.js')
require('./config/initializers/database');
const mongoose = require('mongoose');



// auth middleware
const auth = jwt({
    secret: process.env.JWT_SECRET,
    credentialsRequired: false,
    getToken: function fromHeaderOrQuerystring(req) {
        if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
            return req.headers.authorization.split(' ')[1];
        }
        return null;
    }
})

// authenticate for schema usage
const context = ({ req }) => {
    const user = req.user;
    return { user }
};


// create our express app
const app = express()
app.use(auth);

app.get('/readiness', function (req, res) {
    if (mongoose.connection.readyState == 0) {   // not connected
        res.status(500).json({ error: 'Account service not ready.  Waiting on MongoDB' });
    } else if (mongoose.connection.readyState == 1) { // connected
        res.status(200).json({ message: 'Account service is ready.  MongoDB is connected' });
    }
})
app.get('/liveness', function (req, res) {
    if (mongoose.connection.readyState == 0) {   // not connected
        res.status(500).json({ error: 'Account service not alive.  Waiting on MongoDB to reconnect' });
    } else if (mongoose.connection.readyState == 1) { // connected
        res.status(200).json({ message: 'Account service is alive.  MongoDB is connected' });
    }
})


const path = '/account';
app.path = path;

const server = new ApolloServer({ typeDefs: schema, resolvers, context: context, introspection: true, playground: true});
server.applyMiddleware({ app, path });

module.exports = app
