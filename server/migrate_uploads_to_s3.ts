// Script to migrate all files in uploads/ to S3
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import { uploadFileToS3 } from './s3-util.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

async function uploadDirToS3(dir: string, prefix = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const s3Key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await uploadDirToS3(fullPath, s3Key);
    } else {
      const fileBuffer = fs.readFileSync(fullPath);
      const contentType = mime.lookup(entry.name) || 'application/octet-stream';
      console.log(`Uploading ${fullPath} to S3 as ${s3Key}`);
      await uploadFileToS3(s3Key, fileBuffer, contentType as string);
    }
  }
}

(async () => {
  try {
    await uploadDirToS3(UPLOADS_DIR);
    console.log('Migration to S3 complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  }
})();
