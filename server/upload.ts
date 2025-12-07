import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { nanoid } from 'nanoid';
import AdmZip from 'adm-zip';
import { uploadFileToS3, getS3FileUrl } from './s3-util';
import { uploadTourToCloudinary } from './cloudinary-util';
// @ts-ignore
// import { uploadTourDirToFTP } from "./ftp-upload";
// Dynamically import CommonJS tour-progress-manager for ESM compatibility
// @ts-ignore
let createJob: any, sendProgress: any, addListener: any;
(async () => {
  const progressManager = await import('./tour-progress-manager');
  createJob = progressManager.createJob;
  sendProgress = progressManager.sendProgress;
  addListener = progressManager.addListener;
})();

// Create necessary directories if they don't exist
const uploadDir = path.join(process.cwd(), 'uploads');
const imageDir = path.join(uploadDir, 'images');
const tourDir = path.join(uploadDir, 'tours');

// Create directories if they don't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(imageDir)) {
  fs.mkdirSync(imageDir);
}
if (!fs.existsSync(tourDir)) {
  fs.mkdirSync(tourDir);
}

// Use memory storage to keep the file as a buffer
const imageStorage = multer.memoryStorage();

// Configure storage for virtual tour zip files
const tourStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tourDir);
  },
  filename: (req, file, cb) => {
    const uniqueId = nanoid(8);
    const extension = path.extname(file.originalname);
    cb(null, `${uniqueId}${extension}`);
  }
});

// Multer configuration for property images
const multerUpload = multer({
  storage: imageStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image file.') as any);
    }
  }
});

// Middleware to upload property image to S3
const s3UploadMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return next(); // No file to upload, proceed to next middleware
  }

  try {
    const file = req.file;
    const uniqueId = nanoid(16);
    const extension = path.extname(file.originalname);
    const key = `images/${uniqueId}${extension}`;

    // Upload to S3
    await uploadFileToS3(key, file.buffer, file.mimetype);

    // Get S3 URL
    const s3Url = getS3FileUrl(key);

    // Attach S3 URL to the file object for downstream use
    (req.file as any).s3Url = s3Url;

    next();
  } catch (error) {
    console.error('S3 upload error:', error);
    next(error);
  }
};

// Chain multer middleware with S3 upload middleware
export const uploadPropertyImage = (req: Request, res: Response, next: NextFunction) => {
  const uploader = multerUpload.single('image');
  uploader(req, res, (err: any) => {
    if (err) {
      return next(err);
    }
    // After multer has processed the file, call the S3 upload middleware
    s3UploadMiddleware(req, res, next);
  });
};

// --- Virtual Tour Upload with SSE Progress ---
export const uploadVirtualTour = (req: Request, res: Response, next: NextFunction) => {
  const multerDisk = multer({ storage: tourStorage }).single('tourZip');
  multerDisk(req, res, async (err: any) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    try {
      // Get property ID from URL parameter instead of body
      const propertyId = (req as any).propertyId || req.body.propertyId || nanoid(8);
      const jobId = createJob();
      res.status(200).json({ jobId }); // Respond immediately with jobId

      (async () => {
        try {
          const zip = new AdmZip((req.file as Express.Multer.File).path);
          const extractDir = path.join(tourDir, `property_${propertyId}_tour`);
          if (fs.existsSync(extractDir)) {
            fs.rmSync(extractDir, { recursive: true, force: true });
          }
          fs.mkdirSync(extractDir, { recursive: true });

          const zipEntries = zip.getEntries();
          const totalEntries = zipEntries.length;
          let extracted = 0;

          for (const entry of zipEntries) {
            const entryPath = path.join(extractDir, entry.entryName);
            if (entry.isDirectory) {
              fs.mkdirSync(entryPath, { recursive: true });
            } else {
              fs.mkdirSync(path.dirname(entryPath), { recursive: true });
              fs.writeFileSync(entryPath, entry.getData());
            }

            extracted++;
            const extractionProgress = Math.round((extracted / totalEntries) * 30); // Extraction is 0-30%
            sendProgress(jobId, {
              progress: extractionProgress,
              message: `Extracting ZIP (${extracted}/${totalEntries})...`,
            });
          }

          sendProgress(jobId, { progress: 35, message: 'Scanning for index file...' });

          const findIndexFile = (dir: string): string | null => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
                return path.relative(extractDir, fullPath).replace(/\\/g, '/');
              } else if (entry.isDirectory()) {
                const found = findIndexFile(fullPath);
                if (found) return path.join(entry.name, found).replace(/\\/g, '/');
              }
            }
            return null;
          };

          const indexFile = findIndexFile(extractDir) || 'index.html';

          sendProgress(jobId, { progress: 40, message: `Uploading files to AWS S3...` });

          const { uploadTourToS3 } = await import('./s3-tour-hosting');
          const tourUrl = await uploadTourToS3(extractDir, propertyId, (uploadProgress) => {
            // Map upload progress (0–1) to 40–95%
            sendProgress(jobId, {
              progress: Math.floor(40 + (uploadProgress * 55)),
              message: 'Uploading virtual tour files...'
            });
          });

          sendProgress(jobId, { progress: 97, message: 'Finalizing upload...' });



          const { storage } = await import('./storage');
          await storage.updateProperty(parseInt(propertyId), { hasTour: true, tourUrl });

          fs.unlinkSync((req.file as Express.Multer.File).path);

          sendProgress(jobId, { progress: 100, message: 'Upload complete!', done: true, tourUrl });
        } catch (e: any) {
          sendProgress(jobId, { error: e.message, done: true });
        }
      })();
    } catch (e: any) {
      return res.status(500).json({ error: e.message, stack: e.stack });
    }
  });
};


// --- SSE Progress Endpoint ---
export const sseTourProgress = (req: Request, res: Response) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  const { jobId } = req.params;
  const ok = addListener(jobId, res);
  if (!ok) {
    res.write(`data: ${JSON.stringify({ error: 'Invalid jobId' })}\n\n`);
    res.end();
    return;
  }
  req.on('close', () => {
    // Optionally clean up listeners
  });
};

// Register routes (add to your Express app)
export function registerTourUploadRoutes(app: express.Application) {
  app.post('/api/upload/virtual-tour/:propertyId', uploadVirtualTour);
  app.get('/api/upload/virtual-tour/progress/:jobId', sseTourProgress);
}

// Helper functions for file operations
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Middleware to handle upload errors
export function handleUploadErrors(err: any, req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(400).json({ error: err.message });
  }

  next();
}

// Configure routes to serve uploaded files
export function setupStaticFileRoutes(app: any) {
  // Serve property images
  app.use('/uploads/images', (req: Request, res: Response, next: NextFunction) => {
    // Set cache headers for images
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day
    next();
  }, express.static(imageDir));

  // Serve virtual tours
  app.use('/uploads/tours', (req: Request, res: Response, next: NextFunction) => {
    // Set cache headers for tour files
    res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    next();
  }, express.static(tourDir));
}