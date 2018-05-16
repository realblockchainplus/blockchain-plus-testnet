import { getLedger, Ledger, LedgerType } from './ledger';
import * as os from 'os';
import { Transaction } from './transaction';

const getCurrentTimestamp = (): number => {
  return new Date().getTime();
};

const getEntryByTransactionId = (transactionId: string, type: LedgerType): Transaction => {
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
      const { address, internal, family } = __interface;
      if (internal === false && address.substr(0, 7) === '192.168' && family === 'IPv4') {
        localIp += address;
      }
    }
  }
  return localIp;
};

const isValidAddress = (address: string): boolean => {
  if (address.length !== 130) {
    // console.log(`Invalid public key length. Expected 130, got: ${address.length}`);
  } else if (address.match('^[a-fA-F0-9]+$') === null) {
    // console.log('public key must contain only hex characters');
    return false;
  } else if (!address.startsWith('04')) {
    // console.log('public key must start with 04');
    return false;
  }
  return true;
};

const randomNumberFromRange = (min: number, max: number, floor = true): number => {
  const randomNumber = (Math.random() * (max - min)) + min;
  return floor ? Math.floor(randomNumber) : randomNumber;
};

const toHexString = (byteArray): string => {
  return Array.from(byteArray, (byte: any) => {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
};

export {
  getCurrentTimestamp, getEntryByTransactionId, getEntryInLedgerByTransactionId,
  getLocalIp, isValidAddress, randomNumberFromRange, toHexString,
};
