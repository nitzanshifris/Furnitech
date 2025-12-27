/**
 * Find a suitable model for AWS migration testing
 * Returns models that are safe for testing (small, low traffic)
 */

const { supabase } = require('../lib/supabase.js');

export default async function handler(req, res) {
  // Enable CORS
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
    console.log('🔍 Finding suitable test models...');

    // Find models that are good candidates for testing
    const { data: models, error } = await supabase
      .from('models')
      .select('id, title, file_size, cloudinary_url, cloudinary_public_id, view_count, created_at')
      .not('cloudinary_url', 'is', null)  // Must have Cloudinary URL
      .not('file_size', 'is', null)       // Must have file size
      .lt('file_size', 10000000)          // Less than 10MB
      .order('view_count', { ascending: true })  // Low traffic first
      .limit(10);

    if (error) {
      throw error;
    }

    if (!models || models.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No suitable models found for testing',
        criteria: 'Looking for models with Cloudinary URL, file size < 10MB, low view count'
      });
    }

    // Format results with safety indicators
    const candidates = models.map(model => ({
      id: model.id,
      title: model.title,
      fileSize: model.file_size,
      fileSizeMB: (model.file_size / 1024 / 1024).toFixed(2),
      cloudinaryUrl: model.cloudinary_url,
      viewCount: model.view_count || 0,
      createdAt: model.created_at,
      safetyLevel: getSafetyLevel(model),
      testUrl: `https://${req.headers.host}/view?id=${model.id}`
    }));

    // Recommend the safest option
    const recommended = candidates.find(m => m.safetyLevel === 'VERY_SAFE') || candidates[0];

    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      totalFound: candidates.length,
      recommended: {
        model: recommended,
        reason: `${recommended.safetyLevel}: Small file (${recommended.fileSizeMB}MB), low traffic (${recommended.viewCount} views)`
      },
      allCandidates: candidates,
      nextSteps: [
        `Test model manually: ${recommended.testUrl}`,
        `Migrate model ID: ${recommended.id}`,
        `Verify AR works before migration`
      ]
    });

  } catch (error) {
    console.error('🔍 Error finding test models:', error);

    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      help: 'Check database connection and model data'
    });
  }
}

/**
 * Determine safety level for testing a model
 */
function getSafetyLevel(model) {
  const sizeMB = model.file_size / 1024 / 1024;
  const views = model.view_count || 0;

  if (sizeMB < 2 && views < 5) return 'VERY_SAFE';
  if (sizeMB < 5 && views < 20) return 'SAFE';
  if (sizeMB < 10 && views < 100) return 'MODERATE';
  return 'RISKY';
}