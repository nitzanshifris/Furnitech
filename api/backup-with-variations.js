/**
 * CRITICAL: Complete Database Backup Including Variations
 * This ensures color variants, size options, materials are ALL preserved
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    console.log('🔒 STARTING CRITICAL BACKUP WITH VARIATIONS V3...');
    console.log('📊 Using correct table names: models, model_variants');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = {
      timestamp,
      version: '3.0-correct-tables',
      deploymentTime: '2025-11-05-v3',
      critical: true,
      tables: {},
      relationships: {},
      integrity: {}
    };

    // ========================================
    // 1. BACKUP MAIN MODELS TABLE
    // ========================================
    console.log('📦 Step 1: Backing up models table...');
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('*');

    if (modelsError) throw modelsError;

    backup.tables.models = {
      count: models?.length || 0,
      data: models || [],
      hasData: models?.length > 0
    };

    console.log(`✅ Backed up ${models?.length || 0} models`);

    // ========================================
    // 2. CHECK FOR VARIANTS (might be stored differently)
    // ========================================
    console.log('🎨 Step 2: Looking for variant data...');

    // Check if variants are in separate table or within furniture_models
    let variants = [];
    let variantSource = 'none';

    // Try model_variants table first
    try {
      const { data: modelVariants, error: mvError } = await supabase
        .from('model_variants')
        .select('*');

      if (!mvError && modelVariants) {
        variants = modelVariants;
        variantSource = 'model_variants_table';
        console.log(`✅ Found ${modelVariants.length} variants in model_variants table`);
      }
    } catch (e) {
      console.log('ℹ️ model_variants table not found');
    }

    // Check if variants might be in the furniture_models as JSON
    if (variants.length === 0 && models && models.length > 0) {
      // Check if furniture_models has variants column
      const sampleModel = models[0];
      if (sampleModel.variants || sampleModel.variant_data || sampleModel.colors) {
        variantSource = 'embedded_in_models';
        console.log('ℹ️ Variants appear to be embedded in furniture_models');

        // Extract variant data from models
        models.forEach(model => {
          if (model.variants || model.variant_data || model.colors) {
            variants.push({
              parent_model_id: model.id,
              embedded_data: model.variants || model.variant_data || model.colors
            });
          }
        });
      }
    }

    backup.tables.variants = {
      count: variants.length,
      data: variants,
      source: variantSource,
      hasData: variants.length > 0
    };

    console.log(`📊 Variant storage type: ${variantSource}`);

    // ========================================
    // 3. MAP PARENT-VARIANT RELATIONSHIPS
    // ========================================
    console.log('🔗 Step 3: Mapping variant relationships...');
    const variantMap = {};
    let orphanedVariants = [];

    if (variants && variants.length > 0) {
      variants.forEach(variant => {
        const parentId = variant.parent_model_id;

        if (parentId) {
          if (!variantMap[parentId]) {
            variantMap[parentId] = [];
          }
          variantMap[parentId].push({
            id: variant.id,
            name: variant.name || variant.title,
            color: variant.color,
            size: variant.size,
            material: variant.material,
            sku: variant.sku,
            model_url: variant.model_url || variant.cloudinary_url,
            thumbnail_url: variant.thumbnail_url
          });
        } else {
          // Variant without parent - CRITICAL to preserve!
          orphanedVariants.push(variant);
        }
      });
    }

    backup.relationships.variantMap = variantMap;
    backup.relationships.orphanedVariants = orphanedVariants;

    // ========================================
    // 4. VARIATION INTEGRITY CHECK
    // ========================================
    console.log('🔍 Step 4: Checking variation integrity...');
    const integrityReport = {
      modelsWithVariants: 0,
      modelsWithoutVariants: 0,
      totalVariantCount: variants?.length || 0,
      orphanedVariantCount: orphanedVariants.length,
      variantsByType: {},
      criticalIssues: []
    };

    // Check each model for variants (use the models we backed up)
    const allModels = backup.tables.models.data || [];
    allModels.forEach(model => {
      const modelVariants = variantMap[model.id];
      if (modelVariants && modelVariants.length > 0) {
        integrityReport.modelsWithVariants++;

        // Count variant types
        modelVariants.forEach(v => {
          if (v.color) {
            integrityReport.variantsByType.color = (integrityReport.variantsByType.color || 0) + 1;
          }
          if (v.size) {
            integrityReport.variantsByType.size = (integrityReport.variantsByType.size || 0) + 1;
          }
          if (v.material) {
            integrityReport.variantsByType.material = (integrityReport.variantsByType.material || 0) + 1;
          }
        });
      } else {
        integrityReport.modelsWithoutVariants++;
      }
    });

    // Check for critical issues
    if (orphanedVariants.length > 0) {
      integrityReport.criticalIssues.push(
        `⚠️ Found ${orphanedVariants.length} variants without parent models`
      );
    }

    // Check for models with same-URL variants (potential data loss risk)
    Object.keys(variantMap).forEach(modelId => {
      const modelVariants = variantMap[modelId];
      const urls = modelVariants.map(v => v.model_url).filter(Boolean);
      const uniqueUrls = new Set(urls);

      if (urls.length > 0 && uniqueUrls.size === 1) {
        // All variants point to same URL - might lose variation data!
        integrityReport.criticalIssues.push(
          `⚠️ Model ${modelId} has ${urls.length} variants but all use same 3D file`
        );
      }
    });

    backup.integrity = integrityReport;

    // ========================================
    // 5. BACKUP OTHER TABLES
    // ========================================

    // Categories
    console.log('📦 Step 6: Backing up categories...');
    const { data: categories } = await supabase
      .from('categories')
      .select('*');

    backup.tables.categories = {
      count: categories?.length || 0,
      data: categories || []
    };

    // Subcategories
    console.log('📦 Step 7: Backing up subcategories...');
    const { data: subcategories } = await supabase
      .from('subcategories')
      .select('*');

    backup.tables.subcategories = {
      count: subcategories?.length || 0,
      data: subcategories || []
    };

    // ========================================
    // 6. CREATE MIGRATION SAFETY REPORT
    // ========================================
    const safetyReport = {
      safe: true,
      warnings: [],
      blockers: []
    };

    // Check for blockers
    if (integrityReport.orphanedVariantCount > 10) {
      safetyReport.blockers.push(
        `Too many orphaned variants (${integrityReport.orphanedVariantCount}). Fix parent relationships first.`
      );
      safetyReport.safe = false;
    }

    // Check for warnings
    if (integrityReport.modelsWithVariants > 0) {
      safetyReport.warnings.push(
        `${integrityReport.modelsWithVariants} models have variants. Ensure migration script handles variants!`
      );
    }

    if (integrityReport.criticalIssues.length > 0) {
      safetyReport.warnings.push(...integrityReport.criticalIssues);
    }

    backup.safetyReport = safetyReport;

    // ========================================
    // 7. GENERATE SUMMARY
    // ========================================
    const summary = {
      timestamp: backup.timestamp,
      statistics: {
        totalModels: backup.tables.models.count,
        totalVariants: backup.tables.variants.count,
        modelsWithVariants: integrityReport.modelsWithVariants,
        averageVariantsPerModel: integrityReport.modelsWithVariants > 0
          ? (integrityReport.totalVariantCount / integrityReport.modelsWithVariants).toFixed(2)
          : 0,
        colorVariants: integrityReport.variantsByType.color || 0,
        sizeVariants: integrityReport.variantsByType.size || 0,
        materialVariants: integrityReport.variantsByType.material || 0,
        orphanedVariants: integrityReport.orphanedVariantCount
      },
      readyForMigration: safetyReport.safe,
      criticalWarnings: safetyReport.warnings.length,
      blockers: safetyReport.blockers
    };

    console.log('\n' + '='.repeat(50));
    console.log('📊 BACKUP COMPLETE - SUMMARY:');
    console.log('='.repeat(50));
    console.log(`✅ Total Models: ${summary.statistics.totalModels}`);
    console.log(`🎨 Total Variants: ${summary.statistics.totalVariants}`);
    console.log(`📦 Models with Variants: ${summary.statistics.modelsWithVariants}`);
    console.log(`🔢 Average Variants/Model: ${summary.statistics.averageVariantsPerModel}`);
    console.log(`🎨 Color Variants: ${summary.statistics.colorVariants}`);
    console.log(`📏 Size Variants: ${summary.statistics.sizeVariants}`);
    console.log(`🪵 Material Variants: ${summary.statistics.materialVariants}`);
    console.log(`⚠️ Orphaned Variants: ${summary.statistics.orphanedVariants}`);
    console.log(`🚦 Ready for Migration: ${summary.readyForMigration ? '✅ YES' : '❌ NO'}`);
    console.log('='.repeat(50));

    // Return comprehensive backup
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="supabase-backup-with-variants-${timestamp}.json"`);

    return res.status(200).json({
      success: true,
      message: 'Complete backup with variations created successfully',
      summary,
      backup
    });

  } catch (error) {
    console.error('❌ CRITICAL BACKUP FAILURE:', error);
    return res.status(500).json({
      error: 'Critical backup failed',
      details: error.message,
      critical: true
    });
  }
};