/**
 * Setup Migration Tables and Columns
 * Adds necessary columns and tables for AWS migration tracking
 * SAFE TO RUN MULTIPLE TIMES - Uses IF NOT EXISTS
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('🔧 Setting up migration tables and columns...');

  const results = {
    success: true,
    steps: [],
    errors: [],
    warnings: []
  };

  try {
    // ========================================
    // 1. ADD MIGRATION COLUMNS TO MODELS TABLE
    // ========================================
    console.log('Step 1: Adding migration columns to models table...');

    const migrationColumns = [
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';`,
        description: 'Add storage_location column'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_url TEXT;`,
        description: 'Add aws_url column'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_filename TEXT;`,
        description: 'Add aws_filename column'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;`,
        description: 'Add migrated_at timestamp'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_error TEXT;`,
        description: 'Add migration_error column'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;`,
        description: 'Add file_size_bytes column'
      },
      {
        sql: `ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_verified BOOLEAN DEFAULT false;`,
        description: 'Add migration_verified flag'
      }
    ];

    for (const column of migrationColumns) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: column.sql
        });

        if (error) {
          // Check if it's just "column already exists" error
          if (error.message.includes('already exists')) {
            results.warnings.push(`✓ ${column.description} (already exists)`);
          } else {
            throw error;
          }
        } else {
          results.steps.push(`✅ ${column.description}`);
        }
      } catch (error) {
        // Try alternative approach if RPC doesn't work
        console.log('RPC failed, trying direct approach...');
        results.warnings.push(`⚠️ ${column.description} - Manual setup may be needed`);
      }
    }

    // ========================================
    // 2. ADD MIGRATION COLUMNS TO MODEL_VARIANTS
    // ========================================
    console.log('Step 2: Adding migration columns to model_variants table...');

    const variantColumns = [
      {
        sql: `ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';`,
        description: 'Add storage_location to variants'
      },
      {
        sql: `ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS aws_url TEXT;`,
        description: 'Add aws_url to variants'
      },
      {
        sql: `ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;`,
        description: 'Add migrated_at to variants'
      }
    ];

    for (const column of variantColumns) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: column.sql
        });

        if (error && !error.message.includes('already exists')) {
          results.warnings.push(`⚠️ ${column.description} - May need manual setup`);
        } else {
          results.steps.push(`✅ ${column.description}`);
        }
      } catch (error) {
        results.warnings.push(`⚠️ ${column.description} - Manual setup needed`);
      }
    }

    // ========================================
    // 3. CREATE MIGRATION TRACKING TABLE
    // ========================================
    console.log('Step 3: Creating migration_logs table...');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS migration_logs (
        id SERIAL PRIMARY KEY,
        model_id TEXT,
        action VARCHAR(50),
        status VARCHAR(20),
        details JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;

    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql: createTableSQL
      });

      if (error) {
        results.warnings.push('⚠️ migration_logs table - May need manual creation');
      } else {
        results.steps.push('✅ Created migration_logs table');
      }
    } catch (error) {
      results.warnings.push('⚠️ migration_logs table - Manual creation needed');
    }

    // ========================================
    // 4. CREATE INDEXES FOR PERFORMANCE
    // ========================================
    console.log('Step 4: Creating indexes...');

    const indexes = [
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_models_storage_location ON models(storage_location);`,
        description: 'Index on storage_location'
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_models_migrated_at ON models(migrated_at);`,
        description: 'Index on migrated_at'
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_migration_logs_model_id ON migration_logs(model_id);`,
        description: 'Index on migration_logs.model_id'
      }
    ];

    for (const index of indexes) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: index.sql
        });

        if (!error) {
          results.steps.push(`✅ ${index.description}`);
        }
      } catch (error) {
        results.warnings.push(`⚠️ ${index.description} - Optional optimization`);
      }
    }

    // ========================================
    // 5. TEST THE NEW COLUMNS
    // ========================================
    console.log('Step 5: Testing new columns...');

    // Try to query with new columns
    const { data: testQuery, error: testError } = await supabase
      .from('models')
      .select('id, storage_location, aws_url, migrated_at')
      .limit(1);

    if (testError) {
      results.errors.push('❌ Could not query new columns - manual setup required');
      results.success = false;
    } else {
      results.steps.push('✅ New columns are accessible');
      results.steps.push(`✅ Test query successful - found ${testQuery?.length || 0} models`);
    }

    // ========================================
    // 6. GENERATE SUMMARY
    // ========================================
    const summary = {
      totalSteps: results.steps.length,
      warnings: results.warnings.length,
      errors: results.errors.length,
      ready: results.success && results.errors.length === 0,
      nextSteps: []
    };

    if (summary.ready) {
      summary.nextSteps.push('✅ Database is ready for migration!');
      summary.nextSteps.push('📋 Next: Test with a single model migration');
    } else if (results.warnings.length > 0) {
      summary.nextSteps.push('⚠️ Some columns may need manual setup');
      summary.nextSteps.push('📋 Run the SQL commands manually in Supabase dashboard');
    }

    // ========================================
    // 7. PROVIDE MANUAL SQL IF NEEDED
    // ========================================
    if (results.warnings.length > 0) {
      results.manualSQL = `
-- Run these commands in your Supabase SQL editor:

-- Add columns to models table
ALTER TABLE models ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';
ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_url TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS aws_filename TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_error TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS migration_verified BOOLEAN DEFAULT false;

-- Add columns to model_variants table (if you have variants)
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS storage_location VARCHAR(20) DEFAULT 'cloudinary';
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS aws_url TEXT;
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMP;

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS migration_logs (
  id SERIAL PRIMARY KEY,
  model_id TEXT,
  action VARCHAR(50),
  status VARCHAR(20),
  details JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_models_storage_location ON models(storage_location);
CREATE INDEX IF NOT EXISTS idx_models_migrated_at ON models(migrated_at);
CREATE INDEX IF NOT EXISTS idx_migration_logs_model_id ON migration_logs(model_id);
      `;
    }

    console.log('\n========================================');
    console.log('MIGRATION SETUP COMPLETE');
    console.log('========================================');
    console.log(`✅ Successful steps: ${results.steps.length}`);
    console.log(`⚠️ Warnings: ${results.warnings.length}`);
    console.log(`❌ Errors: ${results.errors.length}`);
    console.log(`🚦 Ready for migration: ${summary.ready ? 'YES' : 'NEEDS MANUAL SETUP'}`);
    console.log('========================================\n');

    return res.status(200).json({
      success: results.success,
      message: summary.ready
        ? '✅ Database is ready for AWS migration!'
        : '⚠️ Some manual setup may be required',
      results,
      summary
    });

  } catch (error) {
    console.error('❌ Setup failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to setup migration tables',
      details: error.message,
      results
    });
  }
};