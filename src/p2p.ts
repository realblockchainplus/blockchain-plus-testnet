import * as http from 'http';
import * as minimist from 'minimist';
import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';

import { getLocalLedger, Ledger, LedgerType, updateLedger, initLedger } from './ledger';
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
} from './message';
import { Pod } from './pod';
import { TestConfig } from './testConfig';
import {
  Result,
  requestValidateTransaction,
  Transaction,
  validateTransaction,
  validateTransactionHash,
} from './transaction';
import { getCurrentTimestamp, getPodIndexBySocket, getPodIndexByPublicKey } from './utils';
import { getPublicFromWallet } from './wallet';
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
let startTime: number;
let endTime: number;
let selectedReceiver: Pod;

let localTestConfig = new TestConfig(60, 2, true, 1, false);

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
const getPort = (): number => port;

const beginTest = (receiver: Pod): void => {
  selectedReceiver = receiver;
  // const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
  // regularPods.filter(pod => !selectedPods.includes(pod));
  // randomReceiver = regularPods[randomNumberFromRange(0, regularPods.length, true)];
  startTime = getCurrentTimestamp();
  endTime = startTime + localTestConfig.duration;

  const transaction = new Transaction(
    getPublicFromWallet(),
    selectedReceiver.address,
    1,
    getCurrentTimestamp(),
    localSelectedPods,
    localTestConfig,
  );

  new LogEvent(
    transaction.from,
    transaction.to,
    '',
    EventType.TEST_START,
    'info',
    undefined,
    undefined,
    localTestConfig,
  );
  requestValidateTransaction(transaction, getLocalLedger(LedgerType.MY_LEDGER));
};

const loopTest = (): void => {
  // console.log(endTime, getCurrentTimestamp());
  if (endTime > getCurrentTimestamp()) {
    const transaction = new Transaction(
      getPublicFromWallet(),
      selectedReceiver.address,
      1,
      getCurrentTimestamp(),
    );

    requestValidateTransaction(transaction, getLocalLedger(LedgerType.MY_LEDGER));
  }
  else {
    // console.log(endTime, getCurrentTimestamp());
    // console.log('Time is up!');
  }
};

