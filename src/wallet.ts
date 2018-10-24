import { ec } from 'elliptic';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

import { getLocalLedger, initLedger, LedgerType } from './ledger';
import { genesisTransaction, requestValidateTransaction } from './transaction';

const EC = new ec('secp256k1');
let privateKeyLocation = '';

const createNodeDir = () => {
  if (!existsSync('node')) {
    mkdirSync('node');
  }
};

const createWalletDir = () => {
  if (!existsSync('node/wallet')) {
    mkdirSync('node/wallet');
  }
};

const deleteWallet = () => {
  if (existsSync(privateKeyLocation)) {
    unlinkSync(privateKeyLocation);
  }
};

const fundWallet = () => {
  // console.log(`Adding 500 value to wallet as part of wallet initiation.`);
  requestValidateTransaction(genesisTransaction(getPublicFromWallet()), getLocalLedger(LedgerType.MY_LEDGER));
};

const generatePrivateKey = () => {
  const keyPair = EC.genKeyPair('');
  const privateKey = keyPair.getPrivate();
  return privateKey.toString(16);
};

const getPrivateFromWallet = () => {
  const buffer = readFileSync(privateKeyLocation, 'utf8');
  return buffer.toString();
};

const getPublicFromWallet = () => {
  const privateKey = getPrivateFromWallet();
  const key = EC.keyFromPrivate(privateKey, 'hex');
  return key.getPublic().encode('hex');
};

const initWallet = (port: number) => {
  privateKeyLocation += `node/wallet/${port}`;
  createNodeDir();
  createWalletDir();
  initLedger(port);
  if (!existsSync(privateKeyLocation)) {
    const newPrivateKey = generatePrivateKey();
    writeFileSync(privateKeyLocation, newPrivateKey);
  }
};

export {
  createNodeDir, createWalletDir, getPublicFromWallet, getPrivateFromWallet, generatePrivateKey,
  initWallet, deleteWallet, fundWallet,
};
