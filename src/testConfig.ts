class TestConfig {
  public duration: number;
  public numSenders: number;
  public local: boolean;
  public maxLedgerLength: number;
  public sendersAsValidators: boolean;

  constructor(duration: number, numSenders: number, local: boolean, maxLedgerLength: number, sendersAsValidators: boolean) {
    this.duration = duration;
    this.numSenders = numSenders;
    this.local = local;
    this.maxLedgerLength = maxLedgerLength;
    this.sendersAsValidators = sendersAsValidators;
  }
}

export { TestConfig };
