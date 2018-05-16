import * as http from 'http';
import * as minimist from 'minimist';
import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';

import { getLedger, Ledger, LedgerType, updateLedger } from './ledger';
import { createLogEvent, EventType, LogEvent } from './logEntry';
import {
  isTransactionHashValid,
  killMsg,
  Message,
  MessageType,
  podListUpdated,
  responseIsTransactionHashValid,
  responseIsTransactionValid,
} from './message';
import { createPod, Pod } from './pod';
import { TestConfig } from './testConfig';
import {
  IResult,
  requestValidateTransaction,
  Transaction,
  validateTransaction,
  validateTransactionHash,
} from './transaction';
import { getCurrentTimestamp, randomNumberFromRange } from './utils';
import { getPublicFromWallet } from './wallet';

type Socket = SocketIOClient.Socket;
type Server = socketIo.Server;

let pods: Pod[] = [];

const argv = minimist(process.argv.slice(2));
const type = parseInt(argv.t, 10);
const isSeed = argv.s === 'true';

let io;
let gServer;
let localSocket;
let localLogger;
let startTime;
let endTime;
let randomReceiver;

let localTestConfig = new TestConfig(60, 2, true, 1);

const validationResults: { [txId: string]: IValidationResult[] } = {};

interface IValidationResult {
  socket: Socket;
  message: Message;
}

const getPods = (): Pod[] => pods;
const getIo = (): Server => io;
const getServer = (): http.Server => gServer;
const getLogger = (): Socket => localLogger;
const getTestConfig = (): TestConfig => localTestConfig;

const beginTest = (selectedPods: Pod[]): void => {
  const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
  regularPods.filter(pod => !selectedPods.includes(pod));
  randomReceiver = regularPods[randomNumberFromRange(0, regularPods.length, true)];
  startTime = getCurrentTimestamp();
  endTime = startTime + localTestConfig.duration;

  const transaction = new Transaction(
    getPublicFromWallet(),
    randomReceiver.address,
    1,
    getCurrentTimestamp(),
  );

  requestValidateTransaction(transaction, getLedger(LedgerType.MY_LEDGER));
};

const loopTest = (): void => {
  // console.log(endTime, getCurrentTimestamp());
  if (endTime < getCurrentTimestamp()) {
    const transaction = new Transaction(
      getPublicFromWallet(),
      randomReceiver.address,
      1,
      getCurrentTimestamp(),
    );

    requestValidateTransaction(transaction, getLedger(LedgerType.MY_LEDGER));
  }
  else { 
    // console.log('Time is up!') 
  }
};

const closeConnection = (socket: Socket): void => {
  const pod = pods[getPodIndexBySocket(socket)];
  // console.log(`Connection failed to peer: ${pod.name} / ${pod.address}`);
  pods.splice(pods.indexOf(pod), 1);
  io.emit('message', podListUpdated(pods));
};

const getPodIndexByPublicKey = (publicKey: string, _pods: Pod[] = pods): number => {
  let index = null;
  for (let i = 0; i < _pods.length; i += 1) {
    const _pod = _pods[i];
    if (publicKey === _pod.address) {
      index = i;
    }
  }
  return index;
};

const getPodIndexBySocket = (socket: Socket): number => {
  let index = null;
  for (let i = 0; i < pods.length; i += 1) {
    const _pod = pods[i];
    if (socket.id === _pod.socketId) {
      index = i;
    }
  }
  return index;
};

