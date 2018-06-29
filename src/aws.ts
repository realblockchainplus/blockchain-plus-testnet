import * as AWS from 'aws-sdk';
import { PodType } from './pod';

interface IRegionBreakdown {
  id: AWSRegionCode;
  numRegular: number;
  numPartner: number;
}

enum AWSRegionCode {
  US_EAST = 'us-east-1',
  US_WEST = 'us-west-2',
  CA_CENTRAL = 'ca-central-1',
  SOUTH_AMERICA = 'sa-east-1',
  AUSTRALIA = 'ap-southeast-2',
  KOREA = 'ap-northeast-2',
  JAPAN = 'ap-northeast-1',
  GERMANY = 'eu-central-1',
}

const regularTag: AWS.EC2.Tag = {
  Key: 'type',
  Value: 'regular',
};

const partnerTag: AWS.EC2.Tag = {
  Key: 'type',
  Value: 'partner',
};

const initEC2 = (region?: AWSRegionCode): AWS.EC2 => {
  const ec2 = new AWS.EC2({ region, apiVersion: '2016-11-15' });
  ec2.config.update({
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
  });
  return ec2;
};

const createEC2Instance = (type: PodType, region: AWSRegionCode, nodeCount: number, imageName: string) => {
  const ec2 = initEC2(region);
  const InstanceType = type === PodType.REGULAR_POD ? 't2.regular' : 't2.large';
  const tag = type === PodType.REGULAR_POD ? regularTag : partnerTag;

  const IamInstanceProfile: AWS.EC2.IamInstanceProfile = {
    Arn: 'arn:aws:iam::490668483643:instance-profile/EC2-bcp-tn-regular',
  };
  getImageId(ec2, imageName, (ImageId) => {
    const params: AWS.EC2.RunInstancesRequest = {
      IamInstanceProfile,
      ImageId,
      InstanceType,
      KeyName: 'bcp-tn-node',
      MinCount: nodeCount,
      MaxCount: nodeCount,
    };

    ec2.runInstances(params, (err, data) => {
      if (err) {
        console.log(`[runInstances] Error: ${err}`);
      }
      else {
        for (let i = 0; i < data.Instances!.length; i += 1) {
          const instance = data.Instances![i];
          const tags = {
            Resources: [instance.InstanceId!],
            Tags: [tag],
          };
          ec2.createTags(tags, (_err, _data) => {
            if (_err) {
              console.log(`[createTags] Error: ${_err}`);
            }
            else {
              console.log('Instance tagged');
              console.log(data);
            }
          });
        }
      }
    });
  });
};

const createEC2Cluster = (totalNodes: number, regions: AWSRegionCode[], imageName: string) => {
  const regularNodes = Math.floor(totalNodes * 0.8);
  const partnerNodes = totalNodes - regularNodes;
  const regionBreakdownArray: IRegionBreakdown[] = [];
  const populateRegionBreakdown = (callback: () => void) => {
    for (let i = 0; i < regions.length; i += 1) {
      const region = regions[i];
      const regionBreakdown = {
        id: region,
        numRegular: 0,
        numPartner: 0,
      };
      regionBreakdownArray.push(regionBreakdown);
    }
    callback();
  };

  const distributeNodes = (callback: () => void) => {
    let regularRegionPointer = 0;
    for (let i = 0; i < regularNodes; i += 1) {
      regionBreakdownArray[regularRegionPointer].numRegular += 1;
      regularRegionPointer += 1;
      regularRegionPointer === regionBreakdownArray.length ? regularRegionPointer = 0 : null;
    }

    let partnerRegionPointer = 0;
    for (let i = 0; i < partnerNodes; i += 1) {
      regionBreakdownArray[partnerRegionPointer].numPartner += 1;
      partnerRegionPointer += 1;
      partnerRegionPointer === regionBreakdownArray.length ? partnerRegionPointer = 0 : null;
    }
    callback();
  };

  populateRegionBreakdown(() => distributeNodes(() => {
    for (let i = 0; i < regionBreakdownArray.length; i += 1) {
      const regionBreakdown = regionBreakdownArray[i];
      createEC2Instance(PodType.REGULAR_POD, regionBreakdown.id, regionBreakdown.numRegular, imageName);
      createEC2Instance(PodType.PARTNER_POD, regionBreakdown.id, regionBreakdown.numPartner, imageName);
    }
  }));
};

const getImageId = (ec2: AWS.EC2, imageName: string, callback: (imageId: string | undefined) => void) => {
  ec2.describeImages((err, data) => {
    if (err) {
      console.log(err);
    }
    const images = data.Images;
    if (images) {
      for (let i = 0; i < images.length; i += 1) {
        const image = images[i];
        image.Name === imageName ? callback(image.ImageId) : null;
      }
    }
  });
};

const configureSecurityGroups = (create: boolean) => {
  const regions = Object.keys(AWSRegionCode).map((key: string) => AWSRegionCode[key as any]);
  for (let i = 0; i < regions.length; i += 1) {
    const region = regions[i];
    const ec2 = initEC2(region as AWSRegionCode);
    ec2.describeVpcs((err, data) => {
      if (err) {
        console.log(`Cannot get VPCs: ${err}`);
      }
      else {
        for (let k = 0; k < data.Vpcs!.length; k += 1) {
          const vpc = data.Vpcs![k];
          if (create) {
            const createSecurityGroupRequest: AWS.EC2.CreateSecurityGroupRequest = {
              Description: 'Default security group for bcp-tn-node instances.',
              GroupName: 'bcp-tn-node-default',
              VpcId: vpc.VpcId,
            };

            ec2.createSecurityGroup(createSecurityGroupRequest, (_err, _data) => {
              if (_err) {
                console.log(`[createSecurityGroup] Error: ${_err}`);
              }
              else {
                const inboundParams: AWS.EC2.AuthorizeSecurityGroupIngressRequest = {
                  GroupName: 'bcp-tn-node-default',
                  IpProtocol: '-1',
                  ToPort: -1,
                  FromPort: -1,
                };
                ec2.authorizeSecurityGroupIngress(inboundParams, (__err, __data) => {
                  if (__err) {
                    console.log(`[authorizeSecurityGroupIngress] Error: ${__err}`);
                  }
                  else {
                    console.log(`[authorizeSecurityGroupIngress] Success: ${__data}`);
                  }
                });
              }
            });
          }
          else {
            ec2.describeSecurityGroups((_err, _data) => {
              const securityGroups = _data.SecurityGroups;
              for (let j = 0; j < securityGroups!.length; j += 1) {
                const securityGroup = securityGroups![j];
                const deleteSecurityGroupRequest: AWS.EC2.DeleteSecurityGroupRequest = {
                  GroupId: securityGroup.GroupId,
                };
                if (securityGroup.GroupName === 'bcp-tn-node-default') {
                  ec2.deleteSecurityGroup(deleteSecurityGroupRequest, (e, d) => {
                    if (e) {
                      console.log(`[deleteSecurityGroup] Error: ${e}`);
                    }
                    else {
                      console.log(`[deleteSecurityGroup] Success: ${d}`);
                    }
                  });
                }
              }
            });
          }
        }
      }
    });
  }
};

export { AWSRegionCode, createEC2Instance, createEC2Cluster, configureSecurityGroups };
