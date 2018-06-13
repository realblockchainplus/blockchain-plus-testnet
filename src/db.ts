import * as mongoose from 'mongoose';

const secrets = require('../env/mongodb.json');

const conn = mongoose.createConnection(`mongodb://${secrets.dbUser}:${secrets.dbPassword}@${secrets.dbIp}/${secrets.dbName}`);

export { conn };
