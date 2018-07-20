import { getPodIndexByPublicKey } from './p2p';
import { Pod } from './pod';
import { info } from './logger';
import { getPublicFromWallet } from './wallet';
import { randomNumberFromRange } from './utils';
import { LogEvent, EventType } from './logEvent';

const selectRandom = (pods: Pod[], num: number, to: string = ''): Pod[] => {
  new LogEvent(
    '',
    '',
    '',
    EventType.SELECT_RANDOM_PODS_START,
    'silly',
  );
  const randomNumbers: number[] = buildRandomSet(pods, num, to);
  const _pods: Pod[] = [];
  for (let i = 0; i < randomNumbers.length; i += 1) {
    _pods.push(pods[randomNumbers[i]]);
  }
  new LogEvent(
    '',
    '',
    '',
    EventType.SELECT_RANDOM_PODS_END,
    'silly',
  );
  info(`[selectRandom] Selected pods length: ${_pods.length}`);
  return _pods;
};

const buildRandomSet = (pods: Pod[], num: number, to: string): number[] => {
  // timer('BUILD_RANDOM_SET_START');
  const randomSet: number[] = [];
  const myIndex = getPodIndexByPublicKey(getPublicFromWallet(), pods);
  let randomNumber;
  // console.log(num, pods.length);
  // console.dir(pods);
  const numInvalidPods = myIndex !== -1 ? 1 : 0;   // cannot select self
  info(`[buildRandomSet] Number of pods: ${pods.length}`);
  if (pods.length - numInvalidPods >= num) {
    while (randomSet.length < num) {
      randomNumber = randomNumberFromRange(0, pods.length, true);
      // console.log(`Random Number: ${randomNumber}, MyIndex: ${myIndex}`);
      if (randomSet.indexOf(randomNumber) === -1 && randomNumber !== myIndex) {
        // console.log('Random number not in set, adding.');
        randomSet.push(randomNumber);
      }
    }
  }
  else {
    console.log(`Not enough pods to fulfill request. Number of pods: ${pods.length - 1}. Requested number of pods: ${num}`);
  }
  // timer('BUILD_RANDOM_SET_END');
  return randomSet;
};

export {
  selectRandom,
};
