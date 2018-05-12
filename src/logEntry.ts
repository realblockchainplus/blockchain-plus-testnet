import * as winston from 'winston';

import { Pod, podType } from './pod';
import { Message, MessageType } from './p2p';

class LogEvent {
  public podOne: Pod;
  public podTwo: Pod;
  public description: string;
  public type: eventType;
  public timestamp: number;
  public transactionId: string;
  public logLevel: winston.NPMLoggingLevel;

  constructor(podOne: Pod, podTwo: Pod, transactionId: string, type: eventType, logLevel: winston.NPMLoggingLevel) {
    this.podOne = podOne;
    this.podTwo = podTwo;
    this.transactionId = transactionId;
    this.type = type;
    this.logLevel = logLevel;
    this.timestamp = Math.round(new Date().getTime() / 1000);
  }
}

enum eventType {
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
}

const createLogEvent = (event: LogEvent): Message => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

const eventToString = (event: LogEvent): string => {
  let result = '';
  switch (event.type) {
    case eventType.POD_JOINED:
      result = podStatusString(event);
      break;
    case eventType.POD_LEFT:
      result = podStatusString(event);
      break;
    case eventType.TEST_START:
      result = testStatusString(event);
      break;
    case eventType.TEST_END:
      result = testStatusString(event);
      break;
    case eventType.TRANSACTION_START:
      result = transactionStatusString(event);
      break;
    case eventType.TRANSACTION_END:
      result = transactionStatusString(event);
      break;
    case eventType.REQUEST_VALIDATION_START:
      result = requestValidationStatusString(event);
      break;
    case eventType.REQUEST_VALIDATION_END:
      result = requestValidationStatusString(event);
      break;
    case eventType.CONNECT_TO_VALIDATOR_START:
      result = connectToValidatorStatusString(event);
      break;
    case eventType.CONNECT_TO_VALIDATOR_END:
      result = connectToValidatorStatusString(event);
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
  `Type: ${event.type}`
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

export {
  LogEvent, eventType, createLogEvent, eventToString,
};
