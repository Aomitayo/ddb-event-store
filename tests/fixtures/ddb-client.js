const Aws = require('aws-sdk')

const ddbEndpoint = process.env.DDB_ENDPOINT
  ? { endpoint: process.env.DDB_ENDPOINT }
  : {}

const ddbClient = new Aws.DynamoDB.DocumentClient({
  region: 'us-east-1',
  apiVersion: '2012-08-10',
  ...ddbEndpoint
})

module.exports = ddbClient
