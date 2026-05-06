const { S3Client } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy_key",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy_secret",
  },
});

module.exports = s3;