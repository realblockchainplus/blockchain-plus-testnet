import * as fs from 'fs';

import { createLogEvent, eventType, LogEvent } from './logEntry';
import { getLogger, getPodIndexByPublicKey, getPods, write, loopTest } from './p2p';
import { Transaction } from './transaction';
import { getEntryInLedgerByTransactionId } from './utils';

let ledgerLocation = ``;
const myLedgerFilename = 'my_ledger.json';
const witnessLedgerFilename = 'witness_ledger.json';

/**
 * Definition of a Ledger. There are two types of ledger:
 * * [[ledgerType.MY_LEDGER]]
 * * [[ledgerType.WITNESS_LEDGER]]
 */
class Ledger {
  public entries: Transaction[];
  public ledgerType: ledgerType;

  constructor(entries: Transaction[], ledgerType: ledgerType) {
    this.entries = entries;
    this.ledgerType = ledgerType;
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
enum ledgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1,
}

/**
 * Returns a copy of a [[Ledger]] based on the specified [[ledgerType]].
 */
const getLedger = (type: ledgerType): Ledger => {
  const ledgerFilename: string = type === ledgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
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
    fs.writeFileSync(`${ledgerLocation}/${myLedgerFilename}`, JSON.stringify(myLedger));
    fs.writeFileSync(`${ledgerLocation}/${witnessLedgerFilename}`, JSON.stringify(witnessLedger));
  }
};

/**
 * Updates a [[Ledger]] based on the specified [[ledgerType]].
 */
const updateLedger = (transaction: Transaction, type: ledgerType): void => {
  const _transaction = updateTransaction(transaction, type);
  const ledger: Ledger = getLedger(type);
  if (getEntryInLedgerByTransactionId(_transaction.id, ledger) === undefined) {
    if (ledger.entries.length > 0) {
      const pods = getPods();
      const localLogger = getLogger();
      const event = new LogEvent(
        pods[getPodIndexByPublicKey(transaction.from)],
        pods[getPodIndexByPublicKey(transaction.to)],
        eventType.TRANSACTION_END,
        'info'
      );
      event.transactionId = transaction.id;
      write(localLogger, createLogEvent(event));
    }
    if (ledger.entries.length > 1 && type === ledgerType.MY_LEDGER ) {
      ledger.entries.pop();
    }
    ledger.entries.push(_transaction);
    writeLedger(ledger, type);
  }
  else { console.log('Entry already exists. TEMPORARY CHECK.'); }
};

/**
 * Updates [[Transaction.amount]] based on the specified [[ledgerType]].
 * 
 * Used to set [[Transaction.amount]] to null if [[ledgerType.WITNESS_LEDGER]].
 */
const updateTransaction = (transaction: Transaction, type: ledgerType): Transaction => {
  const _transaction: Transaction = { ...transaction };
  _transaction.amount = type === ledgerType.MY_LEDGER ? _transaction.amount : null;
  console.log(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

const writeLedger = (ledger: Ledger, type: ledgerType): void => {
  const ledgerFilename = type === ledgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  console.log(`Ledger File Name: ${ledgerFilename}`);
  fs.writeFileSync(`${ledgerLocation}/${ledgerFilename}`, JSON.stringify(ledger));
  if (ledger.entries.length > 1 && type === ledgerType.MY_LEDGER) {
    console.log('Looping...');
    loopTest();
  }
};

const deleteEntry = (ledger: Ledger, type: ledgerType): void => {
};


export {
  Ledger, updateLedger, getLedger, ledgerType, initLedger,
};
