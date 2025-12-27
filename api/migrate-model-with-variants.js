/**
 * Migrate Model WITH All Variants to AWS S3
 * Complete migration including all color/size variants
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

// Helper function to migrate a single file to S3
async function migrateFileToS3(cloudinaryUrl, s3Key, metadata) {
  const s3Client = createS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

  console.log(`  📥 Downloading from: ${cloudinaryUrl}`);

  const response = await fetch(cloudinaryUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`  ✅ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

  console.log(`  ☁️ Uploading to S3: ${s3Key}`);

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: buffer,
    ContentType: 'model/gltf-binary',
    Metadata: metadata
  }));

  const awsUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
  console.log(`  ✅ Uploaded to: ${awsUrl}`);

  // Verify upload
  const headResult = await s3Client.send(new HeadObjectCommand({
    Bucket: bucket,
    Key: s3Key
  }));

  if (Math.abs(buffer.length - headResult.ContentLength) > 1024) {
    throw new Error('File size mismatch after upload');
  }

  return { awsUrl, fileSize: buffer.length };
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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 STARTING COMPLETE MIGRATION (WITH VARIANTS) FOR: ${modelId}`);
  console.log('='.repeat(60));

  try {
    // ========================================
    // 1. GET MODEL AND VARIANTS FROM DATABASE
    // ========================================
    console.log('\n📋 Step 1: Fetching model and variants...');

    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (modelError || !model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const { data: variants, error: variantsError } = await supabase
      .from('model_variants')
      .select('*')
      .eq('parent_model_id', modelId);

    console.log(`✅ Found model: "${model.title}"`);
    console.log(`✅ Found ${variants?.length || 0} variants`);

    // Check if already migrated
    if (model.storage_location === 'aws' && model.aws_url) {
      const unmigrated = variants?.filter(v => v.storage_location !== 'aws') || [];
      if (unmigrated.length === 0) {
        console.log('⚠️ Model and all variants already migrated to AWS');
        return res.status(200).json({
          success: true,
          message: 'Already fully migrated',
          model: {
            id: model.id,
            title: model.title,
            aws_url: model.aws_url,
            variants_count: variants?.length || 0
          }
        });
      }
      console.log(`⚠️ Model migrated but ${unmigrated.length} variants need migration`);
    }

    const migrationResults = {
      model: null,
      variants: [],
      totalSize: 0,
      totalFiles: 0
    };

    // ========================================
    // 2. MIGRATE MAIN MODEL
    // ========================================
    if (model.storage_location !== 'aws' || !model.aws_url) {
      console.log('\n📦 Step 2: Migrating main model...');

      if (!model.cloudinary_url) {
        throw new Error('No Cloudinary URL for main model');
      }

      // Create clean filename for main model
      const cleanTitle = model.title
        .replace(/[^\\w\\s\\u0590-\\u05FF-]/g, '')
        .replace(/\\s+/g, '_')
        .toLowerCase()
        .substring(0, 50);

      const filename = `${cleanTitle}_${modelId}.glb`;
      const s3Key = `furniture-models/${filename}`;

      const result = await migrateFileToS3(
        model.cloudinary_url,
        s3Key,
        {
          'original-id': modelId,
          'original-title': Buffer.from(model.title).toString('base64'), // Encode Hebrew safely
          'variant-type': 'main',
          'migrated-from': 'cloudinary',
          'migrated-at': new Date().toISOString()
        }
      );

      // Update database for main model
      await supabase
        .from('models')
        .update({
          storage_location: 'aws',
          aws_url: result.awsUrl,
          aws_filename: filename,
          migrated_at: new Date().toISOString(),
          file_size_bytes: result.fileSize,
          migration_verified: true
        })
        .eq('id', modelId);

      migrationResults.model = {
        title: model.title,
        aws_url: result.awsUrl,
        size_mb: (result.fileSize / 1024 / 1024).toFixed(2)
      };
      migrationResults.totalSize += result.fileSize;
      migrationResults.totalFiles++;

      console.log(`✅ Main model migrated: ${result.awsUrl}`);
    } else {
      console.log('\n✅ Step 2: Main model already on AWS');
      migrationResults.model = {
        title: model.title,
        aws_url: model.aws_url,
        already_migrated: true
      };
    }

    // ========================================
    // 3. MIGRATE ALL VARIANTS
    // ========================================
    if (variants && variants.length > 0) {
      console.log(`\n🎨 Step 3: Migrating ${variants.length} variants...`);

      for (const variant of variants) {
        // Skip if already migrated
        if (variant.storage_location === 'aws' && variant.aws_url) {
          console.log(`  ✓ Variant "${variant.variant_name}" already on AWS`);
          migrationResults.variants.push({
            name: variant.variant_name,
            color: variant.hex_color,
            aws_url: variant.aws_url,
            already_migrated: true
          });
          continue;
        }

        if (!variant.cloudinary_url) {
          console.log(`  ⚠️ Variant "${variant.variant_name}" has no Cloudinary URL - skipping`);
          continue;
        }

        console.log(`\n  Processing variant: ${variant.variant_name} (${variant.hex_color})`);

        // Create clean filename for variant
        const cleanVariantName = variant.variant_name
          .replace(/[^\\w\\s-]/g, '')
          .replace(/\\s+/g, '_')
          .toLowerCase();

        const variantFilename = `${cleanVariantName}_${variant.id}.glb`;
        const variantS3Key = `furniture-models/variants/${variantFilename}`;

        try {
          const result = await migrateFileToS3(
            variant.cloudinary_url,
            variantS3Key,
            {
              'parent-model-id': modelId,
              'variant-id': variant.id,
              'variant-name': variant.variant_name,
              'variant-color': variant.hex_color,
              'migrated-from': 'cloudinary',
              'migrated-at': new Date().toISOString()
            }
          );

          // Update database for variant
          await supabase
            .from('model_variants')
            .update({
              storage_location: 'aws',
              aws_url: result.awsUrl,
              migrated_at: new Date().toISOString()
            })
            .eq('id', variant.id);

          migrationResults.variants.push({
            name: variant.variant_name,
            color: variant.hex_color,
            aws_url: result.awsUrl,
            size_mb: (result.fileSize / 1024 / 1024).toFixed(2)
          });
          migrationResults.totalSize += result.fileSize;
          migrationResults.totalFiles++;

          console.log(`  ✅ Variant migrated: ${result.awsUrl}`);
        } catch (variantError) {
          console.error(`  ❌ Failed to migrate variant ${variant.variant_name}:`, variantError.message);
          migrationResults.variants.push({
            name: variant.variant_name,
            color: variant.hex_color,
            error: variantError.message
          });
        }
      }
    }

    // ========================================
    // 4. LOG MIGRATION
    // ========================================
    console.log('\n📝 Step 4: Logging migration...');

    await supabase
      .from('migration_logs')
      .insert({
        model_id: modelId,
        action: 'migrate-with-variants',
        status: 'success',
        details: {
          title: model.title,
          main_model: migrationResults.model,
          variants: migrationResults.variants,
          total_files: migrationResults.totalFiles,
          total_size_mb: (migrationResults.totalSize / 1024 / 1024).toFixed(2)
        }
      });

    // ========================================
    // 5. GENERATE SUCCESS REPORT
    // ========================================
    const report = {
      success: true,
      message: `✅ Successfully migrated "${model.title}" with all variants to AWS S3`,
      summary: {
        model_id: modelId,
        title: model.title,
        files_migrated: migrationResults.totalFiles,
        total_size_mb: (migrationResults.totalSize / 1024 / 1024).toFixed(2),
        main_model: migrationResults.model,
        variants: migrationResults.variants
      },
      test_urls: {
        ar_view: `https://newfurniture.live/view?id=${modelId}`,
        variant_test: migrationResults.variants[0]
          ? `https://newfurniture.live/view?id=${modelId}&variant=${variants[0].id}`
          : null
      }
    };

    console.log('\n' + '='.repeat(60));
    console.log('🎉 COMPLETE MIGRATION SUCCESS!');
    console.log('='.repeat(60));
    console.log(`Model: ${model.title}`);
    console.log(`Files migrated: ${migrationResults.totalFiles}`);
    console.log(`Total size: ${(migrationResults.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Variants: ${migrationResults.variants.length}`);
    console.log('='.repeat(60) + '\n');

    return res.status(200).json(report);

  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);

    // Log failure
    await supabase
      .from('migration_logs')
      .insert({
        model_id: modelId,
        action: 'migrate-with-variants',
        status: 'failed',
        error_message: error.message,
        details: { error: error.stack }
      });

    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      model_id: modelId
    });
  }
};