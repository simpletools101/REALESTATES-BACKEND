import path from 'path';
import fs from 'fs';

// Upload optimization configuration
export const UPLOAD_CONFIG = {
  // Dropbox upload settings
  DROPBOX: {
    // Maximum concurrent uploads (adjust based on your connection)
    MAX_CONCURRENT_UPLOADS: 5,
    
    // Chunk size for large files (4MB)
    CHUNK_SIZE: 4 * 1024 * 1024,
    
    // Files larger than this will use chunked upload (10MB)
    MAX_FILE_SIZE_FOR_SIMPLE_UPLOAD: 10 * 1024 * 1024,
    
    // Retry configuration
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1 second base delay
    
    // Connection timeout (30 seconds)
    TIMEOUT: 30000,
  },
  
  // File processing settings
  FILE_PROCESSING: {
    // Supported image formats for tours
    SUPPORTED_IMAGE_FORMATS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    
    // Supported video formats
    SUPPORTED_VIDEO_FORMATS: ['.mp4', '.webm', '.ogg'],
    
    // Maximum file size for individual files (100MB)
    MAX_INDIVIDUAL_FILE_SIZE: 100 * 1024 * 1024,
    
    // Files to exclude from upload
    EXCLUDED_FILES: [
      '.DS_Store',
      'Thumbs.db',
      '.gitkeep',
      'desktop.ini',
      '.tmp'
    ],
    
    // Directories to exclude
    EXCLUDED_DIRECTORIES: [
      '.git',
      '.svn',
      '__MACOSX',
      'node_modules'
    ]
  },
  
  // Progress reporting
  PROGRESS: {
    // How often to report progress (every N files)
    REPORT_INTERVAL: 1,
    
    // Minimum time between progress updates (ms)
    MIN_UPDATE_INTERVAL: 100,
  },
  
  // Performance optimizations
  PERFORMANCE: {
    // Use memory-mapped file reading for large files
    USE_MEMORY_MAPPING: true,
    
    // Buffer size for file streaming
    STREAM_BUFFER_SIZE: 64 * 1024, // 64KB
    
    // Enable compression for text files
    ENABLE_COMPRESSION: false, // Dropbox handles compression
    
    // Skip duplicate file detection
    SKIP_DUPLICATE_CHECK: false,
  }
};

// Environment-specific overrides
export function getOptimizedConfig() {
  const config = { ...UPLOAD_CONFIG };
  
  // Adjust based on environment
  if (process.env.NODE_ENV === 'production') {
    // Production optimizations
    config.DROPBOX.MAX_CONCURRENT_UPLOADS = 8; // More aggressive in production
    config.DROPBOX.CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
  } else if (process.env.NODE_ENV === 'development') {
    // Development - be more conservative
    config.DROPBOX.MAX_CONCURRENT_UPLOADS = 3;
    config.DROPBOX.CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
  }
  
  // Network-specific adjustments
  const uploadSpeedMbps = parseInt(process.env.UPLOAD_SPEED_MBPS || '10');
  if (uploadSpeedMbps < 5) {
    // Slow connection
    config.DROPBOX.MAX_CONCURRENT_UPLOADS = 2;
    config.DROPBOX.CHUNK_SIZE = 1 * 1024 * 1024; // 1MB chunks
  } else if (uploadSpeedMbps > 50) {
    // Fast connection
    config.DROPBOX.MAX_CONCURRENT_UPLOADS = 10;
    config.DROPBOX.CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
  }
  
  return config;
}


// Utility functions for file filtering
export function shouldSkipFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  
  // Check excluded files
  if (UPLOAD_CONFIG.FILE_PROCESSING.EXCLUDED_FILES.includes(fileName)) {
    return true;
  }
  
  // Check if it's a hidden file
  if (fileName.startsWith('.') && fileName !== '.htaccess') {
    return true;
  }
  
  // Check file size
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > UPLOAD_CONFIG.FILE_PROCESSING.MAX_INDIVIDUAL_FILE_SIZE) {
      console.warn(`Skipping large file: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
      return true;
    }
  } catch (error) {
    console.warn(`Could not check file size for ${fileName}:`, error);
  }
  
  return false;
}

export function shouldSkipDirectory(dirPath: string): boolean {
  const dirName = path.basename(dirPath);
  
  return UPLOAD_CONFIG.FILE_PROCESSING.EXCLUDED_DIRECTORIES.some(excluded => 
    dirName.toLowerCase().includes(excluded.toLowerCase())
  );
}
