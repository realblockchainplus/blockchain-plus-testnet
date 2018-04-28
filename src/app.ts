import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import * as kp from 'kill-port';
import * as cors from 'cors';
import * as minimist from 'minimist';
import * as http from 'http';
import * as socketio from 'socket.io';

import { Block, getBlockchain, generateNextBlock, addBlockToChain, getAccountBalance, generateNextBlockWithTransaction, sendTransaction, getLastBlock } from './block';
import { Transaction, getTransactionId, addToWallet } from './transaction';
import { getPods, initP2PServer, initP2PNode } from './p2p.1';
import { initWallet, getPublicFromWallet } from './wallet';
import { Pod, createPod } from './pod';
import { getTransactionPool } from './transactionPool';
import { selectRandom } from './rngTool';
import { transaction } from './transactionOpp';

const argv = minimist(process.argv.slice(2));
const httpPort: number = parseInt(argv.p) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const REGULAR_NODES = 0;
const PARTNER_NODES = 0;

const initHttpServer = (port: number) => {
  const app = express();
  const server = new http.Server(app);

  app.use(bodyParser.json());
  app.use(cors());
  app.use((err, req, res, next) => {
    if (err) {
      res.status(400).send(err.message);
    }
  });

  app.get('/blocks', (req, res) => {
    res.send(getBlockchain());
    // res.send(transaction.blockChain);
  });

  app.post('/blocks', (req, res) => {
    res.send(transaction.transctionInfo(req.body));
  });

  // app.post('/mineBlock', (req, res) => {
  //   const newBlock: Block = generateNextBlock(req.body.data);
  //   const result = addBlockToChain(newBlock);
  //   result ? res.send(newBlock) : res.status(400).send('Invalid Block');
  // });

  app.post('/testTransaction', (req, res) => {
    const address = req.body.address;
    const amount = req.body.amount;
    const pods = getPods();
    const regularPods = pods.filter(pod => pod.type === 0);
    const partnerPods = pods.filter(pod => pod.type === 1);
    const selectedPods: Pod[] = [...selectRandom(regularPods), ...selectRandom(partnerPods)];
    try {
      const resp = generateNextBlockWithTransaction(address, amount);
      res.send(resp);
    } catch (e) {
      console.log(e.message);
      res.status(400).send(e.message);
    }
  });

  app.get('/transactionPool', (req, res) => {
    res.send(getTransactionPool());
  });

  app.get('/balance', (req, res) => {
    const balance = getAccountBalance();
    res.send({ balance });
  });

  app.get('/address', (req, res) => {
    const address: string = getPublicFromWallet();
    res.send({ 'address': address });
  });

  app.get('/peers', (req, res) => {
    res.send(getPods().map((p: any) => {
      const returnObj = {
        type: p.type,
        name: p.name,
        location: p.location,
        ip: `${p.ws._socket.remoteAddress} : ${p.ws._socket.remotePort}`,
        publicAddress: p.address
      };
      return returnObj;
    }));
  });

  app.post('/send', (req, res) => {
    sendTransaction(req.body.address, req.body.amount);
    res.send();
  });

  app.post('/addToWallet', (req, res) => {
    const newFunds: Transaction = addToWallet(req.body.address, getLastBlock().index + 1);
    const newBlock: Block = generateNextBlock([newFunds]);
    const result = addBlockToChain(newBlock);
    result ? res.send(newBlock) : res.status(400).send('Invalid Block');
  });

  server.listen(0, () => {
    console.log(`[Node] New Node created on port: ${server.address().port}`);
    initWallet(server.address().port);
  });
  initP2PServer(server);
  initP2PNode(server);
};

initHttpServer(httpPort);
