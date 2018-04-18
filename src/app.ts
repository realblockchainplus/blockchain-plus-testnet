import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import * as kp from 'kill-port';
import { Block, getBlockchain, generateNextBlock } from './block';
import { getTransactionId, sendTransaction } from './transaction';
import { connectToPeers, getSockets, initP2PServer } from './p2p';

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;
const p2pPort: number = parseInt(process.env.P2P_PORT) || 6001;

const initHttpServer = (port: number) => {
  const app = express();
  app.use(bodyParser.json());

  app.use((err, req, res, next) => {
    if (err) {
      res.status(400).send(err.message);
    }
  });

  app.get('/blocks', (req, res) => {
    res.send(getBlockchain());
  });

  app.post('/mineBlock', (req, res) => {
      const newBlock: Block = generateNextBlock(req.body.data);
      res.send(newBlock);
  });

  app.get('/peers', (req, res) => {
      res.send(getSockets().map(( s: any ) => s._socket.remoteAddress + ':' + s._socket.remotePort));
  });

  app.post('/addPeer', (req, res) => {
      connectToPeers(req.body.peer);
      res.send();
  });

  app.listen(port, () => {
    console.log(`[Node] Listening on port: ${port}`);
  });
};

initHttpServer(httpPort);
initP2PServer(p2pPort);
