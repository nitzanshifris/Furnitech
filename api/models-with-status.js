const { supabase } = require('../lib/supabase.js');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      console.log('🔍 models-with-status API called with query:', req.query);
      const { customer } = req.query;
      console.log('📊 Customer ID:', customer);

      // Get all models with variants
      let modelsQuery = supabase
        .from('models')
        .select(`
          *,
          variants:model_variants(*)
        `)
        .order('upload_date', { ascending: false });

      if (customer) {
        modelsQuery = modelsQuery.eq('customer_id', customer);
      }

      console.log('🗄️ Executing models query for customer:', customer);
      const { data: models, error: modelsError } = await modelsQuery;

      if (modelsError) {
        console.error('❌ Models query error:', modelsError);
        throw modelsError;
      }

      console.log('✅ Models query successful, found:', models?.length || 0, 'models');

      // Get ALL feedback for these models (archive status is admin-only, not client-facing)
      const modelIds = models.map(m => m.id);
      let feedback = [];

      // Only query feedback if we have models (avoid empty array in SQL IN clause)
      if (modelIds.length > 0) {
        console.log('🔄 Querying feedback for', modelIds.length, 'models');
        const { data: feedbackData, error: feedbackError } = await supabase
          .from('feedback')
          .select('*')
          .in('model_id', modelIds);
        // NOTE: Removed .eq('status', 'active') - archive status is for admin organization only!

        if (feedbackError) {
          console.error('❌ Feedback query error:', feedbackError);
          throw feedbackError;
        }

        feedback = feedbackData || [];
        console.log('✅ Feedback query successful, found:', feedback.length, 'feedback items');
      } else {
        console.log('⏭️ Skipping feedback query - no models found');
      }

      // Aggregate feedback status for each model
      console.log('🔄 Processing', models.length, 'models for status aggregation');
      const modelsWithStatus = models.map(model => {
        const modelFeedback = feedback.filter(fb => fb.model_id === model.id);

        // New 4-state logic implementation

        // 1. Check if no reviews exist at all
        if (modelFeedback.length === 0) {
          return {
            ...model,
            feedback_status: {
              status: 'pending',
              statusText: 'Pending Review',
              statusIcon: '⏳',
              statusColor: '#6b7280', // gray
              feedbackCount: 0,
              details: {
                originalReviewed: false,
                variantsReviewed: 0,
                totalVariants: model.variants ? model.variants.length : 0
              }
            }
          };
        }

        // 2. Check original and variant review status
        const originalReviewed = modelFeedback.some(fb =>
          fb.variant_id === 'original' || !fb.variant_id
        );

        // Get all variant IDs that need review
        const variantIds = model.variants ? model.variants.map(v => v.id) : [];
        const totalVariants = variantIds.length;

        // Count reviewed variants (excluding original)
        const reviewedVariantIds = new Set(
          modelFeedback
            .filter(fb => fb.variant_id && fb.variant_id !== 'original')
            .map(fb => fb.variant_id)
        );
        const variantsReviewed = reviewedVariantIds.size;

        // Check if all variants are reviewed
        const allVariantsReviewed = variantIds.every(id => reviewedVariantIds.has(id));

        // 3. Check for Partially Reviewed state
        if (!originalReviewed || (totalVariants > 0 && !allVariantsReviewed)) {
          return {
            ...model,
            feedback_status: {
              status: 'partial',
              statusText: 'Partially Reviewed',
              statusIcon: '📝',
              statusColor: '#f59e0b', // amber
              feedbackCount: modelFeedback.length,
              details: {
                originalReviewed,
                variantsReviewed,
                totalVariants,
                missingOriginal: !originalReviewed,
                missingVariants: totalVariants - variantsReviewed
              }
            }
          };
        }

        // 4. At this point, original + all variants are reviewed
        // Check if any have "Revise" status
        const hasRevisions = modelFeedback.some(fb =>
          fb.approval_status === 'rejected' ||
          fb.feedback_type === 'changes_requested' ||
          fb.feedback_type === 'rejected'
        );

        if (hasRevisions) {
          return {
            ...model,
            feedback_status: {
              status: 'all_reviewed',
              statusText: 'All Reviewed',
              statusIcon: '✅',
              statusColor: '#3b82f6', // blue
              feedbackCount: modelFeedback.length,
              details: {
                originalReviewed: true,
                variantsReviewed: totalVariants,
                totalVariants,
                hasRevisions: true,
                revisionsCount: modelFeedback.filter(fb =>
                  fb.approval_status === 'rejected' ||
                  fb.feedback_type === 'changes_requested'
                ).length
              }
            }
          };
        }

        // 5. All approved (perfect or good enough)
        return {
          ...model,
          feedback_status: {
            status: 'all_approved',
            statusText: 'All Approved',
            statusIcon: '✨',
            statusColor: '#10b981', // green
            feedbackCount: modelFeedback.length,
            details: {
              originalReviewed: true,
              variantsReviewed: totalVariants,
              totalVariants,
              perfectCount: modelFeedback.filter(fb =>
                fb.approval_status === 'perfect' || fb.feedback_type === 'perfect'
              ).length,
              goodEnoughCount: modelFeedback.filter(fb =>
                fb.approval_status === 'approved_with_notes' ||
                fb.feedback_type === 'approved_with_notes' ||
                fb.approval_status === 'approved' ||
                fb.feedback_type === 'approved'
              ).length
            }
          }
        };
      });

      console.log('✅ Successfully processed all models, returning:', modelsWithStatus.length, 'models');

      // Calculate stats for frontend compatibility
      const stats = {
        totalModels: modelsWithStatus.length,
        totalViews: modelsWithStatus.reduce((sum, model) => sum + (model.view_count || 0), 0),
        totalSize: modelsWithStatus.reduce((sum, model) => sum + (model.file_size || 0), 0)
      };

      return res.status(200).json({
        success: true,
        models: modelsWithStatus,
        stats
      });

    } catch (error) {
      console.error('Error getting models with status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get models with status',
        details: error.message
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}