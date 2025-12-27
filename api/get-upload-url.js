/**
 * Generate presigned S3 URL for direct browser uploads
 * This bypasses Vercel's 4.5MB function payload limit
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb'
    }
  }
};

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse request body
    const { filename, fileType, fileSize } = req.body;

    // Validate required fields
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    // Validate file size (50MB limit)
    if (fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB' });
    }

    // Validate file type
    if (!filename.match(/\.(glb|gltf)$/i)) {
      return res.status(400).json({ error: 'Only GLB and GLTF files are allowed' });
    }

    // Generate unique model ID
    const modelId = require('crypto').randomBytes(4).toString('hex');
    const key = `furniture-models/${modelId}.glb`;

    // Create S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // Create presigned URL for PUT operation
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets',
      Key: key,
      ContentType: 'model/gltf-binary',
      // Note: Don't include ContentLength in presigned URL - causes CORS issues
      Metadata: {
        'original-filename': filename,
        'upload-timestamp': new Date().toISOString(),
      },
    });

    // Generate presigned URL (valid for 5 minutes)
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300 // 5 minutes
    });

    // Generate the final URL where the file will be accessible
    const finalUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

    return res.status(200).json({
      uploadUrl,
      modelId,
      key,
      finalUrl,
      expiresIn: 300
    });

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      error: 'Failed to generate upload URL',
      details: error.message // Always include error message for debugging
    });
  }
}