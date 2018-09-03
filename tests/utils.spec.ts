import 'mocha';

import { ec } from 'elliptic';
import * as chai from 'chai';
import * as chaiFs from 'chai-fs';

import { initLedger, Ledger, LedgerType, updateLedger } from '../src/ledger';
import { Pod, PodType } from '../src/pod';
import { Transaction } from '../src/transaction';
import { getCurrentTimestamp, getEntryByTransactionId, getPodIndexByPublicKey, toHexString, isValidAddress, randomNumberFromRange, createDummyTransaction, generateLedgerSnapshot } from '../src/utils';
import { getPrivateFromWallet } from '../src/wallet';

chai.use(chaiFs);
const { expect } = chai;

const EC = new ec('secp256k1');

describe('Get current timestamp', () => {
  it('should return a unix timestamp in milliseconds', () => {
    const result = getCurrentTimestamp();
    expect(result.toString().length).to.equal(13);
  });
});

describe('Create a dummy transaction', () => {
  it('should return a new transaction with empty fields', () => {
    const result = createDummyTransaction();
    expect(result).to.be.an.instanceof(Transaction);
    expect(result.from).length.to.equal(0);
    expect(result.to).length.to.equal(0);
    expect(result.id).length.to.equal(0);
    expect(result.amount).to.equal(0);
    expect(result.timestamp).to.equal(0);
  });
});

describe('Create a ledger snapshot', () => {
  it('shuld return an MD5 hash of a ledger', () => {
    const testTransaction = new Transaction('', '', 0, getCurrentTimestamp());
    const ledger = new Ledger([testTransaction], LedgerType.MY_LEDGER);
    const result = generateLedgerSnapshot(ledger);
    expect(result).length.to.equal(32);
  });

describe('Get entry using transaction id', () => {
  it('should return a transaction', () => {
    const testTransaction = new Transaction('', '', 0, getCurrentTimestamp());
    const ledger = new Ledger([testTransaction], LedgerType.MY_LEDGER);
    const result = getEntryByTransactionId(testTransaction.id, '', ledger);
    expect(result).to.be.an.instanceof(Transaction);
  })

  it('should return a transaction', () => {
    initLedger(80);
    const testTransaction = new Transaction('', '', 0, getCurrentTimestamp());
    updateLedger(testTransaction, LedgerType.MY_LEDGER);
    const result = getEntryByTransactionId(testTransaction.id, '', undefined, LedgerType.MY_LEDGER);
    expect(result).to.be.an.instanceof(Transaction);
  })

  it('should return undefined', () => {
    const testTransaction = new Transaction('', '', 0, getCurrentTimestamp());
    const ledger = new Ledger([testTransaction], LedgerType.MY_LEDGER);
    const result = getEntryByTransactionId('abcd', '', ledger);
    expect(result).to.be.an('undefined');
  })
});

describe('Get pod index using a public key', () => {
  it('should return an inbounds index', () => {
    const pods: Pod[] = [];
    const pod = new Pod(PodType.REGULAR_POD, 80);
    pods.push(pod);
    const result = getPodIndexByPublicKey(pod.address, pods);
    expect(result).to.be.greaterThan(-1);
  })

  it('should return -1', () => {
    const pods: Pod[] = [];
    const pod = new Pod(PodType.REGULAR_POD, 80);
    pods.push(pod);
    const result = getPodIndexByPublicKey('abcd', pods);
    expect(result).to.equal(-1);
  })
});

describe('Check if an address is valid', () => {
  it('should return false', () => {
    const result = isValidAddress('abcd');
    expect(result).to.equal(false);
  });

  it('should return true', () => {
    const result = isValidAddress('04bfcab8722991ae774db48f934ca79cfb7dd991229153b9f732ba5334aafcd8e7266e47076996b55a14bf9913ee3145ce0cfc1372ada8ada74bd287450313534a');
    expect(result).to.equal(true);
  });
});

describe('Returns a random number from a defined range', () => {
  it('should return a number between 1 and 10', () => {
    const result = randomNumberFromRange(1, 10);
    expect(result).to.be.lessThan(10).and.greaterThan(1);
  });
});

describe('Create a hex string from a byte array', () => {
  const key = EC.keyFromPrivate(getPrivateFromWallet(), 'hex');
  const result = toHexString(key.sign(this.id).toDER());
  it('should return a 16 string', () => {
    expect(result.length).to.equal(16);
  });

  it('should return a valid hex string', () => {
    const isValidHexString = parseInt(result, 16).toString() === result.toLowerCase();
    expect(isValidHexString).to.be.true;
  });
})

