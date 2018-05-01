import * as io from 'socket.io-client';
import { Socket } from 'socket.io-client';
import { getPublicFromWallet } from './wallet';

class Pod {

  public id: number;
  public type: podType;
  public spawnTimestamp: number;
  public location: object;
  public ram: number;
  public storage: number;
  public uptime: number;
  public status: status;
  public name: string;
  public ip: string;
  public port: number;
  public address: string;
  public ws: Socket;

  constructor(type: podType, location: object, name: string) {
    this.type = type;
    this.location = location;
    this.name = name;
  }
};

enum status {
  ONLINE = 2,
  BUSY = 1,
  OFFLINE = 0
}
enum podType {
  REGULAR_POD = 0,
  PARTNER_POD = 1
};

const randomNames = [
  "Jeevan Singh",
  "Jaswinder Singh",
  "Gabor Levai",
  "Rajah Vasjaragagag",
  "Scott Donnelly",
  "Gale Rott",
  "Carleen Labarge",
  "Mindy Rummage",
  "Malena Imhoff",
  "Layla Pfaff",
  "Ashleigh Depaoli",
  "Dimple Brockway",
  "Cheryl Mckie",
  "Voncile Rideout",
  "Nanette Skinner",
  "Wilburn Hetzel",
  "Zack Ganey",
  "Aleen Pilarski",
  "Johnson Cribbs",
  "Timothy Hottle",
  "Kellye Loney",
  "Iraida Browne",
  "Shaun Burton",
  "Brianne Honey",
  "Ceola Cantrelle",
  "Sheilah Thiede",
  "Antoine Osterberg",
  "Denese Bergin",
  "Stacia Zobel",
  "Trinity Meng",
  "Christiana Barnes",
  "Freddie Kin",
  "Kai Reid",
  "Marybeth Lavine",
  "Vella Sachs",
  "Cameron Abate",
  "Shawanna Emanuel",
  "Hilaria Gabourel",
  "Clelia Rohloff",
  "Joi Sandidge",
  "Micheal Belew",
  "Mercedes Buhler",
  "Tam Steimle",
  "Slyvia Alongi",
  "Suzie Mcneilly",
  "Stefanie Beehler",
  "Nadene Orcutt",
  "Maud Barlow",
  "Dusty Dabrowski",
  "Kylee Krom",
  "Lena Edmisten",
  "Kristopher Whiteside",
  "Dorine Lepley",
  "Kelle Khouri",
  "Cristen Shier"
];

const regularPodSpecs = {
  ram: 2,
  storage: 100,
  uptime: 50
};

const partnerPodSpecs = {
  ram: 4,
  storage: 200,
  uptime: 99.97
};

const createPod = (type: podType) => {
  const randomName = randomNames.splice(Math.floor(Math.random() * randomNames.length), 1)[0];
  const randomLocation = { x: Math.floor(Math.random() * 5000), y: Math.floor(Math.random() * 5000) };
  const pod: Pod = new Pod(type, randomLocation, randomName);
  pod.address = getPublicFromWallet();
  pod.spawnTimestamp = Math.round(new Date().getTime() / 1000);
  type === podType.REGULAR_POD ? Object.assign(pod, regularPodSpecs) : Object.assign(pod, partnerPodSpecs);
  pod.ram = gbToMb(pod.ram);
  pod.storage = gbToMb(pod.storage);
  pod.status = manageUptime(pod);
  return pod;
};

const gbToMb = (gb: number) => {
  return gb * 1024;
};

const manageUptime = (pod: Pod): status => {
  const changeStatus = () => {
    const randomNumber = Math.random() * 100;
    if (randomNumber >= pod.uptime) {
      return status.OFFLINE;
    }
    return status.ONLINE;
  };

  setInterval(() => { return changeStatus(); }, 3600000);
  return changeStatus();
};

export { Pod, createPod, podType };