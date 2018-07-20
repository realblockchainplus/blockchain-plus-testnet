import { getPublicFromWallet } from '../src/wallet';
import * as chai from 'chai';
import * as chaiFs from 'chai-fs';
import 'mocha';
import { getLedgerBalance, getLedger, LedgerType } from '../src/ledger';

chai.use(chaiFs);
const { expect } = chai;

describe('Wallet exists', () => {
  it('should return a 130 length hex string', () => {
    const result = getPublicFromWallet();
    expect(result.length).to.equal(130);
  });
});
