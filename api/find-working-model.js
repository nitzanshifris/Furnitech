const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    // Get models that are NOT already migrated
    const { data: models } = await supabase
      .from('models')
      .select('id, title, cloudinary_url, model_url, file_size')
      .neq('storage_location', 'aws')
      .or('storage_location.is.null,storage_location.eq.cloudinary')
      .limit(10);

    const working = [];

    for (const model of models) {
      const url = model.cloudinary_url || model.model_url;
      if (url && url.includes('cloudinary.com')) {
        // Just return the first one with a cloudinary URL
        working.push({
          id: model.id,
          title: model.title,
          url: url,
          size_mb: model.file_size ? (model.file_size / 1024 / 1024).toFixed(2) : '?'
        });
      }
    }

    return res.json({
      found: working.length,
      first_model: working[0] || null,
      all: working
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};