const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multiparty = require('multiparty');
const fs = require('fs');
const path = require('path');
const { supabase } = require('../lib/supabase.js');

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const bucket = process.env.AWS_S3_BUCKET || 'newfurniture-ar-assets';

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = new multiparty.Form({
    maxFilesSize: 10 * 1024 * 1024 // 10MB limit
  });

  return new Promise((resolve, reject) => {
    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        res.status(400).json({ error: 'Failed to parse form data' });
        return resolve();
      }

      try {
        const feedbackId = fields.feedback_id?.[0];
        const customerId = fields.customer_id?.[0] || 'unknown';
        const caption = fields.caption?.[0] || '';

        if (!feedbackId) {
          res.status(400).json({ error: 'feedback_id is required' });
          return resolve();
        }

        const imageFile = files.image?.[0];
        if (!imageFile) {
          res.status(400).json({ error: 'No image file provided' });
          return resolve();
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic'];
        const mimeType = imageFile.headers['content-type'];

        if (!allowedTypes.includes(mimeType)) {
          res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, WEBP, and HEIC are allowed.' });
          return resolve();
        }

        // Generate unique key for S3
        const { nanoid } = await import('nanoid');
        const imageId = nanoid(8);
        const ext = path.extname(imageFile.originalFilename).toLowerCase() || '.jpg';
        const s3Key = `feedback-images/${customerId}/${feedbackId}/${imageId}${ext}`;

        // Read file data
        const fileData = await fs.promises.readFile(imageFile.path);

        // Upload to S3 with public read access
        const uploadCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileData,
          ContentType: mimeType,
          ACL: 'public-read',
          Metadata: {
            feedbackId: feedbackId,
            customerId: customerId,
            uploadedAt: new Date().toISOString()
          }
        });

        await s3Client.send(uploadCommand);

        // Generate URLs
        const awsUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;
        // For now, thumbnail URL is same as original (could implement resizing later)
        const thumbnailUrl = awsUrl;

        // Save to database
        const { data: imageRecord, error: dbError } = await supabase
          .from('feedback_images')
          .insert({
            feedback_id: feedbackId,
            aws_url: awsUrl,
            aws_key: s3Key,
            thumbnail_url: thumbnailUrl,
            caption: caption,
            file_size: imageFile.size,
            mime_type: mimeType,
            upload_order: 0
          })
          .select()
          .single();

        if (dbError) {
          console.error('Database error:', dbError);
          res.status(500).json({ error: 'Failed to save image metadata', details: dbError.message });
          return resolve();
        }

        // Also update the feedback table with first image if this is the first one
        const { data: existingFeedback } = await supabase
          .from('feedback')
          .select('image_url')
          .eq('id', feedbackId)
          .single();

        if (!existingFeedback?.image_url) {
          await supabase
            .from('feedback')
            .update({
              image_url: awsUrl,
              image_aws_key: s3Key,
              image_thumbnail_url: thumbnailUrl,
              image_uploaded_at: new Date().toISOString()
            })
            .eq('id', feedbackId);
        }

        // Clean up temp file
        await fs.promises.unlink(imageFile.path).catch(console.error);

        console.log(`✅ Feedback image uploaded: ${s3Key}`);

        res.status(200).json({
          success: true,
          imageId: imageRecord.id,
          imageUrl: awsUrl,
          thumbnailUrl: thumbnailUrl,
          message: 'Image uploaded successfully'
        });

        resolve();
      } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
          error: 'Failed to upload image',
          details: error.message
        });
        resolve();
      }
    });
  });
}