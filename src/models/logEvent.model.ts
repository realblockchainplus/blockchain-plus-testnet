import * as mongoose from 'mongoose';

import { PodSchema } from './pod.model';
import { TestConfigSchema } from './testConfig.model';

const LogEventSchema = new mongoose.Schema({
  sender: PodSchema,
  receiver: PodSchema,
  eventType: Number,
  transactionId: String,
  logLevel: String,
  owner: PodSchema,
  timestamp: Number,
  testId: String,
  testConfig: TestConfigSchema,
  ledgerLength: Number,
  validator: PodSchema,
  connectionTo: PodSchema,
}, { validateBeforeSave: false });

export { LogEventSchema };
