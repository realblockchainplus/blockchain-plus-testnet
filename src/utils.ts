import * as objectHash from 'object-hash';

import { getLocalLedger, Ledger, LedgerType } from './ledger';
// import * as os from 'os';
import { Transaction } from './transaction';
import { LogEvent, EventType } from './logEvent';
import { Pod } from './pod';
import { ClientSocket, ServerSocket } from './p2p';

const getCurrentTimestamp = (): number => {
  return new Date().getTime();
};

const getEntryByTransactionId = (transactionId: string, currentTransactionId: string, type: LedgerType): Transaction => {
  if (type === LedgerType.WITNESS_LEDGER) {
    new LogEvent(
      '',
      '',
      currentTransactionId,
      EventType.GET_ENTRY_FROM_LEDGER_START,
      'silly',
    );
  }
  const { entries }: { entries: Transaction[] } = getLocalLedger(type);
  let index = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.id === transactionId) {
      index = i;
      break;
    }
  }
  if (type === LedgerType.WITNESS_LEDGER) {
    new LogEvent(
      '',
      '',
      currentTransactionId,
      EventType.GET_ENTRY_FROM_LEDGER_END,
      'silly',
    );
  }
  return entries[index];
};

const getEntryInLedgerByTransactionId = (transactionId: string, ledger: Ledger): Transaction => {
  const { entries }: { entries: Transaction[] } = ledger;
  let index = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.id === transactionId) {
      index = i;
      break;
    }
  }
  return entries[index];
};

const getLocalIp = () => {
  // const interfaces = os.networkInterfaces();
  // const keys = Object.keys(interfaces);
  // let localIp = '';
  // for (let i = 0; i < keys.length; i += 1) {
  //   const key = keys[i];
  //   const _interfaces = interfaces[key];
  //   for (let k = 0; k < _interfaces.length; k += 1) {
  //     const __interface = _interfaces[k];
  //     const { address, internal, family } = __interface;
  //     if (internal === false && address.substr(0, 7) === '192.168' && family === 'IPv4') {
  //       localIp += address;
  //     }
  //   }
  // }
  // return localIp;
  return 'localhost';
};

const getPodIndexByPublicKey = (publicKey: string, _pods: Pod[]): number => {
  // console.time('getPodIndexByPublicKey');
  let index = -1;
  for (let i = 0; i < _pods.length; i += 1) {
    const pod = _pods[i];
    if (pod.address === publicKey) {
      index = i;
      break;
    }
  }
  // console.timeEnd('getPodIndexByPublicKey');
  return index;
};

const getPodIndexBySocket = (socket: ClientSocket | ServerSocket, _pods: Pod[]): number => {
  console.time('getPodIndexBySocket');
  let index = -1;
  for (let i = 0; i < _pods.length; i += 1) {
    const pod = _pods[i];
    if (pod.socketId === socket.id) {
      index = i;
      break;
    }
  }
  console.timeEnd('getPodIndexBySocket');
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

const generateSnapshot = (ledger: Ledger): string => {
  const hash = objectHash.MD5(ledger);
  return hash;
};

export {
  createDummyTransaction, generateSnapshot, getCurrentTimestamp, getEntryByTransactionId,
  getEntryInLedgerByTransactionId, getLocalIp, getPodIndexByPublicKey, getPodIndexBySocket,
  isValidAddress, randomNumberFromRange, toHexString,
};
