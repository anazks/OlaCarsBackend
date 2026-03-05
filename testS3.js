require("dotenv").config();
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const fs = require("fs");

const testUpload = async () => {
    try {
        const s3 = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        const body = Buffer.from("test content");

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: "test-upload.txt",
            Body: body,
            ContentType: "text/plain",
        });

        console.log("Sending command to S3...");
        await s3.send(command);
        console.log("Upload successful!");
    } catch (error) {
        console.error("Upload failed:");
        console.error(error);
    }
};

testUpload();
