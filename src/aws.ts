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

const createEC2Instance = (type: PodType, region: AWSRegionCode, nodeCount: number, imageName: string,
  callback: (instance: AWS.EC2.Instance) => void = () => {}) => {
  console.log('[createEC2Instance]');
  const ec2 = initEC2(region);
  const InstanceType = type === PodType.REGULAR_POD ? 't2.medium' : 't2.large';
  const tag = type === PodType.REGULAR_POD ? regularTag : partnerTag;

  const IamInstanceProfile: AWS.EC2.IamInstanceProfile = {
    Arn: 'arn:aws:iam::490668483643:instance-profile/EC2-bcp-tn-regular',
  };

  ec2.describeSecurityGroups((e, d) => {
    if (e) {
      console.log(`[describeSecurityGroups] Error: ${e}`);
    }
    else {
      // console.dir(`[describeSecurityGroups] Success: ${JSON.stringify(d)}`);
      let securityGroup: AWS.EC2.SecurityGroup;
      for (let i = 0; i < d.SecurityGroups!.length; i += 1) {
        const sg = d.SecurityGroups![i];
        if (sg.GroupName === 'bcp-tn-node-default') {
          securityGroup = sg;
        }
      }
      getImageIdByImageName(ec2, imageName, (ImageId) => {
        const params: AWS.EC2.RunInstancesRequest = {
          IamInstanceProfile,
          ImageId,
          InstanceType,
          KeyName: 'bcp-tn-node',
          MinCount: nodeCount,
          MaxCount: nodeCount,
          SecurityGroupIds: [securityGroup.GroupId!],
          UserData: Buffer.from('#!/bin/bash;cd blockchain-plus-testnet;sudo git pull origin master;sudo npm run compile;sudo npm run start-regular').toString('base64'),
        };

        ec2.runInstances(params, (err, data) => {
          if (err) {
            console.log(`[runInstances] Error: ${err}`);
          }
          else {
            for (let i = 0; i < data.Instances!.length; i += 1) {
              const instance = data.Instances![i];
              // console.dir(`[runInstances] Success: ${JSON.stringify(instance)}`);
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
                  callback(instance);
                }
              });
            }
          }
        });
      });
    }
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

const getImagesByTag = (ec2: AWS.EC2, imageTag: AWS.EC2.Tag, callback: (images: AWS.EC2.Image[] | undefined) => void) => {
  const params: AWS.EC2.DescribeImagesRequest = {
    Filters: [
      {
        Name: imageTag.Key as string,
        Values: [
          imageTag.Value as string,
        ],
      },
    ],
  };

  ec2.describeImages(params, (err, data) => {
    if (err) {
      console.log(`[describeImages] Error: ${err}`);
    }
    else {
      const images = data.Images;
      callback(images);
    }
  });
}

const getImageIdByImageName = (ec2: AWS.EC2, imageName: string, callback: (imageId: string | undefined) => void) => {
  const params: AWS.EC2.DescribeImagesRequest = {
    Filters: [
      {
        Name: 'name',
        Values: [
          imageName,
        ],
      },
    ],
  };
  ec2.describeImages(params, (err, data) => {
    if (data.Images!.length === 0) {
      console.log(`${imageName} not found!`);
    }
    if (err) {
      console.log(err);
    }
    else {
    // console.log(`[describeImages] Images: ${JSON.stringify(data)}`);
      const images = data.Images;
      callback(images![0].ImageId);
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
                  IpPermissions: [
                    {
                      IpProtocol: '-1',
                      ToPort: -1,
                      FromPort: -1,
                      IpRanges: [{ CidrIp: '0.0.0.0/0' }],
                    },
                  ],
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

const createNewImage = (region: AWSRegionCode, commitTag: string) => {
  const ec2 = initEC2(region);
  const imageTag: AWS.EC2.Tag = {
    Key: 'tag:category',
    Value: 'bcp-tn-node-image'
  };
  getImagesByTag(ec2, imageTag, (images) => {
    images!.sort((a, b) => {
      return Date.parse(a.CreationDate as string) - Date.parse(b.CreationDate as string);
    });
    const mostRecentImage = images![0];
    createEC2Instance(PodType.REGULAR_POD, region, 1, mostRecentImage.Name!, (instance: AWS.EC2.Instance) => {
      const waitForParams: AWS.EC2.DescribeInstancesRequest = {
        InstanceIds: [instance.InstanceId!],
      };
      ec2.waitFor('instanceRunning', waitForParams, (e, d) => {
        const params: AWS.EC2.CreateImageRequest = {
          InstanceId: instance.InstanceId as string,
          Name: commitTag,
        };
        ec2.createImage(params, (err, data) => {
          if (err) {
            console.log(`[createImage] Error: ${err}`);
          }
          else {
            console.log(`[createImage] Success: ${JSON.stringify(data)}`);
          }
        });
    });
    });
  });
};

export { AWSRegionCode, createEC2Instance, createEC2Cluster, createNewImage, configureSecurityGroups };
