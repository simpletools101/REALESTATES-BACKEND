"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToS3 = uploadFileToS3;
exports.getS3FileUrl = getS3FileUrl;
exports.deleteFileFromS3 = deleteFileFromS3;
var AWS = require("aws-sdk");
var s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});
var BUCKET = process.env.AWS_S3_BUCKET;
function uploadFileToS3(key, body, contentType) {
    return s3.upload({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    }).promise();
}
function getS3FileUrl(key) {
    return "https://".concat(BUCKET, ".s3.").concat(process.env.AWS_REGION, ".amazonaws.com/").concat(key);
}
function deleteFileFromS3(key) {
    return s3.deleteObject({
        Bucket: BUCKET,
        Key: key,
    }).promise();
}
