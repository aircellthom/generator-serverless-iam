'use strict';
const fs = require('fs');
const yaml = require('js-yaml');
const Generator = require('yeoman-generator');


const buildPolicy = (serviceName, stage, region) => {
  return {
    Version: '2012-10-17',
    Statement: [
      {
        "Effect": "Allow",
        "Action": [
          "cloudformation:Describe*",
          "cloudformation:Get*",
          "cloudformation:PreviewStackUpdate",
          "cloudformation:List*",
          "cloudformation:ValidateTemplate"
        ],
        "Resource": [
          "*"
        ]
      },
      {
        "Effect": "Allow",
        "Action": [
          "cloudformation:CreateStack",
          "cloudformation:CreateUploadBucket",
          "cloudformation:DeleteStack",
          "cloudformation:DescribeStackEvents",
          "cloudformation:DescribeStackResource",
          "cloudformation:DescribeStackResources",
          "cloudformation:UpdateStack",
          "cloudformation:DescribeStacks"
        ],
        Resource: [
          `arn:aws:cloudformation:${region}:*:stack/${serviceName}*${stage}*`
        ]
      },
      {
        Effect: 'Allow',
        Action: ['lambda:Get*', 'lambda:List*', 'lambda:Create*', 'lambda:*EventSource*'],
        Resource: ['*']
      },
      {
        Effect: 'Allow',
        Action: [
          'lambda:AddPermission',
          'lambda:CreateAlias',
          'lambda:DeleteFunction',
          'lambda:InvokeFunction',
          'lambda:PublishVersion',
          'lambda:RemovePermission',
          'lambda:PutFunctionConcurrency',
          'lambda:Update*'
        ],
        Resource: [
          `arn:aws:lambda:${region}:*:function:${serviceName}*${stage}*`
        ]
      },
      {
        Effect: 'Allow',
        Action: [         
          "s3:List*",
          "s3:Get*",
          "s3:HeadBucket"
        ],
        Resource: [`*`]
      },
      {
        Effect: 'Allow',
        Action: [        
          "s3:CreateBucket",             
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ],
        Resource: [`arn:aws:s3:::${serviceName}*serverlessdeploy*`]
      },     
      {
        Effect: 'Allow',
        Action: ['iam:PassRole'],
        Resource: ['arn:aws:iam::*:role/*']
      },
      {
        Effect: 'Allow',
        Action: 'iam:*',
        Resource: [
          `arn:aws:iam::*:role/${serviceName}*${stage}-${region}-lambdaRole*`,
          `arn:aws:iam::*:role/${serviceName}*${stage}-kinesisRole*`,
          `arn:aws:iam::*:role/${serviceName}*${stage}-firehoseRole*`,          
          `arn:aws:iam::*:role/${serviceName}*${stage}-iotRole*`
        ]
      },
      {
        Effect: 'Allow',
        Action: 'sqs:*',
        Resource: [`arn:aws:sqs:*:*:${serviceName}*${stage}*`]
      },
      {
        Effect: 'Allow',
        Action: ['cloudwatch:GetMetricStatistics'],
        Resource: ['*']
      },
      {
        Effect: 'Allow',
        Action: ['sns:List*', 'sns:Check*', 'sns:Get*', 'sns:Subscribe*'],
        Resource: ['*']
      },      
      {
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DeleteLogGroup'
        ],
        Resource: [`arn:aws:logs:${region}:*:*`],
        Effect: 'Allow'
      },
      {
        Action: ['logs:PutLogEvents'],
        Resource: [`arn:aws:logs:${region}:*:*`],
        Effect: 'Allow'
      },
      {
        Effect: 'Allow',
        Action: [
          'logs:DescribeLogStreams',
          'logs:DescribeLogGroups',
          'logs:FilterLogEvents'
        ],
        Resource: ['*']
      },
      {
        Effect: 'Allow',
        Action: ['events:Put*', 'events:Remove*', 'events:Delete*', 'events:DescribeRule'],
        Resource: [`arn:aws:events:*:*:rule/${serviceName}*${stage}*`]
      }
    ]
  };
};

const escapeValFilename = function(val) {
  return val === '*' ? 'any' : val;
};

/* ex: getProperty(myObj,'aze.xyz',0) // return myObj.aze.xyz safely
 * accepts array for property names: 
 *     getProperty(myObj,['aze','xyz'],{value: null}) 
 */
function getProperty(obj, props, defaultValue) {
  var res, isvoid = function(x){return typeof x === "undefined" || x === null;}
  if(!isvoid(obj)){
      if(isvoid(props)) props = [];
      if(typeof props  === "string") props = props.trim().split(".");
      if(props.constructor === Array){
          res = props.length>1 ? getProperty(obj[props.shift()],props,defaultValue) : obj[props[0]];
      }
  }
  return typeof res === "undefined" ? defaultValue: res;
}

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    this.option('project', {
      description: 'The name of the Serverless project',
      type: String
    });
    this.option('stage', {
      description: 'The name of a single stage to target',
      type: String,
      default: '*'
    });
    this.option('region', {
      description: 'The name of a single region to target',
      type: String,
      default: '*'
    });
  }
  
  initializing() {
    // Get document, or throw exception on error
    try {
      this.yaml = yaml.safeLoadAll(fs.readFileSync('./serverless.yml', 'utf8'),  yaml.MINIMAL_SCHEMA)[0];
    } catch (e) {
      if (e.code === "ENOENT") {
        this.log('Could not find serverless.yaml, loading defaults');
      } else {
        this.log(e);
      }
    }
  }

  prompting() {
    return this.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Your Serverless service name',
        default: getProperty(this.yaml, 'service', this.appname) //this.appname // Default to current folder name
      },
      {
        type: 'input',
        name: 'stage',
        message: 'You can specify a specific stage, if you like:',
        default: getProperty(this.yaml.provider, 'stage', '*') // '*'
      },
      {
        type: 'input',
        name: 'region',
        message: 'You can specify a specific region, if you like:',
        default: getProperty(this.yaml.provider, 'region', '*') // '*'
      }
    ]).then(answers => {
      this.slsSettings = answers;
      this.log('app name', answers.name);
      this.log('app stage', answers.stage);
      this.log('app region', answers.region);
    });
  }

  writing() {
    const done = this.async();

    const project = this.slsSettings.name;
    const stage = this.slsSettings.stage;
    const region = this.slsSettings.region;

    const policy = buildPolicy(project, stage, region);    

    if (this.yaml.provider.iamRoleStatements) {
      for (var j = 0; j < this.yaml.provider.iamRoleStatements.length; j++){
        var role = this.yaml.provider.iamRoleStatements[j];

        policy.Statement.push({
          Effect: role.Effect,
          Action: role.Action,
          Resource: role.Resource || [`arn:aws:${role.Action[0].split(':')[0]}:*:*:*`] //no resource
        });

      }
    }

    const policyString = JSON.stringify(policy, null, 2);
    const fileName = `${project}-${escapeValFilename(stage)}-${escapeValFilename(region)}-policy.json`;

    this.log(`Writing to ${fileName}`);
    fs.writeFile(fileName, policyString, done);
  }
};
