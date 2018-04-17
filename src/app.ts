import * as bodyParser from 'body-parser';
import * as express from 'express';
import * as _ from 'lodash';

const httpPort: number = parseInt(process.env.HTTP_PORT) || 3001;

const initHttpServer = (port: number) => {
  const app = express();
  app.use(bodyParser.json());

  app.use((err, req, res, next) => {
    if (err) {
      res.status(400).send(err.message);
    }
  });

  app.listen(port, () => {
    console.log(`[Node] Listening on port: ${port}`);
  });
};

initHttpServer(httpPort);