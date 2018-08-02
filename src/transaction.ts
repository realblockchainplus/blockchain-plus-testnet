import * as CryptoJS from 'crypto-js';
import * as ecdsa from 'elliptic';
import * as ioClient from 'socket.io-client';
import { Ledger, getLedgerBalance, LedgerType } from './ledger';
import { EventType, LogEvent } from './logEvent';
import { debug, info } from './logger';
import { isTransactionValid, requestSnapshotMsg, requestLedgerMsg } from './message';
import { IMessage, MessageType, getPodIndexByPublicKey, getPods, getTestConfig, handleMessage, isTransactionHashValid, write, getSnapshotMap, getSelectedPods } from './p2p';
import { Pod, PodType } from './pod';
import { Result } from './result';
import { getEntryByTransactionId, toHexString, getPodIp } from './utils';
import { getPrivateFromWallet, getPublicFromWallet } from './wallet';
import { selectRandom } from './rngTool';
import { TestConfig } from './testConfig';

const ec = new ecdsa.ec('secp256k1');

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

  assignValidatorsToTransaction = (validators: Pod[]): void => {
    this.witnessOne = validators[0].address || '';
    this.witnessTwo = validators[1].address || '';
    this.partnerOne = validators[2].address || '';
    this.partnerTwo = validators[3].address || '';
  }

  generateSignature = (): string => {
    // console.log('generateSignature');
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_SIGNATURE_START,
      'silly',
    );
    const key = ec.keyFromPrivate(getPrivateFromWallet(), 'hex');
    const signature = toHexString(key.sign(this.id).toDER());
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_SIGNATURE_END,
      'silly',
    );
    return signature;
  }

  generateHash = (): string => {
    // console.log('generateHash');
    new LogEvent(
      this.from,
      this.to,
      this.id,
      EventType.GENERATE_TRANSACTION_HASH_START,
      'silly',
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
      'silly',
    );
    return hash;
  }

  getValidators(): Pod[] {
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

const numSnapshotNodes = 4;     // Default is 8
const genesisTimestamp: number = 1525278308842;
const genesisAddress: string = `04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a`;
const genesisAmount: number = 500;
const getGenesisAddress = (): string => genesisAddress;

const genesisTransaction = (publicKey: string): Transaction => {
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

const getTransactionId = (transaction: Transaction): string => {
  // console.time('generateTransactionId');
  const { to, from, witnessOne, witnessTwo, partnerOne, partnerTwo, timestamp } = transaction;
  const transactionId = CryptoJS.SHA256(`${witnessOne}${witnessTwo}${partnerOne}${partnerTwo}${to}${from}${timestamp}`).toString();
  // console.timeEnd('generateTransactionId');
  return transactionId;
};

const requestValidateTransaction = (transaction: Transaction, senderLedger: Ledger): void => {
  // console.time('transaction');
  // console.log('[requestValidateTransaction]');
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    EventType.TRANSACTION_START,
    'info',
  );
  // console.log('Starting for loop for sending out validation checks...');
  const localTestConfig = getTestConfig();
  const validators = transaction.getValidators();
  for (let i = 0; i < validators.length; i += 1) {
    const pod = validators[i];
    console.log(`Transaction.local: ${transaction.local}`);
    const podIp = getPodIp(localTestConfig.local, pod);
    // console.time('requestValidation');
    console.log(`Connecting to ${podIp}`);
    new Promise((resolve, reject) => {
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_VALIDATOR_START,
        'info',
        undefined,
        pod.address,
      );
      debug(`Connecting to validator: ${podIp}`);
      // console.time(`connectValidator-${i}-${transaction.id}`);
      const socket = ioClient(podIp, { transports: ['websocket'] });
      socket.on('connect', () => {
        // console.timeEnd(`connectValidator-${i}-${transaction.id}`);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_VALIDATOR_END,
          'info',
          undefined,
          pod.address,
        );
        write(socket, isTransactionValid({ transaction, senderLedger }));
        // console.dir(senderLedger);
        resolve(`[requestValidateTransaction] Connected to ${podIp}... sending transaction details for transaction with id: ${transaction.id}.`);
      });
      socket.on('message', (message: IMessage) => {
        handleMessage(socket, message);
      });
      socket.on('disconnect', () => {
        // console.log('[requestValidateTransaction] socket disconnected.');
      });
      setTimeout(() => { reject(`Connection to ${podIp} could not be made in 10 seconds.`); }, 10000);
    }).then((fulfilled) => {
      console.log(fulfilled);
    }, (rejected) => {
      console.log(rejected);
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
    'info',
  );
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
    // console.dir(pod);
    const promise: Promise<Result> = new Promise((resolve, reject) => {
      if (pod.address === getPublicFromWallet()) {
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START,
          'info',
          undefined,
          pod.address,
        );
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END,
          'info',
          undefined,
          pod.address,
        );
        // console.log(`This node was a validator for this transaction. Checking hash against witness ledger entry...`);
        // console.time(`connectPreviousValidator-${k}-${entry.id}`);
        // console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);
        const result = validateTransactionHash(entry.id, transaction.id, entry.hash);
        resolve(result);
      } else {
        const podIp = getPodIp(localTestConfig.local, pod);
        // console.log(`Connecting to ${podIp}`);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START,
          'info',
          undefined,
          pod.address,
        );
        // console.time(`connectPreviousValidator-${k}-${entry.id}`);
        const socket = ioClient(podIp, { transports: ['websocket'] });
        const connectTimeout = setTimeout(() => {
          const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
          const result = new Result(false, reason, entry.id);
          reject(result);
        }, 10000);
        const isTransactionHashValidMsg = isTransactionHashValid({ transactionId: entry.id, currentTransactionId: transaction.id, hash: entry.hash });
        socket.on('connect', () => {
          // console.timeEnd(`connectPreviousValidator-${k}-${entry.id}`);
          // console.log(`[validateLedger] Connected to ${podIp}... sending transaction details.`);
          clearTimeout(connectTimeout);
          new LogEvent(
            transaction.from,
            transaction.to,
            transaction.id,
            EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END,
            'info',
            undefined,
            pod.address,
          );
          write(socket, isTransactionHashValidMsg);
        });
        socket.on('disconnect', () => {
          // console.log('Socket was disconnected.');
        });
        socket.on('message', (message: IMessage) => {
          // console.log('[validateLedger] handleMessage');
          if (message.type === MessageType.TRANSACTION_CONFIRMATION_RESULT) {
            const result: Result = JSON.parse(message.data);
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
      'info',
    );
    return validationResult;
  });
};

const validateTransaction = (transaction: Transaction, senderLedger: Ledger,
  callback: (results: (Result | Ledger | ISnapshotResponse)[], transaction: Transaction) => void): void => {
  // console.log(`[validateTransaction] transactionId: ${transaction.id}`);

  if (transaction.from == genesisAddress) {
    info(`Genesis transaction`);
    return callback([new Result(true, '', transaction.id)], transaction);
  }
  const validationPromiseArray: Promise<Result | Ledger | ISnapshotResponse>[] = [];
  const partnerPods = getPods().filter(pod => pod.podType === PodType.PARTNER_POD);
  const snapshotNodes = selectRandom(partnerPods, numSnapshotNodes);
  const senderSnapshotNodes = snapshotNodes.slice(0, numSnapshotNodes / 2);
  const receiverSnapshotNodes = snapshotNodes.slice(numSnapshotNodes / 2, numSnapshotNodes);
  const expectedTransactionId: string = getTransactionId(transaction);
  // const requestReceiverLedgerPromise: Promise<Ledger> = requestReceiverLedger(transaction);
  let result = new Result(false, '', transaction.id);
  // console.log(`[validateTransaction] resultId: ${result.id}`);
  if (expectedTransactionId !== transaction.id) {
    result.reason = `TransactionId is invalid.
     Expecting: ${expectedTransactionId}. Got: ${transaction.id}.`;
    // console.dir(transaction);
    // console.log(result.reason);
    callback([result], transaction);
  } else {
    result = validateSignature(transaction); // Check if sender has proper access to funds
    if (!result.res) {
      // console.log(result.reason);
      callback([result], transaction);
    }
    const requestReceiverLedgerPromise: Promise<Ledger> = requestReceiverLedger(transaction);
    validationPromiseArray.push(requestReceiverLedgerPromise);
    for (let i = 0; i < senderSnapshotNodes.length; i += 1) {
      const snapshotNode = senderSnapshotNodes[i];
      const snapshotValidationPromise: Promise<Result | ISnapshotResponse> = requestSnapshot(snapshotNode, transaction.from, transaction);
      validationPromiseArray.push(snapshotValidationPromise);
    }
    for (let i = 0; i < receiverSnapshotNodes.length; i += 1) {
      const snapshotNode = receiverSnapshotNodes[i];
      // CHANGE TO RECEIVER LEDGER SNAPSHOT WHEN IMPLEMENTED
      const snapshotValidationPromise: Promise<Result | ISnapshotResponse> = requestSnapshot(snapshotNode, transaction.to, transaction);
      validationPromiseArray.push(snapshotValidationPromise);
    }
    // console.log('Signature was valid... validating ledger.');
    const validateLedgerPromise: Promise<Result> = validateLedger(senderLedger, transaction);
    validationPromiseArray.push(validateLedgerPromise);

    Promise.all(validationPromiseArray).then((results) => {
      callback(results, transaction);
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
    'silly',
  );
  const key = ec.keyFromPublic(from, 'hex');
  // console.log(`keyFromPublic: ${key}`);
  const res = key.verify(id, signature);
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    EventType.VALIDATE_SIGNATURE_END,
    'silly',
  );
  const reason = 'Transaction signature is invalid.';
  // console.log(`[validateSignature] resultId: ${res.id}`);
  return new Result(res, reason, id);
};

const validateTransactionHash = (id: string, currentId: string, hash: string): Result => {
  const transaction: Transaction = getEntryByTransactionId(id, currentId, 1);
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
  return new Promise((resolve, reject) => {
    const localTestConfig = getTestConfig();
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.CONNECT_TO_SNAPSHOT_NODE_START,
      'info',
      undefined,
      pod.address,
    );
    const podIp = getPodIp(localTestConfig.local, pod);
    const socket = ioClient(podIp, { transports: ['websocket'] });
    const connectTimeout = setTimeout(() => {
      const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
      const result = new Result(false, reason, transaction.id);
      reject(result);
    }, 10000);
    const msg = requestSnapshotMsg({ snapshotOwner, transactionId: transaction.id });
    socket.on('connect', () => {
      clearTimeout(connectTimeout);
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_SNAPSHOT_NODE_END,
        'info',
        undefined,
        pod.address,
      );
      write(socket, msg);
    });
    socket.on('message', (message: IMessage) => {
      if (message.type === MessageType.SNAPSHOT_RESULT) {
        const data = JSON.parse(message.data);
        socket.disconnect();
        resolve(data);
      }
    });
  });
};

