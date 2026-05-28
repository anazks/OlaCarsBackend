# AWS S3 Bucket and Credentials Setup Guide

This guide will help you create a new Amazon S3 bucket, set up secure IAM access credentials, and connect them to your **OlaCarsBackend** project.

---

## 🛠️ Step 1: Create a New S3 Bucket

1. Sign in to your [AWS Management Console](https://aws.amazon.com/console/).
2. Search for **S3** in the top search bar and open the **S3** service.
3. Click the orange **Create bucket** button.
4. Configure the following settings:
   - **Bucket name**: Enter a unique name, e.g., `olacars-uploads-2026` (Must be lowercase, no spaces, globally unique).
   - **AWS Region**: Select the region closest to your server or users (e.g., `ap-south-1` for Mumbai, or `ap-southeast-2` for Sydney). Remember this region.
   - **Object Ownership**: Leave **ACLs disabled (recommended)** selected.
5. **Block Public Access settings for this bucket**:
   - **Uncheck** 🟩 **Block *all* public access**.
   - Check the warning box below it: ⚠️ *“I acknowledge that the current settings might result in this bucket and the objects within it becoming public.”*
   - *(This is required to allow direct public URL access for driver documents).*
6. Leave all other settings at their default values and click **Create bucket** at the bottom.

---

## 🔒 Step 2: Configure Bucket Permissions & CORS

To allow the backend and clients to upload, view, and display files, you need to add a **Bucket Policy** and **CORS** configuration.

### A. Add Bucket Policy for Public Read Access
1. In the S3 Console, click on your newly created bucket name.
2. Select the **Permissions** tab.
3. Scroll down to **Bucket policy** and click **Edit**.
4. Paste the following JSON policy (make sure to replace `YOUR_BUCKET_NAME` with your actual bucket name):
   ```json
   {
       "Version": "2012-10-17",
       "Statement": [
           {
               "Sid": "PublicReadGetObject",
               "Effect": "Allow",
               "Principal": "*",
               "Action": "s3:GetObject",
               "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
           }
       ]
   }
   ```
5. Click **Save changes**.

### B. Configure CORS (Cross-Origin Resource Sharing)
1. Still on the **Permissions** tab, scroll to the bottom to **Cross-origin resource sharing (CORS)**.
2. Click **Edit** and paste the following configuration:
   ```json
   [
       {
           "AllowedHeaders": [
               "*"
           ],
           "AllowedMethods": [
               "GET",
               "PUT",
               "POST",
               "DELETE",
               "HEAD"
           ],
           "AllowedOrigins": [
               "*"
           ],
           "ExposeHeaders": [],
           "MaxAgeSeconds": 3000
       }
   ]
   ```
3. Click **Save changes**.

---

## 🔑 Step 3: Create an IAM User and Access Credentials

To authenticate your Node.js application, you need AWS Access Keys.

1. Search for **IAM** in the top search bar of the AWS Console and open the **IAM** service.
2. In the left navigation bar, click on **Users**, then click **Create user**.
3. Enter a user name, e.g., `olacars-s3-user`, and click **Next**.
4. In **Permissions options**, select **Attach policies directly**.
5. In the permissions list search box, type **AmazonS3FullAccess**, check the box next to it, and click **Next**.
6. Review the settings and click **Create user**.
7. In the user list, click on your newly created user (`olacars-s3-user`).
8. Go to the **Security credentials** tab.
9. Scroll down to the **Access keys** section and click **Create access key**.
10. Select **Local code** or **Application running outside AWS** as the use case and click **Next**.
11. (Optional) Enter a description tag, then click **Create access key**.
12. **CRITICAL STEP**: Copy both keys:
    - **Access key ID** (looks like `AKIA...`)
    - **Secret access key** (longer text string)
    - *Tip: Click **Download .csv file** to save them securely. You cannot retrieve the Secret Access Key again once you leave this page.*

---

## 📝 Step 4: Update Your `.env` File

Open your project's `.env` file and update the S3 keys with your new credentials:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=YOUR_NEW_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=YOUR_NEW_SECRET_ACCESS_KEY
AWS_REGION=YOUR_SELECTED_REGION (e.g., ap-south-1)
AWS_BUCKET_NAME=YOUR_NEW_BUCKET_NAME
```

---

## ⚡ Step 5: Test the Connection

We have created a helper test script [test-s3.js](file:///c:/Users/Govind/Desktop/olacars/OlaCarsBackend/test-s3.js) for you to test your settings easily.

Run the following command in your terminal:
```bash
node test-s3.js
```

If everything is configured correctly, you will see:
```text
--- S3 Configuration Check ---
AWS_ACCESS_KEY_ID: ✓ Set
...
✓ S3 Upload Successful!
Public URL: https://your-bucket-name.s3.your-region.amazonaws.com/tests/test-connection-...
```
