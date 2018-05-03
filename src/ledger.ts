import { Block } from './block';
import * as fs from 'fs';
import { Transaction } from './transaction';

let ledgerLocation = ``;
let myLedgerFilename = 'my_ledger.json';
let witnessLedgerFilename = 'witness_ledger.json';

class Ledger {
  public entries: Transaction[];
  public ledgerType: ledgerType;
};

enum ledgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1
};

const initLedger = (port: number) => {
  const myLedger = {
    "entries": [],
    "type": 0
  };
  const witnessLedger = {
    "entries": [],
    "type": 1
  };
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
  const _ledger = { ...ledger };
  _ledger.entries.push(_transaction);
  writeLedger(_ledger, type);
};

const updateTransaction = (transaction: Transaction, type: ledgerType): Transaction => {
  const _transaction = { ...transaction };
  _transaction.amount = type === ledgerType.MY_LEDGER ? _transaction.amount : null;
  console.log(`Updated transaction amount based on ledger type. Ledger Type: ${type}, Amount: ${_transaction.amount}.`);
  return _transaction;
};

const getLedger = (type: ledgerType): Ledger => {
  const ledgerFilename = type === ledgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  const ledger: Ledger = JSON.parse(fs.readFileSync(`${ledgerLocation}/${ledgerFilename}`, 'utf-8'));
  return ledger;
};

const writeLedger = (ledger: Ledger, type: ledgerType): void => {
  const ledgerFilename = type === ledgerType.MY_LEDGER ? myLedgerFilename : witnessLedgerFilename;
  console.log(`Ledger File Name: ${ledgerFilename}`);
  fs.writeFileSync(`${ledgerLocation}/${ledgerFilename}`, JSON.stringify(ledger));
}

const getEntryByTransactionId = (transactionId: string, type: ledgerType): Transaction => {
  const { entries }: { entries: Transaction[] } = getLedger(type);
  let index = null;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (transactionId === entry.id) {
      index = i;
    }
  }
  return entries[index];
};

const getEntryInLedgerByTransactionId = (transactionId: string, ledger: Ledger): Transaction => {
  const { entries }: { entries: Transaction[] } = ledger;
  let index = null;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (transactionId === entry.id) {
      index = i;
    }
  }
  return entries[index];
};

export {
  Ledger, updateLedger, getLedger, ledgerType,
  getEntryByTransactionId, getEntryInLedgerByTransactionId, initLedger
}