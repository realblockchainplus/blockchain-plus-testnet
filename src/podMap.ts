import * as ioClient from 'socket.io-client';
import { Pod } from './pod';
import { getPodIp } from './utils';

interface IPodMap {
  [index: string]: SocketIOClient.Socket;
}

const podMap: IPodMap = {};

const getClientSocket = (podMap: IPodMap, podIp: string, funcName: string): SocketIOClient.Socket => {
  console.log(`[${funcName}] ${podMap[podIp] ? `Using existing socket for: ${podIp}` : `Getting new socket for ${podIp}`}`);
  return podMap[podIp] ? podMap[podIp] : ioClient(podIp);
}

const updatePodMap = (pods: Pod[]) => {
  pods.map(pod => {
    const podIp = getPodIp(true, pod);
    const socket = getClientSocket(podMap, podIp, 'updatePodMap');
    if (podMap[podIp] && !socket.connected) {
      socket.once('connect', () => {
        podMap[podIp] = socket;
      });
    }
    else if (podMap[podIp] && socket.connected) {
      podMap[podIp] = socket;
    }
    else {
      podMap[podIp] = socket;
    }
  });
}

export { getClientSocket, IPodMap, podMap, updatePodMap };
