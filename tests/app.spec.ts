import * as chai from 'chai';
import * as chaiFs from 'chai-fs';
import 'mocha';
import * as dotenv from 'dotenv';

dotenv.config();

import { initHttpServer } from '../src/app';
const port = 4001;

initHttpServer(port);
