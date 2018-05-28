import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import { Server } from 'socket.io';
import * as ioClient from 'socket.io-client';

import { Ledger, getLedger } from './ledger';
import { createLogEventMsg, EventType, LogEvent } from './logEvent';
import { isTransactionValid } from './message';
import {
  getIo,
  getLogger,
  getPodIndexByPublicKey,
  getPods,
  getSelectedPods,
  handleMessage,
  isTransactionHashValid,
  Message,
  MessageType,
  write,
  getTestConfig,
} from './p2p';
import { Pod, createPod } from './pod';
import { Result } from './result';
import { selectRandom } from './rngTool';
import { getEntryByTransactionId, isValidAddress, toHexString } from './utils';
import { getPrivateFromWallet, getPublicFromWallet } from './wallet';
import { TestConfig } from './testConfig';

const config = require('../node/config/config.json');
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
  public local: boolean;

  constructor(from: string, to: string, amount: number, timestamp: number, local?: boolean) {
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.timestamp = timestamp;
    this.local = local || false;
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
    const pods = getPods();
    const localLogger = getLogger();
    const generateSignatureStartEvent = new LogEvent(
      pods[getPodIndexByPublicKey(this.from)],
      pods[getPodIndexByPublicKey(this.to)],
      this.id,
      EventType.GENERATE_SIGNATURE_START,
      'silly',
    );
    write(localLogger, createLogEventMsg(generateSignatureStartEvent));
    const key = ec.keyFromPrivate(getPrivateFromWallet(), 'hex');
    this.signature = toHexString(key.sign(this.id).toDER());
    const generateSignatureEndEvent = new LogEvent(
      pods[getPodIndexByPublicKey(this.from)],
      pods[getPodIndexByPublicKey(this.to)],
      this.id,
      EventType.GENERATE_SIGNATURE_END,
      'silly',
    );
    write(localLogger, createLogEventMsg(generateSignatureEndEvent));
  }

  generateHash = (): void => {
    const pods = getPods();
    const localLogger = getLogger();
    const generateTransactionHashStartEvent = new LogEvent(
      pods[getPodIndexByPublicKey(this.from)],
      pods[getPodIndexByPublicKey(this.to)],
      this.id,
      EventType.GENERATE_TRANSACTION_HASH_START,
      'silly',
    );
    write(localLogger, createLogEventMsg(generateTransactionHashStartEvent));
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
    const generateTransactionHashEndEvent = new LogEvent(
      pods[getPodIndexByPublicKey(this.from)],
      pods[getPodIndexByPublicKey(this.to)],
      this.id,
      EventType.GENERATE_TRANSACTION_HASH_END,
      'silly',
    );
    write(localLogger, createLogEventMsg(generateTransactionHashEndEvent));
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
const genesisAddress: string = `04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a`;
const genesisAmount: number = 500;
const getGenesisAddress = (): string => genesisAddress;

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
    // console.log(entry.to, publicKey);
    if (entry.to == publicKey) {
      // console.log(`Address matches publicKey. Adding ${entry.amount} to currentHoldings.`);
      currentHoldings += entry.amount;
    }
    if (entry.from == publicKey) {
      // console.log(`From matches publicKey. Removing ${entry.amount} from currentHoldings.`);
      currentHoldings -= entry.amount;
    }
  }
  return currentHoldings;
};

