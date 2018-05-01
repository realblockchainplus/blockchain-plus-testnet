import { Block } from './block';
import * as d3f from 'd3-fetch';
import * as fs from 'fs';
import { Transaction } from './transaction';

const myLedgerLocation = 'node/ledger/my_ledger.json';
const witnessLedgerLocation = 'node/ledger/witness_ledger.json';

class Ledger {
  public entries: Transaction[];
  public ledgerType: ledgerType;
};

enum ledgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1
};

const updateLedger = (transaction: Transaction, type: ledgerType): void => {
  const ledgerLocation = type === ledgerType.MY_LEDGER ? myLedgerLocation : witnessLedgerLocation;
  const _transaction = updateTransaction(transaction, type);
  d3f.json(ledgerLocation).then((ledger: Ledger) => {
    const _ledger = { ...ledger };
    _ledger.entries.push(transaction);
    fs.writeFileSync(ledgerLocation, _ledger);
  });
};

const updateTransaction = (transaction: Transaction, type: ledgerType): Transaction => {
  const _transaction = { ...transaction };
  _transaction.amount = type === ledgerType.MY_LEDGER ? _transaction.amount : null;
  return _transaction;
};

const getLedger = (type: ledgerType): Ledger => {
  const ledgerLocation = type === ledgerType.MY_LEDGER ? myLedgerLocation : witnessLedgerLocation;
  const ledger: Ledger = JSON.parse(fs.readFileSync(ledgerLocation, 'utf-8'));
  return ledger;
};

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

export {
  Ledger, updateLedger, getLedger, ledgerType, getEntryByTransactionId
}