import * as firebase from 'firebase-admin';
import * as minimist from 'minimist';

const argv = minimist(process.argv.slice(2));
const isSeed = argv.s === 'true';

if (!isSeed) {
  const firebaseAccount = require('../bcp-tn-service-account.json');

  firebase.initializeApp({
    credential: firebase.credential.cert(firebaseAccount),
    databaseURL: 'https://bcp-tn.firebaseio.com',
  });

  const db = firebase.database();
}

export { firebase, db };
