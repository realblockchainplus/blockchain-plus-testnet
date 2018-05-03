import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as _ from 'lodash';
import * as ioClient from 'socket.io-client';
import { Block } from './block';
import { Ledger, getLedger, getEntryByTransactionId, updateLedger, getEntryInLedgerByTransactionId } from './ledger';
import { getPublicFromWallet, generatePrivateKey, getPrivateFromWallet } from './wallet';
import { Pod } from './pod';
import {
  getPods, getIo, write, queryIsTransactionValid,
  getPodIndexByPublicKey, isTransactionHashValid, Message,
  handleMessage, MessageType
} from './p2p';
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
  public hash: string;

  constructor(from: string, address: string, amount: number,
    timestamp: number) {
    this.from = from;
    this.address = address;
    this.amount = amount;
    this.timestamp = timestamp;
    // this.witnessOne = witnessOne;
    // this.witnessTwo = witnessTwo;
    // this.partnerOne = partnerOne;
    // this.partnerTwo = partnerTwo;
  }

  assignValidatorsToTransaction = (selectedPods: Pod[]): void => {
    this.witnessOne = selectedPods[0].address;
    this.witnessTwo = selectedPods[1].address;
    this.partnerOne = selectedPods[2].address;
    this.partnerTwo = selectedPods[3].address;
  }

  setTransactionId = (transactionId: string): void => {
    this.id = transactionId;
  }

  generateSignature = (): void => {
    const key = ec.keyFromPrivate(getPrivateFromWallet(), 'hex');
    this.signature = toHexString(key.sign(this.id).toDER());
  }

  generateHash = (): void => {
    this.hash = CryptoJS.SHA256(
      this.witnessOne +
      this.witnessTwo +
      this.partnerOne +
      this.partnerTwo +
      this.address +
      this.amount +
      this.from +
      this.timestamp.toString()
    ).toString();
  }

  // witnessOne: string, witnessTwo: string, partnerOne: string,
  //   partnerTwo: string,
}

const genesisTimestamp = 1525278308842;
const genesisAddress = '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a';
const getGenesisAddress = (): string => genesisAddress;

const genesisTransaction = (publicKey: string): Transaction => {
  const transaction = new Transaction(
    genesisAddress,
    publicKey,
    50,
    genesisTimestamp
  );

  transaction.setTransactionId(getTransactionId(transaction));
  transaction.generateSignature();
  transaction.generateHash();

  return transaction;
};

const getTransactionId = (transaction: Transaction): string => {
  // const lastSenderId: number = parseInt(''); // Last TransactionId in Sender's ledger
  // const lastreceiverId: number = parseInt(''); // Last TransactionId in receiver's ledger
  // const transactionId = `${lastSenderId + 1}-${lastreceiverId + 1}`;
  const { address, from, witnessOne, witnessTwo, partnerOne, partnerTwo } = transaction;
  return CryptoJS.SHA256(witnessOne + witnessTwo + partnerOne + partnerTwo + address + from + getCurrentTimestamp().toString()).toString();
};

const getExpectedTransactionId = (transaction: Transaction): string => {
  const { address, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  return CryptoJS.SHA256(witnessOne + witnessTwo + partnerOne + partnerTwo + address + from + timestamp.toString()).toString();
}

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger): void => {
  const pods: Pod[] = getPods();
  const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
  const partnerPods: Pod[] = pods.filter(pod => pod.type === 1);
  const selectedPods: Pod[] = [...selectRandom(regularPods), ...selectRandom(partnerPods)];
  transaction.assignValidatorsToTransaction(selectedPods);
  transaction.setTransactionId(getTransactionId(transaction));
  transaction.generateSignature();

  updateLedger(transaction, 0);
  const io: Server = getIo();
  console.log('Starting for loop for sending out validation checks...');
  for (let i = 0; i < selectedPods.length; i += 1) {
    const pod = selectedPods[i];
    console.log(`Connecting to ${pod.ip}:${pod.port}`);
    const promise: Promise<void> = new Promise((resolve, reject) => {
      const socket = ioClient(`http://${pod.ip}:${pod.port}`);
      socket.on('connect', () => {
        resolve(`Connected to ${pod.ip}:${pod.port}... sending transaction details.`);
        write(socket, queryIsTransactionValid({ transaction, senderLedger }));
      });
      setTimeout(() => { reject(`Connection to ${pod.ip}:${pod.port} could not be made in 10 second.`) }, 10000);
    }).then((fulfilled) => {
      console.log(fulfilled);
    }, (rejected) => {
      console.log(rejected);
    });
  }
};

interface Result {
  result: boolean,
  reason: string,
  id: string
};

