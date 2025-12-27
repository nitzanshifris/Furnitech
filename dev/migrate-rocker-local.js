/**
 * Local script to migrate ROCKER model from Cloudinary to AWS S3
 * Run this locally with: node migrate-rocker-local.js
 */

const { createClient } = require('@supabase/supabase-js');
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fetch = require('node-fetch');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

console.log('🪑 Starting ROCKER Migration...');
console.log('📍 Environment check:');
console.log('  SUPABASE_URL:', !!process.env.SUPABASE_URL);
console.log('  AWS credentials:', !!process.env.AWS_ACCESS_KEY_ID);
console.log('  S3 bucket:', process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets');

async function migrateRocker() {
    try {
        // Initialize clients
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        const s3Client = new S3Client({
            region: process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

        // Step 1: Find ROCKER model
        console.log('🔍 Step 1: Finding ROCKER model...');
        const { data: rockerModel, error: findError } = await supabase
            .from('models')
            .select('id, title, cloudinary_url, cloudinary_public_id, file_size')
            .ilike('title', '%rocker%')
            .not('cloudinary_url', 'is', null)
            .single();

        if (findError || !rockerModel) {
            // Try alternative search
            const { data: altSearch } = await supabase
                .from('models')
                .select('id, title, cloudinary_url, file_size')
                .or('title.ilike.%נדנדה%,title.ilike.%כיסא%')
                .not('cloudinary_url', 'is', null)
                .limit(5);

            console.log('❌ ROCKER model not found');
            if (altSearch?.length > 0) {
                console.log('🔍 Found similar models:');
                altSearch.forEach(model => {
                    console.log(`   - ${model.title} (ID: ${model.id})`);
                });
            }
            return;
        }

        console.log(`✅ Found: ${rockerModel.title} (ID: ${rockerModel.id})`);
        console.log(`   File size: ${(rockerModel.file_size / 1024 / 1024).toFixed(2)} MB`);

        const modelId = rockerModel.id;

        // Step 2: Check if already exists in AWS
        console.log('🔍 Step 2: Checking if already in AWS...');
        try {
            const checkCommand = new HeadObjectCommand({
                Bucket: bucket,
                Key: `furniture-models/${modelId}.glb`
            });
            const existing = await s3Client.send(checkCommand);
            console.log('ℹ️  Model already exists in AWS!');
            console.log(`   Size: ${(existing.ContentLength / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   Last modified: ${existing.LastModified}`);

            const awsUrl = `https://${bucket}.s3.us-east-1.amazonaws.com/furniture-models/${modelId}.glb`;
            console.log(`   AWS URL: ${awsUrl}`);
            console.log('✅ Migration already complete!');
            return {
                success: true,
                alreadyExists: true,
                awsUrl: awsUrl,
                size: existing.ContentLength
            };
        } catch (error) {
            if (error.name !== 'NotFound') {
                throw error;
            }
            console.log('✅ Model not in AWS yet - proceeding with migration');
        }

        // Step 3: Download from Cloudinary
        console.log('📥 Step 3: Downloading from Cloudinary...');
        console.log(`   URL: ${rockerModel.cloudinary_url}`);

        const response = await fetch(rockerModel.cloudinary_url);
        if (!response.ok) {
            throw new Error(`Failed to download: ${response.status}`);
        }

        const buffer = await response.buffer();
        console.log(`✅ Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

        // Step 4: Upload to AWS S3
        console.log('📤 Step 4: Uploading to AWS S3...');
        const key = `furniture-models/${modelId}.glb`;

        const uploadCommand = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: 'model/gltf-binary',
            ContentDisposition: 'inline',
            CacheControl: 'public, max-age=31536000',
            Metadata: {
                'model-id': modelId.toString(),
                'upload-timestamp': new Date().toISOString(),
                'source': 'migration',
                'original-title': rockerModel.title
            }
        });

        const uploadResult = await s3Client.send(uploadCommand);
        const awsUrl = `https://${bucket}.s3.us-east-1.amazonaws.com/${key}`;

        console.log('✅ Upload successful!');
        console.log(`   AWS URL: ${awsUrl}`);
        console.log(`   ETag: ${uploadResult.ETag}`);

        // Step 5: Verify upload
        console.log('🔍 Step 5: Verifying upload...');
        const verifyCommand = new HeadObjectCommand({
            Bucket: bucket,
            Key: key
        });
        const verifyResult = await s3Client.send(verifyCommand);

        const sizesMatch = Math.abs(buffer.length - verifyResult.ContentLength) < 1024;
        console.log(`✅ Verification complete!`);
        console.log(`   Original: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   AWS: ${(verifyResult.ContentLength / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Sizes match: ${sizesMatch ? '✅' : '❌'}`);

        // Results
        console.log('\n🎉 ROCKER MIGRATION COMPLETE!');
        console.log('\n📊 Summary:');
        console.log(`   Model: ${rockerModel.title}`);
        console.log(`   ID: ${modelId}`);
        console.log(`   AWS URL: ${awsUrl}`);
        console.log(`   File size: ${(verifyResult.ContentLength / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   Integrity: ${sizesMatch ? 'VERIFIED' : 'NEEDS CHECK'}`);

        console.log('\n🧪 Test URLs:');
        console.log(`   AR Viewer: https://newfurniture.live/view?id=${modelId}`);
        console.log(`   Direct AWS: ${awsUrl}`);
        console.log(`   Original Cloudinary: ${rockerModel.cloudinary_url}`);

        return {
            success: true,
            modelId: modelId,
            title: rockerModel.title,
            awsUrl: awsUrl,
            originalUrl: rockerModel.cloudinary_url,
            verified: sizesMatch
        };

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('Stack:', error.stack);
        return { success: false, error: error.message };
    }
}

// Run the migration
migrateRocker()
    .then(result => {
        if (result.success) {
            console.log('\n✅ Migration completed successfully!');
            process.exit(0);
        } else {
            console.log('\n❌ Migration failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });