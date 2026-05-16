const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const s3 = require("../config/s3");

/**
 * Generate a temporary secure URL to view or download a private S3 file.
 * @param {string} key - The S3 object key or full URL
 * @param {number} expiresIn - Expiration time in seconds (default 1 hour)
 * @param {string} downloadName - If provided, the URL will force a download with this filename
 * @returns {Promise<string>} - The temporary URL
 */
const getPresignedUrl = async (key, expiresIn = 3600, downloadName = null) => {
    if (!key) return null;

    let s3Key = key;
    if (key.startsWith("http")) {
        // This regex catches both virtual-hosted style (bucket.s3.region.amazonaws.com/key)
        // and path-style (s3.region.amazonaws.com/bucket/key) URLs.
        const bucketName = process.env.AWS_BUCKET_NAME;
        
        // Check for virtual-hosted style: https://bucket.s3.../key
        if (key.includes(`${bucketName}.s3`)) {
            const parts = key.split('.amazonaws.com/');
            if (parts.length > 1) s3Key = parts[1];
        } 
        // Check for path-style: https://s3.../bucket/key
        else if (key.includes(`/${bucketName}/`)) {
            const parts = key.split(`/${bucketName}/`);
            if (parts.length > 1) s3Key = parts[1];
        } 
        // If it's some other domain but we know it's a full URL, try to just grab the path
        else {
            try {
                const urlObj = new URL(key);
                s3Key = urlObj.pathname.substring(1); // remove leading slash
            } catch (e) {
                return key;
            }
        }
    }

    // ALWAYS remove any query parameters from the key, decoding first in case of double-encoding
    s3Key = decodeURIComponent(s3Key).split('?')[0];

    try {
        const commandParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
        };

        // FORCE DOWNLOAD: If downloadName is provided, add the header
        if (downloadName) {
            commandParams.ResponseContentDisposition = `attachment; filename="${downloadName}"`;
        }

        const command = new GetObjectCommand(commandParams);
        const url = await getSignedUrl(s3, command, { expiresIn });
        return url;
    } catch (error) {
        console.error("[S3] Presigned URL Error:", error.message);
        return key;
    }
};

module.exports = getPresignedUrl;
