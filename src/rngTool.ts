import { Pod } from './pod';

const selectRandom = (pods: Pod[]): Pod[] => {
  const randomNumbers: number[] = buildRandomSet(pods.length);
  const _pods: Pod[] = [];
  _pods.push(pods[randomNumbers[0]], pods[randomNumbers[1]]);
  return _pods;
};

const buildRandomSet = (podsLength: number): number[] => {
  console.log('Building random set..');
  const randomSet: number[] = [];
  let randomNumber;
  while (randomSet.length < 2) {
    randomNumber = Math.round(Math.random() * (podsLength - 1));
    if (randomSet.indexOf(randomNumber) === -1) {
      console.log('Random number not in set, adding');
      randomSet.push(randomNumber);
    }
  }
  console.log('While loop over, returning randomSet');
  return randomSet;
}

export {
  selectRandom
}