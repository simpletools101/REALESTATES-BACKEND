import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, PutBucketCorsCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { getOptimizedConfig, shouldSkipFile, shouldSkipDirectory } from './upload-config';

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

const BUCKET_NAME = process.env.S3_TOURS_BUCKET || 'realevr-tours';

interface UploadState {
  uploadedFiles: number;
  totalFiles: number;
  onProgress: (progress: number) => void;
}

// Setup S3 bucket with proper configuration for hosting HTML tours
export async function setupS3TourBucket(): Promise<void> {
  try {
    // Check if bucket exists
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`Bucket ${BUCKET_NAME} already exists`);
    } catch (error: any) {
      if (error.name === 'NotFound') {
        // Create bucket
        await s3Client.send(new CreateBucketCommand({ 
          Bucket: BUCKET_NAME,
          CreateBucketConfiguration: {
            LocationConstraint: process.env.AWS_REGION !== 'us-east-1' ? process.env.AWS_REGION || 'us-east-1' : undefined
          }
        }));
        console.log(`Created bucket: ${BUCKET_NAME}`);
      } else {
        throw error;
      }
    }

    // Try to set CORS configuration (this usually works even with block public access)
    try {
      const corsConfiguration = {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposeHeaders: ['Content-Length', 'Date'],
            MaxAgeSeconds: 3600
          }
        ]
      };

      await s3Client.send(new PutBucketCorsCommand({
        Bucket: BUCKET_NAME,
        CORSConfiguration: corsConfiguration
      }));
      console.log('CORS configuration set successfully');
    } catch (corsError) {
      console.warn('Could not set CORS configuration (this may not be critical):', corsError);
    }

    // Set bucket policy to make all objects public
    try {
      const bucketPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicReadGetObject',
            Effect: 'Allow',
            Principal: '*',
            Action: 's3:GetObject',
            Resource: `arn:aws:s3:::${BUCKET_NAME}/*`
          }
        ]
      };

      await s3Client.send(new PutBucketPolicyCommand({
        Bucket: BUCKET_NAME,
        Policy: JSON.stringify(bucketPolicy)
      }));
      console.log('Bucket policy set for public read access');
    } catch (policyError) {
      console.warn('Could not set bucket policy (this may be critical for public access):', policyError);
    }

    console.log('S3 bucket configured successfully for tour hosting');

  } catch (error) {
    console.error('Error setting up S3 bucket:', error);
    throw new Error(`Failed to setup S3 bucket: ${error}`);
  }
}

// Get MIME type for file with proper HTML tour support
function getMimeType(filePath: string): string {
  const mimeType = mime.lookup(filePath);
  
  if (!mimeType) {
    const ext = path.extname(filePath).toLowerCase();
    
    // Handle common tour file types
    switch (ext) {
      case '.htm':
      case '.html':
        return 'text/html';
      case '.css':
        return 'text/css';
      case '.js':
        return 'application/javascript';
      case '.json':
        return 'application/json';
      case '.xml':
        return 'application/xml';
      case '.txt':
        return 'text/plain';
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.mp4':
        return 'video/mp4';
      case '.webm':
        return 'video/webm';
      case '.ogg':
        return 'video/ogg';
      default:
        return 'application/octet-stream';
    }
  }
  
  return mimeType;
}

// Upload single file to S3 with proper metadata
async function uploadFileToS3(
  localPath: string,
  s3Key: string,
  contentType: string
): Promise<void> {
  const fileContent = fs.readFileSync(localPath);
  
  const uploadParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
    // Set cache control for performance
    CacheControl: contentType.startsWith('text/html') ? 'no-cache' : 'public, max-age=31536000',
    // Additional metadata
    Metadata: {
      'uploaded-by': 'realevr-system',
      'upload-timestamp': new Date().toISOString()
    }
  };

  // Upload the file. The bucket policy will make it public.
  try {
    await s3Client.send(new PutObjectCommand(uploadParams));
  } catch (error: any) {
    console.error(`Failed to upload ${s3Key}:`, error);
    throw error;
  }
}