const getTransactionId = (transaction: Transaction): string => {
  console.time('generateTransactionId');
  const { to, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  const transactionId = CryptoJS.SHA256(`${witnessOne}${witnessTwo}${partnerOne}${partnerTwo}${to}${from}${timestamp}`).toString();
  console.timeEnd('generateTransactionId');
  return transactionId;
};

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger): void => {
  const pods: Pod[] = getPods();
  const localSelectedPods: Pod[] = getSelectedPods();
  const localTestConfig: TestConfig = getTestConfig();
  const localLogger = getLogger();
  // console.dir(pods);
  let regularPods: Pod[] = [];
  if (config.sendersAsValidators) {
    regularPods = pods.filter(pod => pod.type === 0);
  }
  else {
    const localSenderPods = localSelectedPods.slice(0, localSelectedPods.length / 2);
    regularPods = pods.filter(pod => pod.type === 0).filter(pod => !localSenderPods.find(senderPod => senderPod.address === pod.address));
  }
  const partnerPods: Pod[] = pods.filter(pod => pod.type === 1);
  const selectedPods: Pod[] = [...selectRandom(regularPods, 2, transaction.to), ...selectRandom(partnerPods, 2, transaction.to)];
  const senderPod = pods[getPodIndexByPublicKey(transaction.from)];
  transaction.assignValidatorsToTransaction(selectedPods);
  transaction.setTransactionId(getTransactionId(transaction));
  // console.time('transaction');
  const transactionStartEvent = new LogEvent(
    senderPod,
    pods[getPodIndexByPublicKey(transaction.to)],
    transaction.id,
    EventType.TRANSACTION_START,
    'info',
  );
  write(localLogger, createLogEventMsg(transactionStartEvent));
  console.time('generateSignature');
  transaction.generateSignature();
  console.timeEnd('generateSignature');

  const io: Server = getIo();
  // console.log('Starting for loop for sending out validation checks...');
  for (let i = 0; i < selectedPods.length; i += 1) {
    const pod = selectedPods[i];
    const podIp = localTestConfig.local ? `${pod.localIp}:${pod.port}` : pod.ip;
    const requestValidationStartEvent = new LogEvent(
      senderPod,
      pods[getPodIndexByPublicKey(transaction.to)],
      transaction.id,
      EventType.REQUEST_VALIDATION_START,
      'info',
      pods[getPodIndexByPublicKey(pod.address)],
    );
    // console.time('requestValidation');
    // console.log(`Connecting to ${podIp}`);
    const promise: Promise<void> = new Promise((resolve, reject) => {
      write(localLogger, createLogEventMsg(requestValidationStartEvent));          
      const connectToValidatorStartEvent = new LogEvent(
        senderPod,
        pods[getPodIndexByPublicKey(transaction.to)],
        transaction.id,
        EventType.CONNECT_TO_VALIDATOR_START,
        'info',
        undefined,
        pods[getPodIndexByPublicKey(pod.address)],
      );
      console.time(`connectValidator-${i}-${transaction.id}`);
      write(localLogger, createLogEventMsg(connectToValidatorStartEvent));      
      const socket = ioClient(`http://${podIp}`, { transports: ['websocket'] });
      socket.on('connect', () => {
        console.timeEnd(`connectValidator-${i}-${transaction.id}`);
        const connectToValidatorEndEvent = new LogEvent(
          senderPod,
          pods[getPodIndexByPublicKey(transaction.to)],
          transaction.id,
          EventType.CONNECT_TO_VALIDATOR_END,
          'info',
          undefined,
          pods[getPodIndexByPublicKey(pod.address)],
        );
        write(localLogger, createLogEventMsg(connectToValidatorEndEvent));
        write(socket, isTransactionValid({ transaction, senderLedger }));
        resolve(`[requestValidateTransaction] Connected to ${podIp}... sending transaction details for transaction with id: ${transaction.id}.`);
      });
      socket.on('message', (message: Message) => {
        handleMessage(socket, message);
      });
      socket.on('disconnect', () => {
        // console.log('[requestValidateTransaction] socket disconnected.');
      });
      setTimeout(() => { reject(`Connection to ${podIp} could not be made in 10 seconds.`); }, 10000);
    }).then((fulfilled) => {
      // console.log(fulfilled);
    },      (rejected) => {
      // console.log(rejected);
    });
  }
};

