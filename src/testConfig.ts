class TestConfig {
  public testId: string;
  public duration: number;
  public numSenders: number;
  public local: boolean;
  public sendersAsValidators: boolean;

  constructor(duration: number, numSenders: number, local: boolean, sendersAsValidators: boolean, testId?: string) {
    this.testId = testId || (+new Date).toString(36);
    this.duration = duration;
    this.numSenders = numSenders;
    this.local = local;
    this.sendersAsValidators = sendersAsValidators;
  }
}

export { TestConfig };
