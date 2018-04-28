import { Block } from './block';
import { Transaction, TxOut, TxIn } from './transaction';

class LedgerEntry {
  public transactionId: string;
  public from: string;
  public amount: number;
  public to: string;
  public witnessOne: string;
  public witnessTwo: string;
  public partnerOne: string;
  public partnerTwo: string;
  public signature: string;
  public timestamp: number;
  public ledgerType: ledgerType;

  constructor(transactionId: string, from: string, amount: number, to: string,
    witnessOne: string, witnessTwo: string, partnerOne: string, partnerTwo: string,
    signature: string, timestamp: number, ledgerType: ledgerType ) 
  {
    this.transactionId = transactionId;
    this.from = from;
    this.amount = this.ledgerType === 0 ? amount : null;
    this.to = to;
    this.witnessOne = witnessOne;
    this.witnessTwo = witnessTwo;
    this.partnerOne = partnerOne;
    this.partnerTwo = partnerTwo;
    this.signature = signature;
    this.timestamp = timestamp;
    this.ledgerType = ledgerType;
  }
}

enum ledgerType {
  MY_LEDGER = 0,
  WITNESS_LEDGER = 1
}

const writeToLedger = (block: Block) => {
  const tx: Transaction = block.data[0];  // blocks only have 1 tx right now
  const txOut: TxOut = tx.txOuts[0];
  const txIn: TxIn = tx.txIns[0];
  const ledgerEntry = new LedgerEntry(
    tx.id,
    txOut.from,
    txOut.amount,
    txOut.address,    
    
  )
}

export {
  LedgerEntry
}

