import { ec } from 'elliptic';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

import { getLocalLedger, initLedger, LedgerType } from './ledger';
import { genesisTransaction, requestValidateTransaction } from './transaction';

const EC = new ec('secp256k1');
let privateKeyLocation = '';

const createNodeDir = (): void => {
  if (!existsSync('node')) {
    mkdirSync('node');
  }
};

const createWalletDir = (): void => {
  if (!existsSync('node/wallet')) {
    mkdirSync('node/wallet');
  }
};

const deleteWallet = (): void => {
  if (existsSync(privateKeyLocation)) {
    unlinkSync(privateKeyLocation);
  }
};

const fundWallet = (): void => {
  // console.log(`Adding 500 value to wallet as part of wallet initiation.`);
  requestValidateTransaction(genesisTransaction(getPublicFromWallet()), getLocalLedger(LedgerType.MY_LEDGER));
};

const generatePrivateKey = (): string => {
  const keyPair = EC.genKeyPair('');
  const privateKey = keyPair.getPrivate();
  return privateKey.toString(16);
};

const getPrivateFromWallet = (): string => {
  const buffer = readFileSync(privateKeyLocation, 'utf8');
  return buffer.toString();
};

const getPublicFromWallet = (): string => {
  const privateKey = getPrivateFromWallet();
  const key = EC.keyFromPrivate(privateKey, 'hex');
  return key.getPublic().encode('hex');
};

const initWallet = (port: number): void => {
  privateKeyLocation += `node/wallet/${port}`;
  createNodeDir();
  createWalletDir();
  initLedger(port);
  if (!existsSync(privateKeyLocation)) {
    const newPrivateKey = generatePrivateKey();
    writeFileSync(privateKeyLocation, newPrivateKey);
  }
  // console.log('new wallet with private key created to : %s', privateKeyLocation);
  // console.log(`Public address: ${getPublicFromWallet()}`);
};

export {
  createNodeDir, createWalletDir, getPublicFromWallet, getPrivateFromWallet, generatePrivateKey,
  initWallet, deleteWallet, fundWallet,
};
