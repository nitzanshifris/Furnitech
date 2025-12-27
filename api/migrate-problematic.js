/**
 * Special migration for problematic models
 * Handles Hebrew titles and checks for missing files
 */

const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

function createS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Check if URL exists
async function checkUrlExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

// Migrate file with safe metadata
async function migrateFileToS3Safe(cloudinaryUrl, s3Key, modelId, modelTitle) {
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

  // Use base64 encoded title for Hebrew text
  const safeTitle = Buffer.from(modelTitle).toString('base64');

  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: buffer,
    ContentType: 'model/gltf-binary',
    Metadata: {
      'original-id': modelId,
      'original-title-base64': safeTitle, // Safe encoding
      'migrated-at': new Date().toISOString()
    }
  }));

  const awsUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
  console.log(`  ✅ Uploaded to: ${awsUrl}`);

  return { awsUrl, fileSize: buffer.length };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { checkOnly = false } = req.body || req.query;

  console.log('\n' + '='.repeat(60));
  console.log('🔧 PROBLEMATIC MODELS MIGRATION');
  console.log('='.repeat(60));

  try {
    // Get the problematic models
    const problematicIds = [
      'K5F8Yc4x', 'Ct81wo8G', 'C0qmHLA5', 'cHXk7ij7', 'nrPbZQbX',
      'qcZ4TvDO', 'AAvMLbXu', 'XTV9jt-W', 'zZSi0j-l'
    ];

    const { data: models, error } = await supabase
      .from('models')
      .select('*')
      .in('id', problematicIds);

    if (error) throw error;

    const results = {
      hebrew_titles: [],
      missing_files: [],
      migrated: [],
      still_failed: []
    };

    for (const model of models) {
      console.log(`\n📦 Checking: ${model.title} (${model.id})`);

      // Check if Cloudinary URL exists
      const exists = await checkUrlExists(model.cloudinary_url);

      if (!exists) {
        console.log('  ❌ File missing from Cloudinary');
        results.missing_files.push({
          id: model.id,
          title: model.title,
          url: model.cloudinary_url
        });
        continue;
      }

      // Check for Hebrew characters
      const hasHebrew = /[\u0590-\u05FF]/.test(model.title);
      if (hasHebrew) {
        console.log('  ⚠️ Has Hebrew title - will use safe encoding');
        results.hebrew_titles.push({
          id: model.id,
          title: model.title
        });
      }

      if (checkOnly) {
        console.log('  ✅ Can be migrated with fixes');
        continue;
      }

      // Try to migrate with safe encoding
      try {
        // Create ASCII-safe filename
        const safeTitle = model.id; // Just use ID for filename
        const filename = `${safeTitle}.glb`;
        const s3Key = `furniture-models/fixed/${filename}`;

        const result = await migrateFileToS3Safe(
          model.cloudinary_url,
          s3Key,
          model.id,
          model.title
        );

        // Update database
        await supabase
          .from('models')
          .update({
            storage_location: 'aws',
            aws_url: result.awsUrl,
            aws_filename: filename,
            migrated_at: new Date().toISOString(),
            file_size_bytes: result.fileSize
          })
          .eq('id', model.id);

        results.migrated.push({
          id: model.id,
          title: model.title,
          aws_url: result.awsUrl
        });

        console.log('  ✅ Successfully migrated!');

      } catch (error) {
        console.error('  ❌ Migration failed:', error.message);
        results.still_failed.push({
          id: model.id,
          title: model.title,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: checkOnly ? 'Check complete' : 'Migration attempt complete',
      results: results,
      summary: {
        total: models.length,
        hebrew_titles: results.hebrew_titles.length,
        missing_files: results.missing_files.length,
        migrated: results.migrated.length,
        still_failed: results.still_failed.length
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};