const closeConnection = (socket: ServerSocket): void => {
  const pod = pods[getPodIndexBySocket(socket, pods)!];
  // console.log(`Connection failed to peer: ${pod.name} / ${pod.address}`);
  pods.splice(pods.indexOf(pod), 1);
  if (isSeed) {
    const numRegular = pods.filter(pod => pod.type === 0).length;
    const numPartner = pods.filter(pod => pod.type === 1).length;
    console.log(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`);
    io.emit('message', podListUpdated(pods));
  }
};

const handleMessage = (socket: ClientSocket | ServerSocket, message: IMessage): void => {
  try {
    if (message === null) {
      // console.log('could not parse received JSON message: ' + message);
      return;
    }
    const { type, data }: { type: number, data: any } = message;
    // console.log('Received message: %s', JSON.stringify(message));
    switch (type) {
      case MessageType.RESPONSE_IDENTITY: {
        console.log('Received Pod Identity');
        console.dir(data);
        const pod: Pod = JSON.parse(data);
        console.dir(pod);
        if (getPodIndexByPublicKey(pod.address, pods) === -1) {
          console.log(`Local IP of connecting node: ${pod.localIp}`);
          // @ts-ignore
          pod.ip = socket['handshake'].headers['x-real-ip'];
          // console.log((<ServerSocket>socket).handshake.address);
          console.log(`old ip: ${pod.ip}`);
          pods.push(pod);
          if (isSeed) {
            const numRegular = pods.filter(_pod => _pod.type === 0).length;
            const numPartner = pods.filter(_pod => _pod.type === 1).length;
            console.log(`Pod Breakdown: [Regular: ${numRegular}, Partner: ${numPartner}, Total: ${numRegular + numPartner}]`);
            io.emit('message', podListUpdated(pods));
          }
        }
        else {
          console.log(getPodIndexByPublicKey(data.address, pods));
          console.log('Pod already exists in Pods, do nothing.');
        }
        break;
      }
      case MessageType.SELECTED_FOR_VALIDATION: {
        // console.log('Selected for validation. Validating...');
        const { transaction, senderLedger }:
          { transaction: Transaction, senderLedger: Ledger } = JSON.parse(data);
        new LogEvent(
          transaction.from,
          transaction.to,
          transaction.id,
          EventType.REQUEST_VALIDATION_START,
          'info',
        );
        validateTransaction(transaction, senderLedger, (res: Result) => {
          const tx = new Transaction(
            transaction.from,
            transaction.to,
            transaction.amount,
            transaction.timestamp,
          );
          const _tx = Object.assign(tx, transaction);

          if (res.res) {
            _tx.generateHash();
            updateLedger(_tx, 1);
          }
          // console.log('Sending out validation result.');
          // io.clients((err, clients) => { // console.dir(clients); });
          // console.log(res.id);
          // console.log(_tx.id);
          new LogEvent(
            transaction.from,
            transaction.to,
            transaction.id,
            EventType.REQUEST_VALIDATION_END,
            'info',
          );
          io.emit('message', responseIsTransactionValid(res, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        const { transaction }: { transaction: Transaction } = JSON.parse(data);
        // console.log(result.id);
        // console.log(transaction.id);
        if (!validationResults.hasOwnProperty(transaction.id)) {
          validationResults[transaction.id] = [];
        }
        if (transaction.from === getPublicFromWallet()) {
          validationResults[transaction.id].push({ socket, message });
        }
        else {
          // console.log('why');
        }
        if (Object.keys(validationResults[transaction.id]).length === 4) {
          handleValidationResults(transaction.id);
        }
        break;
      }
      case MessageType.POD_LIST_UPDATED: {
        console.log('Pod list updated...');
        const _data = JSON.parse(data);
        if (_data.length === undefined) {
          // console.log(`Pod list received was undefined. Ignoring. TEMPORARY, TRACK DOWN message SOURCE.`);
          break;
        }
        pods = _data;
        console.log(`Number of pods: ${pods.length}`);
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
        const { transactionId, hash }:
          { transactionId: string, hash: string } = JSON.parse(data);
        console.log(`Selected to confirm a transaction hash for transaction with id: ${transactionId}.`);
        const result = validateTransactionHash(transactionId, hash);
        io.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_RESULT: {
        // See validateLedger
        break;
      }
      case MessageType.TEST_CONFIG: {
        const data = JSON.parse(message.data);
        const { testConfig, selectedPods }: { testConfig: TestConfig, selectedPods: Pod[] } = data;
        localTestConfig = testConfig;
        // console.dir(localTestConfig);
        // console.dir(testConfig);
        let isSelected = false;
        let index = 0;
        localSelectedPods = selectedPods;
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
          beginTest(selectedPods[index + selectedPods.length / 2]);
        }
        break;
      }
      case MessageType.WIPE_LEDGER: {
        // console.log(gServer.address().port);
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
    console.log('[handleNewConnection] handleMessage');
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
    const { result }:
      { result: Result } = JSON.parse(message.data);
    if (result.res) {
      // console.log(`Validation Result returned ${result.res}`);
    }
    else {
      isValid = false;
      // console.log(`Validation Result returned ${result.res}`);
      // console.log(`Reason: ${result.reason}`);
    }
    socket.disconnect();
  }
  if (isValid) {
    const transaction: Transaction = JSON.parse(_validationResults[0].message.data).transaction;
    const tx = new Transaction(
      transaction.from,
      transaction.to,
      transaction.amount,
      transaction.timestamp,
    );
    const _tx = Object.assign(tx, transaction);
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
  console.log('initP2PNode');
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
    const message = responseIdentityMsg(pod);
    console.dir(message.data);
    socket.on('identity', () => {
      console.log('Received [identity]');
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
  console.log('initP2PServer');
  io = socketIo({ wsEngine: 'ws' });
  io.listen(server);
  io.on('connection', (socket: ServerSocket) => {
    // console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  if (isSeed) {
    console.log('connecting to logger');
    localLogger = ioClient(config.loggerServerIp);
    console.log('after connecting to logger');
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
  ServerSocket, Server, getPort,
};
