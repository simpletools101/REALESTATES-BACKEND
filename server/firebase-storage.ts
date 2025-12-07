import { initializeApp } from "firebase/app";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from "fs";
import path from "path";

const firebaseConfig = {
  // apiKey: "AIzaSyBRIl0ATDL3eN1-fteya4nbv8RLEAdgm1o",
  // authDomain: "artworks-422fa.firebaseapp.com",
  // databaseURL: "https://artworks-422fa-default-rtdb.firebaseio.com",
  // projectId: "artworks-422fa",
  // storageBucket: "artworks-422fa.appspot.com",
  // messagingSenderId: "401262057267",
  // appId: "1:401262057267:web:5f26a73d81fe9b53531046",
  // measurementId: "G-5W9XRXM80N"

  apiKey: "AIzaSyAZpLNyS9RN7BN6eAcD5AvHmgKBi-eYfmA",
  authDomain: "moxiescreen.firebaseapp.com",
  databaseURL: "https://moxiescreen-default-rtdb.firebaseio.com",
  projectId: "moxiescreen",
  storageBucket: "moxiescreen.appspot.com",
  messagingSenderId: "346104076821",
  appId: "1:346104076821:web:fe8a90f12720aeb448cc1c",
  measurementId: "G-NCQ7HLV0D0"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

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

interface UploadState {
  uploadedFiles: number;
  totalFiles: number;
  onProgress: (progress: number) => void;
}

async function uploadFolderRecursive(localFolderPath: string, remoteFolderPath: string, state: UploadState): Promise<{ file: string; url: string; }[]> {
  let uploads: { file: string; url: string; }[] = [];
  try {
    const files = fs.readdirSync(localFolderPath);
    const uploadPromises: Promise<void>[] = [];

    for (const file of files) {
      const localFilePath = path.join(localFolderPath, file);
      const stats = fs.statSync(localFilePath);

      if (stats.isDirectory()) {
        const nestedUploads = await uploadFolderRecursive(localFilePath, `${remoteFolderPath}/${file}`, state);
        uploads.push(...nestedUploads);
      } else {
        const fileRef = ref(storage, `${remoteFolderPath}/${file}`);
        const fileContent = fs.readFileSync(localFilePath);
        
        const uploadPromise = uploadBytes(fileRef, fileContent).then(async () => {
          const downloadURL = await getDownloadURL(fileRef);
          uploads.push({ file, url: downloadURL });
          state.uploadedFiles++;
          if (state.totalFiles > 0) {
            state.onProgress(state.uploadedFiles / state.totalFiles);
          }
        });
        uploadPromises.push(uploadPromise);
      }
    }

    await Promise.all(uploadPromises);

  } catch (error) {
    console.error(`Error uploading folder ${localFolderPath}:`, error);
    // Optionally re-throw or handle error as needed
  }
  return uploads;
}

export async function uploadTourToFirebase(extractedFolderPath: string, propertyId: string, onProgress: (progress: number) => void): Promise<string> {
  try {
    let uploadRoot = extractedFolderPath;
    const entries = fs.readdirSync(extractedFolderPath);
    // If the extracted folder contains a single directory, we'll treat that as the root.
    if (entries.length === 1 && fs.statSync(path.join(extractedFolderPath, entries[0])).isDirectory()) {
      uploadRoot = path.join(extractedFolderPath, entries[0]);
    }

    const tourName = path.basename(extractedFolderPath);
    const remoteFolderPath = `tours/property_${propertyId}/${tourName}`;
    
    const findIndexFile = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
          return path.relative(uploadRoot, fullPath).replace(/\\/g, '/');
        } else if (entry.isDirectory()) {
          const found = findIndexFile(fullPath);
          if (found) return found; // Corrected recursive return
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
    }
    await uploadFolderRecursive(uploadRoot, remoteFolderPath, uploadState);
    
    const indexRef = ref(storage, `${remoteFolderPath}/${indexFile}`);
    return await getDownloadURL(indexRef);

  } catch (error: any) {
    console.error('Firebase upload error:', error);
    throw new Error(`Failed to upload tour to Firebase: ${error.message}`);
  }
}

export async function tourExists(propertyId: string): Promise<boolean> {
  try {
    const remoteFolderPath = `tours/property_${propertyId}`;
    const indexRef = ref(storage, `${remoteFolderPath}/index.html`);
    await getDownloadURL(indexRef);
    return true; // If getDownloadURL succeeds, the file exists
  } catch (error: any) {
    if (error.code === 'storage/object-not-found') {
      return false; // The file does not exist
    }
    console.error('Error checking for tour existence:', error);
    throw new Error(`Failed to check for tour existence: ${error.message}`);
  }
}