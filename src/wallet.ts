import { ec } from 'elliptic';
import { mkdirSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import { getPublicKey, getTransactionId, Transaction, genesisTransaction } from './transaction';
import { updateLedger, initLedger } from './ledger';

const EC = new ec('secp256k1');
let privateKeyLocation = '';

const createNodeDir = (): void => {
  if (existsSync('node')) {
    return;
  }
  mkdirSync('node/wallet');
}
const getPrivateFromWallet = (): string => {
  const buffer = readFileSync(privateKeyLocation, 'utf8');
  return buffer.toString();
};

const getPublicFromWallet = (): string => {
  const privateKey = getPrivateFromWallet();
  const key = EC.keyFromPrivate(privateKey, 'hex');
  return key.getPublic().encode('hex');
};

const generatePrivateKey = (): string => {
  const keyPair = EC.genKeyPair();
  const privateKey = keyPair.getPrivate();
  return privateKey.toString(16);
};

const initWallet = (port: number) => {
  privateKeyLocation += `node/wallet/${port}`;
  createNodeDir();
  if (existsSync(privateKeyLocation)) {
    return;
  }
  const newPrivateKey = generatePrivateKey();

  writeFileSync(privateKeyLocation, newPrivateKey);
  console.log('new wallet with private key created to : %s', privateKeyLocation);
  console.log(`Public address: ${getPublicFromWallet()}`);
  initLedger(port);
  fundWallet();
};

const deleteWallet = () => {
  if (existsSync(privateKeyLocation)) {
    unlinkSync(privateKeyLocation);
  }
};

const fundWallet = () => {
  console.log(`Adding 50 value to wallet as part of wallet initiation.`);
  updateLedger(genesisTransaction(getPublicFromWallet()), 0);
};

export {
  getPublicFromWallet, getPrivateFromWallet, generatePrivateKey,
  initWallet, deleteWallet
};
