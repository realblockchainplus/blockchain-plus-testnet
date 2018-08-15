import * as bodyParser from 'body-parser';
import { spawn } from 'child_process';
import * as cors from 'cors';
import * as dotenv from 'dotenv';
dotenv.config();
import * as express from 'express';
import * as http from 'http';
import * as minimist from 'minimist';
import { AddressInfo } from 'net';

import { AWSRegionCode, createEC2Cluster, terminateEC2Cluster } from './aws';
import { EventType, LogEvent, LogLevel } from './logEvent';
import { info } from './logger';
import { sendTestConfig } from './message';
import { getIo, getPodIndexByPublicKey, getPods, initP2PNode, initP2PServer, killAll } from './p2p';
import { Pod, PodType } from './pod';
import { selectRandom } from './rngTool';
import { TestConfig } from './testConfig';
import { getGenesisAddress, ISnapshotMap } from './transaction';
import { randomNumberFromRange } from './utils';
import { initWallet } from './wallet';

// import { createEC2Instance } from './aws';
const config = require('../node/config/config.json');

// Argument Options
// * p = Port (number)
// * s = isSeed (boolean)
// * t = podType (podType)
// * c = isCluster (boolean)
// * np = numPartner (number)
// * nr = numRegular (number)
const argv = minimist(process.argv.slice(2));

// Arbitrary range
const portMin = config.portMin;
const portMax = config.portMax;

// Either a port is passed through the npm run command, or a random port is selected
// For non-local tests the port 80 is passed through npm run
const port = parseInt(argv.p, 10) || randomNumberFromRange(portMin, portMax, true);

// For local testing a cluster is created
const localCluster = argv.c === 'true';
const numRegular = argv.nr || 0;
const numPartner = argv.np || 0;

/**
 * Initializes a http server with a limited API to allow for
 * user commands.
 * @module routers/httpServer
 * @requires express
 */

const initHttpServer = (port: number, callback = (server: http.Server) => {}): void => {
  /**
   * express module
   * @const
  */
  const app = express();
  const server = new http.Server(app);

  app.use(bodyParser.json());
  app.use(cors());
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      res.status(400).send(err.message);
    }
  });

  /**
   * Terminates all EC2 instances with the tag 'type:partner' or 'type:regular' and the key 'bcp-tn-node'
   * @name post/terminateInstances
   * @function
   * @memberof module:routers/httpServer
   * @inner
   * @param {AWSRegionCode[]} regions - An array of the region codes that the terminated nodes must belong to
   */
  app.post('/terminateInstances', (req, res) => {
    const { regions } = req.body;
    terminateEC2Cluster(regions);
    res.send('No problemo.');
  });

  /**
 * Creates a balanced cluster of EC2 instances across the specified regions. If no region is specified, the instances will be automatically spread
 * across all 8 regions.
 * @name post/createEC2Cluster
 * @function
 * @memberof module:routers/httpServer
 * @inner
 * @param {number} totalNodes - Number of nodes that will be created
 * @param {AWSRegionCode[]} regions - An array of the region codes that the nodes should be distributed among
 * @param {string} imageName - Name of the image to use when creating nodes. Uses semantic versioning, example: bcp-tn-node-1.0.1.alpha.5
 */
  app.post('/createEC2Cluster', (req, res) => {
    const { totalNodes, regions, imageName }: { totalNodes: number, regions: AWSRegionCode[], imageName: string } = req.body;
    createEC2Cluster(totalNodes, regions, imageName);
    res.send(`Creating EC2 Cluster.`);
  });

  /**
   * Kills all nodes connected to this server. Needs to be removed from normal nodes, only made available
   * to seeds.
   * @name get/killAll
   * @function
   * @memberof module:routers/httpServer
   * @inner
   */
  app.get('/killAll', (req, res) => {
    killAll();
    res.send('Killed all nodes.');
  });

  /**
   * Starts a test on the network.
   * @name post/startTest
   * @function
   * @memberof module:routers/httpServer
   * @inner
   * @param {number} duration - Duration of the test, in milliseconds
   * @param {number} numSenders - Number of nodes the test should allocate as senders
   * @param {boolean} local - Is the test on a local network
   * @param {number} maxLedgerLength - invalid -- remove
   * @param {boolean} sendersAsValidators - Should senders be able to be selected as validators for other transactions
   * @param {string[]} senderAddresses - A list of public keys that must be selected as senders for this test
   */
  app.post('/startTest', (req, res) => {
    const { duration, numSenders, local, maxLedgerLength, sendersAsValidators, senderAddresses } = req.body;
    const testConfig = new TestConfig(
      duration,
      numSenders,
      local,
      maxLedgerLength,
      sendersAsValidators,
    );
    const pods: Pod[] = getPods();
    const io = getIo();
    let selectedPods: Pod[] = [];

    // If senderAddresses are provided, use those addresses to select senders
    if (senderAddresses > 0) {
      if (req.body.numSenders !== senderAddresses) {
        res.send('numSenders must equal the length of senderAddresses');
        return;
      }
      for (let i = 0; i < senderAddresses.length; i += 1) {
        const address = senderAddresses[i];
        const pod = pods[getPodIndexByPublicKey(address, pods)];
        selectedPods.push(pod);
      }
    }
    else {
      const regularPods: Pod[] = pods.filter(pod => pod.podType === 0);
      selectedPods = selectRandom(regularPods, testConfig.numSenders * 2, '');
    }


    // Build initial snapshot map. Whitepaper uses 8 snapshot nodes, currently set to 4
    // Needs to be replaced with external chaos number generator whenever possible
    const snapshotMap: ISnapshotMap = {};
    const numSnapshotPods = 4;

    for (let i = 0; i < selectedPods.length; i += 1) {
      const selectedPod = selectedPods[i];
      const snapshotPods = selectRandom(pods.filter(pod => pod.podType === PodType.PARTNER_POD), numSnapshotPods);
      snapshotMap[selectedPod.address] = {
        snapshotNodes: [...snapshotPods.map(pod => pod.address)],
        snapshots: [],
      };
    }

    const snapshotPods = selectRandom(pods.filter(pod => pod.podType === PodType.PARTNER_POD), numSnapshotPods);
    snapshotMap[getGenesisAddress()] = {
      snapshotNodes: [...snapshotPods.map(pod => pod.address)],
      snapshots: [],
    };

    new LogEvent(
      '',
      '',
      '',
      EventType.TEST_START,
      LogLevel.SILLY,
    );
    io.emit('message', sendTestConfig({ selectedPods, snapshotMap, testConfig }));
    res.send('Test Started!');
  });

  server.listen(port, () => {
    callback(server);
  });
};

// Used with `npm run start-cluster-local`. Does not work properly.
if (localCluster) {
  for (let i = 0; i < numRegular; i += 1) {
    info('Spawning Regular node...');
    spawn('npm.cmd', ['run', 'start-regular-local']);
  }
  for (let i = 0; i < numPartner; i += 1) {
    info('Spawning Partner node...');
    spawn('npm.cmd', ['run', 'start-partner-local']);
  }
}
else {
  initHttpServer(port, (server) => {
    const address = server.address() as AddressInfo;
    info(`[Node] New Node created on port: ${address.port}`);
    initWallet(address.port);
    initP2PServer(server);
    initP2PNode(server);
  });
}

export { initHttpServer, port };
