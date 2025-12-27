/**
 * Batch migration endpoint for moving models from Cloudinary to AWS S3
 * Supports safe, monitored migration with rollback capability
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for admin authentication (add your auth check here)
  // if (!isAdmin(req)) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }

  const {
    action,        // 'migrate', 'status', 'rollback'
    modelIds,      // Array of model IDs to migrate
    batchSize = 5  // How many to process at once
  } = req.body;

  try {
    switch (action) {
      case 'migrate':
        return await handleMigration(modelIds, batchSize, res);

      case 'status':
        return await getMigrationStatus(res);

      case 'rollback':
        return await handleRollback(modelIds, res);

      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      error: 'Migration failed',
      details: error.message
    });
  }
}

async function handleMigration(modelIds, batchSize, res) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
    totalTime: 0
  };

  const startTime = Date.now();
  const s3Client = createS3Client();
  const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

  // Process in batches
  for (let i = 0; i < modelIds.length; i += batchSize) {
    const batch = modelIds.slice(i, i + batchSize);

    // Process batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map(modelId => migrateModel(modelId, s3Client, bucket))
    );

    // Categorize results
    batchResults.forEach((result, index) => {
      const modelId = batch[index];
      if (result.status === 'fulfilled') {
        if (result.value.status === 'success') {
          results.success.push({
            modelId,
            s3Url: result.value.s3Url,
            size: result.value.size
          });
        } else if (result.value.status === 'skipped') {
          results.skipped.push({
            modelId,
            reason: result.value.reason
          });
        }
      } else {
        results.failed.push({
          modelId,
          error: result.reason.message
        });
      }
    });
  }

  results.totalTime = Date.now() - startTime;

  // Update migration statistics
  await updateMigrationStats(results);

  return res.status(200).json({
    message: 'Batch migration completed',
    results,
    summary: {
      total: modelIds.length,
      succeeded: results.success.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      duration: `${(results.totalTime / 1000).toFixed(2)}s`
    }
  });
}

async function migrateModel(modelId, s3Client, bucket) {
  console.log(`🔄 Migrating model: ${modelId}`);

  // 1. Check if already migrated
  const { data: model } = await supabase
    .from('furniture_models')
    .select('*')
    .eq('id', modelId)
    .single();

  if (!model) {
    throw new Error(`Model ${modelId} not found`);
  }

  if (model.storage_location === 'aws') {
    return {
      status: 'skipped',
      reason: 'Already migrated to AWS'
    };
  }

  // 2. Check if file already exists in S3
  const filename = `${modelId}.glb`;
  const key = `furniture-models/${filename}`;

  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    }));

    // File exists, just update database
    await supabase
      .from('furniture_models')
      .update({
        storage_location: 'aws',
        aws_url: `https://${bucket}.s3.amazonaws.com/${key}`,
        migrated_at: new Date().toISOString()
      })
      .eq('id', modelId);

    return {
      status: 'skipped',
      reason: 'File already exists in S3'
    };
  } catch (e) {
    // File doesn't exist, proceed with migration
  }

  // 3. Download from Cloudinary
  const cloudinaryUrl = model.model_url || model.cloudinary_url;
  if (!cloudinaryUrl) {
    throw new Error(`No Cloudinary URL for model ${modelId}`);
  }

  console.log(`📥 Downloading from Cloudinary: ${cloudinaryUrl}`);
  const response = await fetch(cloudinaryUrl);

  if (!response.ok) {
    throw new Error(`Failed to download from Cloudinary: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const size = buffer.length;

  // 4. Upload to S3
  console.log(`📤 Uploading to S3: ${key} (${(size / 1024 / 1024).toFixed(2)} MB)`);

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: 'model/gltf-binary',
    Metadata: {
      'original-id': modelId,
      'migrated-from': 'cloudinary',
      'migrated-at': new Date().toISOString()
    }
  }));

  // 5. Update database
  const s3Url = `https://${bucket}.s3.amazonaws.com/${key}`;

  await supabase
    .from('furniture_models')
    .update({
      storage_location: 'aws',
      aws_url: s3Url,
      aws_filename: filename,
      migrated_at: new Date().toISOString()
    })
    .eq('id', modelId);

  console.log(`✅ Successfully migrated: ${modelId}`);

  return {
    status: 'success',
    s3Url,
    size
  };
}

async function getMigrationStatus(res) {
  // Get counts from database
  const { data: stats } = await supabase
    .rpc('get_migration_stats');  // You'll need to create this function

  // Or use direct queries:
  const { count: total } = await supabase
    .from('furniture_models')
    .select('*', { count: 'exact', head: true });

  const { count: migrated } = await supabase
    .from('furniture_models')
    .select('*', { count: 'exact', head: true })
    .eq('storage_location', 'aws');

  const percentComplete = total ? ((migrated / total) * 100).toFixed(2) : 0;

  // Estimate cost savings
  const estimatedMonthlySavings = migrated * 0.5; // $0.50 per model estimated

  return res.status(200).json({
    total,
    migrated,
    remaining: total - migrated,
    percentComplete: `${percentComplete}%`,
    estimatedMonthlySavings: `$${estimatedMonthlySavings.toFixed(2)}`,
    status: percentComplete === '100.00' ? 'completed' : 'in_progress'
  });
}

async function handleRollback(modelIds, res) {
  const results = [];

  for (const modelId of modelIds) {
    try {
      // Update database to use Cloudinary again
      await supabase
        .from('furniture_models')
        .update({
          storage_location: 'cloudinary',
          rollback_at: new Date().toISOString(),
          rollback_reason: 'Manual rollback'
        })
        .eq('id', modelId);

      results.push({
        modelId,
        status: 'rolled_back'
      });
    } catch (error) {
      results.push({
        modelId,
        status: 'rollback_failed',
        error: error.message
      });
    }
  }

  return res.status(200).json({
    message: 'Rollback completed',
    results
  });
}

async function updateMigrationStats(results) {
  // Store migration results for monitoring
  try {
    await supabase
      .from('migration_logs')
      .insert({
        timestamp: new Date().toISOString(),
        success_count: results.success.length,
        failed_count: results.failed.length,
        skipped_count: results.skipped.length,
        total_time_ms: results.totalTime,
        details: results
      });
  } catch (error) {
    console.error('Failed to log migration stats:', error);
  }
}