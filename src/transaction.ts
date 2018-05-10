import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import { Server } from 'socket.io';
import * as ioClient from 'socket.io-client';

import { Ledger } from './ledger';
import { IResult, isTransactionValid } from './message';
import {
  getIo,
  getPodIndexByPublicKey,
  getPods,
  handleMessage,
  isTransactionHashValid,
  Message,
  MessageType,
  write,
  getLogger,
} from './p2p';
import { Pod } from './pod';
import { selectRandom } from './rngTool';
import { getCurrentTimestamp, getEntryByTransactionId, getEntryInLedgerByTransactionId } from './utils';
import { getPrivateFromWallet, getPublicFromWallet } from './wallet';
import { isValidAddress, toHexString } from './utils';
import { LogEvent, eventType, createLogEvent } from './logEntry';

const ec = new ecdsa.ec('secp256k1');

class Transaction {
  public id: string;
  public from: string;
  public to: string;
  public amount: number;
  public witnessOne: string;
  public witnessTwo: string;
  public partnerOne: string;
  public partnerTwo: string;
  public signature: string;
  public timestamp: number;
  public hash: string;

  constructor(from: string, to: string, amount: number, timestamp: number) {
    this.from = from;
    this.to = to;
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
    this.hash = CryptoJS.SHA256(`
      ${this.witnessOne}
      ${this.witnessTwo}
      ${this.partnerOne}
      ${this.partnerTwo}
      ${this.to}
      ${this.amount}
      ${this.from}
      ${this.timestamp}
    `).toString();
  }
}

const genesisTimestamp: number = 1525278308842;
const genesisAddress: string = `04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e
  7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a`;
const genesisAmount: number = 500;
const getGenesisAddress = (): string => genesisAddress;

const generateSignature = (transaction: Transaction, privateKey: string): string => {
  const key = ec.keyFromPrivate(privateKey, 'hex');
  const signature: string = toHexString(key.sign(transaction.id).toDER());
  return signature;
};

const genesisTransaction = (publicKey: string): Transaction => {
  const transaction = new Transaction(
    genesisAddress,
    publicKey,
    genesisAmount,
    genesisTimestamp,
  );

  transaction.setTransactionId(getTransactionId(transaction));
  transaction.generateSignature();
  transaction.generateHash();

  return transaction;
};

const getCurrentHoldings = (ledger: Ledger, publicKey: string): number => {
  let currentHoldings = 0;
  for (let i = 0; i < ledger.entries.length; i += 1) {
    const entry = ledger.entries[i];
    // console.dir(entry);
    if (entry.to == publicKey) {
      console.log(`Address matches publicKey. Adding ${entry.amount} to currentHoldings.`);
      currentHoldings += entry.amount;
    }
    if (entry.from == publicKey) {
      console.log(`From matches publicKey. Removing ${entry.amount} from currentHoldings.`);
      currentHoldings -= entry.amount;
    }
  }
  return currentHoldings;
};

