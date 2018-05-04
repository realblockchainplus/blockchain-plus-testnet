import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';
import { Socket } from 'socket.io-client';
import * as http from 'http';
import * as minimist from 'minimist';
import * as os from 'os';

import { Pod, createPod, podType } from './pod';
import { Transaction, validateTransaction, Result, validateTransactionHash } from './transaction';
import { Ledger, updateLedger, getEntryByTransactionId } from './ledger';
import { getPublicFromWallet } from './wallet';
import { LogEvent, eventType, createLogEvent } from './logEntry';

const argv = minimist(process.argv.slice(2));
const type: number = parseInt(argv.t);
const isSeed: boolean = argv.s === 'true';
let pods: Pod[] = [];

const interfaces = os.networkInterfaces();

const getLocalIp = () => {
  const keys = Object.keys(interfaces);
  let localIp = '';
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const _interfaces = interfaces[key];
    for (let k = 0; k < _interfaces.length; k += 1) {
      const __interface = _interfaces[k];
      const { address, internal, family } = __interface;
      if (internal === false && address.substr(0, 7) === '192.168' && family === 'IPv4') {
        localIp += address;
      }
    }
  }
  return localIp;
};

enum MessageType {
  SELECTED_FOR_VALIDATION = 1,
  RESPONSE_IDENTITY = 2,
  VALIDATION_RESULT = 3,
  POD_LIST_UPDATED = 4,
  KILL_SERVER_PROCESS = 5,
  TRANSACTION_CONFIRMATION_REQUEST = 6,
  TRANSACTION_CONFIRMATION_RESULT = 7,
  LOG_EVENT = 8
};

class Message {
  public type: MessageType;
  public data: any;
};

let io;
let gServer;
let localSocket;
let localLogger;

