import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as ioClient from 'socket.io-client';

import { getLedgerBalance, Ledger, LedgerType } from './ledger';
import { EventType, LogEvent, LogLevel } from './logEvent';
import { debug, info } from './logger';
import { isTransactionValid, requestLedgerMsg, requestSnapshotMsg } from './message';
import {
  getPods,
  getSelectedPods,
  getSnapshotMap,
  getTestConfig,
  handleMessageAsClient,
  IMessage,
  isTransactionHashValid,
  MessageType,
  write,
} from './p2p';
import { Pod } from './pod';
import { Result } from './result';
import { selectRandom } from './rngTool';
import { TestConfig } from './testConfig';
import { getEntryByTransactionId, getPodIndexByPublicKey, getPodIp, toHexString } from './utils';
import { getPrivateFromWallet, getPublicFromWallet } from './wallet';

const ec = new ecdsa.ec('secp256k1');

const ioClientOpts = {
  transports: ['websocket'],
  reconnectionDelay: 1000,
  reconnection: true,
  reconnectionAttempts: 10,
  agent: false,
  upgrade: false,
  rejectUnauthorized: false,
};

class Transaction {
  public id: string = '';
  public from: string;
  public to: string;
  public amount: number;
  public witnessOne: string = '';
  public witnessTwo: string = '';
  public partnerOne: string = '';
  public partnerTwo: string = '';
  public signature: string = '';
  public timestamp: number;
  public hash: string = '';
  public local: boolean;

  constructor(from: string, to: string, amount: number, timestamp: number, selectedPods: Pod[] = [], testConfig?: TestConfig) {
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.timestamp = timestamp;
    this.local = testConfig ? testConfig.local : false;
    if (from !== '') {
      this.selectRandomValidators(selectedPods, testConfig);
      this.id = getTransactionId(this);
      this.signature = this.generateSignature();
      this.hash = this.generateHash();
    }
    // this.witnessOne = witnessOne;
    // this.witnessTwo = witnessTwo;
    // this.partnerOne = partnerOne;
    // this.partnerTwo = partnerTwo;
  }

  assignValidatorsToTransaction = (validators: Pod[]) => {
    this.witnessOne = validators[0].address || '';
    this.witnessTwo = validators[1].address || '';
    this.partnerOne = validators[2].address || '';
    this.partnerTwo = validators[3].address || '';
  }

  generateSignature = () => {
    // console.log('generateSignature');
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_SIGNATURE_START,
      LogLevel.SILLY,
    );
    const key = ec.keyFromPrivate(getPrivateFromWallet(), 'hex');
    const signature = toHexString(key.sign(this.id).toDER());
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_SIGNATURE_END,
      LogLevel.SILLY,
    );
    return signature;
  }

  generateHash = () => {
    // console.log('generateHash');
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_TRANSACTION_HASH_START,
      LogLevel.SILLY,
    );
    const hash = CryptoJS.SHA256(`
      ${this.witnessOne}
      ${this.witnessTwo}
      ${this.partnerOne}
      ${this.partnerTwo}
      ${this.to}
      ${this.amount}
      ${this.from}
      ${this.timestamp}
    `).toString();
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_TRANSACTION_HASH_END,
      LogLevel.SILLY,
    );
    return hash;
  }

  getValidators() {
    // console.log('getValidators');
    const pods = getPods();
    return [
      pods[getPodIndexByPublicKey(this.witnessOne, pods)],
      pods[getPodIndexByPublicKey(this.witnessTwo, pods)],
      pods[getPodIndexByPublicKey(this.partnerOne, pods)],
      pods[getPodIndexByPublicKey(this.partnerTwo, pods)],
    ];
  }

  selectRandomValidators(sendersAndReceivers: Pod[], testConfig?: TestConfig) {
    // console.log('selectRandomValidators');
    // if (this.from === getGenesisAddress()) {
    //   // console.log('genesis transaction, returning...');
    //   return;
    // }
    let regularPods: Pod[] = [];
    const pods = getPods();
    if (testConfig && testConfig.sendersAsValidators) {
      regularPods = pods.filter(pod => pod.podType === 0);
    }
    else {
      const senderPods = sendersAndReceivers.slice(0, sendersAndReceivers.length / 2);
      info(`[selectRandomValidators] senderPods: ${senderPods.length}`);
      regularPods = pods.filter(pod => pod.podType === 0).filter(pod => !senderPods.find(senderPod => senderPod.address === pod.address));
      // console.log('regularPods');
      // console.dir(regularPods);
    }
    const partnerPods: Pod[] = pods.filter(pod => pod.podType === 1);
    info(`[selectRandomValidators] regularPods: ${regularPods.length} | partnerPods: ${partnerPods.length}`);
    const selectedPods: Pod[] = [...selectRandom(regularPods, 2), ...selectRandom(partnerPods, 2)];
    this.assignValidatorsToTransaction(selectedPods);
  }
}