const validateLedger = (senderLedger: Ledger, transaction: Transaction): Promise<Result> => {
  const io: Server = getIo();
  const pods: Pod[] = getPods();
  const validationResult: Result = {
    result: true,
    reason: '',
    id: null
  };
  const publicKey = getPublicFromWallet();
  if (senderLedger.entries.length === 1) {
    if (senderLedger.entries[0].from === getGenesisAddress()) {
      console.log('Initial genesis transaction for wallet. Skipping...');
      return new Promise((resolve, reject) => {
        setTimeout(() => { resolve(validationResult); }, 50);
      });
    }
  }
  const promiseArray: Promise<Result>[] = [];
  for (let i = 0; i < senderLedger.entries.length; i += 1) {
    console.log('Iterating over senderLedger.entries.');
    const entry: Transaction = senderLedger.entries[i];
    console.dir(entry);
    const witnesses: string[] = [entry.witnessOne, entry.witnessTwo];
    const partners: string[] = [entry.partnerOne, entry.partnerTwo];
    const validators: string[] = [...witnesses, ...partners];
    const validatingPods: Pod[] = [];
    validators.map((v: string) => {
      console.log(v);
      const pod: Pod = pods[getPodIndexByPublicKey(v)];
      validatingPods.push(pod);
      return;
    });
    for (let k = 0; k < validatingPods.length; k += 1) {
      console.log('Iterating over validating pods.');
      const pod = validatingPods[k];
      console.dir(pod);
      const promise: Promise<Result> = new Promise((resolve, reject) => {
        console.log(`Connecting to ${pod.ip}:${pod.port}`);
        const socket = ioClient(`http://${pod.ip}:${pod.port}`);
        setTimeout(() => {
          const rejectionResult: Result = {
            result: false,
            reason: `Connection to ${pod.ip}:${pod.port} could not be made in 10 seconds.`,
            id: entry.id
          };
          reject(rejectionResult);
        }, 10000);
        socket.on('connect', () => {
          console.log(`Connected to ${pod.ip}:${pod.port}... sending transaction details.`);
          write(socket, isTransactionHashValid({ transactionId: entry.id, hash: entry.hash }));
        });
        socket.on('message', (message: Message) => {
          console.log('[validateLedger] handleMessage');
          const result: Result = handleMessage(socket, message);
          if (message.type === MessageType.TRANSACTION_CONFIRMATION_RESULT) {
            console.log(`Received validation result from ${pod.ip}:${pod.port}... resolving promise.`);
            resolve(result);
          }
        });
      });
      promiseArray.push(promise);
    }
  }
  return Promise.all(promiseArray).then(results => {
    let currentHoldings = 0;
    for (let j = 0; j < results.length; j += 1) {      
      const result = results[j];
      const entry = getEntryInLedgerByTransactionId(result.id, senderLedger);      
      if (entry.address === publicKey) { currentHoldings += entry.amount };
      if (entry.from === publicKey) { currentHoldings -= entry.amount };
      if (!result.result) {
        validationResult.result = false;
        validationResult.reason = 'Needs to be filled with details of failed validation checks.';
      }
    }
    if (currentHoldings < transaction.amount) {
      validationResult.result = false;
      validationResult.reason = `Insufficient funds in wallet. Current Holdings: ${currentHoldings}, Transaction Amount: ${transaction.amount}`;
    }
    if (validationResult.result) {
      validationResult.reason = 'Needs to be filled with details of validation checks.';
    }
    return validationResult;
  });
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger, callback): void => {
  const expectedTransactionId: string = getExpectedTransactionId(transaction);
  let result: Result = { result: false, reason: '', id: transaction.id };
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid. Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    console.log(result.reason);
    callback(result, transaction);
  }
  else {
    result = validateSignature(transaction); // Check if sender has proper access to funds
    if (!result.result) {
      console.log(result.reason);
      callback(result, transaction);
    }
    console.log('Signature was valid... validating ledger.');
    validateLedger(senderLedger, transaction).then(res => {
      result = res;
      console.log('validateLedger result:');
      console.dir(result);      
      callback(result, transaction);
    });
  }
};

const validateSignature = (transaction: Transaction): Result => {
  console.log('Validating signature...');
  const { id, from, signature }: { id: string, from: string, signature: string } = transaction;
  console.log(`Validating signature. Parameters: { id: ${id}, from: ${from}, signature: ${signature} }`);
  const key = ec.keyFromPublic(from, 'hex');
  console.log(`keyFromPublic: ${key}`);
  const result = key.verify(id, signature);
  const reason = 'Transaction signature is invalid.';
  return {
    result,
    reason,
    id
  }
};

const generateSignature = (transaction: Transaction, privateKey: string): string => {
  const key = ec.keyFromPrivate(privateKey, 'hex');
  const signature: string = toHexString(key.sign(transaction.id).toDER());
  return signature;
};

const validateTransactionHash = (id: string, hash: string): Result => {
  const transaction: Transaction = getEntryByTransactionId(id, 1);
  let result: boolean = false;
  let reason: string = 'Transaction hash is valid';
  if (!transaction) {
    result = false;
    reason = 'Transaction was not found in witnesses ledger';
  }
  if (transaction.hash === hash) {
    result = true;
  }
  else {
    reason = 'Transaction hash is invalid.';
  }
  return {
    result,
    reason,
    id
  }
};

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

// Might be used for something else later
// io.clients((err, clients) => {
//   console.log('Starting client for loop...');
//   for (let k = 0; k < clients.length; k += 1) {
//     const client = clients[k];
//     console.log(`Checking ${client.id} against ${pod.ws.id}`);
//     if (client.id === pod.ws.id) {
//       console.log('Sending out validation check...');
//       write(pod.ws, queryIsTransactionValid({ transaction, senderLedger }));
//     }
//     else {
//       console.log(`ClientId: ${client.id} does not match PodId: ${pod.ws.id}`);
//     }
//   }
// });

export {
  Transaction, getTransactionId, Result, requestValidateTransaction, genesisTransaction,
  getPublicKey, validateTransaction, validateTransactionHash, isValidAddress, getGenesisAddress
}

