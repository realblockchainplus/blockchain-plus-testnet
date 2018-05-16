class TestConfig {
  public duration: number;
  public numSenders: number;
  public local: boolean;
  public maxLedgerLength: number;

  constructor(duration: number, numSenders: number, local: boolean, maxLedgerLength: number) {
    this.duration = duration;
    this.numSenders = numSenders;
    this.local = local;
    this.maxLedgerLength = maxLedgerLength;    
  }
}

export { TestConfig };
