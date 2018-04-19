import * as WebSocket from 'ws';

class Pod {

  public id: number;
  public type: podType;
  public spawnTimestamp: number;
  public location: number;
  public ram: number;
  public storage: number;
  public name: string;
  public ws: WebSocket;

  constructor(type: podType, location: number, name: string, ws: WebSocket) {
    this.type = type;
    this.location = location;
    this.ws = ws;
    this.name = name;
  }
};

enum podType {
  REGULAR_POD = 0,
  PARTNER_POD = 1
};

const regularPodSpecs = {
  ram: 2,
  storage: 100
};

const partnerPodSpecs = {
  ram: 4,
  storage: 200
};

const createPod = (type: podType, location: number, name: string, ws: WebSocket) => {
  const pod: Pod = new Pod(type, location, name, ws);
  pod.id = 0 // get num of pods + 1   OR   random string for id
  pod.spawnTimestamp = Math.round(new Date().getTime() / 1000);
  type === podType.REGULAR_POD ? Object.assign(pod, regularPodSpecs) : Object.assign(pod, partnerPodSpecs);
  pod.ram = gbToMb(pod.ram);
  pod.storage = gbToMb(pod.storage);
  return pod;
};

const gbToMb = (gb: number) => {
  return gb * 1024;
};

export { Pod, createPod };