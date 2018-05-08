import * as fs from 'fs';

import { createLogEvent, eventType, LogEvent } from './logEntry';
import { getLogger, getPodIndexByPublicKey, getPods, write } from './p2p';
import { Transaction } from './transaction';
import { getEntryInLedgerByTransactionId } from './utils';

let ledgerLocation = ``;
const myLedgerFilename = 'my_ledger.json';
const witnessLedgerFilename = 'witness_ledger.json';

class Ledger {
  public entries: Transaction[];
  public ledgerType: ledgerType;

  constructor(entries: Transaction[], ledgerType: ledgerType) {
    this.entries = entries;
    this.ledgerType = ledgerType;
  }
}

enum ledgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1,
}

const getLedger = (type: ledgerType): Ledger => {
  const ledgerFilename: string = type === ledgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  const ledger: Ledger = JSON.parse(fs.readFileSync(`${ledgerLocation}/${ledgerFilename}`, 'utf-8'));
  return ledger;
};

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

const updateLedger = (transaction: Transaction, type: ledgerType): void => {
  const _transaction = updateTransaction(transaction, type);
  const ledger: Ledger = getLedger(type);
  if (getEntryInLedgerByTransactionId(_transaction.id, ledger) === undefined) {
    if (ledger.entries.length > 0) {
      const pods = getPods();
      const localLogger = getLogger();
      const event = new LogEvent(
        pods[getPodIndexByPublicKey(transaction.from)],
        pods[getPodIndexByPublicKey(transaction.address)],
        eventType.TRANSACTION_END,
      );
      write(localLogger, createLogEvent(event));
    }
    ledger.entries.push(_transaction);
    writeLedger(ledger, type);
  }
  else { console.log('Entry already exists. TEMPORARY CHECK.'); }
};

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
};

export {
  Ledger, updateLedger, getLedger, ledgerType, initLedger,
};
