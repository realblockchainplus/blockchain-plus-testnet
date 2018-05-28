import * as winston from 'winston';

import { Message, MessageType } from './message';
import { Pod } from './pod';
import { TestConfig } from './testConfig';
import { getPublicFromWallet } from './wallet';
import { getPods, getPodIndexByPublicKey } from './p2p';

class LogEvent {
  public sender: Pod;
  public receiver: Pod;
  public description: string;
  public eventType: EventType;
  public timestamp: string;
  public messageType: MessageType;
  public transactionId: string;
  public logLevel: winston.NPMLoggingLevel;
  public owner: Pod;
  public testConfig?: TestConfig;
  public ledgerLength?: number;
  public validator?: Pod;
  public connectionTo?: Pod;

  constructor(sender: Pod, receiver: Pod, transactionId: string, eventType: EventType,
    logLevel: winston.NPMLoggingLevel, validator?: Pod, connectionTo?: Pod,
    testConfig?: TestConfig, ledgerLength?: number) {
    this.sender = sender;
    this.receiver = receiver;
    this.owner = getPods()[getPodIndexByPublicKey(getPublicFromWallet())];
    this.transactionId = transactionId;
    this.eventType = eventType;
    this.logLevel = logLevel;
    this.testConfig = testConfig;
    this.ledgerLength = ledgerLength;
    this.validator = validator;
    this.connectionTo = connectionTo;
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
  CONNECT_TO_PREVIOUS_VALIDATOR_START = 11,
  CONNECT_TO_PREVIOUS_VALIDATOR_END = 12,
  GENERATE_SIGNATURE_START = 13,
  GENERATE_SIGNATURE_END = 14,
  GENERATE_TRANSACTION_ID_START = 15,
  GENERATE_TRANSACTION_ID_END = 16,
  WRITE_TO_LOGGER_START = 17,
  WRITE_TO_LOGGER_END = 18,
  SELECT_RANDOM_PODS_START = 19,
  SELECT_RANDOM_PODS_END = 20,
  VALIDATE_SIGNATURE_START = 21,
  VALIDATE_SIGNATURE_END = 22,
  GET_ENTRY_FROM_LEDGER_START = 23,
  GET_ENTRY_FROM_LEDGER_END = 24,
  VALIDATE_LEDGER_START = 25,
  VALIDATE_LEDGER_END = 26,
  GENERATE_TRANSACTION_HASH_START = 27,
  GENERATE_TRANSACTION_HASH_END = 28,
  WRITE_TO_MY_LEDGER_START = 29,
  WRITE_TO_MY_LEDGER_END = 30,
  WRITE_TO_WITNESS_LEDGER_START = 31,
  WRITE_TO_WITNESS_LEDGER_END = 32,
}

const createLogEventMsg = (event: LogEvent): Message => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

export {
  LogEvent, EventType, createLogEventMsg,
};
