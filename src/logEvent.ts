import * as winston from 'winston';

import { Message, MessageType } from './p2p';
import { Pod } from './pod';
import { TestConfig } from './testConfig';

class LogEvent {
  public podOne: Pod;
  public podTwo: Pod;
  public description: string;
  public type: EventType;
  public timestamp: string;
  public messageType: MessageType;
  public transactionId: string;
  public logLevel: winston.NPMLoggingLevel;
  public testConfig?: TestConfig;
  public ledgerLength?: number;

  constructor(podOne: Pod, podTwo: Pod, transactionId: string, type: EventType, logLevel: winston.NPMLoggingLevel, testConfig?: TestConfig, ledgerLength?: number) {
    this.podOne = podOne;
    this.podTwo = podTwo;
    this.transactionId = transactionId;
    this.type = type;
    this.logLevel = logLevel;
    this.testConfig = testConfig;
    this.ledgerLength = ledgerLength;
  }
}

enum EventType {
  POD_JOINED = 1,
  POD_LEFT = 2,
  TEST_START = 3,
  TEST_END = 4,
  TRANSACTION_START = 5,
  TRANSACTION_END = 6,
  REQUEST_VALIDATION_START = 7,
  REQUEST_VALIDATION_END = 8,
  CONNECT_TO_VALIDATOR_START = 9,
  CONNECT_TO_VALIDATOR_END = 10,
  WRITE_TO_MY_LEDGER = 11,
  CONNECT_TO_PREVIOUS_VALIDATOR_START = 12,
  CONNECT_TO_PREVIOUS_VALIDATOR_END = 13,
  GENERATE_SIGNATURE_START = 14,
  GENERATE_SIGNATURE_END = 15,
  GENERATE_TRANSACTION_ID_START = 16,
  GENERATE_TRANSACTION_ID_END = 17,
  WRITE_TO_LOGGER_START = 18,
  WRITE_TO_LOGGER_END = 19,
  SELECT_RANDOM_PODS_START = 20,
  SELECT_RANDOM_PODS_END = 21,
  VALIDATE_SIGNATURE_START = 22,
  VALIDATE_SIGNATURE_END = 23,
  GET_ENTRY_FROM_LEDGER_START = 24,
  GET_ENTRY_FROM_LEDGER_END = 25,
  VALIDATE_LEDGER_START = 26,
  VALIDATE_LEDGER_END = 27,
}

const createLogEventMsg = (event: LogEvent): Message => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

export {
  LogEvent, EventType, createLogEventMsg,
};