interface ISnapshotMap {
  [index: string]: {
    snapshotNodes: string[];
    snapshots: string [];
  };
}

interface ISnapshotResponse {
  snapshotOwner: string;
  transactionId: string;
  snapshot: string;
  ownerRole: ActorRoles;
}

enum ActorRoles {
  SENDER = 0,
  RECEIVER = 1,
  CURRENT_VALIDATOR = 2,
  PREVIOUS_VALIDATOR = 3,
  SNAPSHOT_VALIDATOR = 4,
}

const genesisTimestamp: number = 1525278308842;
const genesisAddress: string = '04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a';
const genesisAmount: number = 500;
const getGenesisAddress = () => genesisAddress;

const genesisTransaction = (publicKey: string) => {
  // console.log('genesisTransaction');
  const localTestConfig = getTestConfig();
  const localSelectedPods = getSelectedPods();
  const transaction = new Transaction(
    genesisAddress,
    publicKey,
    genesisAmount,
    genesisTimestamp,
    localSelectedPods,
    localTestConfig,
  );
  return transaction;
};

const getTransactionId = (transaction: Transaction) => {
  // console.time('generateTransactionId');
  const { to, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  const transactionId = CryptoJS.SHA256(`${witnessOne}${witnessTwo}${partnerOne}${partnerTwo}${to}${from}${timestamp}`).toString();
  // console.timeEnd('generateTransactionId');
  return transactionId;
};

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger) => {
  // console.time('transaction');
  debug('[requestValidateTransaction]');
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    EventType.TRANSACTION_START,
    LogLevel.INFO,
  );
  debug('Starting for loop for sending out validation checks...');
  const localTestConfig = getTestConfig();
  const validators = transaction.getValidators();
  for (let i = 0; i < validators.length; i += 1) {
    const pod = validators[i];
    // console.log(`Transaction.local: ${transaction.local}`);
    const podIp = getPodIp(localTestConfig.local, pod);
    // console.time('requestValidation');
    // console.log(`Connecting to ${podIp}`);
    new Promise((resolve, reject) => {
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_VALIDATOR_START,
        LogLevel.INFO,
        undefined,
        pod.address,
      );
      debug(`Connecting to validator: ${podIp}`);
      // console.time(`connectValidator-${i}-${transaction.id}`);
      const socket = ioClient(podIp, ioClientOpts);
      debug('Opened socket');
      const msg = isTransactionValid({ transaction, senderLedger });
      debug('Built message');
      const connectTimeout = setTimeout(() => {
        const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
        const result = new Result(false, reason, transaction.id);
        reject(result);
      }, 10000);
      debug('Built timeout');
      socket.once('connect', () => {
        // console.timeEnd(`connectValidator-${i}-${transaction.id}`);
        clearTimeout(connectTimeout);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_VALIDATOR_END,
          LogLevel.INFO,
          undefined,
          pod.address,
        );
        write(socket, msg);
        // console.dir(senderLedger);
        resolve(`[requestValidateTransaction] Connected to ${podIp}... sending transaction details for transaction with id: ${transaction.id}.`);
      });
      socket.once('message', (message: IMessage) => {
        handleMessageAsClient(socket, message);
      });
      socket.on('disconnect', (reason: any) => {
        info(`Disconnected from peer. Reason: ${reason}`);
      });
      socket.on('error', (error: any) => info(`[requestValidateTransaction] Error: ${error}`));
      socket.on('reconnect_attempt', () => {
        info('Attempting to reconnect...');
      });
    }).then((fulfilled) => {
      debug(fulfilled);
    }).catch((rejected: Result) => {
      info(rejected.reason);
    });
  }
};

