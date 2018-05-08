import { Pod } from './pod';
import { getPodIndexByPublicKey } from './p2p';
import { getPublicFromWallet } from './wallet';

const selectRandom = (pods: Pod[]): Pod[] => {
  const randomNumbers: number[] = buildRandomSet(pods);
  const _pods: Pod[] = [];
  _pods.push(pods[randomNumbers[0]], pods[randomNumbers[1]]);
  return _pods;
};

const buildRandomSet = (pods: Pod[]): number[] => {
  console.log('Building random set...');
  const randomSet: number[] = [];
  const myIndex = getPodIndexByPublicKey(getPublicFromWallet(), pods);
  let randomNumber;
  while (randomSet.length < 2) {
    randomNumber = Math.round(Math.random() * (pods.length - 1));
    console.log(`Random Number: ${randomNumber}, MyIndex: ${myIndex}`);
    if (randomSet.indexOf(randomNumber) === -1 && randomNumber !== myIndex) {
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
