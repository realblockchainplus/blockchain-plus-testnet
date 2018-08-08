import * as http from 'http';
import * as minimist from 'minimist';
import { AddressInfo } from 'net';
import * as socketIo from 'socket.io';

import { getLedger, getLocalLedger, initLedger, Ledger, LedgerType, updateLedger } from './ledger';
import { EventType, LogEvent } from './logEvent';
import { debug, err, info, warning } from './logger';
import {
  IMessage,
  isTransactionHashValid,
  killMsg,
  MessageType,
  podListUpdated,
  responseIdentityMsg,
  responseIsTransactionHashValid,
  responseIsTransactionValid,
  responseLedgerMsg,
  responseSnapshotMsg,
  snapshotMapUpdated,
  wipeLedgersMsg,
} from './message';
import { Pod } from './pod';
import { Result } from './result';
import { TestConfig } from './testConfig';
import {
  ActorRoles,
  getGenesisAddress,
  ISnapshotMap,
  ISnapshotResponse,
  requestValidateTransaction,
  Transaction,
  validateTransaction,
  validateTransactionHash,
} from './transaction';
import {
  createDummyTransaction,
  generateLedgerSnapshot,
  getCurrentTimestamp,
  getPodIndexByPublicKey,
  getPodIndexBySocket,
  getPodIp,
} from './utils';
import { fundWallet, getPublicFromWallet } from './wallet';
import { IPodMap, getClientSocket } from './podMap';

const config = require('../node/config/config.json');

type ClientSocket = SocketIOClient.Socket;
type ServerSocket = socketIo.Socket;
type Server = socketIo.Server;

let pods: Pod[] = [];
let localSelectedPods: Pod[] = [];

const argv = minimist(process.argv.slice(2));
const type = parseInt(argv.t, 10);
const isSeed = argv.s === 'true';

let io: Server;
let gServer: http.Server;
let port: number;
let localSocket: ClientSocket;
let localLogger: ClientSocket;
let localSnapshotMap: ISnapshotMap;
let startTime: number;
let endTime: number;
let selectedReceiver: Pod;
let localPodMap: IPodMap = {};

let localTestConfig = new TestConfig(60, 2, true, false, 'TEMP');

const validationResults: { [txId: string]: IValidationResult[] } = {};

interface IValidationResult {
  message: IMessage;
}

const getPods = (): Pod[] => pods;
const getIo = (): Server => io;
const getServer = (): http.Server => gServer;
const getLogger = (): ClientSocket => localLogger;
const getTestConfig = (): TestConfig => localTestConfig;
const getSelectedPods = (): Pod[] => localSelectedPods;
const getSnapshotMap = (): ISnapshotMap => localSnapshotMap;
const getPort = (): number => port;
const getPodMap = (): IPodMap => localPodMap;

const beginTest = (receiver: Pod): void => {
  debug('beginTest');
  selectedReceiver = receiver;
  startTime = getCurrentTimestamp();
  endTime = startTime + localTestConfig.duration;

  new LogEvent(
    '',
    '',
    '',
    EventType.TEST_START,
    'info',
    undefined,
    undefined,
    localTestConfig,
  );

  fundWallet();
};

const loopTest = (): void => {
  debug(`End time of test: ${endTime}, Current time: ${getCurrentTimestamp()}`);
  if (endTime > getCurrentTimestamp()) {
    const transaction = new Transaction(
      getPublicFromWallet(),
      selectedReceiver.address,
      1,
      getCurrentTimestamp(),
      localSelectedPods,
      localTestConfig,
    );

    requestValidateTransaction(transaction, getLocalLedger(LedgerType.MY_LEDGER));
  }
  else {
    debug('Time is up!');
  }
};

const closeConnection = (socket: ServerSocket): void => {
  const pod = pods[getPodIndexBySocket(socket, pods)];
  pods.splice(pods.indexOf(pod), 1);
  const numRegular = pods.filter(pod => pod.podType === 0).length;
  const numPartner = pods.filter(pod => pod.podType === 1).length;
  console.log(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`); // temporary. zeit doesnt show debug messages
  // info(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`);
  io.emit('message', podListUpdated(pods));
};

