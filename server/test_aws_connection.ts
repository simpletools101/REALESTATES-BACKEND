import 'dotenv/config';

// Test AWS S3 and DynamoDB connection
import * as AWS from 'aws-sdk';

// S3 test
const s3 = new AWS.S3();
const bucket = process.env.AWS_S3_BUCKET || '';

async function testS3() {
  try {
    const result = await s3.listObjectsV2({ Bucket: bucket, MaxKeys: 1 }).promise();
    console.log('S3 connection successful. Bucket contents:', result.Contents);
  } catch (err) {
    console.error('S3 connection failed:', err);
  }
}

// DynamoDB test
const dynamodb = new AWS.DynamoDB();
const table = process.env.DYNAMODB_PROPERTIES_TABLE || '';

async function testDynamoDB() {
  try {
    const result = await dynamodb.describeTable({ TableName: table }).promise();
    console.log('DynamoDB connection successful. Table info:', result.Table);
  } catch (err) {
    console.error('DynamoDB connection failed:', err);
  }
}

console.log('Bucket:', process.env.AWS_S3_BUCKET);
console.log('Table:', process.env.DYNAMODB_PROPERTIES_TABLE);

(async () => {
  await testS3();
  await testDynamoDB();
})();
