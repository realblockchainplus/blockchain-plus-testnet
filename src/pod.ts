import { getLocalIp, getCurrentTimestamp } from './utils';
import { getPublicFromWallet } from './wallet';

type Socket = SocketIOClient.Socket;

class Pod {
  public id: number;
  public type: PodType;
  public spawnTimestamp: number;
  public location: object;
  public ram: number;
  public storage: number;
  public uptime: number;
  public status: Status;
  public name: string;
  public ip: string;
  public localIp: string;
  public port: number;
  public address: string;
  public socketId: string;

  constructor(type: PodType) {
    this.type = type;
    this.localIp = getLocalIp();
  }
}

enum Status {
  ONLINE = 2,
  BUSY = 1,
  OFFLINE = 0,
}

enum PodType {
  REGULAR_POD = 0,
  PARTNER_POD = 1,
  SEED_POD = 2,
  DUMMY_POD = 3,
}

const regularPodSpecs = {
  ram: 2,
  storage: 100,
  uptime: 50,
};

const partnerPodSpecs = {
  ram: 4,
  storage: 200,
  uptime: 99.97,
};

const createPod = (type: PodType) => {
  const pod: Pod = new Pod(type);
  pod.address = getPublicFromWallet();
  pod.spawnTimestamp = getCurrentTimestamp();
  type === PodType.REGULAR_POD ?
    Object.assign(pod, regularPodSpecs) : Object.assign(pod, partnerPodSpecs);
  pod.ram = gbToMb(pod.ram);
  pod.storage = gbToMb(pod.storage);
  pod.status = manageUptime(pod);
  return pod;
};

const gbToMb = (gb: number) => {
  return gb * 1024;
};

const manageUptime = (pod: Pod): Status => {
  const changeStatus = () => {
    const randomNumber = Math.random() * 100;
    if (randomNumber >= pod.uptime) {
      return Status.OFFLINE;
    }
    return Status.ONLINE;
  };

  setInterval(() => changeStatus(), 3600000);
  return changeStatus();
};

export { Pod, createPod, PodType };
