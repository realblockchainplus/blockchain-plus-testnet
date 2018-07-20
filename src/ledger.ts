import * as fs from 'fs';

import { EventType, LogEvent } from './logEvent';
import { loopTest } from './p2p';
import { Transaction } from './transaction';
import { getEntryInLedgerByTransactionId, createDummyTransaction } from './utils';
import { info, debug } from './logger';
import { getPublicFromWallet } from './wallet';

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
    debug('Ledger location does not exist... creating ledger directory.');
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
  info(`[updateLedger]`);
  const _transaction = updateTransaction(transaction, type);
  info(`[updateLedger] init _transaction`);
  const ledger: Ledger = getLocalLedger(type);
  info(`[updateLedger] get ledger`);
  // debug(getEntryInLedgerByTransactionId(_transaction.id, ledger));
  if (getEntryInLedgerByTransactionId(_transaction.id, ledger) === undefined) {
    info(`[updateLedger] before write ledger`);
    ledger.entries.push(_transaction);
    writeLedger(ledger, type);
  }
  else {
    debug('Entry already exists. TEMPORARY CHECK.');
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
  info(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

/**
 * Writes to the ledger specified by [[LedgerType]].
 */
const writeLedger = (ledger: Ledger, type: LedgerType, test: boolean = false): void => {
  info(`[writeLedger]`);
  const ledgerFilename = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  debug(`Ledger File Name: ${ledgerFilename}`);
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
  if (type === LedgerType.MY_LEDGER) {
    debug('Looping...');
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

const getLedgerBalance = (ledger: Ledger, publicKey?: string): number => {
  const walletAddress = publicKey || getPublicFromWallet();
  let ledgerBalance = 0;
  for (let i = 0; i < ledger.entries.length; i += 1) {
    const entry = ledger.entries[i];
    // console.dir(entry);
    // console.log(entry.to, publicKey);
    if (entry.to == walletAddress) {
      // console.log(`Address matches publicKey. Adding ${entry.amount} to currentHoldings.`);
      ledgerBalance += entry.amount;
    }
    if (entry.from == walletAddress) {
      // console.log(`From matches publicKey. Removing ${entry.amount} from currentHoldings.`);
      ledgerBalance -= entry.amount;
    }
  }
  return ledgerBalance;
};

export {
  Ledger, updateLedger, getLedger, getLedgerBalance, getLocalLedger, LedgerType, initLedger,
};