const handleMessageAsServer = (socket: ServerSocket, message: IMessage): void => {
  try {
    if (message === null) {
      warning('could not parse received JSON message: ' + message);
      return;
    }
    const { type, data }: { type: number, data: any } = message;
    // debug('Received message: %s', JSON.stringify(message));
    switch (type) {
      case MessageType.RESPONSE_IDENTITY: {
        info('Received Pod Identity');
        const pod: Pod = JSON.parse(data);
        if (getPodIndexByPublicKey(pod.address, pods) === -1) {
          debug(`Local IP of connecting node: ${pod.localIp}`);
          // @ts-ignore
          pod.ip = socket['handshake'].headers['x-real-ip'];
          pods.push(pod);
          if (isSeed) {
            const numRegular = pods.filter(_pod => _pod.podType === 0).length;
            const numPartner = pods.filter(_pod => _pod.podType === 1).length;
            console.log(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`); // temporary
            // info(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`);
            io.emit('message', podListUpdated(pods));
          }
        }
        else {
          info('Pod already exists in Pods, do nothing.');
        }
        break;
      }
      case MessageType.SELECTED_FOR_VALIDATION: {
        info('Selected for validation. Validating...');
        const { transaction, senderLedger }:
          { transaction: Transaction, senderLedger: Ledger } = JSON.parse(data);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.REQUEST_VALIDATION_START,
          'info',
        );
        validateTransaction(transaction, senderLedger, (responses: (Result | Ledger | ISnapshotResponse)[]) => {
          const _tx = createDummyTransaction();
          Object.assign(_tx, transaction);

          let validationResult = true;
          info(`[validateTransaction] Responses: ${JSON.stringify(responses)}`);
          const results = responses.filter(response => response instanceof Result) as Result[];
          const snapshots = responses.filter(response => response.hasOwnProperty('snapshotOwner')) as ISnapshotResponse[];
          let receiverLedger = {} as Ledger;
          responses.map(response => response instanceof Ledger ? receiverLedger = response : null);
          results.map(_result => _result.res === false ? validationResult = false : null);
          const existingSenderSnapshot = generateLedgerSnapshot(senderLedger);
          const existingReceiverSnapshot = generateLedgerSnapshot(receiverLedger);
          snapshots.map((_snapshot) => {
            if (_snapshot.ownerRole === ActorRoles.SENDER) {
              _snapshot.snapshot === existingSenderSnapshot ? validationResult = false : null;
            }
            if (_snapshot.ownerRole === ActorRoles.RECEIVER) {
              _snapshot.snapshot === existingReceiverSnapshot ? validationResult = false : null;
            }
          });
          if (validationResult) {
            _tx.generateHash();
            updateLedger(_tx, 1);
            senderLedger.entries.push(transaction);
            const newSenderSnapshot = generateLedgerSnapshot(senderLedger);
            const newReceiverSnapshot = generateLedgerSnapshot(receiverLedger);
            const senderMapLocation = localSnapshotMap[transaction.from];
            const receiverMapLocation = localSnapshotMap[transaction.to];
            senderMapLocation.snapshots.push(newSenderSnapshot);
            receiverMapLocation.snapshots.push(newReceiverSnapshot);
            const targets = [...senderMapLocation.snapshotNodes, ...receiverMapLocation.snapshotNodes];
            transaction.from != getGenesisAddress() ? targets.push(transaction.from) : null;
            targets.push(transaction.to);
            info('Sending out updated snapshot.');
            for (let i = 0; i < targets.length; i += 1) {
              const target = targets[i];
              const pod = pods[getPodIndexByPublicKey(target, pods)];
              const podIp = getPodIp(localTestConfig.local, pod);
              const snapshotSocket = getClientSocket(localPodMap, podIp);
              snapshotSocket.on('connect', () => {
                write(snapshotSocket, snapshotMapUpdated(localSnapshotMap));
              });
            }
          }
          info('Sending out validation result.');
          new LogEvent(
            transaction.from,
            transaction.to,
            transaction.id,
            EventType.REQUEST_VALIDATION_END,
            'info',
          );
          console.log(io.clients);
          socket.emit('message', responseIsTransactionValid(results, _tx));
        });
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_REQUEST: {
        const { transactionId, currentTransactionId, hash }:
          { transactionId: string, currentTransactionId: string, hash: string } = JSON.parse(data);
        // console.log(`Selected to confirm a transaction hash for transaction with id: ${transactionId}.`);
        const result = validateTransactionHash(transactionId, currentTransactionId, hash);
        socket.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.SNAPSHOT_REQUEST: {
        const { snapshotOwner, transactionId }: { snapshotOwner: string, transactionId: string } = JSON.parse(data);
        const senderSnapshots = localSnapshotMap[snapshotOwner].snapshots;
        const lastSnapshot = senderSnapshots[senderSnapshots.length - 1] || '';
        socket.emit('message', responseSnapshotMsg({ snapshotOwner, transactionId, snapshot: lastSnapshot }));
        break;
      }
      case MessageType.LEDGER_REQUEST: {
        const { transactionId, ledgerType }: { transactionId: string, ledgerType: LedgerType } = JSON.parse(data);
        const ledger = getLedger(ledgerType);
        socket.emit('message', responseLedgerMsg({ transactionId, ledger }));
        break;
      }
    }
  } catch (e) {
    // console.log(e);
  }
};

const handleMessageAsClient = (message: IMessage): void => {
  try {
    if (message === null) {
      warning('could not parse received JSON message: ' + message);
      return;
    }
    const { type, data }: { type: number, data: any } = message;
    switch (type) {
      case MessageType.VALIDATION_RESULT: {
        debug(JSON.stringify(data));
        const { transaction }: { transaction: Transaction } = JSON.parse(data);
        if (!validationResults.hasOwnProperty(transaction.id)) {
          validationResults[transaction.id] = [];
        }
        const publicKey = getPublicFromWallet();
        if (transaction.from === publicKey || transaction.to === publicKey) {
          validationResults[transaction.id].push({ message });
        }
        else {
          err('Node received validation result meant for another node.');
        }
        if (Object.keys(validationResults[transaction.id]).length === 4) {
          handleValidationResults(transaction.id);
        }
        break;
      }
      case MessageType.POD_LIST_UPDATED: {
        // console.log('Pod list updated...');
        const _data = JSON.parse(data);
        if (_data.length === undefined) {
          // console.log(`Pod list received was undefined. Ignoring. TEMPORARY, TRACK DOWN message SOURCE.`);
          break;
        }
        pods = _data;
        // console.log(`Number of pods: ${pods.length}`);
        break;
      }
      case MessageType.TEST_CONFIG: {
        info('Received test config');
        const data = JSON.parse(message.data);
        const { testConfig, snapshotMap, selectedPods }: { testConfig: TestConfig, snapshotMap: ISnapshotMap, selectedPods: Pod[] } = data;
        localSnapshotMap = snapshotMap;
        localTestConfig = testConfig;
        // info(`Local test config: ${JSON.stringify(localTestConfig)}`);
        // info(`Received test config: ${JSON.stringify(testConfig)}`);
        let isSelected = false;
        let index = 0;
        localSelectedPods = selectedPods;
        debug(`Selected Pods: ${JSON.stringify(selectedPods)}`);
        // console.dir(selectedPods);
        for (let i = 0; i < selectedPods.length / 2; i += 1) {
          const pod = selectedPods[i];
          if (pod) {
            if (pod.address === getPublicFromWallet()) {
              isSelected = true;
              index = i;
              break;
            }
          }
        }
        if (isSelected) {
          // console.log('Selected as a sender. Starting test...');
          beginTest(selectedPods[index + selectedPods.length / 2]);
        }
        break;
      }
      case MessageType.SNAPSHOT_MAP_UPDATED: {
        const snapshotMap: ISnapshotMap = JSON.parse(data);
        // info(`Received new snapshotmap: ${JSON.stringify(snapshotMap)}`);
        localSnapshotMap = snapshotMap;
        break;
      }
      case MessageType.WIPE_LEDGER: {
        initLedger(port);
        break;
      }
      case MessageType.KILL_SERVER_PROCESS: {
        // console.log('Kill command received, killing process');
        gServer.close();
        localSocket.close();
        io.close();
        process.exit();
        break;
      }
    }
  } catch (e) {
  }
}

const handleNewConnection = (socket: ServerSocket): void => {
  // console.log('New connection, emitting [identity]');
  if (isSeed) {
    socket.emit('identity');
  }
  socket.on('message', (message: IMessage) => {
    // console.log('[handleNewConnection] handleMessage');
    handleMessageAsServer(socket, message);
  });
  if (isSeed) {
    socket.on('disconnect', () => closeConnection(socket));
    socket.on('error', () => closeConnection(socket));
  }
};

const handleValidationResults = (transactionId: string): void => {
  let isValid = true;
  const _validationResults = validationResults[transactionId];
  for (let i = 0; i < _validationResults.length; i += 1) {
    const validationResult = _validationResults[i];
    const { message } = validationResult;
    const { results }:
      { results: Result[] } = JSON.parse(message.data);
    results.map((result) => {
      if (result.res) {
        // console.log(`Validation Result returned ${result.res}`);
      }
      else {
        isValid = false;
        console.log(`Validation Result returned ${result.res}`);
        console.log(`Reason: ${result.reason}`);
      }
    });
  }
  if (isValid) {
    const transaction: Transaction = JSON.parse(_validationResults[0].message.data).transaction;
    const _tx = createDummyTransaction();
    Object.assign(_tx, transaction);
    if (_tx) {
      // console.log(`Transaction From: ${_tx.from}. My Public Key: ${getPublicFromWallet()}`);
      if (_tx.from === getPublicFromWallet() || _tx.to === getPublicFromWallet()) {
        // console.log('Transaction Hash generated');
        _tx.generateHash();
        // console.log('Writing to ledger...');
        updateLedger(_tx, 0);
      }
    }
  }
};

const initP2PNode = (server: http.Server): void => {
  // console.log('initP2PNode');
  gServer = server;
  port = (server.address() as AddressInfo).port;
  if (isSeed) {
    // console.log('Process is a seed server, node will not be created.');
    return;
  }
  const pod = new Pod(type, port);
  const socket: ClientSocket = getClientSocket(localPodMap, config.seedServerIp);
  localSocket = socket;
  socket.on('connect', () => {
    localPodMap[config.seedServerIp] = socket;
    pod.socketId = socket.id;
    const message = responseIdentityMsg(pod);
    // console.dir(message.data);
    socket.on('identity', () => {
      // console.log('Received [identity]');
      write(socket, message);
    });
    socket.on('message', (msg: IMessage) => {
      // console.log(`Received message: ${msg.type}`);
      handleMessageAsClient(msg);
    });
    socket.on('disconnect', () => {
      // console.log('[initP2PNode] socket disconnected');
    });
  });
};

const initP2PServer = (server: http.Server): any => {
  // console.log('initP2PServer');
  io = socketIo({ wsEngine: 'ws' });
  io.listen(server);
  io.on('connection', (socket: ServerSocket) => {
    // console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  if (isSeed) {
    // console.log('connecting to logger');
    // localLogger = ioClient(config.loggerServerIp);
    // console.log('after connecting to logger');
    io.on('disconnect', (socket: ServerSocket) => {
      closeConnection(socket);
    });
  }
};

const write = (socket: ClientSocket, message: IMessage): void => {
  if (socket) {
    socket.emit('message', message);
  }
};

const killAll = (): void => {
  io.emit('message', killMsg());
};

const wipeLedgers = (): void => {
  io.emit('message', wipeLedgersMsg());
};

export {
  beginTest, loopTest, initP2PServer, initP2PNode, getPods, getIo, getServer, getTestConfig, write, handleMessageAsClient, IMessage,
  killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType, getLogger, wipeLedgers, getSelectedPods, ClientSocket,
  ServerSocket, Server, getPort, getSnapshotMap, getPodMap,
};
