import * as http from 'http';
import * as minimist from 'minimist';
import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';

import { getLocalLedger, Ledger, LedgerType, updateLedger, initLedger, getLedger } from './ledger';
import { err, warning, info, debug } from './logger';
import { EventType, LogEvent } from './logEvent';
import {
  isTransactionHashValid,
  killMsg,
  IMessage,
  MessageType,
  podListUpdated,
  responseIsTransactionHashValid,
  responseIsTransactionValid,
  wipeLedgersMsg,
  responseIdentityMsg,
  responseSnapshotMsg,
  snapshotMapUpdated,
  responseLedgerMsg,
} from './message';
import { Pod } from './pod';
import { Result } from './result';
import { TestConfig } from './testConfig';
import {
  requestValidateTransaction,
  Transaction,
  validateTransaction,
  validateTransactionHash,
  ISnapshotMap,
  getGenesisAddress,
  ISnapshotResponse,
  ActorRoles,
} from './transaction';
import { getCurrentTimestamp, getPodIndexBySocket, getPodIndexByPublicKey, createDummyTransaction, generateLedgerSnapshot } from './utils';
import { getPublicFromWallet, fundWallet } from './wallet';
import { AddressInfo } from 'net';

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

let localTestConfig = new TestConfig(60, 2, true, false, 'TEMP');

const validationResults: { [txId: string]: IValidationResult[] } = {};

interface IValidationResult {
  socket: ClientSocket | ServerSocket;
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
  // info(`Connection failed to peer: ${pod.address}`);
  pods.splice(pods.indexOf(pod), 1);
  if (isSeed) {
    const numRegular = pods.filter(pod => pod.podType === 0).length;
    const numPartner = pods.filter(pod => pod.podType === 1).length;
    console.log(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`); // temporary. zeit doesnt show debug messages
    // info(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`);
    io.emit('message', podListUpdated(pods));
  }
};

const handleMessage = (socket: ClientSocket | ServerSocket, message: IMessage): void => {
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
              const podIp = localTestConfig.local ? `http://${pod.localIp}:${pod.port}` : `https://${pod.ip}`;
              const socket = ioClient(podIp, { transports: ['websocket'] });
              socket.on('connect', () => {
                write(socket, snapshotMapUpdated(localSnapshotMap));
                socket.disconnect();
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
          io.emit('message', responseIsTransactionValid(results, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        debug(JSON.stringify(data));
        const { transaction }: { transaction: Transaction } = JSON.parse(data);
        if (!validationResults.hasOwnProperty(transaction.id)) {
          validationResults[transaction.id] = [];
        }
        const publicKey = getPublicFromWallet();
        if (transaction.from === publicKey || transaction.to === publicKey) {
          validationResults[transaction.id].push({ socket, message });
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
      case MessageType.KILL_SERVER_PROCESS: {
        // console.log('Kill command received, killing process');
        gServer.close();
        localSocket.close();
        io.close();
        process.exit();
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_REQUEST: {
        const { transactionId, currentTransactionId, hash }:
          { transactionId: string, currentTransactionId: string, hash: string } = JSON.parse(data);
        // console.log(`Selected to confirm a transaction hash for transaction with id: ${transactionId}.`);
        const result = validateTransactionHash(transactionId, currentTransactionId, hash);
        io.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.SNAPSHOT_REQUEST: {
        const { snapshotOwner, transactionId }: { snapshotOwner: string, transactionId: string } = JSON.parse(data);
        const senderSnapshots = localSnapshotMap[snapshotOwner].snapshots;
        const lastSnapshot = senderSnapshots[senderSnapshots.length - 1] || '';
        io.emit('message', responseSnapshotMsg({ snapshotOwner, transactionId, snapshot: lastSnapshot }));
        break;
      }
      case MessageType.LEDGER_REQUEST: {
        const { transactionId, ledgerType }: { transactionId: string, ledgerType: LedgerType } = JSON.parse(data);
        const ledger = getLedger(ledgerType);
        io.emit('message', responseLedgerMsg({ transactionId, ledger }));
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
    }
  } catch (e) {
    // console.log(e);
  }
};

const handleNewConnection = (socket: ServerSocket): void => {
  // console.log('New connection, emitting [identity]');
  if (isSeed) {
    socket.emit('identity');
  }
  socket.on('message', (message: IMessage) => {
    // console.log('[handleNewConnection] handleMessage');
    handleMessage(socket, message);
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
    const { socket, message } = validationResult;
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
      socket.disconnect();
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
  const socket: ClientSocket = ioClient(config.seedServerIp);
  const logger: ClientSocket = ioClient(config.loggerServerIp);
  localSocket = socket;
  localLogger = logger;
  socket.on('connect', () => {
    pod.socketId = socket.id;
    const message = responseIdentityMsg(pod);
    // console.dir(message.data);
    socket.on('identity', () => {
      // console.log('Received [identity]');
      write(socket, message);
    });
    socket.on('message', (msg: IMessage) => {
      // console.log(`Received message: ${msg.type}`);
      handleMessage(socket, msg);
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
  beginTest, loopTest, initP2PServer, initP2PNode, getPods, getIo, getServer, getTestConfig, write, handleMessage, IMessage,
  killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType, getLogger, wipeLedgers, getSelectedPods, ClientSocket,
  ServerSocket, Server, getPort, getSnapshotMap,
};
