import * as ioClient from 'socket.io-client';

interface IPodMap {
  [index: string]: SocketIOClient.Socket;
}

const getClientSocket = (podMap: IPodMap, podIp: string): SocketIOClient.Socket => {
  return podMap[podIp] ? podMap[podIp] : ioClient(podIp);
}

export { getClientSocket, IPodMap };
