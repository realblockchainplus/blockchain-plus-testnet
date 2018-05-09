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

  constructor(podOne: Pod, podTwo: Pod, type: eventType) {
    this.podOne = podOne;
    this.podTwo = podTwo;
    this.type = type;
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

export {
  LogEvent, eventType, createLogEvent, eventToString,
};
