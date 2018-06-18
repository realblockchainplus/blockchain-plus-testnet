import * as mongoose from 'mongoose';

const conn = mongoose.createConnection(`mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_IP}/${process.env.DB_NAME}`);

export { conn };
