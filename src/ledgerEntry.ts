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

export {
  LedgerEntry
}