const validateLedger = (senderLedger: Ledger, transaction: Transaction): Promise<Result> => {
  // console.time(`validateLedger-${transaction.id}`);
  const pods = getPods();
  const localTestConfig = getTestConfig();
  new LogEvent(
    transaction.to,
    transaction.from,
    transaction.id,
    EventType.VALIDATE_LEDGER_START,
    LogLevel.INFO,
  );
  const publicKey = transaction.from;
  if (senderLedger.entries.length === 1) {
    if (senderLedger.entries[0].from === getGenesisAddress()) {
      // console.log('Initial genesis transaction for wallet. Skipping...');
      return new Promise<Result>((resolve, reject) => {
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
  const ledgerLength = senderLedger.entries.length;
  // console.log('Iterating over senderLedger.entries.');
  const entry: Transaction = senderLedger.entries[ledgerLength - 1];
  // console.dir(entry);
  const witnesses: string[] = [entry.witnessOne, entry.witnessTwo];
  const partners: string[] = [entry.partnerOne, entry.partnerTwo];
  const validators: string[] = [...witnesses, ...partners];
  const validatingPods: Pod[] = [];
  validators.map((v: string) => {
    // console.log(v);
    const pod: Pod = pods[getPodIndexByPublicKey(v, pods)];
    if (pod !== undefined) {
      // console.log('Pushing validating pod to array');
      validatingPods.push(pod);
    }
    return;
  });
  for (let k = 0; k < validatingPods.length; k += 1) {
    // console.log('Iterating over validating pods.');
    const pod: Pod = validatingPods[k];
    const podIp = getPodIp(localTestConfig.local, pod);
    // console.dir(pod);
    const validateLedgerPromise: Promise<Result> = new Promise((resolve, reject) => {
      if (pod.address === getPublicFromWallet()) {
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START,
          LogLevel.INFO,
          undefined,
          pod.address,
        );
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END,
          LogLevel.INFO,
          undefined,
          pod.address,
        );
        // console.log(`This node was a validator for this transaction. Checking hash against witness ledger entry...`);
        // console.time(`connectPreviousValidator-${k}-${entry.id}`);
        // console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);
        const result = validateTransactionHash(entry.id, transaction.id, entry.hash);
        resolve(result);
      } else {
        // console.log(`Connecting to ${podIp}`);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START,
          LogLevel.INFO,
          undefined,
          pod.address,
        );
        // console.time(`connectPreviousValidator-${k}-${entry.id}`);
        const socket = ioClient(podIp, ioClientOpts);
        const isTransactionHashValidMsg = isTransactionHashValid({ transactionId: entry.id, currentTransactionId: transaction.id, hash: entry.hash });
        const connectTimeout = setTimeout(() => {
          const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
          const result = new Result(false, reason, entry.id);
          reject(result);
        }, 10000);
        socket.once('connect', () => {
          // console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);
          // console.log(`[validateLedger] Connected to ${podIp}... sending transaction details.`);
          clearTimeout(connectTimeout);
          new LogEvent(
            transaction.from,
            transaction.to,
            transaction.id,
            EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END,
            LogLevel.INFO,
            undefined,
            pod.address,
          );
          write(socket, isTransactionHashValidMsg);
        });
        socket.once('disconnect', () => {
          // console.log('Socket was disconnected.');
        });
        socket.once('message', (message: IMessage) => {
          // console.log('[validateLedger] handleMessage');
          if (message.type === MessageType.TRANSACTION_CONFIRMATION_RESULT) {
            const result: Result = JSON.parse(message.data);
            socket.disconnect();
            // console.log(`Received validation result from ${podIp}... resolving promise.`);
            resolve(result);
          }
        });
      }
    });
    const timeoutPromise = new Promise<Result>((resolve) => {
      const reason = `[validateLedger] Connection to ${podIp} could not be made in 10 seconds.`;
      const result = new Result(false, reason, transaction.id);
      setTimeout(resolve, 10000, result);
    });

    const promise = Promise.race([validateLedgerPromise, timeoutPromise]);
    // console.log('Adding promise to promiseArray...');
    promiseArray.push(promise);
    if (promiseArray.length > 4) {
      // console.log(`Promise array length: ${promiseArray.length}. SHOULD BE 4 MAX`);
    }
  }
  return Promise.all(promiseArray).then((results) => {
    // console.log('All promises complete. Checking current holdings of sender...');
    const validationResult = new Result(true, '', transaction.id);
    for (let j = 0; j < results.length; j += 1) {
      const result = results[j];
      if (!result.res) {
        validationResult.res = false;
        validationResult.reason += result.reason;
      }
    }
    const currentHoldings = getLedgerBalance(senderLedger, publicKey);
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
    // console.timeEnd(`validateLedger-${transaction.id}`);
    new LogEvent(
      '',
      '',
      transaction.id,
      EventType.VALIDATE_LEDGER_END,
      LogLevel.INFO,
    );
    return validationResult;
  });
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger,
  callback: (results: (Result | Ledger | ISnapshotResponse)[], transaction: Transaction) => void): void => {
  // console.log(`[validateTransaction] transactionId: ${transaction.id}`);

  if (transaction.from == genesisAddress) {
    info('Genesis transaction');
    return callback([new Result(true, '', transaction.id)], transaction);
  }
  const validationPromiseArray: Promise<Result | Ledger | ISnapshotResponse>[] = [];
  const pods = getPods();
  const snapshotMap = getSnapshotMap();
  const senderSnapshotNodes = snapshotMap[transaction.from].snapshotNodes;
  const receiverSnapshotNodes = snapshotMap[transaction.to].snapshotNodes;
  const expectedTransactionId: string = getTransactionId(transaction);
  // const requestReceiverLedgerPromise: Promise<Ledger> = requestReceiverLedger(transaction);
  let result = new Result(false, '', transaction.id);
  // console.log(`[validateTransaction] resultId: ${result.id}`);
  info('Transaction ID Check');
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid.
     Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    // console.dir(transaction);
    // console.log(result.reason);
    callback([result], transaction);
  } else {
    info('Validate Signature');
    result = validateSignature(transaction); // Check if sender has proper access to funds
    if (!result.res) {
      // console.log(result.reason);
      callback([result], transaction);
    }
    const requestReceiverLedgerPromise = requestReceiverLedger(transaction);
    validationPromiseArray.push(requestReceiverLedgerPromise);
    info('Loop over Sender Snapshot Nodes');
    for (let i = 0; i < senderSnapshotNodes.length; i += 1) {
      const snapshotNodeAddress = senderSnapshotNodes[i];
      const snapshotNodeIndex = getPodIndexByPublicKey(snapshotNodeAddress, pods);
      const snapshotNode = pods[snapshotNodeIndex];
      const snapshotValidationPromise: Promise<Result | ISnapshotResponse> = requestSnapshot(snapshotNode, transaction.from, transaction);
      validationPromiseArray.push(snapshotValidationPromise);
    }
    info('Loop over Receiver Snapshot Nodes');
    for (let i = 0; i < receiverSnapshotNodes.length; i += 1) {
      const snapshotNodeAddress = receiverSnapshotNodes[i];
      const snapshotNodeIndex = getPodIndexByPublicKey(snapshotNodeAddress, pods);
      const snapshotNode = pods[snapshotNodeIndex];
      // CHANGE TO RECEIVER LEDGER SNAPSHOT WHEN IMPLEMENTED
      const snapshotValidationPromise: Promise<Result | ISnapshotResponse> = requestSnapshot(snapshotNode, transaction.to, transaction);
      validationPromiseArray.push(snapshotValidationPromise);
    }
    // console.log('Signature was valid... validating ledger.');
    info('Validate Ledger');
    const validateLedgerPromise: Promise<Result> = validateLedger(senderLedger, transaction);
    validationPromiseArray.push(validateLedgerPromise);

    Promise.all(validationPromiseArray).then((results) => {
      callback(results, transaction);
    })
    .catch((error) => {
      info(`[validateTransaction]: Promise All Error: ${error}`);
    });
  }
};

