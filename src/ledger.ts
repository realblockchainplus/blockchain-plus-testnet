import * as fs from 'fs';

import { EventType, LogEvent } from './logEvent';
import { loopTest, getTestConfig } from './p2p';
import { Transaction } from './transaction';
import { getEntryInLedgerByTransactionId, createDummyTransaction } from './utils';

let ledgerLocation = ``;
const myLedgerFilename = 'my_ledger.json';
const witnessLedgerFilename = 'witness_ledger.json';

let ledgers: { myLedger: Ledger, witnessLedger: Ledger };

/**
 * Definition of a Ledger. There are two types of ledger:
 * * [[LedgerType.MY_LEDGER]]
 * * [[LedgerType.WITNESS_LEDGER]]
 */
class Ledger {
  public entries: Transaction[];
  public LedgerType: LedgerType;

  constructor(entries: Transaction[], LedgerType: LedgerType) {
    this.entries = entries;
    this.LedgerType = LedgerType;
  }
}

/**
 * ## Ledger Types
 *
 * Every node stores a ledger of each type.
 *
 * Transactions where the node is either the Sender or Receiver are stored in [[MY_LEDGER]]. Transaction amount is stored.
 *
 * Transactions where the node is a witness are stored in [[WITNESS_LEDGER]]. Transaction amount is NOT stored.
 */
enum LedgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1,
}

/**
 * Returns a copy of a [[Ledger]] based on the specified [[LedgerType]] from the file system.
 */
const getLedger = (type: LedgerType): Ledger => {
  const ledgerFilename: string = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  const ledger: Ledger = JSON.parse(fs.readFileSync(`${ledgerLocation}/${ledgerFilename}`, 'utf-8'));
  return ledger;
};

/**
 * Returns a copy of a [[Ledger]] based on the specified [[LedgerType]] from the current memory.
 */
const getLocalLedger = (ledgerType: LedgerType): Ledger => ledgerType === LedgerType.MY_LEDGER ? ledgers.myLedger : ledgers.witnessLedger;

/**
 * Initializes the ledger folder and files.
 */
const initLedger = (port: number): void => {
  const myLedger = new Ledger([], 0);
  const witnessLedger = new Ledger([], 1);
  ledgerLocation = `node/ledger-${port}`;
  if (!fs.existsSync(ledgerLocation)) {
    fs.mkdirSync(ledgerLocation);
  }
  fs.writeFileSync(`${ledgerLocation}/${myLedgerFilename}`, JSON.stringify(myLedger));
  fs.writeFileSync(`${ledgerLocation}/${witnessLedgerFilename}`, JSON.stringify(witnessLedger));
  ledgers = { myLedger: getLedger(0), witnessLedger: getLedger(1) };
};

/**
 * Updates a [[Ledger]] based on the specified [[LedgerType]].
 */
const updateLedger = (transaction: Transaction, type: LedgerType): void => {
  const localTestConfig = getTestConfig();
  const maxLedgerLength = localTestConfig.maxLedgerLength || 1;
  const _transaction = updateTransaction(transaction, type);
  const ledger: Ledger = getLocalLedger(type);
  // console.log(getEntryInLedgerByTransactionId(_transaction.id, ledger));
  if (getEntryInLedgerByTransactionId(_transaction.id, ledger) === undefined) {
    if (ledger.entries.length > maxLedgerLength && type === LedgerType.MY_LEDGER) {
      ledger.entries.pop();
    }
    ledger.entries.push(_transaction);
    writeLedger(ledger, type);
  }
  else {
    // console.log('Entry already exists. TEMPORARY CHECK.');
    if (type === LedgerType.MY_LEDGER) { loopTest(); }
  }
};

/**
 * Updates [[Transaction.amount]] based on the specified [[LedgerType]].
 *
 * Used to set [[Transaction.amount]] to null if [[LedgerType.WITNESS_LEDGER]].
 */
const updateTransaction = (transaction: Transaction, type: LedgerType): Transaction => {
  const _transaction = createDummyTransaction();
  Object.assign(_transaction, transaction);
  _transaction.amount = type === LedgerType.MY_LEDGER ? _transaction.amount : 0;
  // console.log(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

/**
 * Writes to the ledger specified by [[LedgerType]].
 */
const writeLedger = (ledger: Ledger, type: LedgerType, test: boolean = false): void => {
  const ledgerFilename = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  // console.log(`Ledger File Name: ${ledgerFilename}`);
  const transaction = ledger.entries[ledger.entries.length - 1];
  const eventTypeStart = type === LedgerType.MY_LEDGER ? EventType.WRITE_TO_MY_LEDGER_START : EventType.WRITE_TO_WITNESS_LEDGER_START;
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    eventTypeStart,
    'silly',
  );
  fs.writeFileSync(`${ledgerLocation}/${ledgerFilename}`, JSON.stringify(ledger));
  const eventTypeEnd = type === LedgerType.MY_LEDGER ? EventType.WRITE_TO_MY_LEDGER_END : EventType.WRITE_TO_WITNESS_LEDGER_END;
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    eventTypeEnd,
    'silly',
  );
  if (ledger.entries.length > 1 && type === LedgerType.MY_LEDGER) {
    // console.log('Looping...');
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.TRANSACTION_END,
      'info',
    );
    // console.timeEnd('transaction');
    loopTest();
  }
};

export {
  Ledger, updateLedger, getLedger, getLocalLedger, LedgerType, initLedger,
};
