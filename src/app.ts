import * as bodyParser from 'body-parser';
import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import * as minimist from 'minimist';

import { getLedger, LedgerType } from './ledger';
import { sendTestConfig } from './message';
import { getIo, getPods, initP2PNode, initP2PServer, killAll, wipeLedgers, getPodIndexByPublicKey } from './p2p';
import { Pod } from './pod';
import { selectRandom } from './rngTool';
import { requestValidateTransaction, Transaction } from './transaction';
import { getCurrentTimestamp, randomNumberFromRange } from './utils';
import { getPublicFromWallet, initWallet } from './wallet';
import { TestConfig } from './testConfig';

const argv = minimist(process.argv.slice(2));

// Arbitrary range
const portMin = 50000;
const portMax = 65535;

// Either a port is passed through the npm run command, or a random port is selected
// For non-local tests the port 80 is passed through npm run
const port = argv.p || randomNumberFromRange(portMin, portMax, true);


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

  // app.post('/postTransaction', (req, res) => {
  //   const transaction = new Transaction(
  //     getPublicFromWallet(),
  //     req.body.transaction.to,
  //     req.body.transaction.amount,
  //     getCurrentTimestamp(),
  //   );

  //   requestValidateTransaction(transaction, getLedger(LedgerType.MY_LEDGER));
  //   res.send(`${req.body.transaction.amount} sent to ${req.body.transaction.to}.`);
  // });

  app.get('/getAddress', (req, res) => {
    const address: string = getPublicFromWallet();
    res.send({ address });
  });

  app.get('/killAll', (req, res) => {
    killAll();
    res.send('Killed all nodes');
  });

  // Wipes both ledgers.
  // TODO: Also wipe the wallet? Currently the genesis transaction isn't added to ledger again
  // because wallet already exists.
  app.get('/wipeLedgers', (req, res) => {
    wipeLedgers();
    res.send('Wiped all ledgers');
  });


  app.post('/startTest', (req, res) => {
    const testConfig = new TestConfig(
      req.body.duration,
      req.body.numSenders,
      req.body.local,
      req.body.maxLedgerLength,
    );
    const pods: Pod[] = getPods();
    const io = getIo();
    let selectedPods: Pod[] = [];
    if (req.body.senderAddresses > 0) {
      if (req.body.numSenders !== req.body.senderAddresses) {
        res.send('numSenders must equal the length of senderAddresses');
        return;
      }
      for (let i = 0; i < req.body.senderAddresses.length; i += 1) {
        const address = req.body.senderAddresses[i];
        const pod = pods[getPodIndexByPublicKey(address)];
        selectedPods.push(pod);
      }
    }
    else {
      const regularPods: Pod[] = pods.filter(pod => pod.type === 0);
      selectedPods = selectRandom(regularPods, testConfig.numSenders * 2, '');
    }
    io.emit('message', sendTestConfig({ selectedPods, testConfig }));
    res.send('Test Started!');
  });

  server.listen(port, () => {
    // console.log(`[Node] New Node created on port: ${server.address().port}`);
    initWallet(server.address().port);
    initP2PServer(server);
    initP2PNode(server);
  });
};

initHttpServer();
