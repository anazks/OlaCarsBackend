const { S3Client } = require("@aws-sdk/client-s3");

const hasValidConfig = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION;

console.log("[S3 Config] Initialization Check:");
console.log("[S3 Config] AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing");
console.log("[S3 Config] AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing");
console.log("[S3 Config] AWS_REGION:", process.env.AWS_REGION || "✗ Missing");
console.log("[S3 Config] AWS_BUCKET_NAME:", process.env.AWS_BUCKET_NAME || "✗ Missing");

if (!hasValidConfig) {
  console.warn("[S3 Config] ⚠️  AWS credentials incomplete - will fall back to local storage");
} else {
  console.log(`[S3 Config] ✓ S3 initialized for region: ${process.env.AWS_REGION}, bucket: ${process.env.AWS_BUCKET_NAME}`);
}

const s3Config = {
  region: process.env.AWS_REGION || "ap-south-1",
  logger: console, // Enable AWS SDK logging for debugging
};

if (hasValidConfig) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const s3 = new S3Client(s3Config);

console.log("[S3 Config] S3Client created successfully");

module.exports = s3;