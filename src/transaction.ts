import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';

const ec = new ecdsa.ec('secp256k1');

const MINT_AMOUNT: number = 100;

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

let unspentTxOuts: UnspentTxOut[] = [];
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

const validateTransaction = (transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {

  if (getTransactionId(transaction) !== transaction.id) {
      console.log('invalid tx id: ' + transaction.id);
      return false;
  }
  const hasValidTxIns: boolean = transaction.txIns
      .map((txIn) => validateTxIn(txIn, transaction, aUnspentTxOuts))
      .reduce((a, b) => a && b, true);

  if (!hasValidTxIns) {
      console.log('some of the txIns are invalid in tx: ' + transaction.id);
      return false;
  }

  const totalTxInValues: number = transaction.txIns
      .map((txIn) => getTxInAmount(txIn, aUnspentTxOuts))
      .reduce((a, b) => (a + b), 0);

  const totalTxOutValues: number = transaction.txOuts
      .map((txOut) => txOut.amount)
      .reduce((a, b) => (a + b), 0);

  if (totalTxOutValues !== totalTxInValues) {
      console.log('totalTxOutValues !== totalTxInValues in tx: ' + transaction.id);
      return false;
  }

  return true;
};

const validateBlockTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number): boolean => {
  // const coinbaseTx = aTransactions[0];
  // if (!validateCoinbaseTx(coinbaseTx, blockIndex)) {
  //     console.log('invalid coinbase transaction: ' + JSON.stringify(coinbaseTx));
  //     return false;
  // }

  //check for duplicate txIns. Each txIn can be included only once
  const txIns: TxIn[] = _(aTransactions)
      .map(tx => tx.txIns)
      .flatten()
      .value();

  if (hasDuplicates(txIns)) {
      return false;
  }

  // all but coinbase transactions
  const normalTransactions: Transaction[] = aTransactions.slice(1);
  return normalTransactions.map((tx) => validateTransaction(tx, aUnspentTxOuts))
      .reduce((a, b) => (a && b), true);

};

const addToWallet = (address: string, blockIndex: number): Transaction => {
  const t = new Transaction();
  const txIn: TxIn = new TxIn();
  txIn.signature = '';
  txIn.txOutId = '';
  txIn.txOutIndex = blockIndex;

  t.txIns = [txIn];
  t.txOuts = [new TxOut(address, MINT_AMOUNT)];
  t.id = getTransactionId(t);
  return t;
};

// const validateCoinbaseTx = (transaction: Transaction, blockIndex: number): boolean => {
//   if (transaction == null) {
//       console.log('the first transaction in the block must be coinbase transaction');
//       return false;
//   }
//   if (getTransactionId(transaction) !== transaction.id) {
//       console.log('invalid coinbase tx id: ' + transaction.id);
//       return false;
//   }
//   if (transaction.txIns.length !== 1) {
//       console.log('one txIn must be specified in the coinbase transaction');
//       return;
//   }
//   if (transaction.txIns[0].txOutIndex !== blockIndex) {
//       console.log('the txIn signature in coinbase tx must be the block height');
//       return false;
//   }
//   if (transaction.txOuts.length !== 1) {
//       console.log('invalid number of txOuts in coinbase transaction');
//       return false;
//   }
//   if (transaction.txOuts[0].amount != MINT_AMOUNT) {
//       console.log('invalid coinbase amount in coinbase transaction');
//       return false;
//   }
//   return true;
// };

const validateTxIn = (txIn: TxIn, transaction: Transaction, aUnspentTxOuts: UnspentTxOut[]): boolean => {
  const referencedUTxOut: UnspentTxOut =
      aUnspentTxOuts.find((uTxO) => uTxO.txOutId === txIn.txOutId && uTxO.txOutId === txIn.txOutId);
  if (referencedUTxOut == null) {
      console.log('referenced txOut not found: ' + JSON.stringify(txIn));
      return false;
  }
  const address = referencedUTxOut.address;

  const key = ec.keyFromPublic(address, 'hex');
  return key.verify(transaction.id, txIn.signature);
};

const hasDuplicates = (txIns: TxIn[]): boolean => {
  const groups = _.countBy(txIns, (txIn) => txIn.txOutId + txIn.txOutId);
  return _(groups)
      .map((value, key) => {
          if (value > 1) {
              console.log('duplicate txIn: ' + key);
              return true;
          } else {
              return false;
          }
      })
      .includes(true);
};

const getTxInAmount = (txIn: TxIn, aUnspentTxOuts: UnspentTxOut[]): number => {
  return findUnspentTxOut(txIn.txOutId, txIn.txOutIndex, aUnspentTxOuts).amount;
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

const updateUnspentTxOuts = (newTransactions: Transaction[], unspentTxOuts: UnspentTxOut[]): UnspentTxOut[] => {
  const newUnspentTxOuts: UnspentTxOut[] = newTransactions.map((t) => {
    return t.txOuts.map((txOut, index) => new UnspentTxOut(t.id, index, txOut.address, txOut.amount));
  })
  .reduce((a, b) => a.concat(b), []);

  const consumedTxOuts: UnspentTxOut[] = newTransactions
    .map((t) => t.txIns)
    .reduce((a, b) => a.concat(b), [])
    .map((txIn) => new UnspentTxOut(txIn.txOutId, txIn.txOutIndex, '', 0));

  const resultingUnspentTxOuts = unspentTxOuts
    .filter(((uTxO) => !findUnspentTxOut(uTxO.txOutId, uTxO.txOutIndex, consumedTxOuts)))
    .concat(newUnspentTxOuts);

  return resultingUnspentTxOuts;
};

const toHexString = (byteArray): string => {
  return Array.from(byteArray, (byte: any) => {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
};

const processTransactions = (aTransactions: Transaction[], aUnspentTxOuts: UnspentTxOut[], blockIndex: number) => {
  if (!validateBlockTransactions(aTransactions, aUnspentTxOuts, blockIndex)) {
      console.log('invalid block transactions');
      return null;
  }
  return updateUnspentTxOuts(aTransactions, aUnspentTxOuts);
};

const isValidAddress = (address: string): boolean => {
  if (address.length !== 130) {
    console.log(`Invalid public key length. Expected 130, got: ${address.length}`);
  }
  else if (address.match('^[a-fA-F0-9]+$') === null) {
    console.log('public key must contain only hex characters');
    return false;
  } else if (!address.startsWith('04')) {
    console.log('public key must start with 04');
    return false;
  }
  return true;
};

const getPublicKey = (aPrivateKey: string): string => {
  return ec.keyFromPrivate(aPrivateKey, 'hex').getPublic().encode('hex');
};

export {
  Transaction, TxOut, TxIn, getTransactionId,
  getPublicKey, signTxIn, UnspentTxOut, addToWallet,
  validateTransaction, isValidAddress, processTransactions
}

