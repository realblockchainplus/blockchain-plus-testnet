import { Pod } from './pod';
import { getPodIndexByPublicKey } from './p2p';
import { getPublicFromWallet } from './wallet';

const selectRandom = (pods: Pod[], num: number, to: string = ''): Pod[] => {
  const randomNumbers: number[] = buildRandomSet(pods, num, to);
  const _pods: Pod[] = [];
  _pods.push(pods[randomNumbers[0]], pods[randomNumbers[1]]);
  return _pods;
};

const buildRandomSet = (pods: Pod[], num: number, to: string): number[] => {
  console.log('Building random set...');
  const randomSet: number[] = [];
  const myIndex = getPodIndexByPublicKey(getPublicFromWallet(), pods);
  const toIndex = getPodIndexByPublicKey(to, pods);
  let randomNumber;
  while (randomSet.length < num) {
    randomNumber = Math.round(Math.random() * (pods.length - 1));
    console.log(`Random Number: ${randomNumber}, MyIndex: ${myIndex}`);
    if (randomSet.indexOf(randomNumber) === -1 && randomNumber !== myIndex && randomNumber !== toIndex) {
      console.log('Random number not in set, adding.');
      randomSet.push(randomNumber);
    }
  }
  console.log('While loop over, returning randomSet');
  return randomSet;
};

export {
  selectRandom,
};
