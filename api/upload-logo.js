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

  return new Promise((resolve) => {
    const form = new multiparty.Form({
      maxFilesSize: 10 * 1024 * 1024, // 10MB
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        console.error('Form parsing error:', err);
        res.status(400).json({ error: 'Failed to parse form data' });
        return resolve();
      }

      try {
        const customerId = fields.customer_id?.[0];

        if (!customerId) {
          res.status(400).json({ error: 'customer_id is required' });
          return resolve();
        }

        const logoFile = files.logo?.[0];
        if (!logoFile) {
          res.status(400).json({ error: 'No logo file provided' });
          return resolve();
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
        const mimeType = logoFile.headers['content-type'];

        if (!allowedTypes.includes(mimeType)) {
          res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, WEBP, and SVG are allowed.' });
          return resolve();
        }

        // Generate unique key for S3 - using logos folder separate from feedback-images
        const timestamp = Date.now();
        const ext = path.extname(logoFile.originalFilename).toLowerCase() || '.png';
        const s3Key = `customer-logos/${customerId}/${timestamp}${ext}`;

        // Read file data
        const fileData = await fs.promises.readFile(logoFile.path);

        // Upload to S3 with public read access
        const uploadCommand = new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileData,
          ContentType: mimeType,
          ACL: 'public-read',
          Metadata: {
            customerId: customerId,
            uploadedAt: new Date().toISOString(),
            type: 'customer_logo'
          }
        });

        await s3Client.send(uploadCommand);

        // Generate URL
        const awsUrl = `https://${bucket}.s3.amazonaws.com/${s3Key}`;

        // Update customer's brand settings with logo URL
        const { data: brandData, error: brandError } = await supabase
          .from('customer_brand_settings')
          .upsert({
            customer_id: customerId,
            logo_url: awsUrl,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'customer_id'
          })
          .select()
          .single();

        if (brandError) {
          console.error('Error updating brand settings with logo:', brandError);
          res.status(500).json({ error: 'Failed to save logo information', details: brandError.message });
          return resolve();
        }

        console.log(`✅ Logo uploaded for customer ${customerId}: ${awsUrl}`);

        res.status(200).json({
          success: true,
          message: 'Logo uploaded successfully',
          logoUrl: awsUrl,
          brandSettings: brandData
        });

        // Clean up temp file
        try {
          await fs.promises.unlink(logoFile.path);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', cleanupError);
        }

        resolve();
      } catch (error) {
        console.error('Logo upload error:', error);
        res.status(500).json({
          error: 'Failed to upload logo',
          details: error.message
        });
        resolve();
      }
    });
  });
};