import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';
import * as kp from 'kill-port';
import { Block, getBlockchain } from './block';
import { getTransactionId, sendTransaction } from './transaction';

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;

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

  app.post('/send', (req, res) => {
    const address = req.body.address;
    const amount = req.body.amount;

    const response = sendTransaction(address, amount);
    res.send(response);
  });

  app.listen(port, () => {
    console.log(`[Node] Listening on port: ${port}`);
  });
};

initHttpServer(httpPort);