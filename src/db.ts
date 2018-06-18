import * as minimist from 'minimist';
import * as mongoose from 'mongoose';

const argv = minimist(process.argv.slice(2));
const conn = mongoose.createConnection(`mongodb://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_IP}/${process.env.DB_NAME}`);

conn.on('open', () => {
  if (argv.ci === 'true') {
    process.exit();
  }
});

export { conn };
