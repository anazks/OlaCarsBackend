require("dotenv").config();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// Check config
const hasValidConfig = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION && process.env.AWS_BUCKET_NAME;

console.log("\n--- S3 Configuration Check ---");
console.log("AWS_ACCESS_KEY_ID:", process.env.AWS_ACCESS_KEY_ID ? "✓ Set" : "✗ Missing");
console.log("AWS_SECRET_ACCESS_KEY:", process.env.AWS_SECRET_ACCESS_KEY ? "✓ Set" : "✗ Missing");
console.log("AWS_REGION:", process.env.AWS_REGION || "✗ Missing");
console.log("AWS_BUCKET_NAME:", process.env.AWS_BUCKET_NAME || "✗ Missing");
console.log("-------------------------------\n");

if (!hasValidConfig) {
  console.error("✗ Error: S3 Configuration is incomplete in .env file.");
  process.exit(1);
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testS3() {
  try {
    console.log("Starting S3 upload test...");
    const testKey = `tests/test-connection-${Date.now()}.txt`;
    const fileContent = "Hello from OlaCars Backend! S3 integration is working perfectly.";

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from(fileContent),
      ContentType: "text/plain",
    });

    console.log(`Uploading test file to bucket: ${process.env.AWS_BUCKET_NAME}`);
    console.log(`File Key: ${testKey}`);
    
    await s3.send(command);
    
    const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${testKey}`;
    
    console.log("\n✓ S3 Upload Successful!");
    console.log(`Public URL: ${s3Url}`);
    console.log("\nPlease open the URL in your browser to verify public readability.");
  } catch (error) {
    console.error("\n✗ S3 Upload Failed!");
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);
    console.error("Error Details:", error);
  }
}

testS3();
