/**
 * Proxy endpoint to serve GLB files from AWS S3 without CORS issues
 * Bypasses browser CORS restrictions by serving through our API
 */

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

module.exports = async function handler(req, res) {
  // Enable CORS for this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get filename from query parameter
    const filename = req.query.file || 'groove-grey-scaled.glb';

    console.log('🪑 Proxy: Fetching model from S3:', filename);

    // Initialize S3 client
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';
    const key = `furniture-models/${filename}`;

    // Get file from S3
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    const s3Response = await s3Client.send(command);

    // Set proper headers for GLB files
    res.setHeader('Content-Type', 'model/gltf-binary');
    res.setHeader('Content-Length', s3Response.ContentLength);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('Content-Disposition', 'inline');

    // Stream the file data
    const stream = s3Response.Body;

    // Convert stream to buffer for Vercel compatibility
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log('✅ Proxy: Serving model successfully', {
      filename,
      size: buffer.length,
      contentType: 'model/gltf-binary'
    });

    // Send the GLB file
    res.status(200).send(buffer);

  } catch (error) {
    console.error('❌ Proxy error:', error);

    if (error.name === 'NoSuchKey') {
      return res.status(404).json({
        error: 'Model file not found',
        file: req.query.file,
        help: 'Check if the file exists in S3 furniture-models folder'
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch model from S3',
      details: error.message
    });
  }
}