const validateSignature = (transaction: Transaction): Result => {
  // console.log('Validating signature...');
  const { id, from, signature }: { id: string, from: string, signature: string } = transaction;
  // console.log(`Validating signature.
  //  Parameters: { id: ${id}, from: ${from}, signature: ${signature} }`);
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    EventType.VALIDATE_SIGNATURE_START,
    LogLevel.SILLY,
  );
  const key = ec.keyFromPublic(from, 'hex');
  // console.log(`keyFromPublic: ${key}`);
  const res = key.verify(id, signature);
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    EventType.VALIDATE_SIGNATURE_END,
    LogLevel.SILLY,
  );
  const reason = 'Transaction signature is invalid.';
  // console.log(`[validateSignature] resultId: ${res.id}`);
  return new Result(res, reason, id);
};

const validateTransactionHash = (id: string, currentId: string, hash: string): Result => {
  const transaction = getEntryByTransactionId(id, currentId, undefined, 1);
  let res: boolean = false;
  let reason: string = 'Transaction hash is valid';
  if (transaction === undefined) {
    // console.log(id, hash);
    res = false;
    reason = 'Transaction was not found in witnesses ledger';
    return new Result(res, reason, id);
  }
  if (transaction.hash === hash) {
    res = true;
  } else {
    reason = 'Transaction hash is invalid.';
  }
  return new Result(res, reason, id);
};