const requestReceiverLedger = (transaction: Transaction): Promise<Ledger> => {
  const pods = getPods();
  const localTestConfig = getTestConfig();
  const pod = pods[getPodIndexByPublicKey(transaction.to, pods)];
  return new Promise((resolve, reject) => {
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.CONNECT_TO_RECEIVER_START,
      'info',
      undefined,
      pod.address,
    );
    const podIp = getPodIp(localTestConfig.local, pod);
    const socket = ioClient(podIp, { transports: ['websocket'] });
    const connectTimeout = setTimeout(() => {
      const reason = `Connection to ${podIp} could not be made in 10 seconds.`;
      const result = new Result(false, reason, transaction.id);
      reject(result);
    }, 10000);
    const msg = requestLedgerMsg({ transactionId: transaction.id, ledgerType: LedgerType.MY_LEDGER });
    socket.on('connect', () => {
      clearTimeout(connectTimeout);
      new LogEvent(
        transaction.from,
        transaction.to,
        transaction.id,
        EventType.CONNECT_TO_RECEIVER_END,
        'info',
        undefined,
        pod.address,
      );
      write(socket, msg);
    });
    socket.on('message', (message: IMessage) => {
      if (message.type === MessageType.LEDGER_RESULT) {
        const data = JSON.parse(message.data);
        socket.disconnect();
        resolve(data.ledger);
      }
    });
  });
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
