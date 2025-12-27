/**
 * Migrate Single Model to AWS S3
 * Safe, verified migration of one model at a time
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Initialize S3
function createS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { modelId } = req.body || req.query;

  if (!modelId) {
    return res.status(400).json({ error: 'Model ID is required' });
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`🚀 STARTING MIGRATION FOR MODEL: ${modelId}`);
  console.log('='.repeat(50));

  try {
    // ========================================
    // 1. GET MODEL FROM DATABASE
    // ========================================
    console.log('📋 Step 1: Fetching model from database...');

    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (fetchError || !model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    console.log(`✅ Found model: "${model.title}"`);
    console.log(`   Cloudinary URL: ${model.cloudinary_url}`);
    console.log(`   File size: ${(model.file_size / 1024 / 1024).toFixed(2)} MB`);

    // Check if already migrated
    if (model.storage_location === 'aws' && model.aws_url) {
      console.log('⚠️ Model already migrated to AWS');
      return res.status(200).json({
        success: true,
        message: 'Model already migrated',
        model: {
          id: model.id,
          title: model.title,
          aws_url: model.aws_url,
          migrated_at: model.migrated_at
        }
      });
    }

    // ========================================
    // 2. DOWNLOAD FROM CLOUDINARY
    // ========================================
    console.log('\n📥 Step 2: Downloading from Cloudinary...');

    const cloudinaryUrl = model.cloudinary_url;
    if (!cloudinaryUrl) {
      throw new Error('No Cloudinary URL found for this model');
    }

    const response = await fetch(cloudinaryUrl);
    if (!response.ok) {
      throw new Error(`Failed to download from Cloudinary: ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    console.log(`✅ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // ========================================
    // 3. PREPARE S3 UPLOAD
    // ========================================
    console.log('\n📤 Step 3: Preparing S3 upload...');

    const s3Client = createS3Client();
    const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

    // Create clean filename
    const cleanTitle = model.title
      .replace(/[^\w\s\u0590-\u05FF-]/g, '') // Keep Hebrew chars
      .replace(/\s+/g, '_')
      .toLowerCase()
      .substring(0, 50);

    const filename = `${cleanTitle}_${modelId}.glb`;
    const s3Key = `furniture-models/${filename}`;

    console.log(`   Bucket: ${bucket}`);
    console.log(`   Key: ${s3Key}`);

    // ========================================
    // 4. UPLOAD TO S3
    // ========================================
    console.log('\n☁️ Step 4: Uploading to S3...');

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: 'model/gltf-binary',
      Metadata: {
        'original-id': modelId,
        'original-title': model.title,
        'migrated-from': 'cloudinary',
        'migrated-at': new Date().toISOString()
      }
    }));

    const awsUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
    console.log(`✅ Uploaded to S3: ${awsUrl}`);

    // ========================================
    // 5. VERIFY UPLOAD
    // ========================================
    console.log('\n🔍 Step 5: Verifying upload...');

    const headResult = await s3Client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key
    }));

    const uploadedSize = headResult.ContentLength;
    const sizesMatch = Math.abs(buffer.length - uploadedSize) < 1024; // Within 1KB

    console.log(`   Original size: ${buffer.length} bytes`);
    console.log(`   Uploaded size: ${uploadedSize} bytes`);
    console.log(`   Sizes match: ${sizesMatch ? '✅' : '❌'}`);

    if (!sizesMatch) {
      throw new Error('File size mismatch after upload');
    }

    // ========================================
    // 6. UPDATE DATABASE
    // ========================================
    console.log('\n💾 Step 6: Updating database...');

    const { error: updateError } = await supabase
      .from('models')
      .update({
        storage_location: 'aws',
        aws_url: awsUrl,
        aws_filename: filename,
        migrated_at: new Date().toISOString(),
        file_size_bytes: buffer.length,
        migration_verified: true
      })
      .eq('id', modelId);

    if (updateError) {
      throw new Error(`Failed to update database: ${updateError.message}`);
    }

    console.log('✅ Database updated successfully');

    // ========================================
    // 7. LOG MIGRATION
    // ========================================
    console.log('\n📝 Step 7: Logging migration...');

    await supabase
      .from('migration_logs')
      .insert({
        model_id: modelId,
        action: 'migrate',
        status: 'success',
        details: {
          title: model.title,
          original_url: cloudinaryUrl,
          aws_url: awsUrl,
          file_size: buffer.length,
          duration_ms: Date.now()
        }
      });

    // ========================================
    // 8. GENERATE SUCCESS REPORT
    // ========================================
    const report = {
      success: true,
      message: `✅ Successfully migrated "${model.title}" to AWS S3`,
      migration: {
        model_id: modelId,
        title: model.title,
        original_url: cloudinaryUrl,
        aws_url: awsUrl,
        aws_filename: filename,
        file_size: buffer.length,
        file_size_mb: (buffer.length / 1024 / 1024).toFixed(2),
        migrated_at: new Date().toISOString(),
        verified: true
      },
      next_steps: [
        `Test AR view at: https://newfurniture.live/f/${model.customer_slug}/${model.url_slug}-${modelId}`,
        'Verify 3D model loads correctly',
        'Test on mobile device for AR',
        'If successful, proceed with batch migration'
      ]
    };

    console.log('\n' + '='.repeat(50));
    console.log('🎉 MIGRATION COMPLETE!');
    console.log('='.repeat(50));
    console.log(`Model: ${model.title}`);
    console.log(`AWS URL: ${awsUrl}`);
    console.log(`Size: ${report.migration.file_size_mb} MB`);
    console.log('='.repeat(50) + '\n');

    return res.status(200).json(report);

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);

    // Log failure
    await supabase
      .from('migration_logs')
      .insert({
        model_id: modelId,
        action: 'migrate',
        status: 'failed',
        error_message: error.message,
        details: { error: error.stack }
      });

    // Update model with error
    await supabase
      .from('models')
      .update({
        migration_error: error.message
      })
      .eq('id', modelId);

    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      model_id: modelId
    });
  }
};