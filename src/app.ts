import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import * as kp from 'kill-port';
import * as cors from 'cors';
import * as minimist from 'minimist';
import * as http from 'http';
import * as socketio from 'socket.io';

import { Transaction, getTransactionId, requestValidateTransaction, getCurrentTimestamp } from './transaction';
import { getPods, getIo, initP2PServer, initP2PNode, killAll } from './p2p';
import { initWallet, getPublicFromWallet } from './wallet';
import { Ledger, getLedger, ledgerType } from './ledger';
import { Pod, createPod } from './pod';
import { selectRandom } from './rngTool';

const REGULAR_NODES = 0;
const PARTNER_NODES = 0;

const portMin = 50000;
const portMax = 65535;
const randomPort = Math.floor((Math.random() * (portMax - portMin)) + portMin);


const initHttpServer = () => {
  const app = express();
  const server = new http.Server(app);

  app.use(bodyParser.json());
  app.use(cors());
  app.use((err, req, res, next) => {
    if (err) {
      res.status(400).send(err.message);
    }
  });

  app.post('/transaction', (req, res) => {
    const transaction = new Transaction(
      getPublicFromWallet(),
      req.body.transaction.address,
      req.body.transaction.amount,
      getCurrentTimestamp()
    );

    requestValidateTransaction(transaction, getLedger(ledgerType.MY_LEDGER));
    res.send(`${req.body.transaction.amount} sent to ${req.body.transaction.address}.`);
  });

  app.get('/address', (req, res) => {
    const address: string = getPublicFromWallet();
    res.send({ 'address': address });
  });

  app.get('/peers', (req, res) => {
    res.send(getPods().map((p: Pod) => {
      const returnObj = {
        type: p.type,
        name: p.name,
        location: p.location,
        id: `${p.ws}`,
        publicAddress: p.address
      };
      return returnObj;
    }));
  });

  app.get('/killAll', (req, res) => {
    killAll();
    res.send();
  });
  server.listen(randomPort, () => {
    console.log(`[Node] New Node created on port: ${server.address().port}`);
    initWallet(server.address().port);
    initP2PServer(server);
    initP2PNode(server);
  });
};

initHttpServer();