const handleMessage = (socket: Socket, message: Message): IResult => {
  try {
    if (message === null) {
      // console.log('could not parse received JSON message: ' + message);
      return;
    }
    // console.log('Received message: %s', JSON.stringify(message));
    switch (message.type) {
      case MessageType.RESPONSE_IDENTITY:
        // console.log('Received Pod Identity');
        if (getPodIndexByPublicKey(message.data.address) === null) {
          // console.log(`Local IP of connecting node: ${message.data.localIp}`);
          message.data.ip = socket['handshake'].headers['x-real-ip']; // ts
          // console.log(message.data.ip);
          pods.push(message.data);
          io.emit('message', podListUpdated(pods));
        }
        else { /* // console.log('Pod already exists in Pods, do nothing.'); */ }
        break;
      case MessageType.SELECTED_FOR_VALIDATION: {
        // console.log('Selected for validation. Validating...');
        const { transaction, senderLedger }:
          { transaction: Transaction, senderLedger: Ledger } = JSON.parse(message.data);
        validateTransaction(transaction, senderLedger, (res: IResult) => {
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
          // io.clients((err, clients) => { console.dir(clients); });
          // console.log(res.id);
          // console.log(_tx.id);
          io.emit('message', responseIsTransactionValid(res, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        const { result, transaction }: { result: IResult, transaction: Transaction } = JSON.parse(message.data);
        // console.log(result.id);
        // console.log(transaction.id);
        if (!validationResults.hasOwnProperty(transaction.id)) {
          validationResults[transaction.id] = [];
        }
        validationResults[transaction.id].push({ socket, message });
        if (Object.keys(validationResults[transaction.id]).length === 4) {
          const requestValidationEndEvent = new LogEvent(
            pods[getPodIndexByPublicKey(transaction.from)],
            pods[getPodIndexByPublicKey(transaction.to)],
            transaction.id,
            EventType.REQUEST_VALIDATION_END,
            'info',
          );
          write(localLogger, createLogEvent(requestValidationEndEvent));
          handleValidationResults(transaction.id);
        }
      }
      case MessageType.POD_LIST_UPDATED: {
        // console.log('Pod list updated...');
        const data = JSON.parse(message.data);
        if (data.length === undefined) {
          // console.dir(data);
          // console.log(`Pod list received was undefined. Ignoring. TEMPORARY, TRACK DOWN MESSAGE SOURCE.`);
          break;
        }
        pods = data;
        // console.log(`Number of pods: ${pods.length}`);
        break;
      }
      case MessageType.KILL_SERVER_PROCESS:
        // console.log('Kill command received, killing process');
        gServer.close();
        localSocket.close();
        io.close();
        process.exit();
        break;
      case MessageType.TRANSACTION_CONFIRMATION_REQUEST: {
        // console.log('Selected to confirm a valid transaction. Confirming...');
        const { transactionId, hash }:
          { transactionId: string, hash: string } = JSON.parse(message.data);
        const result = validateTransactionHash(transactionId, hash);
        io.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_RESULT:
        return JSON.parse(message.data);
      case MessageType.TEST_CONFIG:
        const data = JSON.parse(message.data);
        const { testConfig, selectedPods }: { testConfig: TestConfig, selectedPods: Pod[] } = data;
        let localTestConfig = testConfig;
        console.dir(localTestConfig);
        console.dir(testConfig);
        let isSelected = false;
        for (let i = 0; i < selectedPods.length; i += 1) {
          const pod = selectedPods[i];
          if (pod) {
            if (pod.address === getPublicFromWallet()) {
              isSelected = true;
              break;
            }
          }
        }
        if (isSelected) {
          beginTest(selectedPods);
        }
    }
  } catch (e) {
    // console.log(e);
  }
};

const handleNewConnection = (socket: Socket): void => {
  // console.log('New connection, emitting [identity]');
  socket.emit('identity');
  socket.on('message', (message: Message) => {
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
    const { result, transaction }:
      { result: IResult, transaction: Transaction } = JSON.parse(message.data);
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
  gServer = server;
  if (isSeed) {
    // console.log('Process is a seed server, node will not be created.');
    return;
  }
  const randomType: number = Math.floor(Math.random() * 10) >= 1 ? 0 : 1;
  const pod: Pod = createPod(type);
  const socket: Socket = ioClient('https://bcp-tn.now.sh');
  const logger: Socket = ioClient('https://bcp-tn-logger.now.sh');
  localLogger = logger;
  localSocket = socket;
  socket.on('connect', () => {
    pod.socketId = socket.id;
    pod.port = server.address().port;
    const message: Message = new Message();
    message.type = MessageType.RESPONSE_IDENTITY;
    message.data = pod;
    socket.on('identity', () => {
      // console.log('Received [identity]');
      write(socket, message);
    });
    socket.on('message', (msg: Message) => {
      // console.log(`Received Message: ${msg.type}`);
      handleMessage(socket, msg);
    });
    socket.on('disconnect', () => {
      // console.log('[initP2PNode] socket disconnected');
    });
  });
};

const initP2PServer = (server: http.Server): any => {
  io = socketIo(server);
  io.on('connection', (socket) => {
    // console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  if (isSeed) {
    io.on('disconnect', (socket) => {
      closeConnection(socket);
    });
  }
};

const write = (socket: Socket, message: Message): void => {
  // console.log('Before emit');
  socket.emit('message', message);
};

const killAll = (): void => {
  io.emit('message', killMsg());
};

export {
  beginTest, loopTest, initP2PServer, initP2PNode, getPods, getIo, getTestConfig, write, handleMessage, Message,
  killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType,
  getLogger,
};