const validateLedger = (senderLedger: Ledger, transaction: Transaction): Promise<Result> => {
  console.time(`validateLedger-${transaction.id}`);
  const io: Server = getIo();
  const localLogger = getLogger();
  const pods: Pod[] = getPods();
  const localTestConfig = getTestConfig();
  const validateLedgerStartEvent = new LogEvent(
    pods[getPodIndexByPublicKey(transaction.to)],
    pods[getPodIndexByPublicKey(transaction.from)],
    transaction.id,
    EventType.VALIDATE_LEDGER_START,
    'info',
  );
  write(localLogger, createLogEventMsg(validateLedgerStartEvent));
  const publicKey = transaction.from;
  if (senderLedger.entries.length === 1) {
    if (senderLedger.entries[0].from === getGenesisAddress()) {
      // console.log('Initial genesis transaction for wallet. Skipping...');
      return new Promise((resolve, reject) => {
        if (transaction.amount < genesisAmount) {
          const result = new Result(true, '', transaction.id);          
          resolve(result);
        } else {
          reject(`Insufficient funds in wallet. Current Holdings: ${genesisAmount}, Transaction Amount: ${transaction.amount}`);
        }
      });
    }
  }
  const promiseArray: Promise<Result>[] = [];
  for (let i = 0; i < senderLedger.entries.length; i += 1) {
    // console.log('Iterating over senderLedger.entries.');
    const entry: Transaction = senderLedger.entries[i];
    // console.dir(entry);
    const witnesses: string[] = [entry.witnessOne, entry.witnessTwo];
    const partners: string[] = [entry.partnerOne, entry.partnerTwo];
    const validators: string[] = [...witnesses, ...partners];
    const validatingPods: Pod[] = [];
    validators.map((v: string) => {
      // console.log(v);
      const pod: Pod = pods[getPodIndexByPublicKey(v)];
      if (pod !== undefined) {
        // console.log('Pushing validating pod to array');
        validatingPods.push(pod);
      }
      return;
    });
    for (let k = 0; k < validatingPods.length; k += 1) {
      // console.log('Iterating over validating pods.');
      const pod: Pod = validatingPods[k];
      // console.dir(pod);
      const promise: Promise<Result> = new Promise((resolve, reject) => {        
        if (pod.address === getPublicFromWallet()) {
          // console.log(`This node was a validator for this transaction. Checking hash against witness ledger entry...`);
          console.time(`connectPreviousValidator-${k}-${entry.id}`);
          console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);
          const result = validateTransactionHash(entry.id, entry.hash);
          resolve(result);
        } else {
          const podIp = localTestConfig.local ? `${pod.localIp}:${pod.port}` : pod.ip;
          // console.log(`Connecting to ${podIp}`);
          const connectToPreviousValidatorStartEvent = new LogEvent(
            pods[getPodIndexByPublicKey(transaction.to)],
            pods[getPodIndexByPublicKey(transaction.from)],
            transaction.id,
            EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START,
            'info',
            undefined,
            pods[getPodIndexByPublicKey(pod.address)],
          );
          console.time(`connectPreviousValidator-${k}-${entry.id}`);
          write(localLogger, createLogEventMsg(connectToPreviousValidatorStartEvent));          
          const socket = ioClient(`http://${podIp}`, { transports: ['websocket'] });
          const connectTimeout = setTimeout(() => {
            const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
            const result = new Result(false, reason, entry.id);
            reject(result);
          }, 10000);
          const connectToPreviousValidatorEndEvent = new LogEvent(
            pods[getPodIndexByPublicKey(transaction.to)],
            pods[getPodIndexByPublicKey(transaction.from)],
            transaction.id,
            EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END,
            'info',
            undefined,
            pods[getPodIndexByPublicKey(pod.address)],
          );
          const connectToPreviousValidatorLogEvent = createLogEventMsg(connectToPreviousValidatorEndEvent);
          const isTransactionHashValidMsg = isTransactionHashValid({ transactionId: entry.id, hash: entry.hash });
          socket.on('connect', () => {
            console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);        
            write(localLogger, connectToPreviousValidatorLogEvent);
            // console.log(`[validateLedger] Connected to ${podIp}... sending transaction details.`);
            clearTimeout(connectTimeout);
            write(socket, isTransactionHashValidMsg);
          });
          socket.on('disconnect', () => {
            // console.log('Socket was disconnected.');
          });
          socket.on('message', (message: Message) => {
            // console.log('[validateLedger] handleMessage');
            if (message.type === MessageType.TRANSACTION_CONFIRMATION_RESULT) {
              const result: Result = handleMessage(socket, message);
              // console.log(`Received validation result from ${podIp}... resolving promise.`);
              socket.disconnect();
              resolve(result);
            }
          });
        }
      });
      // console.log('Adding promise to promiseArray...');
      promiseArray.push(promise);
      if (promiseArray.length > 4) {
        // console.log(`Promise array length: ${promiseArray.length}. SHOULD BE 4 MAX`);
      }
    }
  }
  return Promise.all(promiseArray).then((results) => {
    // console.log('All promises complete. Checking current holdings of sender...');
    const validationResult = new Result(true, '', transaction.id);
    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (!result.res) {
        validationResult.res = false;
        validationResult.reason = 'Needs to be filled with details of failed validation checks.';
      }
    }
    const currentHoldings = getCurrentHoldings(senderLedger, publicKey);
    if (currentHoldings < transaction.amount) {
      // console.log(`Current Holdings: ${currentHoldings}, Transaction Amount: ${transaction.amount}`);
      validationResult.res = false;
      validationResult.reason = `Insufficient funds in wallet.
       Current Holdings: ${currentHoldings}, Transaction Amount: ${transaction.amount}`;
    }
    if (validationResult.res) {
      validationResult.reason = 'Needs to be filled with details of validation checks.';
    }
    // console.log(`[validateLedger]: resultId ${validationResult.id}`);
    console.timeEnd(`validateLedger-${transaction.id}`);
    const validateLedgerEndEvent = new LogEvent(
      undefined,
      undefined,
      transaction.id,
      EventType.VALIDATE_LEDGER_END,
      'info',
    );
    write(localLogger, createLogEventMsg(validateLedgerEndEvent));
    return validationResult;
  });
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger,
  callback: (result: Result, transaction: Transaction) => void): void => {
  // console.log(`[validateTransaction] transactionId: ${transaction.id}`);
  const expectedTransactionId: string = getTransactionId(transaction);
  let result = new Result(false, '', transaction.id);
  // console.log(`[validateTransaction] resultId: ${result.id}`);
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid.
     Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    // console.dir(transaction);
    // console.log(result.reason);
    callback(result, transaction);
  } else {
    result = validateSignature(transaction); // Check if sender has proper access to funds
    if (!result.res) {
      // console.log(result.reason);
      callback(result, transaction);
    }
    // console.log('Signature was valid... validating ledger.');
    validateLedger(senderLedger, transaction).then((res) => {
      result = res;
      // console.log('validateLedger result:');
      // console.dir(result);
      callback(result, transaction);
    });
  }
};