// Collect all files recursively
function collectAllFiles(dir: string, basePath: string = ''): Array<{localPath: string, s3Key: string, size: number}> {
  const files: Array<{localPath: string, s3Key: string, size: number}> = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const localPath = path.join(dir, entry.name);
      const s3Key = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(localPath)) {
          files.push(...collectAllFiles(localPath, s3Key));
        }
      } else if (entry.isFile()) {
        if (!shouldSkipFile(localPath)) {
          const stats = fs.statSync(localPath);
          files.push({
            localPath,
            s3Key,
            size: stats.size
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error collecting files from ${dir}:`, error);
  }
  
  return files;
}

// Count files recursively
const countFilesRecursive = (dir: string): number => {
  let count = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        if (!shouldSkipDirectory(filePath)) {
          count += countFilesRecursive(filePath);
        }
      } else {
        if (!shouldSkipFile(filePath)) {
          count++;
        }
      }
    }
  } catch (error) {
    console.error(`Error counting files in ${dir}:`, error);
  }
  return count;
};

// Main upload function
export async function uploadTourToS3(
  extractedFolderPath: string,
  propertyId: string,
  onProgress: (progress: number) => void
): Promise<string> {
  try {
    // Ensure bucket is setup
    await setupS3TourBucket();

    let uploadRoot = extractedFolderPath;
    const entries = fs.readdirSync(extractedFolderPath);
    
    // If the extracted folder contains a single directory, treat that as the root
    if (entries.length === 1 && fs.statSync(path.join(extractedFolderPath, entries[0])).isDirectory()) {
      uploadRoot = path.join(extractedFolderPath, entries[0]);
    }
    
    const tourName = path.basename(extractedFolderPath);
    const s3KeyPrefix = `tours/property_${propertyId}/${tourName}`;
    
    // Find index file
    const findIndexFile = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
          return path.relative(uploadRoot, fullPath).replace(/\\/g, '/');
        } else if (entry.isDirectory()) {
          const found = findIndexFile(fullPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    const indexFile = findIndexFile(uploadRoot) || 'index.html';
    const files = collectAllFiles(uploadRoot, s3KeyPrefix);
    const totalFiles = files.length;
    
    if (totalFiles === 0) {
      onProgress(1);
      throw new Error('No files found to upload');
    }
    
    console.log(`Uploading ${totalFiles} files to S3...`);
    
    let uploadedFiles = 0;
    
    // Upload files sequentially to avoid overwhelming S3
    for (const file of files) {
      try {
        const contentType = getMimeType(file.localPath);
        await uploadFileToS3(file.localPath, file.s3Key, contentType);
        
        uploadedFiles++;
        onProgress(uploadedFiles / totalFiles);
        
        console.log(`✓ Uploaded: ${path.basename(file.localPath)} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        
      } catch (error) {
        console.error(`✗ Failed to upload ${path.basename(file.localPath)}:`, error);
        throw error;
      }
    }
    
    // Construct the public URL for the tour
    const indexS3Key = `${s3KeyPrefix}/${indexFile}`;
    const tourUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${indexS3Key}`;
    
    console.log(`Tour uploaded successfully to S3: ${tourUrl}`);
    return tourUrl;
    
  } catch (error: any) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload tour to S3: ${error.message}`);
  }
}

// Check if tour exists in S3
export async function tourExistsInS3(propertyId: string): Promise<boolean> {
  try {
    // This would require listing objects with the prefix, but for simplicity
    // we'll return false and let the upload proceed
    return false;
  } catch (error) {
    console.error('Error checking tour existence in S3:', error);
    return false;
  }
}

// Initialize S3 configuration
export async function initializeS3() {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.warn('AWS credentials not found in environment variables');
    console.warn('Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    return;
  }
  
  if (!process.env.AWS_REGION) {
    console.warn('AWS_REGION not set, using us-east-1 as default');
  }
  
  try {
    await setupS3TourBucket();
    console.log('S3 tour hosting initialized successfully');
  } catch (error) {
    console.error('Failed to initialize S3 tour hosting:', error);
  }
}
