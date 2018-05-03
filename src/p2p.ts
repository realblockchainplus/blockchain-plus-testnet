import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';
import { Socket } from 'socket.io-client';
import * as http from 'http';
import * as minimist from 'minimist';
import { Pod, createPod, podType } from './pod';
import {
  Block, getBlockchain, getLastBlock,
  isStructureValid, generateNextBlock
} from './block';
import { Transaction, validateTransaction, Result, validateTransactionHash } from './transaction';
import { Ledger, updateLedger, getEntryByTransactionId } from './ledger';
import { getPublicFromWallet } from './wallet';

const argv = minimist(process.argv.slice(2));
const type: number = parseInt(argv.t);
const isSeed: boolean = argv.s === 'true';
let pods: Pod[] = [];

enum MessageType {
  QUERY_LATEST = 0,
  QUERY_ALL = 1,
  RESPONSE_BLOCKCHAIN = 2,
  QUERY_TRANSACTION_POOL = 3,
  RESPONSE_TRANSACTION_POOL = 4,
  SELECTED_FOR_VALIDATION = 5,
  RESPONSE_IDENTITY = 6,
  VALIDATION_RESULT = 7,
  POD_LIST_UPDATED = 8,
  KILL_SERVER_PROCESS = 9,
  TRANSACTION_CONFIRMATION_REQUEST = 10,
  TRANSACTION_CONFIRMATION_RESULT = 11
};

class Message {
  public type: MessageType;
  public data: any;
};

let io;
let gServer;
let localSocket;

const initP2PServer = (server: http.Server): any => {
  io = socketIo(server);
  io.on('connection', socket => {
    console.log('[initP2PServer] handleMessage');
    handleNewConnection(socket);
  });
  io.on('disconnect', socket => {
    closeConnection(socket);
  });
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
    const getAll: Message = new Message();
    getAll.type = MessageType.QUERY_ALL;
    getAll.data = null;
    write(socket, getAll);
  });
};

const getPods = () => { return pods; };

const getIo = () => { return io; };

const getServer = () => { return gServer; };

const handleNewConnection = (socket: Socket) => {
  console.log('New connection, emitting [identity]');
  socket.emit('identity');
  socket.on('message', (message: Message) => {
    console.log('[handleNewConnection] handleMessage');
    handleMessage(socket, message);
  });
  socket.on('disconnect', () => closeConnection(socket));
  socket.on('error', () => closeConnection(socket));
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
      case MessageType.QUERY_LATEST:
        write(socket, responseLatestMsg());
        break;
      case MessageType.QUERY_ALL:
        write(socket, responseChainMsg());
        break;
      case MessageType.RESPONSE_IDENTITY: 
        console.log('Received Pod Identity');
        if (getPodIndexByPublicKey(message.data.address) === null) {
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
          io.emit('message', responseIsTransactionValid(res, _tx));
        });
        break;
      }
      case MessageType.VALIDATION_RESULT: {
        const { result, transaction }:
          { result: Result, transaction: Transaction } = JSON.parse(message.data);
        if (result.result) {          
          if (transaction) {
            if (transaction.from === getPublicFromWallet() || transaction.address === getPublicFromWallet()) {
              transaction.generateHash();
              updateLedger(transaction, 0);
            }
          }
        }
        else {
          console.log(`FAILED: ${result.reason}`);
        }
      }
      case MessageType.POD_LIST_UPDATED: {
        console.log('Pod list updated...');
        pods = JSON.parse(message.data);
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
        console.log('Selected to confirm a valid transaction. Confirm...');
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

const getPodIndexByPublicKey = (publicKey: string): number => {
  let index = null;
  for (let i = 0; i < pods.length; i += 1) {
    const _pod = pods[i];
    if (publicKey === _pod.address) {
      index = i;
    }
  }
  return index;
};



const queryChainLengthMsg = (): Message => ({ 'type': MessageType.QUERY_LATEST, 'data': null });

const queryAllMsg = (): Message => ({ 'type': MessageType.QUERY_ALL, 'data': null });

const responseChainMsg = (): Message => ({
  'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

const responseLatestMsg = (): Message => ({
  'type': MessageType.RESPONSE_BLOCKCHAIN,
  'data': JSON.stringify([getLastBlock()])
});

const queryTransactionPoolMsg = (): Message => ({
  'type': MessageType.QUERY_TRANSACTION_POOL,
  'data': null
});

const responseIdentityMsg = (pod: Pod): Message => ({
  'type': MessageType.RESPONSE_IDENTITY,
  'data': JSON.stringify(pod)
});

const queryIsTransactionValid = (transactionData: {
  transaction: Transaction,
  senderLedger: Ledger
}): Message => ({
  'type': MessageType.SELECTED_FOR_VALIDATION,
  'data': JSON.stringify(transactionData)
});

const responseIsTransactionValid = (result: Result, transaction: Transaction): Message => ({
  'type': MessageType.VALIDATION_RESULT,
  'data': JSON.stringify({ result, transaction })
});

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

const handleBlockchainResponse = (socket: Socket, receivedBlocks: Block[]) => {
  if (receivedBlocks.length === 0) {
    console.log('received block chain size of 0');
    return;
  }
  const latestBlockReceived: Block = receivedBlocks[receivedBlocks.length - 1];
  if (!isStructureValid(latestBlockReceived)) {
    console.log('block structuture not valid');
    return;
  }
};

const broadcastLatest = (): void => {
  console.log('Broadcasting latest blockchain');
  io.clients((err, clients) => {
    console.log(clients);
  });
  io.emit('message', responseLatestMsg());
};

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
  initP2PServer, initP2PNode, getPods, getIo, broadcastLatest, write, handleMessage, Message,
  queryIsTransactionValid, killAll, getPodIndexByPublicKey, isTransactionHashValid, MessageType
}