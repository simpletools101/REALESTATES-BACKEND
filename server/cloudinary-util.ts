import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary
cloudinary.config({
    cloud_name: 'dnemgxfwh',
    api_key: '452781244654595',
    api_secret: 'BsW4-BLzWZRMh8_EeUVHAafwdv0'
});

/**
 * Uploads an entire folder to Cloudinary.
 * @param {string} localFolderPath - The local path of the folder to upload.
 * @param {string} cloudinaryFolderPath - The target folder path in Cloudinary.
 * @returns {Promise<any[]>} - An array of upload results.
 */
async function uploadFolder(localFolderPath: string, cloudinaryFolderPath: string) {
    const files = fs.readdirSync(localFolderPath);
    const uploads = [];

    for (const file of files) {
        const localFilePath = path.join(localFolderPath, file);
        const stats = fs.statSync(localFilePath);

        if (stats.isDirectory()) {
            uploads.push(...await uploadFolder(localFilePath, `${cloudinaryFolderPath}/${file}`));
        } else {
            const ext = path.extname(localFilePath).toLowerCase();
            
            // // Skip system files
            // if (['.ds_store', '.thumbs.db'].includes(ext)) {
            //     continue;
            // }
            
            // Upload all files with basic configuration
            const result = await cloudinary.uploader.upload(localFilePath, {
                folder: cloudinaryFolderPath,
                resource_type: 'auto',
                use_filename: true,
                unique_filename: false
            });
            uploads.push(result);
        }
    }

    return uploads;
}

/**
 * Uploads an extracted tour folder to Cloudinary and returns a viewable URL.
 * @param {string} extractedFolderPath - The path to the extracted tour folder.
 * @param {string} propertyId - The ID of the property.
 * @returns {Promise<string>} - The viewable URL of the tour's index.html.
 */
export async function uploadTourToCloudinary(extractedFolderPath: string, propertyId: string): Promise<string> {
    try {
        const cloudinaryFolderPath = `tours/property_${propertyId}`;

        // Find the index.html file in the extracted folder
        const findIndexFile = (dir: string): string | null => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isFile() && (entry.name.toLowerCase() === 'index.html' || entry.name.toLowerCase() === 'index.htm')) {
                    return path.relative(extractedFolderPath, fullPath).replace(/\\/g, '/');
                } else if (entry.isDirectory()) {
                    const found = findIndexFile(fullPath);
                    if (found) return path.join(entry.name, found).replace(/\\/g, '/');
                }
            }
            return null;
        };

        const indexFile = findIndexFile(extractedFolderPath) || 'index.html';

        await uploadFolder(extractedFolderPath, cloudinaryFolderPath);

        // After uploading, the URL to the index.html file will be based on the folder path and the file name.
        const tourUrl = cloudinary.url(`${cloudinaryFolderPath}/${indexFile}`, { resource_type: 'raw' });

        return tourUrl;

    } catch (error: any) {
        console.error('Cloudinary upload error:', error);
        if (error.message.includes('Invalid image file')) {
            throw new Error('Invalid image file detected. Please ensure all files in the tour are valid images (JPG, PNG, GIF, WEBP, SVG).');
        }
        throw new Error(`Failed to upload tour to Cloudinary: ${error.message}`);
    }
}