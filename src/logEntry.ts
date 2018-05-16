import * as winston from 'winston';

import { Message, MessageType } from './p2p';
import { Pod } from './pod';
import { TestConfig } from './testConfig';

class LogEvent {
  public podOne: Pod;
  public podTwo: Pod;
  public description: string;
  public type: EventType;
  public timestamp: number;
  public transactionId: string;
  public logLevel: winston.NPMLoggingLevel;
  public testConfig: TestConfig;

  constructor(podOne: Pod, podTwo: Pod, transactionId: string, type: EventType, logLevel: winston.NPMLoggingLevel, testConfig?: TestConfig) {
    this.podOne = podOne;
    this.podTwo = podTwo;
    this.transactionId = transactionId;
    this.type = type;
    this.logLevel = logLevel;
    this.testConfig = testConfig;
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
}

const createLogEvent = (event: LogEvent): Message => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

const eventToString = (event: LogEvent): string => {
  let result = '';
  switch (event.type) {
    case EventType.POD_JOINED:
      result = podStatusString(event);
      break;
    case EventType.POD_LEFT:
      result = podStatusString(event);
      break;
    case EventType.TEST_START:
      result = testStatusString(event);
      break;
    case EventType.TEST_END:
      result = testStatusString(event);
      break;
    case EventType.TRANSACTION_START:
      result = transactionStatusString(event);
      break;
    case EventType.TRANSACTION_END:
      result = transactionStatusString(event);
      break;
    case EventType.REQUEST_VALIDATION_START:
      result = requestValidationStatusString(event);
      break;
    case EventType.REQUEST_VALIDATION_END:
      result = requestValidationStatusString(event);
      break;
    case EventType.CONNECT_TO_VALIDATOR_START:
      result = connectToValidatorStatusString(event);
      break;
    case EventType.CONNECT_TO_VALIDATOR_END:
      result = connectToValidatorStatusString(event);
      break;
    case EventType.CONNECT_TO_PREVIOUS_VALIDATOR_START:
      result = connectToPreviousValidatorStatusString(event);
      break;
    case EventType.CONNECT_TO_PREVIOUS_VALIDATOR_END:
      result = connectToPreviousValidatorStatusString(event);
      break;
    default:
      break;
  }
  return result;
};

const podStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Pod IP: ${event.podOne.ip}`
);

const testStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Duration: ${event.testConfig.duration}, NumSenders: ${event.testConfig.numSenders}, Local: ${event.testConfig.local}, MaxLedgerLength: ${event.testConfig.maxLedgerLength}`
);

const transactionStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Transaction ID: ${event.transactionId}`
);

const requestValidationStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Transaction ID: ${event.transactionId}, Pod IP: ${event.podTwo.ip}:${event.podTwo.port}`
);

const connectToValidatorStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Transaction ID: ${event.transactionId}, Pod IP: ${event.podTwo.ip}:${event.podTwo.port}`
);

const connectToPreviousValidatorStatusString = (event: LogEvent): string => (
  `Type: ${event.type}, Transaction ID: ${event.transactionId}, Pod IP: ${event.podTwo.ip}:${event.podTwo.port}`
);

export {
  LogEvent, EventType, createLogEvent, eventToString,
};
