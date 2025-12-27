const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { modelId } = req.query;

  if (!modelId) {
    return res.status(400).json({ error: 'Model ID required' });
  }

  try {
    const { data: model, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (error || !model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Determine which source is being used
    const isUsingAWS = model.storage_location === 'aws' && model.aws_url;

    // Build AR URL (you may need to adjust based on your URL structure)
    let ar_url = null;
    if (model.customer_slug && model.url_slug) {
      ar_url = `https://newfurniture.live/f/${model.customer_slug}/${model.url_slug}-${modelId}`;
    }

    return res.status(200).json({
      model: {
        id: model.id,
        title: model.title,
        storage_location: model.storage_location || 'cloudinary',
        cloudinary_url: model.cloudinary_url,
        aws_url: model.aws_url,
        aws_filename: model.aws_filename,
        migrated_at: model.migrated_at,
        file_size: model.file_size,
        is_using_aws: isUsingAWS
      },
      source: isUsingAWS ? 'AWS S3' : 'Cloudinary',
      ar_url: ar_url,
      message: isUsingAWS ?
        '✅ This model is being served from AWS S3!' :
        '⚠️ This model is still being served from Cloudinary'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to check model source',
      details: error.message
    });
  }
};