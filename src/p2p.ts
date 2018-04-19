import * as WebSocket from 'ws';
import { Server } from 'ws';
import { addBlockToChain, Block, getBlockchain, getLastBlock, 
  isChainValid, isStructureValid } from './block';
import { Pod, createPod } from './pod';

const pods: Pod[] = [];

const randomNames = [
  "Jeevan Singh",
  "Jaswinder Singh",
  "Gabor Levai",
  "Rajah Vasjaragagag",
  "Scott Donnelly",
  "Gale Rott",  
  "Carleen Labarge",  
  "Mindy Rummage",  
  "Malena Imhoff",  
  "Layla Pfaff",  
  "Ashleigh Depaoli",  
  "Dimple Brockway",  
  "Cheryl Mckie",  
  "Voncile Rideout",  
  "Nanette Skinner",  
  "Wilburn Hetzel",  
  "Zack Ganey",  
  "Aleen Pilarski",  
  "Johnson Cribbs",  
  "Timothy Hottle",  
  "Kellye Loney",  
  "Iraida Browne",  
  "Shaun Burton",  
  "Brianne Honey",  
  "Ceola Cantrelle",  
  "Sheilah Thiede",  
  "Antoine Osterberg",  
  "Denese Bergin",  
  "Stacia Zobel",  
  "Trinity Meng",  
  "Christiana Barnes",  
  "Freddie Kin",  
  "Kai Reid",  
  "Marybeth Lavine",  
  "Vella Sachs",  
  "Cameron Abate",  
  "Shawanna Emanuel",  
  "Hilaria Gabourel",  
  "Clelia Rohloff",  
  "Joi Sandidge",  
  "Micheal Belew",  
  "Mercedes Buhler",  
  "Tam Steimle",  
  "Slyvia Alongi",  
  "Suzie Mcneilly",  
  "Stefanie Beehler",  
  "Nadene Orcutt",  
  "Maud Barlow",  
  "Dusty Dabrowski",  
  "Kylee Krom",  
  "Lena Edmisten",  
  "Kristopher Whiteside",  
  "Dorine Lepley",  
  "Kelle Khouri",  
  "Cristen Shier"
];

enum MessageType {
  QUERY_LATEST = 0,
  QUERY_ALL = 1,
  RESPONSE_BLOCKCHAIN = 2,
};

class Message {
  public type: MessageType;
  public data: any;
};

const initP2PServer = (p2pPort: number) => {
  const server: Server = new WebSocket.Server({ port: p2pPort });
  console.log('Starting p2p server...');
  server.on('connection', (ws: WebSocket) => {
    // console.log('p2p connection started');
    // initConnection(ws);
  });
};

const getPods = () => { return pods; };

const initConnection = (ws: WebSocket) => {
  const randomName = randomNames.splice(Math.floor(Math.random() * randomNames.length), 1)[0];
  const randomLocation = Math.floor(Math.random() * 5000);
  const pod = createPod(0, randomLocation, randomName, ws);
  console.log(`Adding Pod... ${pod.name}`);
  pods.push(pod);
  initMessageHandler(pod);
  initErrorHandler(pod);
  write(pod, queryChainLengthMsg());
};

const JSONToObject = <T>(data: string): T => {
  try {
    return JSON.parse(data);
  } catch (e) {
    console.log(e);
    return null;
  }
};

const initMessageHandler = (pod: Pod) => {
  const { ws } = pod;
  ws.on('message', (data: string) => {
    const message: Message = JSONToObject<Message>(data);
    if (message === null) {
      console.log('could not parse received JSON message: ' + data);
      return;
    }
    console.log('Received message' + JSON.stringify(message));
    switch (message.type) {
      case MessageType.QUERY_LATEST:
        write(pod, responseLatestMsg());
        break;
      case MessageType.QUERY_ALL:
        write(pod, responseChainMsg());
        break;
      case MessageType.RESPONSE_BLOCKCHAIN:
        const receivedBlocks: Block[] = JSONToObject<Block[]>(message.data);
        if (receivedBlocks === null) {
          console.log('invalid blocks received:');
          console.log(message.data)
          break;
        }
        handleBlockchainResponse(receivedBlocks);
        break;
    }
  });
};

const write = (pod: Pod, message: Message): void => {
  const { ws } = pod;
  ws.send(JSON.stringify(message));
};

const broadcast = (message: Message): void => pods.forEach((pod) => {
  write(pod, message)
});

const queryChainLengthMsg = (): Message => ({ 'type': MessageType.QUERY_LATEST, 'data': null });

const queryAllMsg = (): Message => ({ 'type': MessageType.QUERY_ALL, 'data': null });

const responseChainMsg = (): Message => ({
  'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(getBlockchain())
});

const responseLatestMsg = (): Message => ({
  'type': MessageType.RESPONSE_BLOCKCHAIN,
  'data': JSON.stringify([getLastBlock()])
});

const initErrorHandler = (pod: Pod) => {
  const { ws } = pod;
  const closeConnection = (myPod: Pod) => {
    console.log('connection failed to peer: ' + myPod.ws.url);
    pods.splice(pods.indexOf(myPod), 1);
  };
  ws.on('close', () => closeConnection(pod));
  ws.on('error', () => closeConnection(pod));
};

const handleBlockchainResponse = (receivedBlocks: Block[]) => {
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
        broadcast(responseLatestMsg());
      }
    } else if (receivedBlocks.length === 1) {
      console.log('We have to query the chain from our peer');
      broadcast(queryAllMsg());
    } else {
      console.log('Received blockchain is longer than current blockchain. Replace chain is not implemented yet.');
      // replaceChain(receivedBlocks);
    }
  } else {
    console.log('received blockchain is not longer than received blockchain. Do nothing');
  }
};

const broadcastLatest = (): void => {
  broadcast(responseLatestMsg());
};

const connectToPeers = (newPeer: string): void => {
  console.log(`[New Peer]: ${newPeer}`);
  const ws: WebSocket = new WebSocket(newPeer);
  ws.on('open', () => {
    console.log(`[Web Socket] is open... initiating connection`);
    initConnection(ws);
  });
  ws.on('error', (error) => {
    console.log(`[Error]: ${error}`);
  });
};

export { connectToPeers, broadcastLatest, initP2PServer, getPods };

