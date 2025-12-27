/**
 * Database Backup Utility for Supabase
 * Creates comprehensive backup before AWS migration
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
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

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔄 Starting database backup V3...');
    console.log('📊 Using table: models (not furniture_models)');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupData = {
      timestamp,
      tables: {}
    };

    // 1. Backup models table
    console.log('📦 Backing up models...');
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('*');

    if (modelsError) throw modelsError;

    backupData.tables.models = {
      count: models?.length || 0,
      data: models || []
    };
    console.log(`✅ Backed up ${models?.length || 0} models`);

    // 2. Backup categories table
    console.log('📦 Backing up categories...');
    const { data: categories, error: catError } = await supabase
      .from('categories')
      .select('*');

    if (catError) throw catError;

    backupData.tables.categories = {
      count: categories?.length || 0,
      data: categories || []
    };
    console.log(`✅ Backed up ${categories?.length || 0} categories`);

    // 3. Backup subcategories table
    console.log('📦 Backing up subcategories...');
    const { data: subcategories, error: subError } = await supabase
      .from('subcategories')
      .select('*');

    if (subError) throw subError;

    backupData.tables.subcategories = {
      count: subcategories?.length || 0,
      data: subcategories || []
    };
    console.log(`✅ Backed up ${subcategories?.length || 0} subcategories`);

    // 4. Backup users table (if exists and accessible)
    try {
      console.log('📦 Backing up users...');
      const { data: users, error: userError } = await supabase
        .from('users')
        .select('*');

      if (!userError && users) {
        backupData.tables.users = {
          count: users.length,
          data: users
        };
        console.log(`✅ Backed up ${users.length} users`);
      }
    } catch (e) {
      console.log('ℹ️ Users table not accessible or doesn\'t exist');
    }

    // 5. Create statistics summary
    const stats = {
      totalTables: Object.keys(backupData.tables).length,
      totalRecords: Object.values(backupData.tables).reduce((sum, table) => sum + table.count, 0),
      models: backupData.tables.models?.count || 0,
      categories: backupData.tables.categories?.count || 0,
      subcategories: backupData.tables.subcategories?.count || 0,
      backupSize: JSON.stringify(backupData).length,
      timestamp: backupData.timestamp
    };

    // 6. Create migration readiness report
    const migrationReadiness = await analyzeMigrationReadiness(models);

    console.log('✅ Backup completed successfully!');

    // Return backup data as JSON download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="supabase-backup-${timestamp}.json"`);

    return res.status(200).json({
      success: true,
      message: 'Database backup completed',
      stats,
      migrationReadiness,
      backup: backupData
    });

  } catch (error) {
    console.error('❌ Backup failed:', error);
    return res.status(500).json({
      error: 'Backup failed',
      details: error.message
    });
  }
};

// Analyze data for migration readiness
async function analyzeMigrationReadiness(models) {
  if (!models || models.length === 0) {
    return { ready: false, reason: 'No models found' };
  }

  const analysis = {
    totalModels: models.length,
    modelsWithUrls: 0,
    modelsWithoutUrls: 0,
    cloudinaryModels: 0,
    alreadyOnAws: 0,
    brokenUrls: [],
    largeFiles: [],
    categories: {},
    readyToMigrate: []
  };

  models.forEach(model => {
    // Check URL status
    if (model.model_url || model.cloudinary_url) {
      analysis.modelsWithUrls++;

      const url = model.model_url || model.cloudinary_url;
      if (url.includes('cloudinary')) {
        analysis.cloudinaryModels++;
        analysis.readyToMigrate.push({
          id: model.id,
          name: model.model_name,
          url: url
        });
      }
      if (url.includes('aws') || url.includes('s3')) {
        analysis.alreadyOnAws++;
      }
    } else {
      analysis.modelsWithoutUrls++;
      analysis.brokenUrls.push({
        id: model.id,
        name: model.model_name
      });
    }

    // Count by category
    const category = model.category || 'uncategorized';
    analysis.categories[category] = (analysis.categories[category] || 0) + 1;
  });

  analysis.migrationPercentage = analysis.cloudinaryModels > 0
    ? ((analysis.alreadyOnAws / analysis.totalModels) * 100).toFixed(2)
    : 0;

  analysis.ready = analysis.cloudinaryModels > 0;
  analysis.estimatedMigrationTime = `${Math.ceil(analysis.cloudinaryModels / 50)} hours`;
  analysis.priorityModels = analysis.readyToMigrate.slice(0, 20); // Top 20 to migrate first

  return analysis;
}