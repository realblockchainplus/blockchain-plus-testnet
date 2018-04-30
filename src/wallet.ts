import { ec } from 'elliptic';
import { mkdirSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as _ from 'lodash';
import * as minimist from 'minimist';
import { getPublicKey, getTransactionId, Transaction } from './transaction';

const EC = new ec('secp256k1');
const argv = minimist(process.argv.slice(2));
const port = argv.p;
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

const initWallet = (port) => {
  privateKeyLocation += `node/wallet/${port}`;
  createNodeDir();
  if (existsSync(privateKeyLocation)) {
    return;
  }
  const newPrivateKey = generatePrivateKey();

  writeFileSync(privateKeyLocation, newPrivateKey);
  console.log('new wallet with private key created to : %s', privateKeyLocation);
};

const deleteWallet = () => {
  if (existsSync(privateKeyLocation)) {
    unlinkSync(privateKeyLocation);
  }
};

export {
  getPublicFromWallet, getPrivateFromWallet, generatePrivateKey,
  initWallet, deleteWallet
};
