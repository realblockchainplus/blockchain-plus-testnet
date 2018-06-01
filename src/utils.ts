import { getLocalLedger, Ledger, LedgerType } from './ledger';
import * as os from 'os';
import { Transaction } from './transaction';
import { LogEvent, EventType } from './logEvent';
import { Pod } from './pod';
import { ClientSocket, ServerSocket } from './p2p';

const getCurrentTimestamp = (): number => {
  return new Date().getTime();
};

const getEntryByTransactionId = (transactionId: string, type: LedgerType): Transaction => {
  new LogEvent(
    '',
    '',
    transactionId,
    EventType.GET_ENTRY_FROM_LEDGER_START,
    'silly',
  );
  const { entries }: { entries: Transaction[] } = getLocalLedger(type);
  const index = entries.findIndex(entry => entry.id === transactionId);
  new LogEvent(
    '',
    '',
    transactionId,
    EventType.GET_ENTRY_FROM_LEDGER_END,
    'silly',
  );
  return entries[index];
};

const getEntryInLedgerByTransactionId = (transactionId: string, ledger: Ledger): Transaction => {
  const { entries }: { entries: Transaction[] } = ledger;
  new LogEvent(
    '',
    '',
    transactionId,
    EventType.GET_ENTRY_FROM_LEDGER_START,
    'silly',
  );
  const index = entries.findIndex(entry => entry.id === transactionId);
  new LogEvent(
    '',
    '',
    transactionId,
    EventType.GET_ENTRY_FROM_LEDGER_END,
    'silly',
  );
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

const getPodIndexByPublicKey = (publicKey: string, _pods: Pod[]): number => {
  const index = _pods.findIndex(_pod => _pod.address === publicKey);
  return index;
};

const getPodIndexBySocket = (socket: ClientSocket | ServerSocket, _pods: Pod[]): number => {
  const index = _pods.findIndex(_pod => _pod.socketId === socket.id);
  return index;
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

const toHexString = (byteArray: any[]): string => {
  return Array.from(byteArray, (byte: any) => {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
};

const createDummyTransaction = (): Transaction => {
  const tx = new Transaction('', '', 0, 0);
  return tx;
};

export {
  createDummyTransaction, getCurrentTimestamp, getEntryByTransactionId, 
  getEntryInLedgerByTransactionId, getLocalIp, getPodIndexByPublicKey, getPodIndexBySocket,
  isValidAddress, randomNumberFromRange, toHexString,
};
