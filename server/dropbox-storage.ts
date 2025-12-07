import { Dropbox } from 'dropbox';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import pLimit from 'p-limit';
import { getOptimizedConfig, shouldSkipFile, shouldSkipDirectory } from './upload-config';

// Initialize Dropbox client with your credentials
const dbx = new Dropbox({
  clientId: process.env.DROPBOX_CLIENT_ID || 'wifh2kcy9zxidec',
  clientSecret: process.env.DROPBOX_CLIENT_SECRET || 'mkm08rg0k06ohja',
  accessToken: process.env.DROPBOX_ACCESS_TOKEN, // You'll need to get this through OAuth flow
});

interface UploadState {
  uploadedFiles: number;
  totalFiles: number;
  onProgress: (progress: number) => void;
}

const countFilesRecursive = (dir: string): number => {
  let count = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        count += countFilesRecursive(filePath);
      } else {
        count++;
      }
    }
  } catch (error) {
    console.error(`Error counting files in ${dir}:`, error);
  }
  return count;
};

// Get optimized configuration
const config = getOptimizedConfig();

// Create concurrency limiter with dynamic configuration
const uploadLimit = pLimit(config.DROPBOX.MAX_CONCURRENT_UPLOADS);

// Retry function with exponential backoff
async function retryOperation<T>(operation: () => Promise<T>, maxRetries = config.DROPBOX.MAX_RETRIES): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s, 8s...
      const delay = config.DROPBOX.RETRY_DELAY * Math.pow(2, attempt - 1);
      console.log(`Upload attempt ${attempt} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Optimized file collection function
function collectAllFiles(dir: string, basePath: string = ''): Array<{localPath: string, remotePath: string, size: number}> {
  const files: Array<{localPath: string, remotePath: string, size: number}> = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const localPath = path.join(dir, entry.name);
      const remotePath = basePath + '/' + entry.name;
      
      if (entry.isDirectory()) {
        // Recursively collect files from subdirectories
        files.push(...collectAllFiles(localPath, remotePath));
      } else if (entry.isFile()) {
        const stats = fs.statSync(localPath);
        files.push({
          localPath,
          remotePath,
          size: stats.size
        });
      }
    }
  } catch (error) {
    console.error(`Error collecting files from ${dir}:`, error);
  }
  
  return files;
}

// Optimized single file upload with chunking for large files
async function uploadSingleFile(localPath: string, remotePath: string, fileSize: number): Promise<void> {
  return retryOperation(async () => {
    if (shouldSkipFile(localPath)) {
      console.log(`⏭️ Skipping file: ${path.basename(localPath)}`);
      return;
    }
    
    if (fileSize <= config.DROPBOX.MAX_FILE_SIZE_FOR_SIMPLE_UPLOAD) {
      // Simple upload for smaller files
      const fileContent = fs.readFileSync(localPath);
      await dbx.filesUpload({
        path: remotePath,
        contents: fileContent,
        mode: 'overwrite',
        autorename: true
      });
    } else {
      // Chunked upload for larger files
      const sessionStartResult = await dbx.filesUploadSessionStart({
        contents: Buffer.alloc(0)
      });
      
      const sessionId = sessionStartResult.result.session_id;
      let offset = 0;
      
      // Read and upload file in chunks
      const fileHandle = fs.openSync(localPath, 'r');
      try {
        while (offset < fileSize) {
          const remainingBytes = fileSize - offset;
          const chunkSize = Math.min(config.DROPBOX.CHUNK_SIZE, remainingBytes);
          const buffer = Buffer.alloc(chunkSize);
          
          fs.readSync(fileHandle, buffer, 0, chunkSize, offset);
          
          if (offset + chunkSize >= fileSize) {
            // Final chunk
            await dbx.filesUploadSessionFinish({
              cursor: {
                session_id: sessionId,
                offset: offset
              },
              contents: buffer,
              commit: {
                path: remotePath,
                mode: 'overwrite',
                autorename: true
              }
            });
          } else {
            // Intermediate chunk
            await dbx.filesUploadSessionAppendV2({
              cursor: {
                session_id: sessionId,
                offset: offset
              },
              contents: buffer
            });
          }
          
          offset += chunkSize;
        }
      } finally {
        fs.closeSync(fileHandle);
      }
    }
  });
}

// Optimized parallel upload function
async function uploadFolderOptimized(
  localFolderPath: string,
  remoteFolderPath: string,
  state: UploadState
): Promise<string[]> {
  const files = collectAllFiles(localFolderPath, remoteFolderPath);
  const uploadedFiles: string[] = [];
  
  // Sort files by size (upload smaller files first for better perceived performance)
  files.sort((a, b) => a.size - b.size);
  
  // Create upload tasks with concurrency control
  const uploadTasks = files.map(file => 
    uploadLimit(async () => {
      try {
        await uploadSingleFile(file.localPath, file.remotePath, file.size);
        uploadedFiles.push(file.remotePath);
        
        // Update progress
        state.uploadedFiles++;
        if (state.totalFiles > 0) {
          state.onProgress(state.uploadedFiles / state.totalFiles);
        }
        
        console.log(`✓ Uploaded: ${path.basename(file.localPath)} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
        return file.remotePath;
      } catch (error) {
        console.error(`✗ Failed to upload ${path.basename(file.localPath)}:`, error);
        throw error;
      }
    })
  );
  
  // Wait for all uploads to complete
  await Promise.all(uploadTasks);
  return uploadedFiles;
}

