/**
 * Check Cloudinary URLs for all models
 * Find models with working URLs for migration testing
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('🔍 Checking Cloudinary URLs for all models...\n');

  try {
    // Get all models with cloudinary URLs
    const { data: models, error } = await supabase
      .from('models')
      .select('id, title, cloudinary_url, model_url, file_size, storage_location')
      .or('cloudinary_url.not.is.null,model_url.not.is.null')
      .limit(20);

    if (error) throw error;

    const results = {
      total: models.length,
      working: [],
      broken: [],
      checking: []
    };

    console.log(`Found ${models.length} models to check\n`);

    // Check each URL
    for (const model of models) {
      const url = model.cloudinary_url || model.model_url;

      if (!url) {
        results.broken.push({
          id: model.id,
          title: model.title,
          reason: 'No URL found'
        });
        continue;
      }

      results.checking.push({
        id: model.id,
        title: model.title,
        url: url
      });

      try {
        // Try to fetch the URL (HEAD request first for speed)
        const response = await fetch(url, { method: 'HEAD' });

        if (response.ok) {
          results.working.push({
            id: model.id,
            title: model.title,
            url: url,
            size_mb: model.file_size ? (model.file_size / 1024 / 1024).toFixed(2) : 'unknown',
            status: response.status
          });
          console.log(`✅ ${model.title} - URL works!`);
        } else {
          results.broken.push({
            id: model.id,
            title: model.title,
            url: url,
            status: response.status,
            reason: `HTTP ${response.status}`
          });
          console.log(`❌ ${model.title} - ${response.status}`);
        }
      } catch (fetchError) {
        // Try GET request as fallback
        try {
          const getResponse = await fetch(url, {
            method: 'GET',
            headers: { 'Range': 'bytes=0-0' } // Just check if accessible
          });

          if (getResponse.ok || getResponse.status === 206) { // 206 is partial content
            results.working.push({
              id: model.id,
              title: model.title,
              url: url,
              size_mb: model.file_size ? (model.file_size / 1024 / 1024).toFixed(2) : 'unknown',
              status: getResponse.status
            });
            console.log(`✅ ${model.title} - URL works (via GET)!`);
          } else {
            results.broken.push({
              id: model.id,
              title: model.title,
              url: url,
              reason: fetchError.message
            });
            console.log(`❌ ${model.title} - ${fetchError.message}`);
          }
        } catch (getError) {
          results.broken.push({
            id: model.id,
            title: model.title,
            url: url,
            reason: getError.message
          });
          console.log(`❌ ${model.title} - ${getError.message}`);
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('CLOUDINARY URL CHECK SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Working URLs: ${results.working.length}`);
    console.log(`❌ Broken URLs: ${results.broken.length}`);
    console.log(`📊 Total checked: ${results.total}`);

    if (results.working.length > 0) {
      console.log('\n📦 RECOMMENDED TEST MODELS:');
      results.working.slice(0, 3).forEach(model => {
        console.log(`  - ${model.title} (ID: ${model.id}, Size: ${model.size_mb} MB)`);
      });
    }

    // Return results
    return res.status(200).json({
      success: true,
      summary: {
        total_checked: results.total,
        working: results.working.length,
        broken: results.broken.length
      },
      recommended_test_models: results.working.slice(0, 3),
      all_working: results.working,
      all_broken: results.broken
    });

  } catch (error) {
    console.error('❌ Error checking URLs:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};