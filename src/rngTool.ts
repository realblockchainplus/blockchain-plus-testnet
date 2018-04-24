import { Pod } from './pod';

const selectRandom = (pods: Pod[]): Pod[] => {
  const randomNumbers: number[] = buildRandomSet(pods.length);
  const _pods: Pod[] = [];
  _pods.push(pods[randomNumbers[0]], pods[randomNumbers[1]]);
  return _pods;
};

const buildRandomSet = (podsLength: number): number[] => {
  const randomSet: number[] = [];
  let randomNumber;
  while (randomSet.length < 2) {
    randomNumber = Math.floor(Math.random() * podsLength);
    if (randomSet.indexOf(randomNumber) === -1) {
      randomSet.push(randomNumber);
    }
  }
  return randomSet;
}

export {
  selectRandom
}