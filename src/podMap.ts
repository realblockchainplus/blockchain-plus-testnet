import * as ioClient from 'socket.io-client';

import { getPort } from './p2p';
import { Pod } from './pod';
import { getPodIp } from './utils';

interface IPodMap {
  [index: string]: SocketIOClient.Socket;
}

const podMap: IPodMap = {};

/**
 * Returns an existing socket if the provided ip exists within the provided podMap. Otherwise returns a new socket.
 *
 * @param podMap Pod map to get client socket from
 * @param podIp Ip of pod to get
 * @param funcName Name of function that called this function. Logging purposes.
 */
const getClientSocket = (podMap: IPodMap, podIp: string, funcName: string): SocketIOClient.Socket => {
  console.log(`[${funcName}] ${podMap[podIp] ? `Using existing socket for: ${podIp}` : `Getting new socket for ${podIp}`}`);
  return podMap[podIp] ? podMap[podIp] : ioClient(podIp);
};

/**
 * Updates the local podMap with the array of pods provided.
 *
 * @param pods Array of pods to update
 */
const updatePodMap = (pods: Pod[]) => {
  const port: number = getPort();
  pods.map((pod) => {
    if (pod.port !== port) {
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
    }
  });
};

export { getClientSocket, IPodMap, podMap, updatePodMap };
