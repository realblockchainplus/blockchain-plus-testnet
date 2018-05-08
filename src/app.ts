import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';

import { getLedger, ledgerType } from './ledger';
import { createLogEvent, eventType, LogEvent } from './logEntry';
import {
  getLogger, getPodIndexByPublicKey, getPods, initP2PNode,
  initP2PServer, killAll, write,
} from './p2p';
import { Pod } from './pod';
import { requestValidateTransaction, Transaction } from './transaction';
import { getPublicFromWallet, initWallet } from './wallet';
import { getCurrentTimestamp, randomNumberFromRange } from './utils';

const portMin = 50000;
const portMax = 65535;
const randomPort = randomNumberFromRange(portMin, portMax);

const initHttpServer = (): void => {
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
      getCurrentTimestamp(),
    );

    const pods = getPods();
    const localLogger = getLogger();
    const event = new LogEvent(
      pods[getPodIndexByPublicKey(transaction.from)],
      pods[getPodIndexByPublicKey(transaction.address)],
      eventType.TRANSACTION_START,
    );
    write(localLogger, createLogEvent(event));
    requestValidateTransaction(transaction, getLedger(ledgerType.MY_LEDGER));
    res.send(`${req.body.transaction.amount} sent to ${req.body.transaction.address}.`);
  });

  app.get('/address', (req, res) => {
    const address: string = getPublicFromWallet();
    res.send({ address });
  });

  app.get('/killAll', (req, res) => {
    killAll();
    res.send('Killed all nodes');
  });

  server.listen(randomPort, () => {
    console.log(`[Node] New Node created on port: ${server.address().port}`);
    initWallet(server.address().port);
    initP2PServer(server);
    initP2PNode(server);
  });
};

initHttpServer();
