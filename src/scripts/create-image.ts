import * as dotenv from 'dotenv';

dotenv.config();

import { AWSRegionCode, createNewImage } from '../aws';

const regions = Object.keys(AWSRegionCode).map((key: string) => AWSRegionCode[key as any]);

for (let i = 0; i < regions.length; i += 1) {
  const region = regions[i];
  createNewImage(region as AWSRegionCode, '1.0.0-alpha.16');
}
