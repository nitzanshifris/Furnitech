/**
 * Simple AWS S3 operations - CommonJS for Vercel compatibility
 * Focused on basic connectivity, model migration, and uploads
 * NO complex abstractions, NO dual-write complexity
 */

const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

/**
 * Initialize S3 client with environment variables
 */
function createS3Client() {
  // Validate required environment variables
  const requiredVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing AWS environment variables: ${missing.join(', ')}`);
  }

  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

/**
 * Get S3 bucket configuration
 */
function getS3Config() {
  return {
    bucket: process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets',
    region: process.env.AWS_REGION || 'us-east-1',
    cloudfrontDomain: process.env.AWS_CLOUDFRONT_DOMAIN || null,
  };
}

/**
 * Generate CloudFront or S3 URL for a model
 */
function generateModelUrl(modelId, config = null) {
  if (!config) config = getS3Config();

  const key = `furniture-models/${modelId}.glb`;

  if (config.cloudfrontDomain) {
    return `https://${config.cloudfrontDomain}/${key}`;
  } else {
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  }
}

/**
 * Test S3 connectivity
 */
async function testS3Connection() {
  try {
    const s3Client = createS3Client();
    const config = getS3Config();

    // Try to list objects in bucket (minimal permissions test)
    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: 'test-connectivity' // This file doesn't need to exist
    });

    try {
      await s3Client.send(command);
      return { status: 'success', message: 'S3 connection successful' };
    } catch (error) {
      if (error.name === 'NotFound') {
        // This is expected - file doesn't exist, but we can connect
        return { status: 'success', message: 'S3 connection successful (bucket accessible)' };
      }
      throw error;
    }
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      code: error.name
    };
  }
}

/**
 * Upload a GLB file to S3
 */
async function uploadModelToS3(fileBuffer, modelId) {
  try {
    const s3Client = createS3Client();
    const config = getS3Config();
    const key = `furniture-models/${modelId}.glb`;

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: 'model/gltf-binary',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000', // 1 year cache
      Metadata: {
        'model-id': modelId.toString(),
        'upload-timestamp': new Date().toISOString(),
        'source': 'migration',
      }
    });

    const result = await s3Client.send(command);
    const url = generateModelUrl(modelId, config);

    return {
      success: true,
      url: url,
      key: key,
      bucket: config.bucket,
      etag: result.ETag,
      size: fileBuffer.length
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.name
    };
  }
}

/**
 * Check if a model exists in S3
 */
async function checkModelExists(modelId) {
  try {
    const s3Client = createS3Client();
    const config = getS3Config();
    const key = `furniture-models/${modelId}.glb`;

    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: key
    });

    const result = await s3Client.send(command);

    return {
      exists: true,
      size: result.ContentLength,
      lastModified: result.LastModified,
      etag: result.ETag,
      url: generateModelUrl(modelId, config)
    };
  } catch (error) {
    if (error.name === 'NotFound') {
      return { exists: false };
    }
    throw error;
  }
}

/**
 * Upload a logo/image file to S3
 */
async function uploadLogoToS3(fileBuffer, customerId, filename, contentType) {
  try {
    const s3Client = createS3Client();
    const config = getS3Config();

    // Generate unique key for logo
    const timestamp = Date.now();
    const extension = filename.split('.').pop().toLowerCase();
    const key = `customer-logos/${customerId}/${timestamp}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType || 'image/jpeg',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000', // 1 year cache
      Metadata: {
        'customer-id': customerId.toString(),
        'upload-timestamp': new Date().toISOString(),
        'original-filename': filename,
        'type': 'logo'
      }
    });

    const result = await s3Client.send(command);

    // Generate public URL
    const url = config.cloudfrontDomain
      ? `https://${config.cloudfrontDomain}/${key}`
      : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;

    return {
      success: true,
      url: url,
      key: key,
      bucket: config.bucket,
      etag: result.ETag,
      size: fileBuffer.length,
      filename: filename
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.name
    };
  }
}

/**
 * Download a file from Cloudinary (for migration)
 */
async function downloadFromCloudinary(cloudinaryUrl) {
  const fetch = require('node-fetch');

  try {
    const response = await fetch(cloudinaryUrl);
    if (!response.ok) {
      throw new Error(`Failed to download from Cloudinary: ${response.status}`);
    }

    const buffer = await response.buffer();
    return {
      success: true,
      buffer: buffer,
      size: buffer.length,
      contentType: response.headers.get('content-type')
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  testS3Connection,
  uploadModelToS3,
  uploadLogoToS3,
  checkModelExists,
  downloadFromCloudinary,
  generateModelUrl,
  getS3Config
};