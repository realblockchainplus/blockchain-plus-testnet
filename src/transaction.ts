import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';

const ec = new ecdsa.ec('secp256k1');

const MINT_AMOUNT: number = 5;

/**
 * An outgoing transaction
 * @
 */
class TxOut {
  public address: string;
  public amount: number;

  constructor(address: string, amount: number) {
    this.address = address;
    this.amount = amount;
  }
};

class TxIn {
  public txOutId: string;
  public txOutIndex: number;
  public signature: string;
};

class UnspentTxOut {
  public readonly txOutId: string;
  public readonly txOutIndex: number;
  public readonly address: string;
  public readonly amount: number;

  constructor(txOutId: string, txOutIndex: number, address: string, amount: number) {
    this.txOutId = txOutId;
    this.txOutIndex = txOutIndex;
    this.address = address;
    this.amount = amount;
  }
};

class Transaction {
  public id: string;
  public txIns: TxIn[];
  public txOuts: TxOut[];
};

/**
 * 
 *
 */
const getTransactionId = (transaction: Transaction): string => {
  const txInContent: string = transaction.txIns
    .map((txIn: TxIn) => txIn.txOutId + txIn.txOutIndex)
    .reduce((a, b) => a + b, '');
  
  const txOutContent: string = transaction.txOuts
    .map((txOut: TxOut) => txOut.address + txOut.amount)
    .reduce((a, b) => a + b, '');

  return CryptoJS.SHA256(txInContent + txOutContent).toString();
};

const sendTransaction = (address: string, amount: number): Transaction => {
  const tx: Transaction = createTransaction(address, amount);
  return tx;
};

const createTransaction = (address: string, amount: number): Transaction => {
  const txOut: TxOut = new TxOut(address, amount);
  const txIn: TxIn = new TxIn();
  txIn.txOutId = '';
  txIn.txOutIndex = 0;
  txIn.signature = '';

  const tx: Transaction = new Transaction();
  tx.txIns = [txIn];
  tx.txOuts = [txOut];
  tx.id = getTransactionId(tx);

  return tx;
};

const signTxIn = (transaction: Transaction, txInIndex: number, privateKey: string,
  unspentTxOuts: UnspentTxOut[]): string => {
    const txIn: TxIn = transaction.txIns[txInIndex];
    const dataToSign = transaction.id;
    const _unspentTxOut: UnspentTxOut = findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, unspentTxOuts);
    const _address = _unspentTxOut.address;
    const key = ec.keyFromPrivate(privateKey, 'hex');
    const signature: string = toHexString(key.sign(dataToSign).toDER());
    return signature;
};

const findUnspentTxOut = (txOutId: string, txOutIndex: number, unspentTxOuts: UnspentTxOut[]) => {
  let unspentTxOut: UnspentTxOut;
  for (let i = 0; i < unspentTxOuts.length; i += 1) {
    const _unspentTxOut = unspentTxOuts[i];
    if (_unspentTxOut.txOutId === txOutId && _unspentTxOut.txOutIndex === txOutIndex) {
      unspentTxOut = _unspentTxOut;
    }
  }
  return unspentTxOut;
};

const toHexString = (byteArray): string => {
  return Array.from(byteArray, (byte: any) => {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
};

const getPublicKey = (aPrivateKey: string): string => {
  return ec.keyFromPrivate(aPrivateKey, 'hex').getPublic().encode('hex');
};

let unspentTxOuts: UnspentTxOut[] = [];

export {
  Transaction, TxOut, TxIn, getTransactionId, sendTransaction
}