// Convert Dropbox share URL to direct access URL
function convertToDirectUrl(shareUrl: string): string {
  // Convert from: https://www.dropbox.com/s/abc123/file.html?dl=0
  // To: https://dl.dropboxusercontent.com/s/abc123/file.html
  return shareUrl.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
}

// Create a shared link for the tour that can be embedded in iframe
async function createTourShareUrl(remotePath: string): Promise<string> {
  try {
    // Create shared link with public access
    const sharedLinkResult = await dbx.sharingCreateSharedLinkWithSettings({
      path: remotePath,
      settings: {
        requested_visibility: 'public'
      }
    });
    
    // Convert to direct URL that can be used in iframe
    const directUrl = convertToDirectUrl(sharedLinkResult.result.url);
    return directUrl;
  } catch (error: any) {
    // If shared link already exists, try to get existing one
    if (error.error && error.error['.tag'] === 'shared_link_already_exists') {
      try {
        const existingLinks = await dbx.sharingListSharedLinks({
          path: remotePath
        });
        
        if (existingLinks.result.links.length > 0) {
          return convertToDirectUrl(existingLinks.result.links[0].url);
        }
      } catch (getError) {
        console.error('Error getting existing shared link:', getError);
      }
    }
    
    console.error('Error creating shared link:', error);
    throw new Error(`Failed to create shared link: ${error.message}`);
  }
}

export async function uploadTourToDropbox(
  extractedFolderPath: string, 
  propertyId: string, 
  onProgress: (progress: number) => void
): Promise<string> {
  try {
    let uploadRoot = extractedFolderPath;
    const entries = fs.readdirSync(extractedFolderPath);
    
    // If the extracted folder contains a single directory, treat that as the root
    if (entries.length === 1 && fs.statSync(path.join(extractedFolderPath, entries[0])).isDirectory()) {
      uploadRoot = path.join(extractedFolderPath, entries[0]);
    }
    
    const tourName = path.basename(extractedFolderPath);
    const remoteFolderPath = `/tours/property_${propertyId}/${tourName}`;
    
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
    const totalFiles = countFilesRecursive(uploadRoot);
    
    const uploadState: UploadState = {
      uploadedFiles: 0,
      totalFiles: totalFiles,
      onProgress: onProgress
    };
    
    if (totalFiles === 0) {
      onProgress(1); // Nothing to upload, progress is 100%
      throw new Error('No files found to upload');
    }
    
    // Upload all files using optimized parallel upload
    console.log(`Starting optimized upload of ${totalFiles} files...`);
    await uploadFolderOptimized(uploadRoot, remoteFolderPath, uploadState);
    
    // Create and return the shared link for the index file
    const indexPath = `${remoteFolderPath}/${indexFile}`;
    const tourUrl = await createTourShareUrl(indexPath);
    
    console.log(`Tour uploaded successfully: ${tourUrl}`);
    return tourUrl;
    
  } catch (error: any) {
    console.error('Dropbox upload error:', error);
    throw new Error(`Failed to upload tour to Dropbox: ${error.message}`);
  }
}

export async function tourExists(propertyId: string): Promise<boolean> {
  try {
    const remotePath = `/tours/property_${propertyId}`;
    
    // Check if the folder exists
    const result = await dbx.filesListFolder({
      path: remotePath
    });
    
    // Check if there are any files (indicating tour exists)
    return result.result.entries.length > 0;
  } catch (error: any) {
    if (error.error && error.error['.tag'] === 'path_not_found') {
      return false; // The folder does not exist
    }
    console.error('Error checking for tour existence:', error);
    throw new Error(`Failed to check for tour existence: ${error.message}`);
  }
}

// Initialize Dropbox access token if not already set
export async function initializeDropboxAuth() {
  if (!process.env.DROPBOX_ACCESS_TOKEN) {
    console.warn('DROPBOX_ACCESS_TOKEN not found in environment variables');
    console.warn('You need to complete OAuth flow to get access token');
    
    // For development, you can get access token manually:
    // 1. Go to https://www.dropbox.com/developers/apps
    // 2. Create an app or select your existing app
    // 3. Go to Settings tab
    // 4. Generate access token
    // 5. Add it to your .env file as DROPBOX_ACCESS_TOKEN=your_token_here
  }
}

// Clean up old tours to save space (optional)
export async function cleanupOldTours(daysOld: number = 30): Promise<void> {
  try {
    const result = await dbx.filesListFolder({
      path: '/tours'
    });
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    for (const entry of result.result.entries) {
      if (entry['.tag'] === 'folder') {
        const folderInfo = await dbx.filesGetMetadata({
          path: entry.path_lower!
        });
        
        if (folderInfo.result['.tag'] === 'folder') {
          const serverModified = new Date(folderInfo.result.server_modified);
          if (serverModified < cutoffDate) {
            console.log(`Deleting old tour folder: ${entry.name}`);
            await dbx.filesDeleteV2({
              path: entry.path_lower!
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning up old tours:', error);
  }
}
