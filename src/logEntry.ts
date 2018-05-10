import * as winston from 'winston';

import { Pod, podType } from './pod';
import { Message, MessageType } from './p2p';
import { Transaction } from './transaction';

class LogEvent {
  public podOne: Pod;
  public podTwo: Pod;
  public description: string;
  public type: eventType;
  public timestamp: number;
  public transactionId: string;
  public logLevel: winston.NPMLoggingLevel;

  constructor(podOne: Pod, podTwo: Pod, type: eventType, logLevel: winston.NPMLoggingLevel) {
    this.podOne = podOne;
    this.podTwo = podTwo;
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
  WRITE_TO_MY_LEDGER = 11
}

const createLogEvent = (event: LogEvent): Message => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

const eventToString = (event: LogEvent): string => {
  let result = '';
  switch (event.type) {
    case eventType.POD_JOINED:
      result = podJoinedString(event);
      break;
    case eventType.POD_LEFT:
      result = podLeftString(event);
      break;
    case eventType.TEST_START:
      result = testStartString(event);
      break;
    case eventType.TEST_END:
      result = testEndString(event);
      break;
    case eventType.TRANSACTION_START:
      result = transactionStartString(event);
      break;
    case eventType.TRANSACTION_END:
      result = transactionEndString(event);
      break;
    case eventType.REQUEST_VALIDATION_START:
      result = requestValidationStartString(event);
      break;
    case eventType.REQUEST_VALIDATION_END:
      result = requestValidationEndString(event);
      break;
    case eventType.CONNECT_TO_VALIDATOR_START:
      result = connectToValidatorStartString(event);
      break;
    case eventType.CONNECT_TO_VALIDATOR_END:
      result = connectToValidatorEndString(event);
      break;
    default:
      break;
  }
  return result;
};

const podJoinedString = (event: LogEvent): string => (
  `${event.podOne.name} has joined the network.`
);

const podLeftString = (event: LogEvent): string => (
  `${event.podOne.name} has left the network.`
);

const testStartString = (event: LogEvent): string => (
  `Test has started.`
);

const testEndString = (event: LogEvent): string => (
  `Test has ended.`
);

const transactionStartString = (event: LogEvent): string => (
  `Transaction ID: ${event.transactionId} has started.`
);

const transactionEndString = (event: LogEvent): string => (
  `Transaction ID: ${event.transactionId} has been completed.`
);

const requestValidationStartString = (event: LogEvent): string => (
  `Validation Request sent to: ${event.podTwo.ip}:${event.podTwo.port}.`
);

const requestValidationEndString = (event: LogEvent): string => (
  `Validation Result received from: ${event.podTwo.ip}:${event.podTwo.port}.`
);

const connectToValidatorStartString = (event: LogEvent): string => (
  `Connecting to validator: ${event.podTwo.ip}:${event.podTwo.port}.`
);

const connectToValidatorEndString = (event: LogEvent): string => (
  `Connected to validator: ${event.podTwo.ip}:${event.podTwo.port}.`
);





export {
  LogEvent, eventType, createLogEvent, eventToString,
};
