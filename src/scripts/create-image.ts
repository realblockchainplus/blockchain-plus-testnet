import * as dotenv from 'dotenv';

dotenv.config();

import { AWSRegionCode, createNewImage } from '../aws';

const regions = Object.keys(AWSRegionCode).map((key: string) => AWSRegionCode[key as any]);

let count = 0;
for (let i = 0; i < regions.length; i += 1) {
  const region = regions[i];
  createNewImage(region as AWSRegionCode, process.env.TRAVIS_TAG as string, () => {
    count += 1;
    count === regions.length ? process.exit(0) : null;
  });
}
