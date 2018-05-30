import { getPodIndexByPublicKey } from './p2p';
import { Pod } from './pod';
import { getPublicFromWallet } from './wallet';
import { randomNumberFromRange } from './utils';

const selectRandom = (pods: Pod[], num: number, to: string = ''): Pod[] => {
  console.time('selectRandom');
  const randomNumbers: number[] = buildRandomSet(pods, num, to);
  const _pods: Pod[] = [];
  for (let i = 0; i < randomNumbers.length; i += 1) {
    _pods.push(pods[randomNumbers[i]]);
  }
  console.timeEnd('selectRandom');
  return _pods;
};

const buildRandomSet = (pods: Pod[], num: number, to: string): number[] => {
  console.time('buildRandomSet');
  const randomSet: number[] = [];
  const myIndex = getPodIndexByPublicKey(getPublicFromWallet(), pods);
  const toIndex = getPodIndexByPublicKey(to, pods);
  let randomNumber;
  while (randomSet.length < num) {
    randomNumber = randomNumberFromRange(0, pods.length, true);
    // console.log(`Random Number: ${randomNumber}, MyIndex: ${myIndex}`);
    if (randomSet.indexOf(randomNumber) === -1 && randomNumber !== myIndex) {
      // console.log('Random number not in set, adding.');
      randomSet.push(randomNumber);
    }
  }
  // console.timeEnd('buildRandomSet');
  return randomSet;
};

export {
  selectRandom,
};
