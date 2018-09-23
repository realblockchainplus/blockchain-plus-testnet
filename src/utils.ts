import * as objectHash from 'object-hash';

import { getLocalLedger, Ledger, LedgerType } from './ledger';
import { EventType, LogEvent, LogLevel } from './logEvent';
import { ClientSocket, ServerSocket } from './p2p';
import { Pod } from './pod';
import { Transaction } from './transaction';

/**
 * Returns a timestamp in milliseconds of the current time.
 */
const getCurrentTimestamp = (): number => {
  return new Date().getTime();
};

/**
 * Finds and returns a transaction that matches the provided transaction ID.
 * If a ledger is not passed, the local ledgers will be used.
 *
 * @param transactionId  Id of transaction to find
 * @param currentTransactionId  Id of parent transaction for logging purposes
 * @param ledger  Ledger to search
 * @param type  Type of local ledger to search if ledger is not provided
 */
const getEntryByTransactionId = (transactionId: string, currentTransactionId: string, ledger?: Ledger, type?: LedgerType): Transaction | undefined => {
  if (ledger) {
    if (ledger.LedgerType === LedgerType.WITNESS_LEDGER) {
      new LogEvent(
        '',
        '',
        currentTransactionId,
        EventType.GET_ENTRY_FROM_LEDGER_START,
        LogLevel.SILLY,
      );
    }
    const { entries }: { entries: Transaction[] } = ledger;
    let index = -1;
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (entry.id === transactionId) {
        index = i;
        break;
      }
    }
    if (ledger.LedgerType === LedgerType.WITNESS_LEDGER) {
      new LogEvent(
        '',
        '',
        currentTransactionId,
        EventType.GET_ENTRY_FROM_LEDGER_END,
        LogLevel.SILLY,
      );
    }
    return entries[index];
  }
  if (type) {
    if (type === LedgerType.WITNESS_LEDGER) {
      new LogEvent(
        '',
        '',
        currentTransactionId,
        EventType.GET_ENTRY_FROM_LEDGER_START,
        LogLevel.SILLY,
      );
    }
    const { entries } = getLocalLedger(type);
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
        LogLevel.SILLY,
      );
    }
    return entries[index];
  }
  return undefined;
};

/**
 * Returns 'localhost'
 */
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

/**
 * Finds and returns the index of a pod within a provided pod array with the provided public key.
 *
 * @param publicKey  Public key of the requested pod
 * @param _pods  Pod array to search
 */
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

/**
 * Finds and returns the index of a pod within a provided pod array that uses the specified socket.
 *
 * @param socket  Socket of the requested pod
 * @param _pods  Pod array to search
 */
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

/**
 * Checks if the provided address is a valid node address. A valid node address is a 130digit hex string.
 * @param address  Address to check.
 */
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

/**
 * Generates and returns a random number within a range. Can specify whether the number should be rounded down.
 * @param min  Minimum end of range
 * @param max  Maximum end of range
 * @param floor  Determines whether the returned number should be rounded down
 */
const randomNumberFromRange = (min: number, max: number, floor = true): number => {
  const randomNumber = (Math.random() * (max - min)) + min;
  return floor ? Math.floor(randomNumber) : randomNumber;
};

/**
 * Converts a byte array into a hex string
 * @param byteArray  Byte array to be converted
 */
const toHexString = (byteArray: any[]): string => {
  return Array.from(byteArray, (byte: any) => {
    // tslint:disable-next-line:prefer-template
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
};

/**
 * Creates a dummy transaction.
 */
const createDummyTransaction = (): Transaction => {
  const tx = new Transaction('', '', 0, 0);
  return tx;
};

/**
 * Generates a snapshot of the provided ledger
 * @param ledger  Ledger to generate a snapshot of
 */
const generateLedgerSnapshot = (ledger: Ledger) => {
  const hash = objectHash.MD5(ledger);
  return hash;
};

/**
 * Builds an ip string of the provided pod and whether the transaction is local
 * @param local  Is the transaction local
 * @param pod  Pod to grab ip from
 */
const getPodIp = (local: boolean, pod: Pod) => {
  return local ? `http://${pod.localIp}:${pod.port}` : `http://${pod.ip}`;
};

export {
  createDummyTransaction, getCurrentTimestamp, getEntryByTransactionId,
  getLocalIp, getPodIndexByPublicKey, getPodIndexBySocket,
  isValidAddress, randomNumberFromRange, toHexString, generateLedgerSnapshot, getPodIp,
};
