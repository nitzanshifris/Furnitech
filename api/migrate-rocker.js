/**
 * Migrate specific model "כיסא נדנדה ROCKER" from Cloudinary to AWS S3
 * Direct, focused migration for single model testing
 */

const { supabase } = require('../lib/supabase.js');
const { uploadModelToS3, downloadFromCloudinary, checkModelExists, generateModelUrl } = require('../lib/aws-s3-simple.js');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed - use POST to start migration' });
  }

  try {
    console.log('🪑 ROCKER Migration: Starting...');

    // Step 1: Find the ROCKER model in database
    const { data: rockerModel, error: findError } = await supabase
      .from('models')
      .select('id, title, cloudinary_url, cloudinary_public_id, file_size')
      .ilike('title', '%rocker%')
      .not('cloudinary_url', 'is', null)
      .single();

    if (findError || !rockerModel) {
      // Try alternative search patterns
      const { data: altSearch, error: altError } = await supabase
        .from('models')
        .select('id, title, cloudinary_url, cloudinary_public_id, file_size')
        .or('title.ilike.%נדנדה%,title.ilike.%כיסא%')
        .not('cloudinary_url', 'is', null)
        .limit(5);

      return res.status(404).json({
        success: false,
        error: 'ROCKER model not found',
        searched: 'title containing "rocker"',
        alternativeMatches: altSearch || [],
        help: 'Check if model exists and has Cloudinary URL'
      });
    }

    console.log('🪑 ROCKER Migration: Found model', {
      id: rockerModel.id,
      title: rockerModel.title,
      size: rockerModel.file_size
    });

    const modelId = rockerModel.id;

    // Step 2: Check if already exists in AWS
    const awsCheck = await checkModelExists(modelId);
    if (awsCheck.exists) {
      return res.status(200).json({
        success: true,
        message: 'ROCKER already migrated to AWS!',
        model: rockerModel,
        aws: {
          url: awsCheck.url,
          size: awsCheck.size,
          lastModified: awsCheck.lastModified
        },
        testUrl: `https://${req.headers.host}/view?id=${modelId}`,
        status: '✅ Ready for AR testing'
      });
    }

    // Step 3: Download from Cloudinary
    console.log('🪑 ROCKER Migration: Downloading from Cloudinary...');
    const downloadResult = await downloadFromCloudinary(rockerModel.cloudinary_url);

    if (!downloadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to download from Cloudinary',
        details: downloadResult.error,
        cloudinaryUrl: rockerModel.cloudinary_url
      });
    }

    console.log('🪑 ROCKER Migration: Downloaded successfully', {
      size: downloadResult.size,
      contentType: downloadResult.contentType
    });

    // Step 4: Upload to AWS S3
    console.log('🪑 ROCKER Migration: Uploading to AWS S3...');
    const uploadResult = await uploadModelToS3(downloadResult.buffer, modelId);

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to upload to AWS S3',
        details: uploadResult.error,
        downloadSuccess: true
      });
    }

    console.log('🪑 ROCKER Migration: Uploaded to AWS successfully', {
      url: uploadResult.url,
      size: uploadResult.size,
      etag: uploadResult.etag
    });

    // Step 5: Verify upload integrity
    const verifyCheck = await checkModelExists(modelId);
    const sizesMatch = Math.abs(downloadResult.size - (verifyCheck.size || 0)) < 1024; // Allow 1KB difference

    // Step 6: Return migration results
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      migration: {
        model: {
          id: modelId,
          title: rockerModel.title,
          originalSize: rockerModel.file_size
        },
        cloudinary: {
          url: rockerModel.cloudinary_url,
          downloadedSize: downloadResult.size
        },
        aws: {
          url: uploadResult.url,
          bucket: uploadResult.bucket,
          key: uploadResult.key,
          uploadedSize: uploadResult.size,
          etag: uploadResult.etag
        },
        verification: {
          sizesMatch: sizesMatch,
          awsAccessible: verifyCheck.exists,
          integrity: sizesMatch && verifyCheck.exists ? '✅ VERIFIED' : '⚠️ NEEDS_CHECK'
        }
      },
      testUrls: {
        arViewer: `https://${req.headers.host}/view?id=${modelId}`,
        directAws: uploadResult.url,
        originalCloudinary: rockerModel.cloudinary_url
      },
      nextSteps: [
        'Test AR viewer with original Cloudinary URL',
        'Modify AR viewer to use AWS URL',
        'Compare loading performance',
        'Verify AR functionality works identically'
      ],
      status: '🎉 ROCKER MIGRATION COMPLETE!'
    });

  } catch (error) {
    console.error('🪑 ROCKER Migration: Error occurred', error);

    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      status: '❌ ROCKER migration failed'
    });
  }
}