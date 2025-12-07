import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

export async function uploadFileToS3(key: string, body: Buffer | Uint8Array | Blob | string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET!,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  return s3.send(command);
}

export function getS3FileUrl(key: string) {
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export async function deleteFileFromS3(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET!,
    Key: key,
  });
  return s3.send(command);
}

export function getS3Client() {
  return s3;
}
