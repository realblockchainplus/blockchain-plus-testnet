import * as fs from 'fs';

import { EventType, LogEvent, LogLevel } from './logEvent';
import { loopTest } from './p2p';
import { Transaction } from './transaction';
import { createDummyTransaction, getEntryByTransactionId } from './utils';
import { info, debug } from './logger';
import { getPublicFromWallet } from './wallet';

/** Base ledgerLocation string */
let ledgerLocation = ``;

/** Default filename for a personal ledger */
const myLedgerFilename = 'my_ledger.json';

/** Default filename for a witness ledger */
const witnessLedgerFilename = 'witness_ledger.json';

let ledgers: { myLedger: Ledger, witnessLedger: Ledger };

/**
 * Definition of a Ledger.
 */
class Ledger {
  /** Array of Transactions */
  public entries: Transaction[];

  /** Type of ledger */
  public LedgerType: LedgerType;

  /** Creates an instance of Ledger. */
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
 * Returns a copy of a Ledger based on the specified LedgerType from the file system.
 *
 * @param type  Type of ledger to return
 */
const getLedger = (type: LedgerType): Ledger => {
  const ledgerFilename: string = type === LedgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  const ledger: Ledger = JSON.parse(fs.readFileSync(`${ledgerLocation}/${ledgerFilename}`, 'utf-8'));
  return ledger;
};

/**
 * Returns a copy of a Ledger based on the specified LedgerType from the current memory.
 * @param type
 */
const getLocalLedger = (type: LedgerType): Ledger => type === LedgerType.MY_LEDGER ? ledgers.myLedger : ledgers.witnessLedger;

/**
 * Initializes the ledger folder and files.
 * @param port  The ledger is named after the port the node is running on. TEMP
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
 * Updates a Ledger based on the specified LedgerType.
 * @param transaction  Transaction that will be placed into the ledger entries
 * @param type  Ledger type to determine which ledger will be updated
 */
const updateLedger = (transaction: Transaction, type: LedgerType): void => {
  info(`[updateLedger]`);
  const _transaction = updateTransaction(transaction, type);
  info(`[updateLedger] init _transaction`);
  const ledger: Ledger = getLocalLedger(type);
  info(`[updateLedger] get ledger`);
  // debug(getEntryInLedgerByTransactionId(_transaction.id, ledger));
  if (getEntryByTransactionId(_transaction.id, '', ledger) === undefined) {
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
 * Updates the amount field in a transaction based on the specified LedgerType.
 * Used to set Transaction.amount to null if LedgerType === WITNESS_LEDGER
 * @param transaction  Transaction to be updated
 * @param type  Type of ledger to determine amount field
 */
const updateTransaction = (transaction: Transaction, type: LedgerType): Transaction => {
  const _transaction = createDummyTransaction();
  Object.assign(_transaction, transaction);
  _transaction.amount = type === LedgerType.MY_LEDGER ? _transaction.amount : 0;
  info(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

/**
 * Writes to the ledger specified by LedgerType.
 * @param ledger  Ledger to write to
 * @param type  Type of ledger, used to determine where to write the new ledger to
 */
const writeLedger = (ledger: Ledger, type: LedgerType): void => {
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
    LogLevel.SILLY,
  );
  fs.writeFileSync(`${ledgerLocation}/${ledgerFilename}`, JSON.stringify(ledger));
  const eventTypeEnd = type === LedgerType.MY_LEDGER ? EventType.WRITE_TO_MY_LEDGER_END : EventType.WRITE_TO_WITNESS_LEDGER_END;
  new LogEvent(
    transaction.from,
    transaction.to,
    transaction.id,
    eventTypeEnd,
    LogLevel.SILLY,
  );
  if (type === LedgerType.MY_LEDGER) {
    debug('Looping...');
    new LogEvent(
      transaction.from,
      transaction.to,
      transaction.id,
      EventType.TRANSACTION_END,
      LogLevel.INFO,
    );
    loopTest();
  }
};

/**
 * Returns the balance of a specified account
 *
 * @param ledger  Ledger to get balance from
 * @param publicKey  Key of account to check balance of -- Might be useless, ledger should always be a personal ledger anyway
 * @returns {number}
 */
const getLedgerBalance = (ledger: Ledger, publicKey?: string): number => {
  const walletAddress = publicKey || getPublicFromWallet();
  let ledgerBalance = 0;
  for (let i = 0; i < ledger.entries.length; i += 1) {
    const entry = ledger.entries[i];
    // console.dir(entry);
    // console.log(entry.to, publicKey);
    if (entry.to == walletAddress) {
      ledgerBalance += entry.amount;
    }
    if (entry.from == walletAddress) {
      ledgerBalance -= entry.amount;
    }
  }
  return ledgerBalance;
};

export {
  Ledger, updateLedger, getLedger, getLedgerBalance, getLocalLedger, LedgerType, initLedger,
};
