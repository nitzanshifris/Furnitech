/**
 * Batch Migration - Migrate ALL models with variants to AWS S3
 * Safe batch processing with progress tracking
 */

const { createClient } = require('@supabase/supabase-js');

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

  const { limit = 10, testMode = false } = req.body || req.query;

  console.log('\n' + '='.repeat(70));
  console.log('🚀 STARTING BATCH MIGRATION OF ALL MODELS');
  console.log('='.repeat(70));
  console.log(`Mode: ${testMode ? 'TEST MODE (dry run)' : 'PRODUCTION'}`);
  console.log(`Limit: ${limit === 'all' ? 'ALL MODELS' : `First ${limit} models`}`);

  try {
    // ========================================
    // 1. GET ALL UNMIGRATED MODELS
    // ========================================
    console.log('\n📋 Step 1: Finding unmigrated models...');

    // Get models that are NOT fully migrated
    // Exclude known problematic models with Hebrew characters or missing files
    const problematicIds = [
      'K5F8Yc4x', 'Ct81wo8G', 'C0qmHLA5', 'cHXk7ij7', 'nrPbZQbX',
      'qcZ4TvDO', 'AAvMLbXu', 'XTV9jt-W', 'zZSi0j-l'
    ];

    let query = supabase
      .from('models')
      .select('id, title, cloudinary_url, file_size')
      .or('storage_location.is.null,storage_location.neq.aws')
      .not('id', 'in', `(${problematicIds.join(',')})`);

    // Apply limit if not migrating all
    if (limit !== 'all') {
      query = query.limit(parseInt(limit));
    }

    const { data: models, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!models || models.length === 0) {
      return res.status(200).json({
        success: true,
        message: '✅ All models are already migrated!',
        summary: {
          total_checked: 0,
          already_migrated: true
        }
      });
    }

    console.log(`✅ Found ${models.length} models to migrate`);

    // ========================================
    // 2. GET VARIANT COUNTS
    // ========================================
    const modelIds = models.map(m => m.id);
    const { data: variantCounts } = await supabase
      .from('model_variants')
      .select('parent_model_id')
      .in('parent_model_id', modelIds);

    const variantCountMap = {};
    variantCounts?.forEach(v => {
      variantCountMap[v.parent_model_id] = (variantCountMap[v.parent_model_id] || 0) + 1;
    });

    // ========================================
    // 3. PREPARE MIGRATION BATCH
    // ========================================
    const migrationQueue = models.map(model => ({
      id: model.id,
      title: model.title,
      variant_count: variantCountMap[model.id] || 0,
      estimated_size_mb: model.file_size ? (model.file_size / 1024 / 1024).toFixed(2) : 'Unknown'
    }));

    const totalFiles = migrationQueue.reduce((sum, m) => sum + 1 + m.variant_count, 0);

    console.log('\n📊 Migration Summary:');
    console.log(`  • Models to migrate: ${migrationQueue.length}`);
    console.log(`  • Total files (with variants): ${totalFiles}`);
    console.log(`  • First 5 models:`, migrationQueue.slice(0, 5).map(m => m.title));

    if (testMode) {
      return res.status(200).json({
        success: true,
        message: '🧪 TEST MODE - No actual migration performed',
        summary: {
          models_found: migrationQueue.length,
          total_files: totalFiles,
          migration_queue: migrationQueue
        }
      });
    }

    // ========================================
    // 4. PERFORM BATCH MIGRATION
    // ========================================
    console.log('\n🔄 Step 4: Starting batch migration...\n');

    const results = {
      successful: [],
      failed: [],
      skipped: [],
      total_size: 0,
      total_files: 0
    };

    for (let i = 0; i < migrationQueue.length; i++) {
      const model = migrationQueue[i];
      const progress = `[${i + 1}/${migrationQueue.length}]`;

      console.log(`\n${'-'.repeat(50)}`);
      console.log(`${progress} Migrating: ${model.title} (${model.id})`);
      console.log(`  Variants: ${model.variant_count}`);

      try {
        // Call the single model migration endpoint
        const migrationResponse = await fetch(
          `${req.headers.origin || 'https://newfurniture.live'}/api/migrate-model-with-variants`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': req.headers.cookie || ''
            },
            body: JSON.stringify({ modelId: model.id })
          }
        );

        const migrationResult = await migrationResponse.json();

        if (migrationResult.success) {
          console.log(`  ✅ Success: ${migrationResult.summary.files_migrated} files, ${migrationResult.summary.total_size_mb} MB`);

          results.successful.push({
            id: model.id,
            title: model.title,
            files: migrationResult.summary.files_migrated,
            size_mb: migrationResult.summary.total_size_mb
          });

          results.total_files += migrationResult.summary.files_migrated;
          results.total_size += parseFloat(migrationResult.summary.total_size_mb || 0);
        } else if (migrationResult.message?.includes('Already fully migrated')) {
          console.log(`  ⏭️ Skipped: Already migrated`);
          results.skipped.push({
            id: model.id,
            title: model.title,
            reason: 'Already migrated'
          });
        } else {
          console.log(`  ❌ Failed: ${migrationResult.details || migrationResult.error}`);
          results.failed.push({
            id: model.id,
            title: model.title,
            error: migrationResult.details || migrationResult.error
          });
        }

        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`  ❌ Error migrating ${model.title}:`, error.message);
        results.failed.push({
          id: model.id,
          title: model.title,
          error: error.message
        });
      }
    }

    // ========================================
    // 5. LOG BATCH MIGRATION RESULTS
    // ========================================
    await supabase
      .from('migration_logs')
      .insert({
        model_id: 'BATCH',
        action: 'batch-migration',
        status: results.failed.length === 0 ? 'success' : 'partial',
        details: {
          successful_count: results.successful.length,
          failed_count: results.failed.length,
          skipped_count: results.skipped.length,
          total_files: results.total_files,
          total_size_mb: results.total_size.toFixed(2),
          successful: results.successful,
          failed: results.failed
        }
      });

    // ========================================
    // 6. GENERATE FINAL REPORT
    // ========================================
    const finalReport = {
      success: results.failed.length === 0,
      message: results.failed.length === 0
        ? '🎉 All models successfully migrated!'
        : `⚠️ Migration completed with ${results.failed.length} failures`,
      summary: {
        total_processed: migrationQueue.length,
        successful: results.successful.length,
        failed: results.failed.length,
        skipped: results.skipped.length,
        total_files_migrated: results.total_files,
        total_size_mb: results.total_size.toFixed(2)
      },
      details: {
        successful: results.successful,
        failed: results.failed,
        skipped: results.skipped
      },
      cost_savings: {
        old_cloudinary_monthly: '$300-650',
        new_aws_monthly: `~$${(results.total_size * 0.023 + 5).toFixed(2)}`,
        monthly_savings: `~$${(300 - (results.total_size * 0.023 + 5)).toFixed(2)}`
      }
    };

    console.log('\n' + '='.repeat(70));
    console.log('📊 BATCH MIGRATION COMPLETE!');
    console.log('='.repeat(70));
    console.log(`✅ Successful: ${results.successful.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️ Skipped: ${results.skipped.length}`);
    console.log(`📦 Total Files: ${results.total_files}`);
    console.log(`💾 Total Size: ${results.total_size.toFixed(2)} MB`);
    console.log(`💰 Monthly Savings: ${finalReport.cost_savings.monthly_savings}`);
    console.log('='.repeat(70) + '\n');

    return res.status(200).json(finalReport);

  } catch (error) {
    console.error('\n❌ BATCH MIGRATION FAILED:', error);

    return res.status(500).json({
      success: false,
      error: 'Batch migration failed',
      details: error.message
    });
  }
};