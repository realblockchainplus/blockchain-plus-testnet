import * as AWS from 'aws-sdk';

AWS.config.loadFromPath('./awsConfig.json');

AWS.config.region = 'us-east-1';

const createEC2Instance = () => {
  const ec2 = new AWS.EC2({ apiVersion: '2016-11-15' });

  const params = {
    ImageId: 'ami-92e8aaed',
    InstanceType: 't2.micro',
    KeyName: 'bcp-tn-us-east',
    MinCount: 1,
    MaxCount: 1,
  };

  ec2.runInstances(params).promise()
    .then((data) => {
      console.log(data);
      // @ts-ignore
      const instanceId = data.Instances[0].InstanceId;
      console.log(`Created Instance: ${instanceId}`);
      const tags = {
        Resources: [instanceId],
        Tags: [
          {
            Key: 'test',
            Value: 'testValue',
          },
        ],
      };
      // @ts-ignore
      ec2.createTags(tags).promise()
        .then((data: any) => {
          console.log('Instance tagged');
          console.log(data);
        })
        .catch((err: any) => {
          console.error(err, err.stack);
        });
    })
    .catch((err) => {
      console.error(err, err.stack);
    });
};

export { createEC2Instance };