const initP2PServer = (server: http.Server): any => {
  io = socketIo(server);
  io.on('connection', socket => {
    console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  if (isSeed) {
    io.on('disconnect', socket => {
      closeConnection(socket);
    });
  }
};

const initP2PNode = (server: http.Server) => {
  gServer = server;
  if (isSeed) {
    console.log('Process is a seed server, node will not be created.');
    return false;
  }
  const randomType: number = Math.floor(Math.random() * 10) >= 1 ? 0 : 1;
  const pod: Pod = createPod(type);
  const socket: Socket = ioClient('https://bcp-tn.now.sh');
  const logger: Socket = ioClient('http://192.168.0.14:3005');
  localLogger = logger;
  localSocket = socket;
  socket.on('connect', () => {
    pod.ws = socket.id;
    pod.port = server.address().port;
    const message: Message = new Message();
    message.type = MessageType.RESPONSE_IDENTITY;
    message.data = pod;
    socket.on('identity', () => {
      console.log('Received [identity]');
      write(socket, message);
    });
    socket.on('message', (message: Message) => {
      console.log(`Received Message: ${message.type}`);
      handleMessage(socket, message);
    });
    socket.on('disconnect', () => {
      console.log('[initP2PNode] socket disconnected');
    });
  });
};

const getPods = () => { return pods; };

const getIo = () => { return io; };

const getServer = () => { return gServer; };

const getLogger = () => { return localLogger; };

const handleNewConnection = (socket: Socket) => {
  console.log('New connection, emitting [identity]');
  socket.emit('identity');
  socket.on('message', (message: Message) => {
    console.log('[handleNewConnection] handleMessage');
    handleMessage(socket, message);
  });
  if (isSeed) {
    socket.on('disconnect', () => closeConnection(socket));
    socket.on('error', () => closeConnection(socket));
  }
};

const handleMessage = (socket: Socket, message: Message): Result => {
  try {
    if (message === null) {
      console.log('could not parse received JSON message: ' + message);
      return;
    }
    let result: Result;
    // console.log('Received message: %s', JSON.stringify(message));
    switch (message.type) {
      case MessageType.RESPONSE_IDENTITY:
        console.log('Received Pod Identity');
        if (getPodIndexByPublicKey(message.data.address) === null) {
          console.log(`Local IP of connecting node: ${message.data.localIp}`);
          message.data.ip = socket.handshake.headers['x-real-ip'];
          pods.push(message.data);
          io.emit('message', podListUpdated(pods));
        }
        else { console.log('Pod already exists in Pods, do nothing.'); }
        break;
      case MessageType.SELECTED_FOR_VALIDATION: {
        console.log('Selected for validation. Validating...');
        const { transaction, senderLedger }:
          { transaction: Transaction, senderLedger: Ledger } = JSON.parse(message.data);
        validateTransaction(transaction, senderLedger, (res) => {
          const tx = new Transaction(
            transaction.from,
            transaction.address,
            transaction.amount,
            transaction.timestamp
          );
          const _tx = Object.assign(tx, transaction);

          if (res.result) {
            _tx.generateHash();
            updateLedger(_tx, 1);
          }
          console.log('Sending out validation result.');
          io.clients((err, clients) => { console.dir(clients); });
          io.emit('message', responseIsTransactionValid(res, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        console.log('Validation Result msg');
        const { result, transaction }:
          { result: Result, transaction: Transaction } = JSON.parse(message.data);
        const tx = new Transaction(
          transaction.from,
          transaction.address,
          transaction.amount,
          transaction.timestamp
        );
        const _tx = Object.assign(tx, transaction);
        if (result.result) {
          console.log(`Validation Result returned ${result.result}`);
          // console.dir(_tx);
          if (_tx) {
            console.log(`Transaction From: ${_tx.from}. My Public Key: ${getPublicFromWallet()}`);
            if (_tx.from === getPublicFromWallet() || _tx.address === getPublicFromWallet()) {
              console.log('Transaction Hash generated');
              _tx.generateHash();
              console.log('Writing to ledger...');
              updateLedger(_tx, 0);
              socket.disconnect();
            }
          }
        }
        else {
          const event = new LogEvent(
            pods[getPodIndexByPublicKey(transaction.from)],
            pods[getPodIndexByPublicKey(transaction.address)],
            eventType.TRANSACTION_END
          );
          write(localLogger, createLogEvent(event));
          console.log(`FAILED: ${result.reason}`);
        }
      }
      case MessageType.POD_LIST_UPDATED: {
        console.log('Pod list updated...');
        const data = JSON.parse(message.data);
        if (data.length === undefined) {
          // console.dir(data);
          console.log('Pod list received was undefined. Ignoring. TEMPORARY, TRACK DOWN MESSAGE SOURCE.');
          break;
        }
        pods = data;
        console.log(`Number of pods: ${pods.length}`);
        break;
      }
      case MessageType.KILL_SERVER_PROCESS:
        console.log('Kill command received, killing process');
        gServer.close();
        localSocket.close();
        io.close();
        process.exit();
        break;
      case MessageType.TRANSACTION_CONFIRMATION_REQUEST: {
        console.log('Selected to confirm a valid transaction. Confirming...');
        const { transactionId, hash }:
          { transactionId: string, hash: string } = JSON.parse(message.data);
        const result = validateTransactionHash(transactionId, hash);
        io.emit('message', responseIsTransactionHashValid(result));
        break;
      }
      case MessageType.TRANSACTION_CONFIRMATION_RESULT:
        return JSON.parse(message.data);
    }
  } catch (e) {
    console.log(e);
  }
};

const write = (socket: Socket, message: Message): void => {
  console.log('Before emit');
  socket.emit('message', message);
};

const closeConnection = (socket: Socket) => {
  const pod = pods[getPodIndexBySocket(socket)];
  console.log(`Connection failed to peer: ${pod.name} / ${pod.address}`);
  pods.splice(pods.indexOf(pod), 1);
  io.emit('message', podListUpdated(pods));
};

const getPodIndexBySocket = (socket: Socket): number => {
  let index = null;
  for (let i = 0; i < pods.length; i += 1) {
    const _pod = pods[i];
    if (socket.id === _pod.ws) {
      index = i;
    }
  }
  return index;
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

const responseIdentityMsg = (pod: Pod): Message => ({
  'type': MessageType.RESPONSE_IDENTITY,
  'data': JSON.stringify(pod)
});

const queryIsTransactionValid = (transactionData: {
  transaction: Transaction,
  senderLedger: Ledger
}): Message => {
  return {
    'type': MessageType.SELECTED_FOR_VALIDATION,
    'data': JSON.stringify(transactionData)
  };
};

const responseIsTransactionValid = (result: Result, transaction: Transaction): Message => {
  return {
    'type': MessageType.VALIDATION_RESULT,
    'data': JSON.stringify({ result, transaction })
  };
};

const isTransactionHashValid = (transactionData: {
  transactionId: string,
  hash: string
}): Message => ({
  'type': MessageType.TRANSACTION_CONFIRMATION_REQUEST,
  'data': JSON.stringify(transactionData)
});

const responseIsTransactionHashValid = (result: Result): Message => ({
  'type': MessageType.TRANSACTION_CONFIRMATION_RESULT,
  'data': JSON.stringify(result)
});

const podListUpdated = (pods: Pod[]): Message => ({
  'type': MessageType.POD_LIST_UPDATED,
  'data': JSON.stringify(pods)
});

const killMsg = (): Message => ({
  'type': MessageType.KILL_SERVER_PROCESS,
  'data': null
});

const killAll = (): void => {
  io.emit('message', killMsg());
};

// const initConnection = (socket: Socket) => {  
//   io.on('connection', socket => {
//     console.log('a peer connected');
//     socket.emit('identify', () => {});
//     socket.on('identity', pod => {
//       console.log(pod);
//     });
//   });
// };

export {
  initP2PServer, initP2PNode, getPods, getIo, write, handleMessage, Message,
  queryIsTransactionValid, killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType,
  getLocalIp, getLogger
}