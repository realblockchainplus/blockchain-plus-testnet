import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import * as minimist from 'minimist';

import { getLedger, LedgerType } from './ledger';
import { sendTestConfig } from './message';
import { getIo, getPods, initP2PNode, initP2PServer, killAll } from './p2p';
import { Pod } from './pod';
import { selectRandom } from './rngTool';
import { requestValidateTransaction, Transaction } from './transaction';
import { getCurrentTimestamp, randomNumberFromRange } from './utils';
import { getPublicFromWallet, initWallet } from './wallet';

const argv = minimist(process.argv.slice(2));
const portMin = 50000;
const portMax = 65535;

/**
 * Gets a random port. See [[randomNumberFromRange]]
 */
const randomPort = randomNumberFromRange(portMin, portMax);


/**
 * Initializes a http server with a limited API to allow for
 * user commands.
 * 
 * Commands: 
 * * postTransaction
 * * killAll
 * * getAddress
 */
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

  app.post('/postTransaction', (req, res) => {
    const transaction = new Transaction(
      getPublicFromWallet(),
      req.body.transaction.to,
      req.body.transaction.amount,
      getCurrentTimestamp(),
    );

    requestValidateTransaction(transaction, getLedger(LedgerType.MY_LEDGER));
    res.send(`${req.body.transaction.amount} sent to ${req.body.transaction.to}.`);
  });

  app.get('/getAddress', (req, res) => {
    const address: string = getPublicFromWallet();
    res.send({ address });
  });

  app.get('/killAll', (req, res) => {
    killAll();
    res.send('Killed all nodes');
  });

  app.post('/startTest', (req, res) => {
    const testConfig = {
      duration: req.body.duration,
      numSenders: req.body.numSenders,
      local: req.body.local
    };
    const io = getIo();
    const pods: Pod[] = getPods();
    const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
    const selectedPods: Pod[] = selectRandom(regularPods, testConfig.numSenders, '');
    io.emit('message', sendTestConfig({ selectedPods, duration: testConfig.duration }));
    res.send('Test Started!');
  });

  server.listen(80, () => {
    console.log(`[Node] New Node created on port: ${server.address().port}`);
    initWallet(server.address().port);
    initP2PServer(server);
    initP2PNode(server);
  });
};

initHttpServer();
