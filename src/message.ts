import { Ledger, LedgerType } from './ledger';
import { LogEvent } from './logEvent';
import { Pod } from './pod';
import { Result } from './result';
import { TestConfig } from './testConfig';
import { ISnapshotMap, Transaction } from './transaction';

/**
 *
 *
 * @interface IMessage
 */
interface IMessage {
  type: MessageType;
  data: any;
}

/**
 *
 *
 * @enum {number}
 */
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
  SNAPSHOT_REQUEST = 13,
  SNAPSHOT_RESULT = 14,
  SNAPSHOT_MAP_UPDATED = 15,
  LEDGER_REQUEST = 16,
  LEDGER_RESULT = 17,
}

/**
 *
 *
 * @param {Result} result
 * @returns {IMessage}
 */
const responseIsTransactionHashValid = (result: Result): IMessage => ({
  type: MessageType.TRANSACTION_CONFIRMATION_RESULT,
  data: JSON.stringify(result),
});

/**
 *
 *
 * @param {Pod[]} pods
 * @returns {IMessage}
 */
const podListUpdated = (pods: Pod[]): IMessage => ({
  type: MessageType.POD_LIST_UPDATED,
  data: JSON.stringify(pods),
});

/**
 *
 *
 * @param {ISnapshotMap} snapshotMap
 * @returns {IMessage}
 */
const snapshotMapUpdated = (snapshotMap: ISnapshotMap): IMessage => ({
  type: MessageType.SNAPSHOT_MAP_UPDATED,
  data: JSON.stringify(snapshotMap),
});

/**
 *
 *
 * @returns {IMessage}
 */
const killMsg = (): IMessage => ({
  type: MessageType.KILL_SERVER_PROCESS,
  data: null,
});

/**
 *
 *
 * @param {{
 *   transactionId: string,
 *   currentTransactionId: string,
 *   hash: string,
 * }} transactionData
 * @returns {IMessage}
 */
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

/**
 *
 *
 * @param {{
 *   snapshotOwner: string,
 *   transactionId: string,
 * }} data
 * @returns {IMessage}
 */
const requestSnapshotMsg = (data: {
  snapshotOwner: string,
  transactionId: string,
}): IMessage => {
  return {
    type: MessageType.SNAPSHOT_REQUEST,
    data: JSON.stringify(data),
  };
};

/**
 *
 *
 * @param {{
 *   transactionId: string,
 *   ledgerType: LedgerType,
 * }} data
 * @returns {IMessage}
 */
const requestLedgerMsg = (data: {
  transactionId: string,
  ledgerType: LedgerType,
}): IMessage => {
  return {
    type: MessageType.LEDGER_REQUEST,
    data: JSON.stringify(data),
  };
};

/**
 *
 *
 * @param {{
 *   transactionId: string,
 *   ledger: Ledger,
 * }} data
 * @returns {IMessage}
 */
const responseLedgerMsg = (data: {
  transactionId: string,
  ledger: Ledger,
}): IMessage => {
  return {
    type: MessageType.LEDGER_RESULT,
    data: JSON.stringify(data),
  };
};

/**
 *
 *
 * @param {{
 *   snapshotOwner: string,
 *   transactionId: string,
 *   snapshot: string,
 * }} data
 * @returns {IMessage}
 */
const responseSnapshotMsg = (data: {
  snapshotOwner: string,
  transactionId: string,
  snapshot: string,
}): IMessage => {
  return {
    type: MessageType.SNAPSHOT_RESULT,
    data: JSON.stringify(data),
  };
};

/**
 *
 *
 * @param {Result[]} results
 * @param {Transaction} transaction
 * @returns {IMessage}
 */
const responseIsTransactionValid = (results: Result[], transaction: Transaction): IMessage => {
  return {
    type: MessageType.VALIDATION_RESULT,
    data: JSON.stringify({ results, transaction }),
  };
};

/**
 *
 *
 * @param {Pod} pod
 * @returns {IMessage}
 */
const responseIdentityMsg = (pod: Pod): IMessage => {
  return {
    type: MessageType.RESPONSE_IDENTITY,
    data: JSON.stringify(pod),
  };
};

/**
 *
 *
 * @param {{
 *   transaction: Transaction,
 *   senderLedger: Ledger,
 * }} transactionData
 * @returns {IMessage}
 */
const isTransactionValid = (transactionData: {
  transaction: Transaction,
  senderLedger: Ledger,
}): IMessage => {
  return {
    type: MessageType.SELECTED_FOR_VALIDATION,
    data: JSON.stringify(transactionData),
  };
};

/**
 *
 *
 * @param {{
 *   selectedPods: Pod[],
 *   snapshotMap: ISnapshotMap,
 *   testConfig: TestConfig,
 * }} testConfig
 * @returns {IMessage}
 */
const sendTestConfig = (testConfig: {
  selectedPods: Pod[],
  snapshotMap: ISnapshotMap,
  testConfig: TestConfig,
}): IMessage => ({
  type: MessageType.TEST_CONFIG,
  data: JSON.stringify(testConfig),
});

/**
 *
 *
 * @returns {IMessage}
 */
const wipeLedgersMsg = (): IMessage => ({
  type: MessageType.WIPE_LEDGER,
  data: null,
});

/**
 *
 *
 * @returns {IMessage}
 */
const testStartMsg = (): IMessage => ({
  type: MessageType.TEST_START,
  data: null,
});

/**
 *
 *
 * @param {LogEvent} event
 * @returns {IMessage}
 */
const logEventMsg = (event: LogEvent): IMessage => ({
  type: MessageType.LOG_EVENT,
  data: JSON.stringify(event),
});

export {
  IMessage, MessageType, isTransactionHashValid, isTransactionValid, killMsg,
  podListUpdated, responseIdentityMsg, responseIsTransactionHashValid,
  responseIsTransactionValid, sendTestConfig, wipeLedgersMsg, testStartMsg,
  logEventMsg, requestSnapshotMsg, responseSnapshotMsg, snapshotMapUpdated,
  requestLedgerMsg, responseLedgerMsg,
};
