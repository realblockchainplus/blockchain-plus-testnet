import { Ledger } from './ledger';
import { Pod } from './pod';
import { Result } from './result';
import { Transaction, ISnapshotMap } from './transaction';
import { TestConfig } from './testConfig';
import { LogEvent } from './logEvent';

interface IMessage {
  type: MessageType;
  data: any;
}

enum MessageType {
  SELECTED_FOR_VALIDATION = 1,
  RESPONSE_IDENTITY = 2,
  VALIDATION_RESULT = 3,
  POD_LIST_UPDATED = 4,
  KILL_SERVER_PROCESS = 5,
  TRANSACTION_CONFIRMATION_REQUEST = 6,
  TRANSACTION_CONFIRMATION_RESULT = 7,
  LOG_EVENT = 8,
  TEST_CONFIG = 9,
  WIPE_LEDGER = 10,
  TEST_START = 11,
  LOGGER_READY = 12,
  SNAPSHOT_VALIDATION_REQUEST = 13,
  SNAPSHOT_VALIDATION_RESULT = 14,
  SNAPSHOT_MAP_UPDATED = 15,
}

const responseIsTransactionHashValid = (result: Result): IMessage => ({
  type: MessageType.TRANSACTION_CONFIRMATION_RESULT,
  data: JSON.stringify(result),
});

const podListUpdated = (pods: Pod[]): IMessage => ({
  type: MessageType.POD_LIST_UPDATED,
  data: JSON.stringify(pods),
});

const snapshotMapUpdated = (data: {
  snapshotMap: ISnapshotMap,
  targets: string[],
}): IMessage => ({
  type: MessageType.SNAPSHOT_MAP_UPDATED,
  data: JSON.stringify(data),
});

const killMsg = (): IMessage => ({
  type: MessageType.KILL_SERVER_PROCESS,
  data: null,
});

const isTransactionHashValid = (transactionData: {
  transactionId: string,
  currentTransactionId: string,
  hash: string,
}): IMessage => {
  return {
    type: MessageType.TRANSACTION_CONFIRMATION_REQUEST,
    data: JSON.stringify(transactionData),
  };
};

const isSnapshotHashValid = (transactionData: {
  snapshot: string,
  sender: string,
  transactionId: string,
}): IMessage => {
  return {
    type: MessageType.SNAPSHOT_VALIDATION_REQUEST,
    data: JSON.stringify(transactionData),
  };
};

const responseIsSnapshotValid = (result: Result): IMessage => {
  return {
    type: MessageType.SNAPSHOT_VALIDATION_RESULT,
    data: JSON.stringify(result),
  };
};

const responseIsTransactionValid = (results: Result[], transaction: Transaction): IMessage => {
  return {
    type: MessageType.VALIDATION_RESULT,
    data: JSON.stringify({ results, transaction }),
  };
};

const responseIdentityMsg = (pod: Pod): IMessage => {
  return {
    type: MessageType.RESPONSE_IDENTITY,
    data: JSON.stringify(pod),
  };
};

const isTransactionValid = (transactionData: {
  transaction: Transaction,
  senderLedger: Ledger,
}): IMessage => {
  return {
    type: MessageType.SELECTED_FOR_VALIDATION,
    data: JSON.stringify(transactionData),
  };
};

const sendTestConfig = (testConfig: {
  selectedPods: Pod[],
  snapshotMap: ISnapshotMap,
  testConfig: TestConfig,
}): IMessage => ({
  type: MessageType.TEST_CONFIG,
  data: JSON.stringify(testConfig),
});

const wipeLedgersMsg = (): IMessage => ({
  type: MessageType.WIPE_LEDGER,
  data: null,
});

const testStartMsg = (): IMessage => ({
  type: MessageType.TEST_START,
  data: null,
});

const logEventMsg = (event: LogEvent): IMessage => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

export {
  IMessage, MessageType, isTransactionHashValid, isTransactionValid, killMsg,
  podListUpdated, responseIdentityMsg, responseIsTransactionHashValid,
  responseIsTransactionValid, sendTestConfig, wipeLedgersMsg, testStartMsg,
  logEventMsg, isSnapshotHashValid, responseIsSnapshotValid, snapshotMapUpdated,
};
