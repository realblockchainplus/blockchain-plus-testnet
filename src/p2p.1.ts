import * as socketIo from 'socket.io';
import * as ioClient from 'socket.io-client';
import { Socket } from 'socket.io-client';
import { Server } from 'http';
import { Pod, createPod } from './pod';
import {
  addBlockToChain, Block, getBlockchain, getLastBlock, handleReceivedTransaction, isStructureValid, replaceChain
} from './block';
import { Transaction } from './transaction';
import { getTransactionPool } from './transactionPool';

const pods: Pod[] = [];

enum MessageType {
  QUERY_LATEST = 0,
  QUERY_ALL = 1,
  RESPONSE_BLOCKCHAIN = 2,
  QUERY_TRANSACTION_POOL = 3,
  RESPONSE_TRANSACTION_POOL = 4,
  SELECTED_FOR_VALIDATION = 5,
  RESPONSE_IDENTITY = 6,
  VALIDATION_RESULT = 7
};

class Message {
  public type: MessageType;
  public data: any;
};

let io;

const initP2PServer = (server: Server): any => {
  io = socketIo(server);
  io.on('connection', socket => {
    handleNewConnection(socket);
  });
};

const initP2PNode = (server: Server) => {
  const randomType: number = Math.floor(Math.random() * 10) >= 1 ? 0 : 1;
  const pod: Pod = createPod(randomType);
  const message: Message = new Message();
  message.type = MessageType.RESPONSE_IDENTITY;
  message.data = pod;
  const socket: Socket = ioClient('https://blockchain-plus-testnet.now.sh');
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
};

const getPods = () => { return pods; };

const handleNewConnection = (socket: Socket) => {
  console.log('New connection, emitting [identity]');
  socket.emit('identity');
  socket.on('message', (message: Message) => {
    handleMessage(socket, message);
  });
  socket.on('close', () => closeConnection(socket));
  socket.on('error', () => closeConnection(socket));
};

const handleMessage = (socket: Socket, message: Message) => {
  try {
    if (message === null) {
      console.log('could not parse received JSON message: ' + message);
      return;
    }
    console.log('Received message: %s', JSON.stringify(message));
    switch (message.type) {
      case MessageType.QUERY_LATEST:
        write(socket, responseLatestMsg());
        break;
      case MessageType.QUERY_ALL:
        write(socket, responseChainMsg());
        break;
      case MessageType.RESPONSE_BLOCKCHAIN:
        const receivedBlocks: Block[] = JSON.parse(message.data);
        if (receivedBlocks === null) {
          console.log('invalid blocks received: %s', JSON.stringify(message.data));
          break;
        }
        handleBlockchainResponse(socket, receivedBlocks);
        break;
      case MessageType.QUERY_TRANSACTION_POOL:
        write(socket, responseTransactionPoolMsg());
        break;
      case MessageType.RESPONSE_TRANSACTION_POOL:
        const receivedTransactions: Transaction[] = JSON.parse(message.data);
        if (receivedTransactions === null) {
          console.log('invalid transaction received: %s', JSON.stringify(message.data));
          break;
        }
        receivedTransactions.forEach((transaction: Transaction) => {
          try {
            handleReceivedTransaction(transaction);
            // if no error is thrown, transaction was indeed added to the pool
            // let's broadcast transaction pool
            io.emit('message', responseTransactionPoolMsg());
          } catch (e) {
            console.log(e.message);
          }
        });
        break;
      case MessageType.RESPONSE_IDENTITY:
        console.log('Received Peer Identity');
        pods.push(message.data);
        break;
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
};

const getPodIndexBySocket = (socket: Socket): number => {
  let index = null;
  for (let i = 0; i < pods.length; i += 1) {
    const _pod = pods[i];
    if (socket.id === _pod.ws.id) {
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

const responseTransactionPoolMsg = (): Message => ({
  'type': MessageType.RESPONSE_TRANSACTION_POOL,
  'data': JSON.stringify(getTransactionPool())
});

const responseIdentityMsg = (pod: Pod): Message => ({
  'type': MessageType.RESPONSE_IDENTITY,
  'data': JSON.stringify(pod)
});

const queryIsTransactionValid = (transaction: Transaction): Message => ({
  'type': MessageType.SELECTED_FOR_VALIDATION,
  'data': JSON.stringify(transaction)
});

const responseIsTransactionValid = (result: Boolean): Message => ({
  'type': MessageType.VALIDATION_RESULT,
  'data': result
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
  const latestBlockHeld: Block = getLastBlock();
  if (latestBlockReceived.index > latestBlockHeld.index) {
    console.log('blockchain possibly behind. We got: '
      + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
    if (latestBlockHeld.hash === latestBlockReceived.prevHash) {
      if (addBlockToChain(latestBlockReceived)) {
        write(socket, responseLatestMsg());
      }
    } else if (receivedBlocks.length === 1) {
      console.log('We have to query the chain from our peer');
      write(socket, queryAllMsg());
    } else {
      console.log('Received blockchain is longer than current blockchain');
      replaceChain(receivedBlocks);
    }
  } else {
    console.log('received blockchain is not longer than received blockchain. Do nothing');
  }
};

const broadcastLatest = (): void => {
  console.log('Broadcasting latest blockchain');
  io.clients((err, clients) => {
    console.log(clients);
  });
  io.emit('message', responseLatestMsg());
};

const broadCastTransactionPool = (): void => {
  console.log('Broadcasting latest transaction pool');
  io.emit('message', responseTransactionPoolMsg());
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
  initP2PServer, initP2PNode, getPods, broadcastLatest, broadCastTransactionPool
}