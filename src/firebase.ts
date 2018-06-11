import * as firebase from 'firebase-admin';

const firebaseAccount = require('../env/bcp-tn-service-account.json');

firebase.initializeApp({
  credential: firebase.credential.cert(firebaseAccount),
  databaseURL: 'https://bcp-tn.firebaseio.com',
});

const db = firebase.database();

export { firebase, db };
