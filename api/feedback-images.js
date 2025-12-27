const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Fetch images for a feedback
  if (req.method === 'GET') {
    try {
      const { feedback_id } = req.query;

      if (!feedback_id) {
        return res.status(400).json({ error: 'feedback_id is required' });
      }

      const { data: images, error } = await supabase
        .from('feedback_images')
        .select('*')
        .eq('feedback_id', feedback_id)
        .order('upload_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        images: images || [],
        count: images?.length || 0
      });

    } catch (error) {
      console.error('Error fetching images:', error);
      return res.status(500).json({
        error: 'Failed to fetch images',
        details: error.message
      });
    }
  }

  // DELETE - Remove an image
  if (req.method === 'DELETE') {
    try {
      const { image_id } = req.query;

      if (!image_id) {
        return res.status(400).json({ error: 'image_id is required' });
      }

      // Get image details first
      const { data: image, error: fetchError } = await supabase
        .from('feedback_images')
        .select('*')
        .eq('id', image_id)
        .single();

      if (fetchError || !image) {
        return res.status(404).json({ error: 'Image not found' });
      }

      // Delete from S3
      if (image.aws_key) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: image.aws_key
        });

        try {
          await s3Client.send(deleteCommand);
          console.log(`✅ Deleted from S3: ${image.aws_key}`);
        } catch (s3Error) {
          console.error('S3 deletion error:', s3Error);
          // Continue even if S3 deletion fails
        }
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('feedback_images')
        .delete()
        .eq('id', image_id);

      if (deleteError) {
        throw deleteError;
      }

      // If this was the main image on feedback table, clear it
      const { data: feedback } = await supabase
        .from('feedback')
        .select('image_url')
        .eq('id', image.feedback_id)
        .single();

      if (feedback?.image_url === image.aws_url) {
        // Find another image to set as main, or clear if none
        const { data: remainingImages } = await supabase
          .from('feedback_images')
          .select('aws_url, aws_key, thumbnail_url')
          .eq('feedback_id', image.feedback_id)
          .order('created_at', { ascending: true })
          .limit(1);

        const newMainImage = remainingImages?.[0];

        await supabase
          .from('feedback')
          .update({
            image_url: newMainImage?.aws_url || null,
            image_aws_key: newMainImage?.aws_key || null,
            image_thumbnail_url: newMainImage?.thumbnail_url || null
          })
          .eq('id', image.feedback_id);
      }

      return res.status(200).json({
        success: true,
        message: 'Image deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting image:', error);
      return res.status(500).json({
        error: 'Failed to delete image',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}