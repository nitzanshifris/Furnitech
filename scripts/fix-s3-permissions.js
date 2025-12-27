#!/usr/bin/env node

/**
 * Script to fix S3 permissions for existing feedback images
 * Makes all feedback images publicly readable
 */

import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

async function fixPermissions() {
  console.log('🔧 Starting S3 permissions fix...');
  console.log(`📦 Bucket: ${bucket}`);

  try {
    // List all objects in the feedback-images folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'feedback-images/',
      MaxKeys: 1000
    });

    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('📭 No feedback images found');
      return;
    }

    console.log(`📸 Found ${response.Contents.length} feedback images`);

    // Update ACL for each object
    let fixed = 0;
    let failed = 0;

    for (const object of response.Contents) {
      try {
        const aclCommand = new PutObjectAclCommand({
          Bucket: bucket,
          Key: object.Key,
          ACL: 'public-read'
        });

        await s3Client.send(aclCommand);
        fixed++;
        console.log(`✅ Fixed: ${object.Key}`);
      } catch (error) {
        failed++;
        console.error(`❌ Failed: ${object.Key} - ${error.message}`);
      }
    }

    console.log('\n📊 Summary:');
    console.log(`✅ Successfully fixed: ${fixed} images`);
    console.log(`❌ Failed to fix: ${failed} images`);
    console.log(`📸 Total processed: ${response.Contents.length} images`);

    if (response.IsTruncated) {
      console.log('\n⚠️  Warning: There are more images than shown. Run the script again to process additional images.');
    }

  } catch (error) {
    console.error('🚨 Error:', error);
    process.exit(1);
  }
}

// Run the script
fixPermissions().then(() => {
  console.log('\n✨ Done!');
  process.exit(0);
}).catch(error => {
  console.error('🚨 Fatal error:', error);
  process.exit(1);
});