const getExpectedTransactionId = (transaction: Transaction): string => {
  const { to, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  return CryptoJS.SHA256(`${witnessOne}${witnessTwo}${partnerOne}${partnerTwo}${to}${from}${timestamp}`).toString();
};

const getPublicKey = (privateKey: string): string => {
  return ec.keyFromPrivate(privateKey, 'hex').getPublic().encode('hex');
};

const getTransactionId = (transaction: Transaction): string => {
  // const lastSenderId: number = parseInt(''); // Last TransactionId in Sender's ledger
  // const lastreceiverId: number = parseInt(''); // Last TransactionId in receiver's ledger
  // const transactionId = `${lastSenderId + 1}-${lastreceiverId + 1}`;
  const { to, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  console.dir(transaction);
  return CryptoJS.SHA256(`${witnessOne}${witnessTwo}${partnerOne}${partnerTwo}${to}${from}${timestamp}`).toString();
};

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger): void => {
  const pods: Pod[] = getPods();
  // console.dir(pods);
  const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
  const partnerPods: Pod[] = pods.filter(pod => pod.type === 1);
  const selectedPods: Pod[] = [...selectRandom(regularPods, 2, transaction.to), ...selectRandom(partnerPods, 2, transaction.to)];
  transaction.assignValidatorsToTransaction(selectedPods);
  transaction.setTransactionId(getTransactionId(transaction));
  transaction.generateSignature();

  const localLogger = getLogger();
  const senderPod = pods[getPodIndexByPublicKey(transaction.from)];
  const transactionStartEvent = new LogEvent(
    senderPod,
    pods[getPodIndexByPublicKey(transaction.to)],
    eventType.TRANSACTION_START,
    'info'
  );
  transactionStartEvent.transactionId = transaction.id;
  write(localLogger, createLogEvent(transactionStartEvent));

  const io: Server = getIo();
  console.log('Starting for loop for sending out validation checks...');
  for (let i = 0; i < selectedPods.length; i += 1) {
    const pod = selectedPods[i];
    const requestValidationStartEvent = new LogEvent(
      senderPod,
      pod,
      eventType.REQUEST_VALIDATION_START,
      'verbose'
    );

    console.log(`Connecting to ${pod.localIp}:${pod.port}`);
    const promise: Promise<void> = new Promise((resolve, reject) => {
      write(localLogger, createLogEvent(requestValidationStartEvent))
      const socket = ioClient(`https://${pod.ip}`);
      const connectToValidatorStartEvent = new LogEvent(
        senderPod,
        pod,
        eventType.CONNECT_TO_VALIDATOR_START,
        'verbose'
      );
      socket.on('connect', () => {
        resolve(`[requestValidateTransaction] Connected to ${pod.localIp}:${pod.port}... sending transaction details for transaction with id: ${transaction.id}.`);
        const connectToValidatorEndEvent = new LogEvent(
          senderPod,
          pod,
          eventType.CONNECT_TO_VALIDATOR_END,
          'verbose'
        );
        write(socket, isTransactionValid({ transaction, senderLedger }));
      });
      socket.on('message', (message: Message) => {
        handleMessage(socket, message);
      });
      socket.on('disconnect', () => {
        console.log('[requestValidateTransaction] socket disconnected.');
      });
      setTimeout(() => { reject(`Connection to ${pod.localIp}:${pod.port} could not be made in 10 seconds.`); }, 10000);
    }).then((fulfilled) => {
      console.log(fulfilled);
    },      (rejected) => {
      console.log(rejected);
    });
  }
};

const validateLedger = (senderLedger: Ledger, transaction: Transaction): Promise<IResult> => {
  const io: Server = getIo();
  const pods: Pod[] = getPods();
  const publicKey = transaction.from;
  if (senderLedger.entries.length === 1) {
    if (senderLedger.entries[0].from === getGenesisAddress()) {
      console.log('Initial genesis transaction for wallet. Skipping...');
      return new Promise((resolve, reject) => {
        if (transaction.amount < genesisAmount) {
          const result: IResult = {
            res: true,
            reason: '',
            id: transaction.id,
          };          
          resolve(result);
        } else {
          reject(
            `Insufficient funds in wallet.
             Current Holdings: ${genesisAmount}, Transaction Amount: ${transaction.amount}`);
        }
      });
    }
  }
  const promiseArray: Promise<IResult>[] = [];
  for (let i = 0; i < senderLedger.entries.length; i += 1) {
    console.log('Iterating over senderLedger.entries.');
    const entry: Transaction = senderLedger.entries[i];
    // console.dir(entry);
    const witnesses: string[] = [entry.witnessOne, entry.witnessTwo];
    const partners: string[] = [entry.partnerOne, entry.partnerTwo];
    const validators: string[] = [...witnesses, ...partners];
    const validatingPods: Pod[] = [];
    validators.map((v: string) => {
      console.log(v);
      const pod: Pod = pods[getPodIndexByPublicKey(v)];
      if (pod !== undefined) {
        console.log('Pushing validating pod to array');
        validatingPods.push(pod);
      }
      return;
    });
    for (let k = 0; k < validatingPods.length; k += 1) {
      console.log('Iterating over validating pods.');
      const pod = validatingPods[k];
      // console.dir(pod);
      const promise: Promise<IResult> = new Promise((resolve, reject) => {
        if (pod.address === getPublicFromWallet()) {
          console.log(`This node was a validator for this transaction.
           Checking hash against witness ledger entry...`);
          const result = validateTransactionHash(entry.id, entry.hash);
          resolve(result);
        } else {
          console.log(`Connecting to ${pod.localIp}:${pod.port}`);
          const socket = ioClient(`http://${pod.localIp}:${pod.port}`);
          const connectTimeout = setTimeout(() => {
            const result: IResult = {
              res: false,
              reason: `Connection to ${pod.localIp}:${pod.port} could not be made in 10 seconds.`,
              id: entry.id,
            };
            reject(result);
          }, 10000);
          socket.on('connect', () => {
            console.log(`[validateLedger] Connected to ${pod.localIp}:${pod.port}... sending transaction details.`);
            clearTimeout(connectTimeout);
            write(socket, isTransactionHashValid({ transactionId: entry.id, hash: entry.hash }));
          });
          socket.on('disconnect', () => {
            console.log('Socket was disconnected.');
          });
          socket.on('message', (message: Message) => {
            console.log('[validateLedger] handleMessage');
            if (message.type === MessageType.TRANSACTION_CONFIRMATION_RESULT) {
              const result: IResult = handleMessage(socket, message);
              console.log(`Received validation result from ${pod.localIp}:${pod.port}...
               resolving promise.`);
              socket.disconnect();
              resolve(result);
            }
          });
        }
      });
      console.log('Adding promise to promiseArray...');
      promiseArray.push(promise);
    }
  }
  return Promise.all(promiseArray).then((results) => {
    console.log('All promises complete. Checking current holdings of sender...');
    const validationResult: IResult = {
      res: true,
      reason: '',
      id: transaction.id,
    };
    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (!result.res) {
        validationResult.res = false;
        validationResult.reason = 'Needs to be filled with details of failed validation checks.';
      }
    }
    const currentHoldings = getCurrentHoldings(senderLedger, publicKey);
    if (currentHoldings < transaction.amount) {
      console.log(`Current Holdings: ${currentHoldings},
       Transaction Amount: ${transaction.amount}`);
      validationResult.res = false;
      validationResult.reason = `Insufficient funds in wallet.
       Current Holdings: ${currentHoldings}, Transaction Amount: ${transaction.amount}`;
    }
    if (validationResult.res) {
      validationResult.reason = 'Needs to be filled with details of validation checks.';
    }
    console.log(`[validateLedger]: resultId ${validationResult.id}`);
    return validationResult;
  });
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger, callback): void => {
  console.log(`[validateTransaction] transactionId: ${transaction.id}`);
  const expectedTransactionId: string = getExpectedTransactionId(transaction);
  let result: IResult = { res: false, reason: '', id: transaction.id };
  console.log(`[validateTransaction] resultId: ${result.id}`);
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid.
     Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    console.dir(transaction);
    console.log(result.reason);
    callback(result, transaction);
  } else {
    result = validateSignature(transaction); // Check if sender has proper access to funds
    if (!result.res) {
      console.log(result.reason);
      callback(result, transaction);
    }
    console.log('Signature was valid... validating ledger.');
    validateLedger(senderLedger, transaction).then((res) => {
      result = res;
      // console.log('validateLedger result:');
      // console.dir(result);
      callback(result, transaction);
    });
  }
};