const validateSignature = (transaction: Transaction): Result => {
  // console.log('Validating signature...');
  const { id, from, signature }: { id: string, from: string, signature: string } = transaction;
  // console.log(`Validating signature.
  //  Parameters: { id: ${id}, from: ${from}, signature: ${signature} }`);
  const pods = getPods();
  const localLogger = getLogger();
  const validateSignatureStartEvent = new LogEvent(
    pods[getPodIndexByPublicKey(transaction.from)],
    pods[getPodIndexByPublicKey(transaction.to)],
    transaction.id,
    EventType.VALIDATE_SIGNATURE_START,
    'silly',
  );
  write(localLogger, createLogEventMsg(validateSignatureStartEvent));
  const key = ec.keyFromPublic(from, 'hex');
  // console.log(`keyFromPublic: ${key}`);
  const res = key.verify(id, signature);
  const validateSignatureEndEvent = new LogEvent(
    pods[getPodIndexByPublicKey(transaction.from)],
    pods[getPodIndexByPublicKey(transaction.to)],
    transaction.id,
    EventType.VALIDATE_SIGNATURE_END,
    'silly',
  );
  write(localLogger, createLogEventMsg(validateSignatureEndEvent));
  const reason = 'Transaction signature is invalid.';
  // console.log(`[validateSignature] resultId: ${res.id}`);
  return new Result(res, reason, id);
};

const validateTransactionHash = (id: string, hash: string): Result => {
  const transaction: Transaction = getEntryByTransactionId(id, 1);
  let res: boolean = false;
  let reason: string = 'Transaction hash is valid';
  if (transaction === undefined) {
    // console.log(id, hash);
    res = false;
    reason = 'Transaction was not found in witnesses ledger';
    return new Result (res, reason, id);
  }
  if (transaction.hash === hash) {
    res = true;
  } else {
    reason = 'Transaction hash is invalid.';
  }
  return new Result(res, reason, id);
};

export {
  Transaction, getTransactionId, Result, requestValidateTransaction, genesisTransaction,
  validateTransaction, validateTransactionHash, isValidAddress, getGenesisAddress,
};
