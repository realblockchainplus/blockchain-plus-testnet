import * as http from 'http';
import * as minimist from 'minimist';
import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';

import { getLedger, getLocalLedger, Ledger, LedgerType, updateLedger, initLedger } from './ledger';
import { createLogEvent, EventType, LogEvent } from './logEntry';
import {
  isTransactionHashValid,
  killMsg,
  Message,
  MessageType,
  podListUpdated,
  responseIsTransactionHashValid,
  responseIsTransactionValid,
  wipeLedgersMsg,
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
let localSocket: ClientSocket;
let localLogger: ClientSocket;
let startTime: number;
let endTime: number;
let selectedReceiver: Pod;

let localTestConfig = new TestConfig(60, 2, true, 1);

const validationResults: { [txId: string]: IValidationResult[] } = {};

interface IValidationResult {
  socket: ClientSocket | ServerSocket;
  message: Message;
}

const getPods = (): Pod[] => pods;
const getIo = (): Server => io;
const getServer = (): http.Server => gServer;
const getLogger = (): ClientSocket => localLogger;
const getTestConfig = (): TestConfig => localTestConfig;
const getSelectedPods = (): Pod[] => localSelectedPods;

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
  );

  const testStartEvent = new LogEvent(
    pods[getPodIndexByPublicKey(transaction.from)],
    pods[getPodIndexByPublicKey(transaction.to)],
    '',
    EventType.TEST_START,
    'info',
    localTestConfig,
  );

  write(localLogger, createLogEvent(testStartEvent));
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
  const pod = pods[getPodIndexBySocket(socket)];
  // console.log(`Connection failed to peer: ${pod.name} / ${pod.address}`);
  pods.splice(pods.indexOf(pod), 1);
  if (isSeed) {
    io.emit('message', podListUpdated(pods));
  }
};

const getPodIndexByPublicKey = (publicKey: string, _pods: Pod[] = pods): number => {
  // console.time('getPodIndexByPublicKey');
  let index = null;
  for (let i = 0; i < _pods.length; i += 1) {
    const _pod = _pods[i];
    if (publicKey === _pod.address) {
      index = i;
    }
  }
  // console.timeEnd('getPodIndexByPublicKey');
  return index;
};

const getPodIndexBySocket = (socket: ClientSocket | ServerSocket): number => {
  let index = null;
  for (let i = 0; i < pods.length; i += 1) {
    const _pod = pods[i];
    if (socket.id === _pod.socketId) {
      index = i;
    }
  }
  return index;
};

const handleMessage = (socket: ClientSocket | ServerSocket, message: Message): IResult => {
  try {
    if (message === null) {
      // console.log('could not parse received JSON message: ' + message);
      return;
    }
    const { type, data }: { type: number, data: any } = message;
    // console.log('Received message: %s', JSON.stringify(message));
    switch (type) {
      case MessageType.RESPONSE_IDENTITY: {
        // console.log('Received Pod Identity');
        if (getPodIndexByPublicKey(data.address) === null) {
          // console.log(`Local IP of connecting node: ${data.localIp}`);
          // @ts-ignore
          data.ip = socket['handshake'].headers['x-real-ip'];
          // data.ip = (<ServerSocket>socket).handshake.address;
          // console.log(data.ip);
          pods.push(data);
          if (isSeed) {
            io.emit('message', podListUpdated(pods));          
          }
        }
        else {
          // console.log('Pod already exists in Pods, do nothing.');
        }
        break;
      }
      case MessageType.SELECTED_FOR_VALIDATION: {
        // console.log('Selected for validation. Validating...');
        const { transaction, senderLedger }:
          { transaction: Transaction, senderLedger: Ledger } = JSON.parse(data);
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
          // io.clients((err, clients) => { // console.dir(clients); });
          // console.log(res.id);
          // console.log(_tx.id);
          io.emit('message', responseIsTransactionValid(res, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        const { result, transaction }: { result: IResult, transaction: Transaction } = JSON.parse(data);
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
          const requestValidationEndEvent = new LogEvent(
            pods[getPodIndexByPublicKey(transaction.from)],
            pods[getPodIndexByPublicKey(transaction.to)],
            transaction.id,
            EventType.REQUEST_VALIDATION_END,
            'info',
          );
          console.timeEnd('requestValidation');
          write(localLogger, createLogEvent(requestValidationEndEvent));
          handleValidationResults(transaction.id);          
        }
        break;
      }
      case MessageType.POD_LIST_UPDATED: {
        // console.log('Pod list updated...');
        const _data = JSON.parse(data);
        if (_data.length === undefined) {
          // console.log(`Pod list received was undefined. Ignoring. TEMPORARY, TRACK DOWN MESSAGE SOURCE.`);
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
        // console.log('Selected to confirm a valid transaction. Confirming...');
        const { transactionId, hash }:
          { transactionId: string, hash: string } = JSON.parse(data);
        const result = validateTransactionHash(transactionId, hash);
        io.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_RESULT: {
        return JSON.parse(data);
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
        initLedger(gServer.address().port);
        break;
      }
    }
  } catch (e) {
    // console.log(e);
  }
};

const handleNewConnection = (socket: ServerSocket): void => {
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
  const socket: ClientSocket = ioClient('https://bcp-tn.now.sh');
  const logger: ClientSocket = ioClient('https://bcp-tn-logger.now.sh');
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
  io = socketIo({ wsEngine: 'ws' });
  io.listen(server);
  io.on('connection', (socket: ServerSocket) => {
    // console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  if (isSeed) {
    io.on('disconnect', (socket: ServerSocket) => {
      closeConnection(socket);
    });
  }
};

const write = async (socket: ClientSocket, message: Message): Promise<void> => {
  await socket.emit('message', message);
};

const killAll = (): void => {
  io.emit('message', killMsg());
};

const wipeLedgers = (): void => {
  io.emit('message', wipeLedgersMsg());
};

export {
  beginTest, loopTest, initP2PServer, initP2PNode, getPods, getIo, getTestConfig, write, handleMessage, Message,
  killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType, getLogger, wipeLedgers, getSelectedPods,
};