const requestSnapshot = (pod: Pod, snapshotOwner: string, transaction: Transaction): Promise<Result | ISnapshotResponse> => {
  const localTestConfig = getTestConfig();
  const podIp = getPodIp(localTestConfig.local, pod);
  const timeoutPromise = new Promise<Result>((resolve) => {
    const reason = `[requestSnapshot] Connection to ${podIp} could not be made in 10 seconds.`;
    const result = new Result(false, reason, transaction.id);
    setTimeout(resolve, 10000, result);
  });
  const requestSnapshotPromise = new Promise<Result | ISnapshotResponse>((resolve, reject) => {
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.CONNECT_TO_SNAPSHOT_NODE_START,
      LogLevel.INFO,
      undefined,
      pod.address,
    );
    const socket = ioClient(podIp, ioClientOpts);
    const msg = requestSnapshotMsg({ snapshotOwner, transactionId: transaction.id });
    const connectTimeout = setTimeout(() => {
      const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
      const result = new Result(false, reason, transaction.id);
      reject(result);
    }, 10000);
    socket.once('connect', () => {
      clearTimeout(connectTimeout);
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_SNAPSHOT_NODE_END,
        LogLevel.INFO,
        undefined,
        pod.address,
      );
      write(socket, msg);
    });
    socket.once('message', (message: IMessage) => {
      if (message.type === MessageType.SNAPSHOT_RESULT) {
        const data = JSON.parse(message.data);
        socket.disconnect();
        resolve(data);
      }
      else {
        const reason = `[requestSnapshot] Received wrong message type: ${message.type}`;
        const result = new Result(false, reason, transaction.id);
        socket.disconnect();
        reject(result);
      }
    });
  });

  return Promise.race([requestSnapshotPromise, timeoutPromise]);
};

const requestReceiverLedger = (transaction: Transaction): Promise<Ledger | Result> => {
  const pods = getPods();
  const pod = pods[getPodIndexByPublicKey(transaction.to, pods)];
  const localTestConfig = getTestConfig();
  const podIp = getPodIp(localTestConfig.local, pod);
  const timeoutPromise = new Promise<Result>((resolve) => {
    const reason = `[requestReceiverLedger] Connection to ${podIp} could not be made in 10 seconds.`;
    const result = new Result(false, reason, transaction.id);
    setTimeout(resolve, 10000, result);
  });
  const requestReceiverLedgerPromise = new Promise<Ledger>((resolve, reject) => {
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.CONNECT_TO_RECEIVER_START,
      LogLevel.INFO,
      undefined,
      pod.address,
    );
    const socket = ioClient(podIp, ioClientOpts);
    const msg = requestLedgerMsg({ transactionId: transaction.id, ledgerType: LedgerType.MY_LEDGER });
    const connectTimeout = setTimeout(() => {
      const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
      const result = new Result(false, reason, transaction.id);
      reject(result);
    }, 10000);
    socket.once('connect', () => {
      clearTimeout(connectTimeout);
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_RECEIVER_END,
        LogLevel.INFO,
        undefined,
        pod.address,
      );
      write(socket, msg);
    });
    socket.once('message', (message: IMessage) => {
      if (message.type === MessageType.LEDGER_RESULT) {
        const data = JSON.parse(message.data);
        socket.disconnect();
        resolve(data.ledger);
      }
    });
  });

  return Promise.race([requestReceiverLedgerPromise, timeoutPromise]);
};

const validateSnapshot = (snapshot: string, sender: string, transactionId: string) => {
  const snapshotMap = getSnapshotMap();
  info(`[validateSnapshot] snapshot: ${snapshot}`);
  info(`sender: ${sender}`);
  const senderSnapshots = snapshotMap[sender].snapshots;
  info(`[validateSnapshot] senderSnapshots: ${JSON.stringify(senderSnapshots)}`);
  const lastSnapshot = senderSnapshots[senderSnapshots.length - 1];
  info(`[validateSnapshot] lastSnapshot: ${lastSnapshot}`);
  if (lastSnapshot == snapshot) {
    return new Result(true, '', transactionId);
  }
  return new Result(false, 'Provided snapshot does not match sender\'s last snapshot', transactionId);
};

export {
  Transaction, getTransactionId, ISnapshotMap, requestValidateTransaction, genesisTransaction,
  validateTransaction, validateTransactionHash, getGenesisAddress, validateSnapshot, ISnapshotResponse,
  ActorRoles,
};
