import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';
import { Ledger } from './ledger';
import { getPublicFromWallet } from './wallet';
import { Pod } from './pod';
import { getPods, getIo, write, queryIsTransactionValid } from './p2p';
import { selectRandom } from './rngTool';
import { getCurrentTimestamp } from './block';
import { Server } from 'socket.io';

const ec = new ecdsa.ec('secp256k1');

const MINT_AMOUNT: number = 100;

class Transaction {
  public id: string;
  public from: string;
  public address: string;
  public amount: number;
  public witnessOne: string;
  public witnessTwo: string;
  public partnerOne: string;
  public partnerTwo: string;
  public signature: string;
  public timestamp: number;

  constructor(from: string, address: string, amount: number,
    witnessOne: string, witnessTwo: string, partnerOne: string,
    partnerTwo: string, signature: string, timestamp: number) {
    this.from = from;
    this.address = address;
    this.amount = amount;
    this.witnessOne = witnessOne;
    this.witnessTwo = witnessTwo;
    this.partnerOne = partnerOne;
    this.partnerTwo = partnerTwo;
    this.signature = signature;
    this.timestamp = timestamp;
  }
}

const getTransactionId = (transaction: Transaction): string => {
  // const lastSenderId: number = parseInt(''); // Last TransactionId in Sender's ledger
  // const lastreceiverId: number = parseInt(''); // Last TransactionId in receiver's ledger
  // const transactionId = `${lastSenderId + 1}-${lastreceiverId + 1}`;
  const { address, from, witnessOne, witnessTwo, partnerOne, partnerTwo } = transaction;
  return CryptoJS.SHA256(witnessOne + witnessTwo + partnerOne + partnerTwo + address + from + getCurrentTimestamp().toString()).toString();
};

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger): boolean => {
  const pods: Pod[] = getPods();
  const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
  const partnerPods: Pod[] = pods.filter(pod => pod.type === 1);
  const selectedPods: Pod[] = [...selectRandom(regularPods), ...selectRandom(partnerPods)];
  const io: Server = getIo();
  for (let i = 0; i < selectedPods.length; i += 1) {
    const pod = selectedPods[i];
    io.clients((err, clients) => {
      for (let k = 0; k < clients.length; k += 1) {
        const client = clients[k];
        if (clients.id === pod.ws.id) {
          write(pod.ws, queryIsTransactionValid({ transaction, senderLedger }));
        }
      }
    });
  }
  return true;
};

interface Result {
  result: boolean,
  reason: string,
  transaction: Transaction
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger): Result => {
  const expectedTransactionId = getTransactionId(transaction);
  const result: Result = { result: false, reason: '', transaction };
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid. Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    console.log(result.reason);
    return result;
  }
  else {
    result.result = true;
    result.reason = 'This is a test! Every transaction is valid.';
    return result;
  }
}

const toHexString = (byteArray): string => {
  return Array.from(byteArray, (byte: any) => {
      return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
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
  Transaction, getTransactionId, Result,
  getPublicKey, validateTransaction, isValidAddress
}

