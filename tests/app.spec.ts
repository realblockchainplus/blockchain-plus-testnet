import 'mocha';
import * as dotenv from 'dotenv';

dotenv.config();

import { initHttpServer } from '../src/app';
const port = 4002;

initHttpServer(port);
