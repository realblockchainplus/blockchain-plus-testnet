import { getPublicFromWallet } from './wallet';

class Result {
  public res: boolean;
  public reason: string;
  public id: string;
  public validator: string;

  constructor(res: boolean, reason: string, id: string) {
    this.res = res;
    this.reason = reason;
    this.id = id;
    this.validator = getPublicFromWallet();  
  }
}

export { Result };
