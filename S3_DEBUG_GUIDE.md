# S3 Connection Debugging Guide

## Environment Variables Check

Your `.env` file has the following S3 configuration:
```
AWS_ACCESS_KEY_ID=AKIAR2KSJCRDVNZZB37Y
AWS_SECRET_ACCESS_KEY=u5V8Oz5QfQFfsn6k8WUC8dDs0w7baR1j9gas3jME
AWS_REGION=ap-southeast-2
AWS_BUCKET_NAME=olacars-bucket-26
```

## Verification Steps

### 1. Check Credentials in AWS Console
```
✓ Access Key ID: AKIAR2KSJCRDVNZZB37Y
✓ Region: ap-southeast-2 (Sydney, Australia)
✓ Bucket: olacars-bucket-26
```

Go to AWS Console and verify:
- [ ] Access Key is active and not revoked
- [ ] S3 bucket exists in the ap-southeast-2 region
- [ ] Bucket policy allows PutObject operations
- [ ] Access Key has S3 permissions

### 2. Check Node.js Logs

When you upload a file, look for logs in this order:

```
[S3 Config] Initialization Check:
[S3 Config] AWS_ACCESS_KEY_ID: ✓ Set
[S3 Config] AWS_SECRET_ACCESS_KEY: ✓ Set
[S3 Config] AWS_REGION: ap-southeast-2
[S3 Config] AWS_BUCKET_NAME: olacars-bucket-26
[S3 Config] ✓ S3 initialized for region: ap-southeast-2, bucket: olacars-bucket-26
```

### 3. Upload Debug Logs

When uploading a document, watch for:

```
[Driver Upload] Starting upload for driver: {driverId}
[Driver Upload] Files received: [fieldName1, fieldName2, ...]
[Driver Upload] Processing field: {fieldName}, file: {filename}
[Upload] Starting S3 upload...
[Upload] Bucket: olacars-bucket-26
[Upload] Region: ap-southeast-2
[Upload] Key: drivers/{driverId}/documents/{timestamp}_{filename}
[Upload] File size: {bytes} bytes
[Upload] Content-Type: {type}
[Upload] Executing PutObjectCommand...
[Upload] ✓ S3 upload successful: https://olacars-bucket-26.s3.ap-southeast-2.amazonaws.com/...
```

## Common Issues & Solutions

### Issue 1: AWS Credentials Not Set
**Symptom**: 
```
[Upload] AWS credentials not fully configured. Using local file storage.
```

**Solution**:
- Verify all 4 env variables are set: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME`
- Check for extra spaces in `.env` file
- Restart the Node.js server after updating `.env`

### Issue 2: Access Denied Error
**Symptom**:
```
[Upload] ✗ S3 upload failed!
[Upload] Error name: AccessDenied
[Upload] Error message: The AWS Access Key Id you provided does not exist...
```

**Solution**:
- Verify Access Key ID and Secret Access Key in AWS IAM Console
- Check if the key is still active (not deactivated/deleted)
- Ensure the key has S3 permissions: `s3:PutObject`, `s3:GetObject`
- Verify in IAM > Users > Security credentials

### Issue 3: NoSuchBucket Error
**Symptom**:
```
[Upload] Error name: NoSuchBucket
```

**Solution**:
- Verify bucket name: `olacars-bucket-26`
- Check if bucket exists in region: `ap-southeast-2` (Sydney)
- Create bucket if missing: AWS S3 Console > Create bucket

### Issue 4: Wrong Region
**Symptom**: Uploading works but files aren't visible in console

**Solution**:
- Verify you're looking at the correct region: **ap-southeast-2**
- Files are in S3 bucket: `olacars-bucket-26` > `drivers/{id}/documents/`

### Issue 5: Network Connectivity
**Symptom**:
```
[Upload] ✗ S3 upload failed!
[Upload] Error message: RequestError...
```

**Solution**:
- Check internet connection
- Check if AWS endpoints are accessible from your network
- Try uploading from a different network
- Check firewall rules

## Testing S3 Connection

### Using Node.js Test Script

Create `test-s3.js`:

```javascript
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testS3() {
  try {
    console.log("Testing S3 connection...");
    const testKey = `test-${Date.now()}.txt`;
    
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: testKey,
      Body: Buffer.from("Hello, S3!"),
      ContentType: "text/plain",
    });

    await s3.send(command);
    console.log("✓ S3 test successful!");
    console.log(`File uploaded to: https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${testKey}`);
  } catch (error) {
    console.error("✗ S3 test failed:", error.message);
    console.error("Error details:", error);
  }
}

testS3();
```

Run with:
```bash
node test-s3.js
```

## Expected S3 URLs

Valid URLs should follow this format:
```
https://olacars-bucket-26.s3.ap-southeast-2.amazonaws.com/drivers/{driverId}/documents/{timestamp}_{filename}
```

Example:
```
https://olacars-bucket-26.s3.ap-southeast-2.amazonaws.com/drivers/6a0e8b11c1b0fb24e291e76f/documents/1779358320612_Screenshot_2026-03-12-09-02-56.jpg
```

**NOT** this (local fallback):
```
/uploads/drivers/{driverId}/documents/{timestamp}_{filename}
```

## Logs Location

- **Backend logs**: Check terminal where `npm run dev` is running
- **Frontend logs**: Browser console (F12)
- **Driver Upload logs**: Look for `[Driver Upload]` prefix
- **S3 Upload logs**: Look for `[Upload]` prefix
- **S3 Config logs**: Look for `[S3 Config]` prefix

## Contact AWS Support

If you've verified everything above and still have issues:
- Go to AWS Console > Support Center
- Create a support case with:
  - AWS Access Key ID (AKIAR2KSJCRDVNZZB37Y)
  - Region: ap-southeast-2
  - Bucket: olacars-bucket-26
  - Error message from logs
