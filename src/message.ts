import { Ledger } from './ledger';
import { Pod } from './pod';
import { Transaction } from './transaction';
import { TestConfig } from './testConfig';

class Message {
  public type: MessageType;
  public data: any;
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
}

interface IResult {
  res: boolean;
  reason: string;
  id: string;
}

const responseIsTransactionHashValid = (result: IResult): Message => ({
  type: MessageType.TRANSACTION_CONFIRMATION_RESULT,
  data: JSON.stringify(result),
});

const podListUpdated = (pods: Pod[]): Message => ({
  type: MessageType.POD_LIST_UPDATED,
  data: JSON.stringify(pods),
});

const killMsg = (): Message => ({
  type: MessageType.KILL_SERVER_PROCESS,
  data: null,
});

const isTransactionHashValid = (transactionData: {
  transactionId: string,
  hash: string,
}): Message => ({
  type: MessageType.TRANSACTION_CONFIRMATION_REQUEST,
  data: JSON.stringify(transactionData),
});

const responseIsTransactionValid = (result: IResult, transaction: Transaction): Message => {
  return {
    type: MessageType.VALIDATION_RESULT,
    data: JSON.stringify({ result, transaction }),
  };
};

const responseIdentityMsg = (pod: Pod): Message => ({
  type: MessageType.RESPONSE_IDENTITY,
  data: JSON.stringify(pod),
});

const isTransactionValid = (transactionData: {
  transaction: Transaction,
  senderLedger: Ledger,
}): Message => {
  return {
    type: MessageType.SELECTED_FOR_VALIDATION,
    data: JSON.stringify(transactionData),
  };
};

const sendTestConfig = (testConfig: {
  selectedPods: Pod[],
  testConfig: TestConfig,
}): Message => ({
  type: MessageType.TEST_CONFIG,
  data: JSON.stringify(testConfig),
});

const wipeLedgersMsg = (): Message => ({
  type: MessageType.WIPE_LEDGER,
  data: null,
});

export {
  Message, MessageType, IResult, isTransactionHashValid, isTransactionValid, killMsg,
  podListUpdated, responseIdentityMsg, responseIsTransactionHashValid,
  responseIsTransactionValid, sendTestConfig, wipeLedgersMsg,
};
