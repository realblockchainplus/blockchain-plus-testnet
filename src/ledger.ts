import * as fs from 'fs';

import { createLogEvent, EventType, LogEvent } from './logEntry';
import { getLogger, getPodIndexByPublicKey, getPods, loopTest, write, getTestConfig } from './p2p';
import { Transaction } from './transaction';
import { getEntryInLedgerByTransactionId } from './utils';

let ledgerLocation = ``;
const myLedgerFilename = 'my_ledger.json';
const witnessLedgerFilename = 'witness_ledger.json';

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
 * Returns a copy of a [[Ledger]] based on the specified [[LedgerType]].
 */
const getLedger = (type: LedgerType): Ledger => {
  const ledgerFilename: string = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  const ledger: Ledger = JSON.parse(fs.readFileSync(`${ledgerLocation}/${ledgerFilename}`, 'utf-8'));
  return ledger;
};

/**
 * Initializes the ledger folder and files.
 */
const initLedger = (port: number): void => {
  const myLedger = new Ledger([], 0);
  const witnessLedger = new Ledger([], 1);
  ledgerLocation += `node/ledger-${port}`;
  if (!fs.existsSync(ledgerLocation)) {
    fs.mkdirSync(ledgerLocation);
  }
  fs.writeFileSync(`${ledgerLocation}/${myLedgerFilename}`, JSON.stringify(myLedger));
  fs.writeFileSync(`${ledgerLocation}/${witnessLedgerFilename}`, JSON.stringify(witnessLedger));
};

/**
 * Updates a [[Ledger]] based on the specified [[LedgerType]].
 */
const updateLedger = (transaction: Transaction, type: LedgerType): void => {
  const localTestConfig = getTestConfig();
  const maxLedgerLength = localTestConfig.maxLedgerLength || 1;
  const _transaction = updateTransaction(transaction, type);
  const ledger: Ledger = getLedger(type);
  // console.log(getEntryInLedgerByTransactionId(_transaction.id, ledger));
  if (getEntryInLedgerByTransactionId(_transaction.id, ledger) === undefined) {
    if (ledger.entries.length > maxLedgerLength && type === LedgerType.MY_LEDGER) {
      ledger.entries.pop();
    }
    ledger.entries.push(_transaction);
    writeLedger(ledger, type);
  }
  else {
    if (type === LedgerType.MY_LEDGER) { loopTest(); }
    // console.log('Entry already exists. TEMPORARY CHECK.');
  }
};

/**
 * Updates [[Transaction.amount]] based on the specified [[LedgerType]].
 * 
 * Used to set [[Transaction.amount]] to null if [[LedgerType.WITNESS_LEDGER]].
 */
const updateTransaction = (transaction: Transaction, type: LedgerType): Transaction => {
  const _transaction: Transaction = { ...transaction };
  _transaction.amount = type === LedgerType.MY_LEDGER ? _transaction.amount : null;
  // console.log(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

/**
 * Writes to the ledger specified by [[LedgerType]].
 */
const writeLedger = (ledger: Ledger, type: LedgerType, test: boolean = false): void => {
  const ledgerFilename = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  // console.log(`Ledger File Name: ${ledgerFilename}`);
  fs.writeFileSync(`${ledgerLocation}/${ledgerFilename}`, JSON.stringify(ledger));
  if (ledger.entries.length > 1 && type === LedgerType.MY_LEDGER) {
    // console.log('Looping...');
    const transaction = ledger.entries[1];
    const pods = getPods();
    const localLogger = getLogger();
    const event = new LogEvent(
      pods[getPodIndexByPublicKey(transaction.from)],
      pods[getPodIndexByPublicKey(transaction.to)],
      transaction.id,
      EventType.TRANSACTION_END,
      'info',
    );
    console.timeEnd('transaction');
    write(localLogger, createLogEvent(event));
    loopTest();
  }
};

const deleteEntry = (ledger: Ledger, type: LedgerType): void => {
};


export {
  Ledger, updateLedger, getLedger, LedgerType, initLedger,
};
