import { Pod, createPod, podType } from './pod';
import { Message, MessageType } from './p2p';

class LogEvent {
  public podOne: Pod;
  public podTwo: Pod;
  public description: string;
  public timestamp: number;
  constructor(podOne: Pod, podTwo: Pod, description: string) {
    this.podOne = podOne;
    this.podTwo = podTwo;
    this.description = description;
    this.timestamp = Math.round(new Date().getTime() / 1000);
  }
}

enum eventType {
  POD_JOINED = 1,
  POD_LEFT = 2,
  TEST_START = 3,
  TEST_END = 4,  
  TRANSACTION_START = 5,
  TRANSACTION_END = 6
};

const createLogEvent = (event: LogEvent): Message => ({
  'type': MessageType.LOG_EVENT,
  'data': event
});

export {
  LogEvent, eventType, createLogEvent
}