const validateSignature = (transaction: Transaction): IResult => {
  console.log('Validating signature...');
  const { id, from, signature }: { id: string, from: string, signature: string } = transaction;
  // console.log(`Validating signature.
  //  Parameters: { id: ${id}, from: ${from}, signature: ${signature} }`);
  const key = ec.keyFromPublic(from, 'hex');
  // console.log(`keyFromPublic: ${key}`);
  const res = key.verify(id, signature);
  const reason = 'Transaction signature is invalid.';
  console.log(`[validateSignature] resultId: ${res.id}`);
  return {
    res,
    reason,
    id,
  };
};

const validateTransactionHash = (id: string, hash: string): IResult => {
  const transaction: Transaction = getEntryByTransactionId(id, 1);
  let res: boolean = false;
  let reason: string = 'Transaction hash is valid';
  if (transaction === undefined) {
    console.log(id, hash);
    res = false;
    reason = 'Transaction was not found in witnesses ledger';
    return {
      res,
      reason,
      id
    }
  }
  if (transaction.hash === hash) {
    res = true;
  } else {
    reason = 'Transaction hash is invalid.';
  }
  return {
    res,
    reason,
    id,
  };
};

export {
  Transaction, getTransactionId, IResult, requestValidateTransaction, genesisTransaction,
  getPublicKey, validateTransaction, validateTransactionHash, isValidAddress, getGenesisAddress,
};
