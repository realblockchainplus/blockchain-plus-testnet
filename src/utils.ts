import * as os from 'os';

import { getLedger, Ledger, ledgerType } from './ledger';
import { Transaction } from './transaction';

const getCurrentTimestamp = (): number => {
  return Math.round(new Date().getTime() / 1000);
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

const getLocalIp = () => {
  const interfaces = os.networkInterfaces();
  const keys = Object.keys(interfaces);
  let localIp = '';
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const _interfaces = interfaces[key];
    for (let k = 0; k < _interfaces.length; k += 1) {
      const __interface = _interfaces[k];
      console.dir(__interface);
      const { address, internal, family } = __interface;
      if (internal === false && address.substr(0, 7) === '192.168' && family === 'IPv4') {
        localIp += address;
      }
    }
  }
  return localIp;
};

const randomNumberFromRange = (min: number, max: number, round = true): number => {
  const randomNumber = (Math.random() * (max - min)) + min;
  return round ? Math.round(randomNumber) : randomNumber;
};

export {
  getCurrentTimestamp, getEntryByTransactionId,
  getEntryInLedgerByTransactionId, randomNumberFromRange,
};
