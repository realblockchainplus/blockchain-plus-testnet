import { EventType, LogEvent, LogLevel } from './logEvent';
import { info } from './logger';
import { Pod } from './pod';
import { getPodIndexByPublicKey, randomNumberFromRange } from './utils';
import { getPublicFromWallet } from './wallet';

const selectRandom = (pods: Pod[], num: number, to: string = ''): Pod[] => {
  new LogEvent(
    '',
    '',
    '',
    EventType.SELECT_RANDOM_PODS_START,
    LogLevel.SILLY,
  );
  const activePods = pods.filter(pod => pod.active === true);
  const randomNumbers: number[] = buildRandomSet(activePods, num, to);
  const _pods: Pod[] = [];
  for (let i = 0; i < randomNumbers.length; i += 1) {
    _pods.push(activePods[randomNumbers[i]]);
  }
  new LogEvent(
    '',
    '',
    '',
    EventType.SELECT_RANDOM_PODS_END,
    LogLevel.SILLY,
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
  const numInvalidPods = myIndex !== -1 ? 1 : 0;   // cannot select self
  const podsLength = pods.length;
  info(`[buildRandomSet] Number of pods: ${podsLength}`);
  if (podsLength - numInvalidPods >= num) {
    while (randomSet.length < num) {
      randomNumber = randomNumberFromRange(0, podsLength, true);
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
