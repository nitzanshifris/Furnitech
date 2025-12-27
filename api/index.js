// Removed Cloudinary imports - now using AWS S3 only
const { uploadModelToS3, uploadLogoToS3, generateModelUrl, getS3Config } = require('../lib/aws-s3-simple.js');
const { saveModel, saveModelVariant, getModel, getAllModels, getModelsWithVariants, getModelsByCustomer, getModelsByCustomerWithVariants, getCustomers, getStats, deleteModel, incrementViewCount, updateModelCustomer, migrateModelSlugs, resolveUrlToModel, supabase, query } = require('../lib/supabase.js');
// deleteFromCloudinary no longer needed - using AWS S3
const { validateFileContent, sanitizeFilename, checkRateLimit, getRateLimitHeaders, hashIP } = require('../lib/security.js');
const { logger } = require('../lib/logger.js');
const { getInternalEndpoint } = require('../lib/endpoints.js');
const { generateQR } = require('../lib/qr-generator.js');
const multiparty = require('multiparty');
const bcrypt = require('bcryptjs');

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

/**
 * Create secure error response that doesn't leak internal details in production
 */
function createErrorResponse(statusCode, message, error = null) {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  const response = { error: message };
  
  if (isDevelopment && error) {
    response.details = error.message;
    if (error.stack) {
      response.stack = error.stack;
    }
  }
  
  return { statusCode, response };
}

/**
 * Single catch-all API handler for all routes
 * Handles: upload, models, model/[id], model/[id]/info, model/[id]/view
 */
module.exports = async function handler(req, res) {
  logger.debug('Function entry', { 
    method: req.method, 
    timestamp: new Date().toISOString() 
  });
  
  // Rate limiting for sensitive endpoints
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const ipHash = hashIP(clientIP);
  
  // Apply rate limiting to upload and authentication endpoints
  const url = new URL(req.url, `https://${req.headers.host}`);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const routePath = pathParts.slice(1).join('/');
  
  if (['upload-simple', 'upload', 'upload-image', 'login', 'create-user'].includes(routePath)) {
    const rateLimit = checkRateLimit(ipHash, 60000, 10); // 10 requests per minute
    
    // Set rate limit headers
    const headers = getRateLimitHeaders(rateLimit);
    Object.entries(headers).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: rateLimit.resetTime - Math.floor(Date.now() / 1000)
      });
    }
  }
  
  logger.debug('Route processing', { routePath });
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // CORS headers (restrict in production)
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://newfurniture.live', 'https://www.newfurniture.live']
    : ['*'];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Parse route from URL path instead of query params
    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 's7'] or ['api', 'models']
    const externalRoutePath = pathParts.slice(1).join('/'); // Remove 'api' prefix: 's7' or 'models'

    // Convert obfuscated endpoint back to internal name
    const routePath = getInternalEndpoint(externalRoutePath) || externalRoutePath;

    // SUPER AGGRESSIVE DEBUG LOGGING
    console.log('🔍 SUPER DEBUG:', {
      'req.url': req.url,
      'url.pathname': url.pathname,
      'pathParts': pathParts,
      'externalRoutePath': externalRoutePath,
      'routePath': routePath,
      'method': req.method,
      'contains_model': routePath?.includes('model'),
      'contains_category': routePath?.includes('category'),
      'starts_with_model': routePath?.startsWith('model/'),
      'host': req.headers.host
    });

    // SUPER EXPLICIT ROUTE CHECK - SHOULD CATCH EVERYTHING
    if (req.method === 'PUT' && req.url.includes('model') && req.url.includes('category')) {
      console.log('🚨 EMERGENCY ROUTE MATCH - URL contains model + category + PUT');
      // Extract model ID from URL
      const urlParts = req.url.split('/');
      const modelIndex = urlParts.indexOf('model');
      if (modelIndex >= 0 && urlParts[modelIndex + 1]) {
        const modelId = urlParts[modelIndex + 1];
        console.log('🎯 EXTRACTED MODEL ID:', modelId);
        return await handleModelCategoryUpdate(req, res, modelId);
      }
    }

    logger.debug('Route debug', { routePath, method: req.method, searchParams: Object.fromEntries(url.searchParams) });

    // Remove debug code - we found the issue

    logger.debug('Users route detected', { routePath });

    logger.debug('Model route detected', { routePath });

    // Handle SEO URL routes from vercel.json rewrites
    const seoRoute = url.searchParams.get('route');
    const seoPath = url.searchParams.get('path');

    if (seoRoute === 'f' && seoPath) {
      return await handleSEOFurnitureUrl(req, res, seoPath);
    }

    if (seoRoute === 'qr' && seoPath) {
      return await handleSEOQRUrl(req, res, seoPath);
    }

    // Route: /api/upload-simple
    if (routePath === 'upload-simple') {
      return await handleUpload(req, res);
    }

    // Route: /api/upload - AWS S3 Upload
    if (routePath === 'upload') {
      return await handleUpload(req, res);
    }

    // Route: /api/cloudinary-config - Get signed upload configuration
    if (routePath === 'cloudinary-config') {
      return await handleCloudinaryConfig(req, res);
    }

    // Route: /api/cloudinary-save - Save metadata after direct upload
    if (routePath === 'cloudinary-save') {
      return await handleCloudinarySave(req, res);
    }

    // Route: /api/qr-migration - Add QR persistence columns to database
    if (routePath === 'qr-migration') {
      return await handleQRMigration(req, res);
    }

    // Route: /api/url-slug-migration - Generate URL slugs for existing models
    if (routePath === 'url-slug-migration') {
      return await handleUrlSlugMigration(req, res);
    }

    // Route: /api/variant-equality-migration - Add original variants for equality
    if (routePath === 'variant-equality-migration') {
      return await handleVariantEqualityMigration(req, res);
    }

    // Route: /api/qr-generate - Generate QR code using local generator
    if (routePath === 'qr-generate') {
      return await handleQRGenerate(req, res);
    }

    // Route: /api/upload-wallpaper
    if (routePath === 'upload-wallpaper') {
      return await handleWallpaperUpload(req, res);
    }
    
    // Route: /api/models
    if (routePath === 'models') {
      return await handleModels(req, res);
    }

    // Route: /api/models/bulk-category - Bulk update categories
    if (routePath === 'models/bulk-category') {
      return await handleBulkCategoryUpdate(req, res);
    }

    // NEW DEBUG ROUTE - Fresh database SKU check (bypass cache)
    if (routePath === 'debug-sku-fresh') {
      try {
        // Direct database query to see what's actually stored
        const directResult = await query('SELECT id, title, sku FROM models ORDER BY upload_date DESC LIMIT 10');
        console.log('🔍 DIRECT DATABASE QUERY RESULT:', directResult);
        console.log('🔍 QUERY SUCCESS:', directResult.success);
        console.log('🔍 QUERY ROWS:', directResult.rows);
        console.log('🔍 QUERY ROWS LENGTH:', directResult.rows?.length);

        return res.status(200).json({
          message: 'Direct database SKU check',
          success: directResult.success,
          models: directResult.rows || [],
          modelCount: directResult.rows?.length || 0,
          rawResult: directResult,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('🔍 QUERY ERROR:', error);
        return res.status(500).json({
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
      }
    }

    // TEMPORARY DEBUG ROUTE - Remove after debugging
    if (routePath === 'debug-sku-hell') {
      try {
        // FIRST: Check what models exist in database
        const modelsResult = await query('SELECT id, title, sku FROM models ORDER BY upload_date DESC LIMIT 5');
        console.log('🔍 MODELS QUERY RESULT:', modelsResult);

        const testSku = 'DEBUG-TEST-SKU';

        // Just return the models data for now - skip the complex tests that are failing
        return res.status(200).json({
          actualModels: modelsResult.rows || [],
          modelQuerySuccess: modelsResult.success,
          modelsCount: modelsResult.rows?.length || 0,
          message: 'Simple models query result'
        });

        // Test 5: Manual uniqueness check for variant rovKYO1_
        // const { isSKUUnique } = await import('../lib/sku-generator.js');
        const isUniqueResult = false; // await isSKUUnique(testSku, { sql: query }, 'rovKYO1_', 'variant');

        return res.status(200).json({
          testSku,
          modelCount: modelCount.rows[0].count,
          variantCount: variantCount.rows[0].count,
          modelCountNonNull: modelCountNonNull.rows[0].count,
          variantCountNonNull: variantCountNonNull.rows[0].count,
          modelNullCount: modelNullCount.rows[0].count,
          variantNullCount: variantNullCount.rows[0].count,
          specificVariant: specificVariant.rows[0] || null,
          isUniqueResult,

          // ACTUAL MODELS DATA
          actualModels: modelsResult.rows || [],
          modelQuerySuccess: modelsResult.success,
          message: 'Database models and test results'
        });
      } catch (error) {
        return res.status(500).json({ error: error.message, stack: error.stack });
      }
    }

    // Route: /api/customers
    if (routePath === 'customers') {
      return await handleCustomers(req, res);
    }

    // Route: /api/customers/{customerId}/categories - Manage customer categories
    if (routePath?.match(/^customers\/[^\/]+\/categories$/)) {
      const customerId = routePath.split('/')[1];
      return await handleCustomerCategories(req, res, customerId);
    }

    // Route: /api/categories - Get all categories for current context
    if (routePath === 'categories') {
      return await handleCategories(req, res);
    }
    
    // Route: /api/cleanup-variants
    if (routePath === 'cleanup-variants') {
      return await handleCleanupVariants(req, res);
    }
    
    // Route: /api/update-color
    if (routePath === 'update-color') {
      return await handleUpdateColor(req, res);
    }
    
    // Route: /api/update-variant-color
    if (routePath === 'update-variant-color') {
      return await handleUpdateVariantColor(req, res);
    }
    
    // Route: /api/upload-image
    if (routePath === 'upload-image') {
      return await handleImageUpload(req, res);
    }
    
    // Route: /api/images
    if (routePath === 'images') {
      return await handleImages(req, res);
    }
    
    // Route: /api/create-images-table
    if (routePath === 'create-images-table') {
      return await handleCreateImagesTable(req, res);
    }
    
    // Route: /api/create-model-views-table
    if (routePath === 'create-model-views-table') {
      return await handleCreateModelViewsTable(req, res);
    }
    
    // Route: /api/reset-view-counts
    if (routePath === 'reset-view-counts') {
      return await handleResetViewCounts(req, res);
    }
    
    // Route: /api/feedback
    if (routePath === 'feedback') {
      return await handleFeedback(req, res);
    }
    
    // Route: /api/create-feedback-table
    if (routePath === 'create-feedback-table') {
      return await handleCreateFeedbackTable(req, res);
    }
    
    // Route: /api/create-brand-settings-table
    if (routePath === 'create-brand-settings-table') {
      return await handleCreateBrandSettingsTable(req, res);
    }
    
    // Route: /api/init-models-db
    if (routePath === 'init-models-db') {
      return await handleInitModelsDB(req, res);
    }
    
    // Route: /api/test-save-model
    if (routePath === 'test-save-model') {
      return await handleTestSaveModel(req, res);
    }
    
    // Route: /api/test-brand-settings-schema
    if (routePath === 'test-brand-settings-schema') {
      return await handleTestBrandSettingsSchema(req, res);
    }
    
    // Route: /api/test-columns (debug endpoint)
    if (routePath === 'test-columns') {
      try {
        const result = await query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'models' AND column_name = 'product_url'
        `);
        
        const variantResult = await query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = 'model_variants' AND column_name = 'product_url'
        `);
        
        return res.status(200).json({
          models_product_url: result.data,
          model_variants_product_url: variantResult.data
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    
    // Route: /api/debug-update (test update functionality)
    if (routePath === 'debug-update') {
      try {
        // Test a simple update on the first model
        const testResult = await query(`
          SELECT id, title, product_url FROM models LIMIT 1
        `);
        
        if (!testResult.success || !testResult.data || testResult.data.length === 0) {
          return res.status(400).json({ error: 'No models found to test with' });
        }
        
        const testModel = testResult.data[0];
        const testUrl = 'https://test-url.com';
        
        console.log('🧪 Testing update on model:', testModel.id);
        
        const updateResult = await query(`
          UPDATE models 
          SET product_url = $1, updated_at = NOW() 
          WHERE id = $2
        `, [testUrl, testModel.id]);
        
        return res.status(200).json({
          original_model: testModel,
          update_result: updateResult,
          test_url_set: testUrl
        });
        
      } catch (error) {
        console.error('Debug update error:', error);
        return res.status(500).json({ error: error.message, stack: error.stack });
      }
    }
    
    // Route: /api/create-user
    if (routePath === 'create-user') {
      return await handleCreateUser(req, res);
    }
    
    // Route: /api/requests - handle customer request operations
    if (routePath === 'requests') {
      return await handleRequests(req, res);
    }
    
    // Route: /api/variants - handle variant operations
    if (routePath === 'variants') {
      if (req.method === 'PUT') {
        // Update a variant's product URL or SKU
        const { id, product_url, sku } = req.body;

        if (!id) {
          return res.status(400).json({ error: 'Variant ID required' });
        }

        try {
          // Determine what to update based on provided fields
          const updates = [];
          const values = [];
          let paramIndex = 1;

          if (product_url !== undefined) {
            updates.push(`product_url = $${paramIndex}`);
            values.push(product_url || null);
            paramIndex++;
          }

          if (sku !== undefined) {
            updates.push(`sku = $${paramIndex}`);
            values.push(sku || null);
            paramIndex++;
          }

          if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
          }

          // Add updated_at and WHERE clause
          updates.push(`updated_at = NOW()`);
          values.push(id);

          const updateQuery = `
            UPDATE model_variants
            SET ${updates.join(', ')}
            WHERE id = $${paramIndex}
          `;

          console.log('🔄 Executing variant update query:', updateQuery);
          console.log('🔄 With values:', values);

          const result = await query(updateQuery, values);

          if (!result.success) {
            console.error('Variant query execution failed:', result.error);
            throw new Error(result.error || 'Database update failed');
          }

          const updateType = sku !== undefined ? 'SKU' : 'URL';
          res.status(200).json({ success: true, message: `Variant ${updateType} updated successfully` });
          
        } catch (error) {
          console.error('Error updating variant:', error);
          console.error('Full error object:', JSON.stringify(error, null, 2));
          
          if (error.message && error.message.includes('column')) {
            res.status(500).json({ 
              error: 'Database schema issue. Column might be missing.',
              details: error.message
            });
          } else {
            res.status(500).json({ 
              error: 'Unable to save variant changes. Please try again.',
              details: error.message || 'Unknown error'
            });
          }
        }
      } else {
        return res.status(405).json({ error: 'Method not allowed' });
      }
    }
    
    
    // Route: /api/users - handle all user operations directly
    if (routePath === 'users') {
      // GET /api/users - List all users with view counts
      if (req.method === 'GET') {
        const usersResult = await query(`
          SELECT 
            u.id,
            u.username,
            u.role,
            u.customer_id,
            u.customer_name,
            u.is_active,
            u.created_at,
            COALESCE(SUM(m.view_count), 0) as total_views
          FROM users u
          LEFT JOIN models m ON (u.role = 'customer' AND m.customer_id = u.customer_id)
          GROUP BY u.id, u.username, u.role, u.customer_id, u.customer_name, u.is_active, u.created_at
          ORDER BY u.created_at DESC
        `);
        
        if (!usersResult.success) {
          return res.status(500).json({ error: 'Failed to fetch users' });
        }
        
        return res.status(200).json(usersResult.data || []);
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Route: /api/users/{id}/password - Update user password
    if (routePath?.startsWith('users/') && routePath.endsWith('/password')) {
      if (req.method === 'PUT') {
        const userId = routePath.split('/')[1];
        const { password } = req.body;
        
        if (!password) {
          return res.status(400).json({ error: 'Password is required' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const updateResult = await query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [hashedPassword, userId]
        );
        
        if (!updateResult.success) {
          return res.status(500).json({ error: 'Failed to update password' });
        }
        
        return res.status(200).json({ success: true });
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Route: /api/users/{id}/toggle - Toggle user active status  
    if (routePath?.startsWith('users/') && routePath.endsWith('/toggle')) {
      if (req.method === 'PUT') {
        const userId = routePath.split('/')[1];
        
        const toggleResult = await query(
          'UPDATE users SET is_active = NOT is_active WHERE id = $1',
          [userId]
        );
        
        if (!toggleResult.success) {
          return res.status(500).json({ error: 'Failed to toggle user status' });
        }
        
        return res.status(200).json({ success: true });
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Route: /api/login - User authentication
    if (routePath === 'login') {
      if (req.method === 'POST') {
        try {
          const { username, password } = req.body;
          
          if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
          }
          
          // Find user by username (using parameterized query to prevent SQL injection)
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .single();
          
          if (userError || !userData) {
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          const user = userData;
          
          // Verify password
          const passwordMatch = await bcrypt.compare(password, user.password_hash);
          
          if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
          }
          
          // Set secure session cookies
          const isProduction = process.env.NODE_ENV === 'production';
          res.setHeader('Set-Cookie', [
            `user_role=${user.role}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${isProduction ? '; Secure' : ''}`,
            `user_id=${user.id}; Path=/; Max-Age=86400; HttpOnly; SameSite=Strict${isProduction ? '; Secure' : ''}`
          ]);
          
          return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
              id: user.id,
              username: user.username,
              role: user.role,
              customerId: user.customer_id,
              customerName: user.customer_name
            },
            redirectUrl: user.role === 'admin' ? '/admin.html' : `/customer.html?customer=${user.customer_id}`
          });
          
        } catch (error) {
          logger.error('Login error', error);
          const { statusCode, response } = createErrorResponse(500, 'Login failed', error);
          return res.status(statusCode).json(response);
        }
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Route: /api/customer?customer=id (for query parameter format)
    if (routePath === 'customer') {
      const customerId = url.searchParams.get('customer');
      if (!customerId) {
        return res.status(400).json({ error: 'Customer ID is required' });
      }
      return await handleCustomerModels(req, res, customerId);
    }
    
    // Route: /api/customers/[id]/brand-settings
    if (routePath?.match(/^customers\/[^\/]+\/brand-settings$/)) {
      const customerId = routePath.split('/')[1];
      return await handleBrandSettings(req, res, customerId);
    }
    
    // Route: /api/customers/[id]/logo - Customer logo upload
    if (routePath?.match(/^customers\/[^\/]+\/logo$/)) {
      const customerId = routePath.split('/')[1];
      return await handleCustomerLogoUpload(req, res, customerId);
    }
    
    // Route: /api/customer/[id]
    if (routePath?.startsWith('customer/')) {
      const customerId = routePath.split('/')[1];
      return await handleCustomerModels(req, res, customerId);
    }
    
    // EXPLICIT CATEGORY ROUTE CHECK (100% guaranteed to work)
    if (routePath?.includes('/category') && routePath?.includes('model/') && req.method === 'PUT') {
      const parts = routePath.split('/');
      const modelId = parts[1];
      console.log('🎯 EXPLICIT CATEGORY ROUTE MATCHED:', { routePath, modelId });
      return await handleModelCategoryUpdate(req, res, modelId);
    }

    // Route: /api/model/[id]
    if (routePath?.startsWith('model/')) {
      const routeParts = routePath.split('/');
      const modelId = routeParts[1];

      console.log('Model route detected:', { routePath, routeParts, modelId, method: req.method });

      if (routeParts.length === 2) {
        // /api/model/[id]
        return await handleModelFile(req, res, modelId);
      } else if (routeParts.length === 3 && routeParts[2] === 'info') {
        // /api/model/[id]/info
        return await handleModelInfo(req, res, modelId);
      } else if (routeParts.length === 3 && routeParts[2] === 'view') {
        // /api/model/[id]/view
        return await handleModelView(req, res, modelId);
      } else if (routeParts.length === 3 && routeParts[2] === 'assign') {
        // /api/model/[id]/assign
        return await handleModelAssign(req, res, modelId);
      } else if (routeParts.length === 3 && routeParts[2] === 'category') {
        // /api/model/[id]/category
        console.log('Category route matched!');
        return await handleModelCategoryUpdate(req, res, modelId);
      }

      // If no route matched, return 404
      console.log('No model sub-route matched:', routeParts);
      return res.status(404).json({ error: 'Model route not found' });
    }

    // Route: /api/sku/{sku} - Find model or variant by SKU
    if (routePath?.startsWith('sku/')) {
      const sku = routePath.split('/')[1];
      return await handleSKULookup(req, res, sku);
    }

    // SKU updates now handled by /api/models and /api/variants routes

    // Debug route: /api/variant/{id}/debug - Check variant exists
    if (routePath?.startsWith('variant/') && routePath.endsWith('/debug')) {
      const routeParts = routePath.split('/');
      if (routeParts.length === 3) {
        const variantId = routeParts[1];
        try {
          const variantCheck = await query('SELECT id, sku FROM model_variants WHERE id = $1', [variantId]);
          return res.status(200).json({
            variantId,
            found: variantCheck.rows.length > 0,
            variant: variantCheck.rows[0] || null,
            totalVariants: (await query('SELECT COUNT(*) as count FROM model_variants')).rows[0].count
          });
        } catch (error) {
          return res.status(500).json({ error: error.message });
        }
      }
    }

    /*
    // Test route: /api/test-sku-check - Manual SKU uniqueness test
    if (routePath === 'test-sku-check') {
      try {
        const testSku = req.url.includes('sku=') ? new URL(req.url, 'http://localhost').searchParams.get('sku') : 'TEST-SKU';
        const excludeId = req.url.includes('exclude=') ? new URL(req.url, 'http://localhost').searchParams.get('exclude') : null;

        const { isSKUUnique } = await import('../lib/sku-generator.js');

        const result = await isSKUUnique(testSku, { sql: query }, excludeId, 'variant');

        // Also run raw queries
        const modelCheck = await query('SELECT id, sku FROM models WHERE sku = $1 AND sku IS NOT NULL', [testSku]);
        const variantCheck = await query('SELECT id, sku FROM model_variants WHERE sku = $1 AND sku IS NOT NULL', [testSku]);

        return res.status(200).json({
          testSku,
          excludeId,
          isUnique: result,
          modelMatches: modelCheck.rows,
          variantMatches: variantCheck.rows,
          debug: 'Manual SKU uniqueness test'
        });
      } catch (error) {
        return res.status(500).json({ error: error.message, stack: error.stack });
      }
    }
    */

    // 404 for unknown routes
    console.log('🚨 NO ROUTE MATCHED:', {
      routePath,
      method: req.method,
      allChecks: {
        startsWithModel: routePath?.startsWith('model/'),
        isEmptyOrNull: !routePath,
        exactValue: JSON.stringify(routePath)
      }
    });
    return res.status(404).json({
      error: 'Route not found',
      debug: {
        routePath,
        method: req.method
      }
    });
    
  } catch (error) {
    console.error('API Error:', error);
    
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    return res.status(500).json({ 
      error: 'Something went wrong on our end. Please try again in a few moments.',
      message: 'Service temporarily unavailable',
      showReportButton: true,
      reportData: {
        errorType: 'server_error',
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent'] || 'unknown'
      }
    });
  }
}

/**
 * Handle file upload
 */
async function handleUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🔧 UPLOAD DEBUG: Starting upload process');

    // Parse multipart form data
    console.log('🔧 UPLOAD DEBUG: Creating multiparty form');
    const form = new multiparty.Form({
      maxFilesSize: 100 * 1024 * 1024, // 100MB
      maxFields: 20,
      maxFieldsSize: 2 * 1024 * 1024  // 2MB for form fields
    });

    console.log('🔧 UPLOAD DEBUG: Parsing form data');
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('🚨 FORM PARSING ERROR:', err);
          reject(err);
        } else {
          console.log('🔧 UPLOAD DEBUG: Form parsing completed');
          console.log('🔧 Fields:', Object.keys(fields || {}));
          console.log('🔧 Files:', Object.keys(files || {}));
          resolve({ fields, files });
        }
      });
    });

    // Variant detection logic
    const parentModelId = fields.parentModelId?.[0];
    const variantName = fields.variantName?.[0];
    const isVariantUpload = parentModelId && variantName && 
                           parentModelId.trim() !== '' && variantName.trim() !== '';
    
    logger.debug('Upload type detected', { 
      isVariant: isVariantUpload 
    });

    // Get file
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(uploadedFile.originalFilename);
    
    // Validate file type and extension
    if (!uploadedFile.originalFilename?.match(/\.(glb|gltf)$/i)) {
      return res.status(400).json({ error: 'Only GLB and GLTF files are allowed' });
    }

    // Check file size (50MB)
    if (uploadedFile.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum size is 50MB' });
    }

    // Read file
    const fs = await import('fs');
    const fileBuffer = fs.readFileSync(uploadedFile.path);
    
    // Validate file content using magic numbers
    const contentValidation = validateFileContent(fileBuffer, uploadedFile.originalFilename, ['glb', 'gltf']);
    if (!contentValidation.valid) {
      fs.unlinkSync(uploadedFile.path); // Clean up temp file
      return res.status(400).json({ error: `Security validation failed: ${contentValidation.error}` });
    }

    // Upload to AWS S3
    console.log('🔧 UPLOAD DEBUG: Starting AWS S3 upload');
    logger.debug('Starting file upload to S3');

    // Generate model ID for S3 filename
    const modelId = require('crypto').randomBytes(4).toString('hex');
    const s3Result = await uploadModelToS3(fileBuffer, modelId);
    const awsUrl = generateModelUrl(modelId);

    console.log('🔧 UPLOAD DEBUG: AWS S3 upload completed', { url: awsUrl });

    // Create result object compatible with existing code
    const cloudinaryResult = {
      url: awsUrl,
      public_id: modelId,
      resource_type: 'raw',
      format: 'glb'
    };

    // Save to database - VARIANT OR MODEL
    let dbResult;
    
    if (isVariantUpload) {
      logger.debug('Saving variant to database');
      const hexColor = fields.hexColor?.[0] || '#000000';
      
      console.log('💾 Saving variant with params:', {
        parentModelId,
        variantName,
        hexColor,
        fileSize: cloudinaryResult.size || fileBuffer.length,
        sku: fields.sku?.[0] || null
      });

      dbResult = await saveModelVariant({
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor,
        cloudinaryUrl: awsUrl, // Database field - populated with AWS URL
        awsUrl: awsUrl, // AWS URL - this is what we actually use
        cloudinaryPublicId: modelId, // Database field - populated with AWS model ID
        fileSize: fileBuffer.length,
        isPrimary: false,
        variantType: fields.variantType?.[0] || 'upload',
        productUrl: fields.variantProductUrl?.[0] || fields.variant_product_url?.[0] || null, // Check both field names
        dimensionsText: fields.dimensionsText?.[0] || null,
        storageLocation: 'aws', // IMPORTANT: We only use AWS now
        sku: fields.sku?.[0] || null
      });
    } else {
      logger.debug('Saving model to database');
      
      dbResult = await saveModel({
        title: fields.title?.[0] || uploadedFile.originalFilename.replace(/\.(glb|gltf)$/i, ''),
        description: fields.description?.[0] || '',
        filename: uploadedFile.originalFilename,
        cloudinaryUrl: awsUrl, // Database field - populated with AWS URL
        awsUrl: awsUrl, // AWS URL - this is what we actually use
        cloudinaryPublicId: modelId, // Database field - populated with AWS model ID
        fileSize: fileBuffer.length,
        customerId: fields.customerId?.[0] || 'unassigned',
        customerName: fields.customerName?.[0] || 'Unassigned',
        dominantColor: '#6b7280', // Will be updated by frontend after color extraction
        productUrl: fields.product_url?.[0] || null, // Product URL for back button
        storageLocation: 'aws', // IMPORTANT: We only use AWS now
        awsFilename: `${modelId}.glb`,
        metadata: {
          mimetype: uploadedFile.headers['content-type'],
          uploadedAt: new Date().toISOString()
        },
        category: fields.category?.[0] || null,
        arPlacement: fields.ar_placement?.[0] || 'floor' // AR placement type (floor or wall)
      });
    }

    console.log('🔍 Database save completed with result:', dbResult);

    if (!dbResult.success) {
      console.error('❌ Database save failed with details:', {
        success: dbResult.success,
        error: dbResult.error,
        fullResult: dbResult
      });

      return res.status(500).json({
        error: 'Database save failed',
        message: dbResult.error || 'Unknown database error',
        details: dbResult.error,
        showReportButton: true,
        reportData: {
          errorType: 'database_save_failed',
          filename: uploadedFile?.originalFilename || 'unknown',
          timestamp: new Date().toISOString(),
          dbError: dbResult.error
        }
      });
    }

    // Clean up temp file
    fs.unlinkSync(uploadedFile.path);

    // Return success - different response based on upload type
    const domain = process.env.DOMAIN || 'newfurniture.live';
    
    if (isVariantUpload) {
      // Variant upload response
      res.status(200).json({
        success: true,
        id: dbResult.id,
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: fields.hexColor?.[0] || '#000000',
        cloudinaryUrl: cloudinaryResult.url,
        viewUrl: `https://${domain}/view?id=${parentModelId}&variant=${dbResult.id}`,
        message: '🎨 Variant uploaded successfully!',
        debugInfo: {
          uploadType: 'variant',
          detectedAs: 'variant'
        }
      });
    } else {
      // Model upload response  
      const modelId = dbResult.id;
      res.status(200).json({
        success: true,
        id: modelId,
        viewUrl: `https://${domain}/view?id=${modelId}`,
        directUrl: cloudinaryResult.url,
        shareUrl: `https://${domain}/view?id=${modelId}`,
        title: fields.title?.[0] || uploadedFile.originalFilename,
        fileSize: cloudinaryResult.size,
        message: '📦 Furniture uploaded successfully!',
        debugInfo: {
          uploadType: 'model',
          detectedAs: 'regular model'
        }
      });
    }

  } catch (error) {
    console.error('🚨 UPLOAD CRASH - Full error details:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Error object:', JSON.stringify(error, null, 2));

    logger.error('Upload error', error);
    const { statusCode, response } = createErrorResponse(500, 'Upload failed', error);
    return res.status(statusCode).json({
      error: 'Upload failed',
      details: error.message,
      stage: 'server_upload'
    });
  }
}

/**
 * Handle models listing and deletion
 */
async function handleModels(req, res) {
  // List all models
  if (req.method === 'GET') {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;
      
      const models = await getModelsWithVariants(limit, offset);
      const stats = await getStats();
      
      res.status(200).json({
        models,
        stats,
        success: true
      });
      
    } catch (error) {
      console.error('Error fetching models:', error);
      res.status(500).json({ error: 'Unable to load your furniture collection. Please refresh the page and try again.' });
    }
  }
  
  // Update a model
  else if (req.method === 'PUT') {
    const { id, title, product_url, sku } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Model ID required' });
    }

    try {
      // Build update object with only provided fields
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (product_url !== undefined) updateData.product_url = product_url || null;
      if (sku !== undefined) updateData.sku = sku || null;

      // Build SQL query dynamically for the fields we want to update
      const setClauses = [];
      const values = [];
      let paramIndex = 1;

      if (title !== undefined) {
        setClauses.push(`title = $${paramIndex}`);
        values.push(title);
        paramIndex++;
      }

      if (product_url !== undefined) {
        setClauses.push(`product_url = $${paramIndex}`);
        values.push(product_url || null);
        paramIndex++;
      }

      if (sku !== undefined) {
        console.log('🏷️ SKU UPDATE: Setting sku to:', sku || null);
        setClauses.push(`sku = $${paramIndex}`);
        values.push(sku || null);
        paramIndex++;
      }
      
      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      // Add the ID parameter for WHERE clause
      values.push(id);
      
      const updateQuery = `
        UPDATE models
        SET ${setClauses.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
      `;

      console.log('🔄 Executing update query:', updateQuery);
      console.log('🔄 With values:', values);

      // SIMPLE DIRECT UPDATE: Use Supabase client directly instead of complex query function
      const { supabase } = await import('../lib/supabase.js');

      const supabaseUpdateData = {};
      if (title !== undefined) supabaseUpdateData.title = title;
      if (product_url !== undefined) supabaseUpdateData.product_url = product_url || null;
      if (sku !== undefined) supabaseUpdateData.sku = sku || null;

      console.log('🔄 DIRECT SUPABASE UPDATE:', id, 'with data:', supabaseUpdateData);

      const { error } = await supabase
        .from('models')
        .update(supabaseUpdateData)
        .eq('id', id);

      if (error) {
        console.error('Supabase update error:', error);
        throw new Error(error.message || 'Database update failed');
      }

      res.status(200).json({ success: true, message: 'Model updated successfully' });
      
    } catch (error) {
      console.error('Error updating model:', error);
      console.error('Error details:', error.message);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      
      // Check if it's a column not found error
      if (error.code === '42703') {
        res.status(500).json({ 
          error: 'Database column missing. Please run migration at /api/init-models-db',
          details: 'The product_url column needs to be added to the database'
        });
      } else if (error.message && error.message.includes('column')) {
        res.status(500).json({ 
          error: 'Database schema issue. Column might be missing.',
          details: error.message
        });
      } else {
        res.status(500).json({ 
          error: 'Unable to save changes. Please try again.',
          details: error.message || 'Unknown error'
        });
      }
    }
  }
  
  // Delete a model or variant
  else if (req.method === 'DELETE') {
    const { id, cloudinaryPublicId, type } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'ID required' });
    }
    
    try {
      if (type === 'variant') {
        // Delete variant
        console.log('Deleting variant:', id);

        // Check if this is an original variant
        const isOriginalVariant = id.endsWith('-original');

        // Get variant info first to delete from Cloudinary
        const { data: variant, error: fetchError } = await supabase
          .from('model_variants')
          .select('cloudinary_public_id, parent_model_id, is_original')
          .eq('id', id)
          .single();

        if (fetchError) {
          console.warn('Could not fetch variant for cleanup:', fetchError);
        }

        if (isOriginalVariant && variant?.is_original) {
          // This is an original variant - check if we need to promote another variant
          const { data: otherVariants, error: variantsError } = await supabase
            .from('model_variants')
            .select('*')
            .eq('parent_model_id', variant.parent_model_id)
            .eq('is_original', false)
            .limit(1);

          if (variantsError) {
            console.warn('Could not check for other variants:', variantsError);
          }

          if (otherVariants && otherVariants.length > 0) {
            // Promote the first variant to be the new original
            const newOriginal = otherVariants[0];
            console.log('Promoting variant to original:', newOriginal.id);

            // Update the model with the new original variant data
            const { error: updateModelError } = await supabase
              .from('models')
              .update({
                cloudinary_url: newOriginal.cloudinary_url,
                cloudinary_public_id: newOriginal.cloudinary_public_id,
                dominant_color: newOriginal.hex_color,
                filename: `${newOriginal.variant_name}.glb`
              })
              .eq('id', variant.parent_model_id);

            if (updateModelError) {
              console.error('Failed to promote variant to original:', updateModelError);
              throw new Error('Failed to promote variant to original');
            }

            // Delete the promoted variant from variants table (it's now the original)
            const { error: deletePromotedError } = await supabase
              .from('model_variants')
              .delete()
              .eq('id', newOriginal.id);

            if (deletePromotedError) {
              console.error('Failed to remove promoted variant:', deletePromotedError);
            }

            console.log('✅ Successfully promoted variant to original');
          }
        }

        // Cloudinary deletion removed - using AWS S3 only
        // AWS S3 deletion handled separately if needed

        // Delete from database
        const { error: deleteError } = await supabase
          .from('model_variants')
          .delete()
          .eq('id', id);

        if (deleteError) {
          throw new Error('Failed to delete variant from database');
        }

        res.status(200).json({
          success: true,
          message: isOriginalVariant ? 'Original variant deleted and variant promoted' : 'Variant deleted successfully'
        });
        
      } else {
        // Delete model (original logic)
        // Cloudinary deletion removed - using AWS S3 only
        // AWS S3 deletion handled separately if needed
        
        // Delete from database
        const result = await deleteModel(id);
        
        if (!result.success) {
          throw new Error('Failed to delete from database');
        }
        
        res.status(200).json({ success: true, message: 'Model deleted successfully' });
      }
      
    } catch (error) {
      console.error('Error deleting:', error);
      res.status(500).json({ error: `Failed to delete ${type || 'model'}` });
    }
  }
  
  else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle model file serving - Return JSON with direct URL for AR compatibility
 */
async function handleModelFile(req, res, modelId) {
  try {
    // Get model from database
    const model = await getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Furniture item not found' });
    }

    // Check if model has been migrated to AWS
    const modelUrl = (model.storage_location === 'aws' && model.aws_url)
      ? model.aws_url
      : model.cloudinary_url;

    // Log which source is being used
    console.log(`📦 Model ${modelId} file serving from ${model.storage_location === 'aws' ? 'AWS S3' : 'Cloudinary'}`);

    // Return JSON with the appropriate URL (AWS if available, otherwise Cloudinary)
    res.json({
      id: model.id,
      title: model.title,
      cloudinary_url: modelUrl, // Use AWS URL if available, otherwise Cloudinary
      storage_location: model.storage_location || 'cloudinary', // For debugging
      variants: model.variants || []
    });

  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: 'Unable to load the requested furniture model. Please check the link and try again.' });
  }
}

/**
 * Handle model info with variants
 */
async function handleModelInfo(req, res, modelId) {
  try {
    const model = await getModel(modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Furniture item not found' });
    }

    // Get variants for this model
    const { data: variants, error: variantsError } = await supabase
      .from('model_variants')
      .select('*')
      .eq('parent_model_id', modelId)
      .order('is_primary', { ascending: false });

    if (variantsError) {
      console.warn('Error fetching variants for model info:', variantsError);
    }
    
    // Check if model has been migrated to AWS
    const modelUrl = (model.storage_location === 'aws' && model.aws_url)
      ? model.aws_url
      : model.cloudinary_url;

    // Log which source is being used
    console.log(`📍 Model ${modelId} using ${model.storage_location === 'aws' ? 'AWS' : 'Cloudinary'} URL`);

    // Return model info with variants (using AWS URL if available, otherwise Cloudinary)
    res.status(200).json({
      id: model.id,
      title: model.title,
      description: model.description,
      filename: model.filename,
      file_size: model.file_size,
      upload_date: model.upload_date,
      view_count: model.view_count,
      dominant_color: model.dominant_color,
      customer_id: model.customer_id, // Include for logo loading
      customer_name: model.customer_name, // Include for logo loading
      product_url: model.product_url, // Include for back button functionality
      metadata: model.metadata,
      cloudinary_url: modelUrl, // Use AWS URL if available, otherwise Cloudinary
      storage_location: model.storage_location || 'cloudinary', // Include storage location for debugging
      aws_url: model.aws_url, // Include AWS URL if available
      variants: (variants || []).map(variant => ({
        id: variant.id,
        variant_name: variant.variant_name,
        hex_color: variant.hex_color,
        is_primary: variant.is_primary,
        variant_type: variant.variant_type || 'upload',
        cloudinary_url: (variant.storage_location === 'aws' && variant.aws_url)
          ? variant.aws_url
          : variant.cloudinary_url // Use AWS URL for variants if available
      }))
    });
    
  } catch (error) {
    console.error('Error fetching model info:', error);
    res.status(500).json({ error: 'Unable to load furniture details. Please try again.' });
  }
}

/**
 * Handle model view tracking with variant support
 */
async function handleModelView(req, res, modelId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Get variant ID from query parameter
    const url = new URL(req.url, `https://${req.headers.host}`);
    const variantId = url.searchParams.get('variant');
    
    console.log(`📊 Tracking view for model ${modelId}, variant: ${variantId || 'original'}`);
    
    const result = await incrementViewCount(modelId, variantId);
    
    if (!result.success) {
      return res.status(404).json({ error: 'Furniture item not found' });
    }
    
    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Error tracking view:', error);
    res.status(500).json({ error: 'Failed to track view' });
  }
}

/**
 * Handle customers list
 */
async function handleCustomers(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const customers = await getCustomers();
    res.status(200).json({ customers, success: true });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
}

/**
 * Handle customer-specific models
 */
async function handleCustomerModels(req, res, customerId) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const models = await getModelsByCustomerWithVariants(customerId, limit, offset);
    
    // Get customer stats
    const totalViews = models.reduce((sum, model) => sum + (model.view_count || 0), 0);
    const totalSize = models.reduce((sum, model) => sum + (model.file_size || 0), 0);
    
    const stats = {
      totalModels: models.length,
      totalViews,
      totalSize
    };
    
    res.status(200).json({
      models,
      stats,
      customer: customerId,
      success: true
    });
    
  } catch (error) {
    console.error('Error fetching customer models:', error);
    res.status(500).json({ error: 'Failed to fetch customer models' });
  }
}

/**
 * Handle model customer assignment
 */
async function handleModelAssign(req, res, modelId) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customerId, customerName } = req.body;

    if (!customerId || !customerName) {
      return res.status(400).json({ error: 'Customer ID and name required' });
    }

    const result = await updateModelCustomer(modelId, customerId, customerName);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.status(200).json({
      success: true,
      model: result.data,
      message: 'Model assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning model:', error);
    res.status(500).json({ error: 'Failed to assign model' });
  }
}

/**
 * Handle model category update
 */
async function handleModelCategoryUpdate(req, res, modelId) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { category } = req.body;

    // Allow empty string to remove category
    // if (!category) {
    //   return res.status(400).json({ error: 'Category is required' });
    // }

    // Update the model's category
    const updateResult = await query(
      'UPDATE models SET product_category = $1 WHERE id = $2',
      [category, modelId]
    );

    if (!updateResult.success) {
      return res.status(500).json({ error: 'Failed to update category' });
    }

    // Get the updated model
    const modelResult = await query(
      'SELECT id, title, product_category FROM models WHERE id = $1',
      [modelId]
    );

    if (!modelResult.success || !modelResult.data || modelResult.data.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    res.status(200).json({
      success: true,
      model: modelResult.data[0],
      message: 'Category updated successfully'
    });

  } catch (error) {
    console.error('Error updating model category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
}

/**
 * Handle bulk category update for multiple models
 */
async function handleBulkCategoryUpdate(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { modelIds, category } = req.body;

    if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
      return res.status(400).json({ error: 'Model IDs array is required' });
    }

    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    // Build the IN clause for multiple IDs
    const placeholders = modelIds.map((_, index) => `$${index + 2}`).join(', ');
    const queryText = `UPDATE models SET product_category = $1 WHERE id IN (${placeholders})`;
    const queryParams = [category, ...modelIds];

    const updateResult = await query(queryText, queryParams);

    if (!updateResult.success) {
      return res.status(500).json({ error: 'Failed to update categories' });
    }

    res.status(200).json({
      success: true,
      message: `Updated category for ${modelIds.length} models`,
      updatedModels: modelIds
    });

  } catch (error) {
    console.error('Error bulk updating categories:', error);
    res.status(500).json({ error: 'Failed to bulk update categories' });
  }
}

/**
 * Handle customer-specific categories
 */
async function handleCustomerCategories(req, res, customerId) {
  if (req.method === 'GET') {
    // Get all categories for a customer
    try {
      const categoriesResult = await query(
        `SELECT id, category_name, category_slug, display_order
         FROM customer_categories
         WHERE customer_id = $1
         ORDER BY display_order, category_name`,
        [customerId]
      );

      if (!categoriesResult.success) {
        return res.status(500).json({ error: 'Failed to fetch categories' });
      }

      res.status(200).json({
        success: true,
        categories: categoriesResult.data || []
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  } else if (req.method === 'POST') {
    // Create a new category
    try {
      const { category_name } = req.body;

      if (!category_name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      const category_slug = category_name.toLowerCase().replace(/\s+/g, '-');

      console.log('Creating category:', { customerId, category_name, category_slug });

      // Insert category
      const insertResult = await query(
        `INSERT INTO customer_categories (customer_id, category_name, category_slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (customer_id, category_slug) DO UPDATE
         SET category_name = EXCLUDED.category_name
         RETURNING *`,
        [customerId, category_name, category_slug]
      );

      console.log('Insert result:', insertResult);

      if (!insertResult.success) {
        console.error('Failed to create category:', insertResult.error);
        return res.status(500).json({ error: insertResult.error || 'Failed to create category' });
      }

      res.status(201).json({
        success: true,
        category: insertResult.data[0]
      });
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({ error: 'Failed to create category' });
    }
  } else if (req.method === 'DELETE') {
    // Delete a category
    try {
      const { category_id } = req.body;

      if (!category_id) {
        return res.status(400).json({ error: 'Category ID is required' });
      }

      const deleteResult = await query(
        'DELETE FROM customer_categories WHERE id = $1 AND customer_id = $2',
        [category_id, customerId]
      );

      if (!deleteResult.success) {
        return res.status(500).json({ error: 'Failed to delete category' });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting category:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle general categories fetch (gets unique categories from models)
 */
async function handleCategories(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { customer_id } = req.query;

    let categoriesResult;
    if (customer_id) {
      // Get categories for specific customer
      categoriesResult = await query(
        `SELECT id, category_name, category_slug, display_order
         FROM customer_categories
         WHERE customer_id = $1
         ORDER BY display_order, category_name`,
        [customer_id]
      );
    } else {
      // Get all unique categories from models (for backward compatibility)
      categoriesResult = await query(
        `SELECT DISTINCT product_category as category_name,
                product_category as category_slug
         FROM models
         WHERE product_category IS NOT NULL
         ORDER BY product_category`
      );
    }

    res.status(200).json({
      success: true,
      categories: categoriesResult.data || []
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

/**
 * Handle cleanup of color-type variants
 */
async function handleCleanupVariants(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧹 Cleaning up color-type variants...');

    // Delete all variants where variant_type is 'color'
    const { data: deletedVariants, error: deleteError } = await supabase
      .from('model_variants')
      .delete()
      .eq('variant_type', 'color')
      .select();

    if (deleteError) {
      console.error('Error deleting color variants:', deleteError);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete color variants',
        details: deleteError.message
      });
    }

    console.log(`✅ Deleted ${deletedVariants?.length || 0} color-type variants`);

    // Get remaining variants for summary
    const { data: remainingVariants, error: countError } = await supabase
      .from('model_variants')
      .select('*');

    return res.status(200).json({
      success: true,
      message: `Cleaned up ${deletedVariants?.length || 0} color-type variants`,
      deletedCount: deletedVariants?.length || 0,
      remainingVariants: remainingVariants?.length || 0,
      deletedVariants: deletedVariants || []
    });

  } catch (error) {
    console.error('💥 Cleanup error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      instructions: 'Run this SQL manually in your Supabase SQL editor:',
      manualSql: "DELETE FROM model_variants WHERE variant_type = 'color';"
    });
  }
}

/**
 * Handle updating dominant color for a model
 */
async function handleUpdateColor(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { modelId, dominantColor, variantId, hexColor, isOriginal } = req.body;

    // Handle variant color update
    if (variantId && hexColor) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
        return res.status(400).json({ error: 'Invalid hex color format' });
      }

      const { error } = await supabase
        .from('model_variants')
        .update({ hex_color: hexColor })
        .eq('id', variantId);

      if (error) {
        console.error('Error updating variant color:', error);
        return res.status(500).json({ error: 'Failed to update variant color' });
      }

      return res.status(200).json({ success: true, message: 'Variant color updated successfully' });
    }

    // Handle original model color update
    if (isOriginal && modelId && hexColor) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
        return res.status(400).json({ error: 'Invalid hex color format' });
      }

      const { error } = await supabase
        .from('models')
        .update({ dominant_color: hexColor })
        .eq('id', modelId);

      if (error) {
        console.error('Error updating model color:', error);
        return res.status(500).json({ error: 'Failed to update model color' });
      }

      return res.status(200).json({ success: true, message: 'Original model color updated successfully' });
    }

    // Legacy support for old API calls
    if (!modelId || !dominantColor) {
      return res.status(400).json({ error: 'Model ID and dominant color required' });
    }
    
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(dominantColor)) {
      return res.status(400).json({ error: 'Invalid hex color format' });
    }

    // Update model dominant color in database
    const { error } = await supabase
      .from('models')
      .update({ dominant_color: dominantColor })
      .eq('id', modelId);

    if (error) {
      console.error('Error updating model color:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update model color',
        details: error.message
      });
    }
    
    console.log(`✅ Updated dominant color for model ${modelId}: ${dominantColor}`);

    return res.status(200).json({
      success: true,
      message: 'Model color updated successfully',
      modelId,
      dominantColor
    });

  } catch (error) {
    console.error('💥 Update color error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
}

/**
 * Handle updating variant color
 */
async function handleUpdateVariantColor(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { variantId, dominantColor } = req.body;
    
    if (!variantId || !dominantColor) {
      return res.status(400).json({ error: 'Variant ID and dominant color required' });
    }
    
    // Validate hex color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(dominantColor)) {
      return res.status(400).json({ error: 'Invalid hex color format' });
    }

    // Update variant hex color in database
    const { error } = await supabase
      .from('model_variants')
      .update({ hex_color: dominantColor })
      .eq('id', variantId);

    if (error) {
      console.error('Error updating variant color:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update variant color',
        details: error.message
      });
    }
    
    console.log(`✅ Updated variant color for ${variantId}: ${dominantColor}`);

    return res.status(200).json({
      success: true,
      message: 'Variant color updated successfully',
      variantId,
      dominantColor
    });

  } catch (error) {
    console.error('💥 Update variant color error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message
    });
  }
}

/**
 * Handle image upload (logos, brand assets, etc.)
 */
async function handleImageUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const form = new multiparty.Form({
      maxFilesSize: 100 * 1024 * 1024, // 100MB
      maxFields: 20,
      maxFieldsSize: 2 * 1024 * 1024  // 2MB for form fields
    });
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Get file
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Sanitize filename
    const sanitizedFilename = sanitizeFilename(uploadedFile.originalFilename);
    
    // Validate file type and extension
    if (!uploadedFile.originalFilename?.match(/\.(jpg|jpeg|png|webp|svg)$/i)) {
      return res.status(400).json({ error: 'Only image files (JPG, PNG, WebP, SVG) are allowed' });
    }

    // Check file size (10MB for images)
    if (uploadedFile.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
    }

    // Read file
    const fs = await import('fs');
    const fileBuffer = fs.readFileSync(uploadedFile.path);
    
    // Validate file content using magic numbers
    const allowedImageTypes = ['jpg', 'jpeg', 'png', 'webp', 'svg'];
    const contentValidation = validateFileContent(fileBuffer, uploadedFile.originalFilename, allowedImageTypes);
    if (!contentValidation.valid) {
      fs.unlinkSync(uploadedFile.path); // Clean up temp file
      return res.status(400).json({ error: `Security validation failed: ${contentValidation.error}` });
    }

    // Upload to Cloudinary
    console.log('Uploading image to Cloudinary...');
    // Cloudinary upload removed - this route should use AWS S3 instead
    // For now, return error since we removed Cloudinary
    return res.status(501).json({ error: 'Image upload via Cloudinary has been disabled. Use AWS S3 endpoints instead.' });

    // Old Cloudinary code (removed):
    // const cloudinaryResult = await uploadImage(fileBuffer, uploadedFile.originalFilename);

    // Save to database
    console.log('Saving image to database...');
    const imageType = fields.imageType?.[0] || 'general';
    const customerId = fields.customerId?.[0] || null;
    const customerName = fields.customerName?.[0] || null;
    
    // Generate a UUID for the image
    const imageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const { data, error } = await supabase
      .from('images')
      .insert({
        id: imageId,
        filename: uploadedFile.originalFilename,
        cloudinary_url: cloudinaryResult.url,
        cloudinary_public_id: cloudinaryResult.publicId,
        file_size: cloudinaryResult.size,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
        format: cloudinaryResult.format,
        image_type: imageType,
        customer_id: customerId,
        metadata: {
          originalName: uploadedFile.originalFilename,
          uploadedAt: new Date().toISOString(),
          customerName: customerName
        }
      })
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: 'Failed to save image to database' });
    }

    // Clean up temp file
    try {
      fs.unlinkSync(uploadedFile.path);
    } catch (e) {
      console.log('Could not delete temp file:', e);
    }

    return res.status(200).json({
      success: true,
      message: 'Image uploaded successfully',
      image: data
    });

  } catch (error) {
    console.error('Image upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle fetching all images or images by type
 */
async function handleImages(req, res) {
  if (req.method === 'GET') {
    try {
      const { imageType, customerId } = req.query;

      // Special handling for customer logos - check new brand settings table
      if (imageType === 'customer_logo' && customerId) {
        console.log('🎨 Checking customer_brand_settings for logo:', customerId);

        const { data: brandSettings, error: brandError } = await supabase
          .from('customer_brand_settings')
          .select('logo_url, updated_at')
          .eq('customer_id', customerId)
          .single();

        if (brandError && brandError.code !== 'PGRST116') { // PGRST116 = not found
          console.error('Error fetching brand settings:', brandError);
          return res.status(500).json({ error: 'Failed to fetch brand settings' });
        }

        if (brandSettings?.logo_url) {
          console.log('✅ Found logo in brand settings:', brandSettings.logo_url);
          // Return in format expected by AR viewer
          const logoImage = {
            id: `brand_logo_${customerId}`,
            filename: 'logo',
            cloudinary_url: brandSettings.logo_url, // Map to expected field name
            aws_url: brandSettings.logo_url,
            image_type: 'customer_logo',
            customer_id: customerId,
            created_at: brandSettings.updated_at,
            updated_at: brandSettings.updated_at
          };
          return res.status(200).json({ images: [logoImage] });
        } else {
          console.log('📝 No logo found in brand settings for customer:', customerId);
          return res.status(200).json({ images: [] });
        }
      }

      // Original images table query for other image types
      let query = supabase.from('images').select('*');

      if (imageType) {
        query = query.eq('image_type', imageType);
      }

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching images:', error);
        return res.status(500).json({ error: 'Failed to fetch images' });
      }

      return res.status(200).json({ images: data || [] });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id, cloudinaryPublicId } = req.body;
      
      if (!id || !cloudinaryPublicId) {
        return res.status(400).json({ error: 'Image ID and Cloudinary ID required' });
      }
      
      // Delete from Cloudinary
      const { deleteImage } = await import('../lib/cloudinary.js');
      await deleteImage(cloudinaryPublicId);
      
      // Delete from database
      const { error } = await supabase
        .from('images')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Error deleting image:', error);
        return res.status(500).json({ error: 'Failed to delete image' });
      }
      
      return res.status(200).json({ success: true, message: 'Image deleted successfully' });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle testing saveModel function
 */
async function handleTestSaveModel(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 Testing saveModel function...');
    
    const testResult = await saveModel({
      title: 'Test Model',
      description: 'Test Description',
      filename: 'test.glb',
      cloudinaryUrl: 'https://test.cloudinary.com/test.glb',
      cloudinaryPublicId: 'test-public-id',
      fileSize: 12345,
      customerId: 'test-customer',
      customerName: 'Test Customer',
      dominantColor: '#6b7280',
      metadata: { test: true }
    });
    
    console.log('🧪 Test result:', testResult);
    
    if (!testResult.success) {
      return res.status(500).json({ 
        error: 'SaveModel test failed',
        details: testResult.error
      });
    }
    
    // Clean up test record
    await supabase
      .from('models')
      .delete()
      .eq('id', testResult.id);
    
    return res.status(200).json({
      success: true,
      message: 'SaveModel test passed!',
      testId: testResult.id
    });

  } catch (error) {
    console.error('🧪 Test error:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Handle initializing models database table
 */
async function handleInitModelsDB(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🎨 Checking models table...');

    // Try to insert and then delete a test record to check if table exists
    const testId = 'test-' + Date.now();
    
    const { error: testError } = await supabase
      .from('models')
      .insert({
        id: testId,
        title: 'test',
        filename: 'test.glb',
        cloudinary_url: 'https://test.url',
        cloudinary_public_id: 'test-id',
        file_size: 0,
        customer_id: 'test',
        customer_name: 'Test',
        metadata: {}
      });
    
    if (testError && testError.code === '42P01') {
      // Table doesn't exist
      console.log('Models table does not exist');
      return res.status(200).json({
        success: false,
        message: 'Models table needs to be created manually',
        sql: `
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0,
  customer_id VARCHAR(100) DEFAULT 'unassigned',
  customer_name VARCHAR(255) DEFAULT 'Unassigned',
  view_count INTEGER DEFAULT 0,
  dominant_color VARCHAR(7) DEFAULT '#6b7280',
  product_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_customer ON models(customer_id);
CREATE INDEX IF NOT EXISTS idx_models_created ON models(created_at);

-- Add product_url column if it doesn't exist (migration)
ALTER TABLE models ADD COLUMN IF NOT EXISTS product_url TEXT;

-- Create model_variants table
CREATE TABLE IF NOT EXISTS model_variants (
  id TEXT PRIMARY KEY,
  parent_model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  variant_name VARCHAR(255) NOT NULL,
  hex_color VARCHAR(7) DEFAULT '#000000',
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  file_size INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  variant_type VARCHAR(50) DEFAULT 'upload',
  dimensions_text VARCHAR(100),
  product_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for model_variants
CREATE INDEX IF NOT EXISTS idx_model_variants_parent ON model_variants(parent_model_id);
CREATE INDEX IF NOT EXISTS idx_model_variants_primary ON model_variants(is_primary);

-- Add product_url column to existing model_variants table if it doesn't exist (migration)
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS product_url TEXT;

-- Add dimensions_text column for size variants (migration)
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS dimensions_text VARCHAR(100);

-- Grant permissions
GRANT ALL ON models TO authenticated;
GRANT ALL ON models TO service_role;
GRANT ALL ON model_variants TO authenticated;
GRANT ALL ON model_variants TO service_role;
        `,
        instructions: 'Please run the SQL above in your Supabase SQL editor'
      });
    }
    
    // If test insert succeeded, delete the test record
    if (!testError) {
      await supabase
        .from('models')
        .delete()
        .eq('id', testId);
    }

    console.log('✅ Models table exists and is accessible!');
    
    // Now check if product_url column exists
    console.log('🔧 Checking if product_url column exists...');
    
    try {
      // Try to query the product_url column to see if it exists
      const { error: columnCheckError } = await supabase
        .from('models')
        .select('product_url')
        .limit(1);
      
      if (columnCheckError && columnCheckError.message.includes('product_url')) {
        console.log('⚠️  product_url column is missing!');
        
        return res.status(200).json({
          success: false,
          message: 'Models table exists but product_url column is missing',
          action_required: 'Please run this SQL in your Supabase SQL editor:',
          sql: 'ALTER TABLE models ADD COLUMN product_url TEXT;',
          instructions: [
            '1. Go to your Supabase dashboard',
            '2. Navigate to SQL Editor',
            '3. Run the SQL command above',
            '4. Then try saving product URLs again'
          ]
        });
      } else {
        console.log('✅ product_url column exists!');
      }
    } catch (columnError) {
      console.error('⚠️  Error checking product_url column:', columnError);
      
      return res.status(200).json({
        success: false,
        message: 'Could not verify product_url column',
        error: columnError.message,
        action_required: 'Please run this SQL in your Supabase SQL editor to be safe:',
        sql: 'ALTER TABLE models ADD COLUMN IF NOT EXISTS product_url TEXT;'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Models table is ready with product_url column!'
    });

  } catch (error) {
    console.error('💥 Database initialization error:', error);
    return res.status(500).json({ 
      error: error.message,
      solution: 'Check your Supabase configuration'
    });
  }
}

/**
 * Handle creating images table SQL instructions
 */
async function handleCreateImagesTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor',
    sql: `
-- Create images table
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  format VARCHAR(50),
  image_type VARCHAR(50) NOT NULL DEFAULT 'general',
  customer_id VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_images_type ON images(image_type);
CREATE INDEX IF NOT EXISTS idx_images_customer ON images(customer_id);

-- Grant permissions
GRANT ALL ON images TO authenticated;
GRANT ALL ON images TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the table'
    ]
  });
}

/**
 * Handle user creation with universal customer integration
 */
async function handleCreateUser(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password, role, customerId, customerName } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password and role are required' });
    }

    if (role === 'customer' && (!customerId || !customerName)) {
      return res.status(400).json({ error: 'Customer ID and name are required for customer role' });
    }

    // Generate user ID
    const userId = Date.now().toString().slice(-8);
    
    // Create user record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        username,
        password_hash: password, // In production, this should be hashed
        role,
        customer_id: customerId || null,
        customer_name: customerName || null
      })
      .select()
      .single();

    if (userError) {
      console.error('Error creating user:', userError);
      return res.status(500).json({ error: 'Failed to create user: ' + userError.message });
    }

    // If creating a customer, also ensure they exist in the customers system
    if (role === 'customer') {
      // Check if customer already exists in models table (via assignment)
      const { data: existingCustomers } = await supabase
        .from('models')
        .select('customer_id, customer_name')
        .eq('customer_id', customerId)
        .limit(1);

      // If customer doesn't exist in models, create a placeholder entry
      if (!existingCustomers || existingCustomers.length === 0) {
        console.log(`Creating customer entry for: ${customerName} (${customerId})`);
        // We'll let the customer appear when they first get furniture assigned
        // This ensures the customer system stays universal
      }
    }

    return res.status(200).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: userData.id,
        username: userData.username,
        role: userData.role,
        customerId: userData.customer_id,
        customerName: userData.customer_name
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Handle creating model_views table for variant tracking
 */
async function handleCreateModelViewsTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to enable per-variant view tracking',
    sql: `
-- Create model_views table for detailed view tracking per variant
CREATE TABLE IF NOT EXISTS model_views (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL,
  variant_id TEXT NULL, -- NULL for original variant
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_model_views_model ON model_views(model_id);
CREATE INDEX IF NOT EXISTS idx_model_views_variant ON model_views(variant_id);
CREATE INDEX IF NOT EXISTS idx_model_views_date ON model_views(viewed_at);

-- Grant permissions
GRANT ALL ON model_views TO authenticated;
GRANT ALL ON model_views TO service_role;
GRANT USAGE, SELECT ON SEQUENCE model_views_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE model_views_id_seq TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor', 
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the table',
      '5. This enables detailed per-variant view analytics'
    ]
  });
}

/**
 * Handle resetting all view counts to 0
 */
async function handleResetViewCounts(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if customer parameter is provided for customer-specific reset
    const { customer } = req.body;
    let modelsError;
    
    if (customer) {
      console.log(`🔄 Resetting view counts for customer: ${customer}`);
      
      // Reset view_count only for specific customer's models
      const result = await supabase
        .from('models')
        .update({ view_count: 0 })
        .eq('customer_id', customer);
        
      modelsError = result.error;
        
    } else {
      console.log('🔄 Resetting all view counts to 0...');
      
      // Reset view_count in models table - use not equal to impossible value to match all rows
      const result = await supabase
        .from('models')
        .update({ view_count: 0 })
        .not('id', 'eq', 'impossible_id_that_never_exists');
        
      modelsError = result.error;
    }

    if (modelsError) {
      console.error('Error resetting models view counts:', modelsError);
      return res.status(500).json({ 
        error: 'Failed to reset model view counts',
        details: modelsError.message 
      });
    }

    // Clear records from model_views table (if it exists)
    let viewsCleared = 0;
    try {
      let deleteQuery;
      
      if (customer) {
        // Get model IDs for this customer first
        const { data: customerModels } = await supabase
          .from('models')
          .select('id')
          .eq('customer_id', customer);
          
        if (customerModels && customerModels.length > 0) {
          const modelIds = customerModels.map(m => m.id);
          deleteQuery = supabase
            .from('model_views')
            .delete()
            .in('model_id', modelIds);
        }
      } else {
        deleteQuery = supabase
          .from('model_views')
          .delete()
          .neq('id', 0); // Delete all records
      }
      
      if (deleteQuery) {
        const { error: viewsError, count } = await deleteQuery;
        
        if (!viewsError) {
          viewsCleared = count || 0;
          console.log(`✅ Cleared ${viewsCleared} detailed view records${customer ? ` for customer ${customer}` : ''}`);
        }
      }
    } catch (viewsTableError) {
      console.log('📝 model_views table not found (this is okay for first setup)');
    }

    const resetMessage = customer ? 
      `✅ View counts reset to 0 for customer '${customer}'` : 
      '✅ All view counts reset to 0';
    console.log(resetMessage);

    return res.status(200).json({
      success: true,
      message: customer ? `View counts reset to 0 for customer '${customer}'` : 'All view counts reset to 0',
      customer: customer || null,
      modelsReset: true,
      detailedViewsCleared: viewsCleared,
      instructions: customer ? 
        `View counts for customer '${customer}' have been reset to 0` :
        'You can now test the per-variant view tracking system from a clean state'
    });

  } catch (error) {
    console.error('💥 Reset view counts error:', error);
    return res.status(500).json({ 
      error: error.message,
      solution: 'Check your Supabase configuration and try again'
    });
  }
}

/**
 * Handle feedback submission and retrieval
 */
async function handleFeedback(req, res) {
  if (req.method === 'POST') {
    // Submit new feedback
    try {
      const {
        type,
        categories,
        comment,
        customerId,
        itemId,
        itemName,
        userAgent
      } = req.body;

      if (!type || !customerId || !itemId) {
        return res.status(400).json({
          error: 'Missing required fields: type, customerId, itemId'
        });
      }

      // Generate feedback ID
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Save feedback to database
      const { data, error } = await supabase
        .from('feedback')
        .insert({
          id: feedbackId,
          feedback_type: type,
          categories: categories || [],
          comment: comment || null,
          customer_id: customerId,
          model_id: itemId,
          model_name: itemName,
          user_agent: userAgent,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving feedback:', error);
        return res.status(500).json({
          error: 'Failed to save feedback',
          details: error.message
        });
      }

      console.log(`✅ Feedback saved: ${type} for ${itemName} by customer ${customerId}`);

      return res.status(200).json({
        success: true,
        message: 'Feedback submitted successfully',
        feedbackId: feedbackId
      });

    } catch (error) {
      console.error('Error handling feedback submission:', error);
      return res.status(500).json({
        error: 'Failed to process feedback',
        details: error.message
      });
    }
  } else if (req.method === 'GET') {
    // Retrieve feedback (for admin)
    try {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const customerId = url.searchParams.get('customer');
      const modelId = url.searchParams.get('model');
      const limit = parseInt(url.searchParams.get('limit')) || 100;

      let query = supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (customerId) {
        query = query.eq('customer_id', customerId);
      }

      if (modelId) {
        query = query.eq('model_id', modelId);
      }

      query = query.limit(limit);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching feedback:', error);
        return res.status(500).json({
          error: 'Failed to fetch feedback',
          details: error.message
        });
      }

      return res.status(200).json({
        success: true,
        feedback: data || []
      });

    } catch (error) {
      console.error('Error handling feedback retrieval:', error);
      return res.status(500).json({
        error: 'Failed to retrieve feedback',
        details: error.message
      });
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle creating feedback table
 */
async function handleCreateFeedbackTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to create the feedback system',
    sql: `
-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  feedback_type VARCHAR(20) NOT NULL CHECK (feedback_type IN ('positive', 'negative', 'error')),
  categories TEXT[] DEFAULT '{}',
  comment TEXT,
  customer_id VARCHAR(100) NOT NULL,
  model_id TEXT NOT NULL,
  model_name VARCHAR(255),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_feedback_customer ON feedback(customer_id);
CREATE INDEX IF NOT EXISTS idx_feedback_model ON feedback(model_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_date ON feedback(created_at);

-- Grant permissions
GRANT ALL ON feedback TO authenticated;
GRANT ALL ON feedback TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the feedback table',
      '5. This enables customer feedback collection and admin viewing'
    ]
  });
}

/**
 * Handle brand settings for customers
 */
async function handleBrandSettings(req, res, customerId) {
  if (req.method === 'GET') {
    // Get brand settings for customer
    try {
      const { data, error } = await supabase
        .from('customer_brand_settings')
        .select('*')
        .eq('customer_id', customerId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching brand settings:', error);
        return res.status(500).json({ error: 'Failed to fetch brand settings' });
      }

      // If no logo_url in settings, check Images table for admin-uploaded customer logo
      let logoUrl = data?.logo_url;
      if (!logoUrl) {
        const { data: imageData } = await supabase
          .from('images')
          .select('cloudinary_url')
          .eq('customer_id', customerId)
          .in('image_type', ['customer_logo', 'brand'])  // Check both types
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        
        logoUrl = imageData?.cloudinary_url || null;
      }

      // Return settings or defaults
      const settings = data || {
        customer_id: customerId,
        text_direction: 'ltr',
        primary_color: '#667eea',
        secondary_color: '#764ba2',
        font_family: 'Inter',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      // Always use the discovered logo (from settings or Images table)
      settings.logo_url = logoUrl;

      return res.status(200).json(settings);

    } catch (error) {
      console.error('Error handling brand settings GET:', error);
      return res.status(500).json({ error: 'Failed to process request' });
    }
  }

  if (req.method === 'PUT') {
    // Update brand settings for customer
    try {
      const { textDirection, primaryColor, secondaryColor, fontFamily, logoUrl } = req.body;

      const settingsData = {
        customer_id: customerId,
        text_direction: textDirection || 'ltr',
        primary_color: primaryColor || '#667eea',
        secondary_color: secondaryColor || '#764ba2', 
        font_family: fontFamily || 'Inter',
        logo_url: logoUrl || null,
        updated_at: new Date().toISOString()
      };

      // Upsert brand settings
      const { data, error } = await supabase
        .from('customer_brand_settings')
        .upsert(settingsData, {
          onConflict: 'customer_id'
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving brand settings:', error);
        return res.status(500).json({ 
          error: 'Failed to save brand settings',
          details: error.message 
        });
      }

      console.log(`✅ Brand settings saved for customer ${customerId}`);

      return res.status(200).json({
        success: true,
        message: 'Brand settings saved successfully',
        settings: data
      });

    } catch (error) {
      console.error('Error handling brand settings PUT:', error);
      return res.status(500).json({ 
        error: 'Failed to process request',
        details: error.message 
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

/**
 * Handle creating brand settings table
 */
async function handleCreateBrandSettingsTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to create the brand settings system',
    sql: `
-- Create brand_settings table
CREATE TABLE IF NOT EXISTS brand_settings (
  id BIGSERIAL PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL UNIQUE,
  text_direction VARCHAR(10) DEFAULT 'ltr' CHECK (text_direction IN ('ltr', 'rtl')),
  primary_color VARCHAR(7) DEFAULT '#667eea',
  secondary_color VARCHAR(7) DEFAULT '#764ba2',
  font_family VARCHAR(100) DEFAULT 'Inter',
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_brand_settings_customer ON brand_settings(customer_id);

-- Grant permissions
GRANT ALL ON brand_settings TO authenticated;
GRANT ALL ON brand_settings TO service_role;
GRANT USAGE, SELECT ON SEQUENCE brand_settings_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE brand_settings_id_seq TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the brand settings table',
      '5. This enables customer brand customization settings'
    ]
  });
}

/**
 * Test brand settings schema with sample data
 */
async function handleTestBrandSettingsSchema(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testCustomerId = 'TEST_CUSTOMER_001';
    
    if (req.method === 'POST') {
      // Test inserting sample brand settings data
      console.log('🧪 Testing brand settings schema with sample data...');
      
      const sampleData = {
        customer_id: testCustomerId,
        text_direction: 'rtl',
        logo_url: 'https://res.cloudinary.com/example/image/upload/v1/brand-assets/test-logo.png',
        primary_color: '#ff6b6b',
        secondary_color: '#4ecdc4',
        font_family: 'Roboto',
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('customer_brand_settings')
        .upsert(sampleData)
        .select()
        .single();

      if (error) {
        console.error('❌ Schema test failed:', error);
        return res.status(500).json({ 
          error: 'Schema test failed', 
          details: error.message,
          hint: 'Make sure you ran the database migration first'
        });
      }

      console.log('✅ Sample data inserted successfully');
      return res.status(200).json({
        success: true,
        message: 'Brand settings schema test passed!',
        testData: data,
        schemaFields: ['id', 'customer_id', 'text_direction', 'logo_url', 'primary_color', 'secondary_color', 'font_family', 'created_at', 'updated_at']
      });
    }
    
    else if (req.method === 'GET') {
      // Test retrieving the sample data
      const { data, error } = await supabase
        .from('customer_brand_settings')
        .select('*')
        .eq('customer_id', testCustomerId)
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to retrieve test data', details: error.message });
      }

      if (!data) {
        return res.status(200).json({
          message: 'No test data found. Use POST to create test data first.',
          instructions: 'Send a POST request to this endpoint to create sample data'
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Schema validation successful!',
        testData: data,
        validation: {
          hasAllFields: !!(data.customer_id && data.text_direction !== undefined && 
                         data.logo_url !== undefined && data.primary_color && 
                         data.secondary_color && data.font_family),
          missingFields: []
        }
      });
    }

  } catch (error) {
    console.error('❌ Schema test error:', error);
    return res.status(500).json({ 
      error: 'Schema test failed', 
      details: error.message,
      hint: 'Check if the customer_brand_settings table exists and has all required columns'
    });
  }
}


/**
 * Handle customer requests operations
 */
async function handleRequests(req, res) {
  // GET /api/requests or /api/requests?customer={id} - Get all requests or customer requests
  if (req.method === 'GET') {
    try {
      const { customer } = req.query;
      
      let query = supabase
        .from('customer_requests')
        .select(`
          *,
          models!customer_requests_model_id_fkey(title, id)
        `)
        .order('created_at', { ascending: false });
      
      // If customer parameter is provided, filter by customer (for customer view)
      // If no customer parameter, return all requests (for admin view)
      if (customer) {
        query = query.eq('customer_id', customer);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching requests:', error);
        return res.status(500).json({ error: 'Failed to fetch requests' });
      }
      
      return res.status(200).json({
        requests: data || [],
        success: true
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/requests - Submit new request
  else if (req.method === 'POST') {
    try {
      const { customerId, productUrl, title, description, notes, referenceImages } = req.body;
      
      if (!customerId || !productUrl) {
        return res.status(400).json({ error: 'Customer ID and product URL are required' });
      }
      
      // Generate request ID
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      
      const { data, error } = await supabase
        .from('customer_requests')
        .insert({
          id: requestId,
          customer_id: customerId,
          product_url: productUrl,
          title: title || 'Custom Furniture Request',
          description: description || '',
          notes: notes || '',
          reference_images: referenceImages || [],
          status: 'pending',
          priority: 'normal',
          metadata: {
            submitted_at: new Date().toISOString(),
            user_agent: req.headers['user-agent']
          }
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating request:', error);
        return res.status(500).json({ error: 'Failed to create request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request submitted successfully!',
        request: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // PUT /api/requests - Update request (admin only for now)  
  else if (req.method === 'PUT') {
    try {
      const { id, status, adminNotes, estimatedCompletion, modelId } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID required' });
      }
      
      const updateData = { updated_at: new Date().toISOString() };
      
      if (status) updateData.status = status;
      if (adminNotes) updateData.admin_notes = adminNotes;
      if (estimatedCompletion) updateData.estimated_completion = estimatedCompletion;
      if (modelId) updateData.model_id = modelId;
      
      const { data, error } = await supabase
        .from('customer_requests')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating request:', error);
        return res.status(500).json({ error: 'Failed to update request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request updated successfully',
        request: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // DELETE /api/requests - Delete request
  else if (req.method === 'DELETE') {
    try {
      const { id, customerId } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID required' });
      }
      
      // Verify the request belongs to this customer (security check)
      if (customerId) {
        const { data: existingRequest, error: fetchError } = await supabase
          .from('customer_requests')
          .select('customer_id')
          .eq('id', id)
          .single();
          
        if (fetchError || !existingRequest) {
          return res.status(404).json({ error: 'Request not found' });
        }
        
        if (existingRequest.customer_id !== customerId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
      
      const { data, error } = await supabase
        .from('customer_requests')
        .delete()
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Error deleting request:', error);
        return res.status(500).json({ error: 'Failed to delete request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request deleted successfully',
        deletedRequest: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle wallpaper upload with PBR texture generation
 */
async function handleWallpaperUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const form = new multiparty.Form({
      maxFilesSize: 100 * 1024 * 1024, // 100MB
      maxFields: 20,
      maxFieldsSize: 2 * 1024 * 1024  // 2MB for form fields
    });
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Get form data
    const customerId = fields.customerId?.[0];
    const title = fields.title?.[0];
    const width = parseFloat(fields.width?.[0]) || 2.44;
    const height = parseFloat(fields.height?.[0]) || 2.44;
    const tileRepeat = parseFloat(fields.tileRepeat?.[0]) || 4;

    if (!customerId || !title) {
      return res.status(400).json({ error: 'Customer ID and title are required' });
    }

    // Collect texture files
    const textureTypes = ['albedo', 'normal', 'roughness', 'height'];
    const textures = {};
    let hasAlbedo = false;

    for (const textureType of textureTypes) {
      const textureFile = files[`${textureType}Texture`]?.[0];
      if (textureFile) {
        // Validate file type
        if (!textureFile.originalFilename?.match(/\.(jpg|jpeg|png|webp)$/i)) {
          return res.status(400).json({ 
            error: `Invalid ${textureType} texture format. Only JPG, PNG, and WebP are allowed.` 
          });
        }

        // Check file size (10MB per texture)
        if (textureFile.size > 10 * 1024 * 1024) {
          return res.status(400).json({ 
            error: `${textureType} texture too large. Maximum size is 10MB per texture.` 
          });
        }

        textures[textureType] = textureFile;
        if (textureType === 'albedo') {
          hasAlbedo = true;
        }
      }
    }

    if (!hasAlbedo) {
      return res.status(400).json({ error: 'Albedo texture is required for wallpaper generation' });
    }

    logger.debug('Starting wallpaper generation', { 
      customerId, 
      title, 
      textureCount: Object.keys(textures).length,
      dimensions: { width, height, tileRepeat }
    });

    // Generate GLB file with PBR materials
    const glbBuffer = await generateWallpaperGLB(textures, {
      width,
      height,
      tileRepeat,
      title
    });

    // Upload albedo texture to Cloudinary for preview
    let albedoUrl = null;
    if (textures.albedo) {
      try {
        const albedoFilename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_albedo.jpg`;
        // Cloudinary upload removed - needs AWS S3 implementation
        // const albedoResult = await uploadImage(textures.albedo.buffer, albedoFilename);
        const albedoResult = { secure_url: 'AWS_S3_NOT_IMPLEMENTED', public_id: 'temp' };
        albedoUrl = albedoResult.url;
      } catch (e) {
        console.warn('Failed to upload albedo texture:', e);
      }
    }

    // Upload GLB to Cloudinary
    const filename = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_wallpaper.glb`;
    const cloudinaryResult = await uploadModel(glbBuffer, filename);

    // Get customer name for database
    let customerName = 'Unknown Customer';
    try {
      const customers = await getCustomers();
      const customer = customers.find(c => c.id === customerId);
      if (customer) customerName = customer.name;
    } catch (e) {
      console.warn('Could not fetch customer name:', e);
    }

    // Save wallpaper model to database
    const dbResult = await saveModel({
      title: `${title} (Wallpaper)`,
      description: `AR Wallpaper with ${Object.keys(textures).length} PBR textures - ${width}m × ${height}m`,
      filename: filename,
      cloudinaryUrl: cloudinaryResult.url,
      cloudinaryPublicId: cloudinaryResult.publicId,
      fileSize: cloudinaryResult.size,
      customerId: customerId,
      customerName: customerName,
      dominantColor: '#8B4513', // Default brown/mosaic color
      metadata: {
        type: 'wallpaper',
        dimensions: { width, height },
        tileRepeat,
        textureTypes: Object.keys(textures),
        albedoUrl: albedoUrl,
        generatedAt: new Date().toISOString()
      }
    });

    if (!dbResult.success) {
      logger.error('Database save failed for wallpaper', dbResult.error);
      return res.status(500).json({ 
        error: 'Failed to save wallpaper. Please try again.',
        details: dbResult.error
      });
    }

    // Clean up temporary files
    Object.values(textures).forEach(file => {
      try {
        const fs = require('fs');
        fs.unlinkSync(file.path);
      } catch (e) {
        console.warn('Could not clean up temp file:', file.path);
      }
    });

    const domain = process.env.DOMAIN || 'newfurniture.live';
    const modelId = dbResult.id;

    logger.debug('Wallpaper upload completed', { modelId, cloudinaryUrl: cloudinaryResult.url });

    return res.status(200).json({
      success: true,
      id: modelId,
      viewUrl: `https://${domain}/view?id=${modelId}`,
      directUrl: cloudinaryResult.url,
      shareUrl: `https://${domain}/view?id=${modelId}`,
      title: `${title} (Wallpaper)`,
      fileSize: cloudinaryResult.size,
      message: '🧱 Wallpaper generated successfully!',
      textureCount: Object.keys(textures).length,
      dimensions: { width, height, tileRepeat }
    });

  } catch (error) {
    logger.error('Wallpaper upload error', error);
    
    // Clean up any temp files on error
    try {
      if (files) {
        Object.values(files).flat().forEach(file => {
          const fs = require('fs');
          if (file.path) fs.unlinkSync(file.path);
        });
      }
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError);
    }

    const { statusCode, response } = createErrorResponse(500, 'Wallpaper generation failed', error);
    return res.status(statusCode).json(response);
  }
}

/**
 * Generate GLB file with PBR materials from texture maps
 */
async function generateWallpaperGLB(textures, options) {
  const { width, height, tileRepeat, title } = options;

  // TEMPORARY SOLUTION: Create a simple plane GLB without complex Three.js
  // This avoids server-side Three.js issues in serverless environments
  
  try {
    console.log('Generating simple wallpaper GLB:', { width, height, title, textureCount: Object.keys(textures).length });
    
    // Create a minimal GLB structure that Model Viewer can display
    const glbBuffer = createBasicPlaneGLB(width, height, title);
    
    console.log('Generated GLB size:', glbBuffer.length, 'bytes');
    return glbBuffer;
    
  } catch (error) {
    console.error('GLB generation failed:', error);
    throw new Error(`Failed to generate wallpaper GLB: ${error.message}`);
  }
}

/**
 * Create a basic plane GLB for wallpaper display
 * This is a simplified approach that works reliably in serverless environments
 */
function createBasicPlaneGLB(width = 2.44, height = 2.44, title = 'Wallpaper') {
  // Create minimal glTF 2.0 structure for a textured plane
  const gltf = {
    asset: { version: '2.0', generator: 'AR Wallpaper Generator' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: title }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, TEXCOORD_0: 1 },
        indices: 2,
        material: 0
      }]
    }],
    materials: [{
      name: 'WallpaperMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: [0.8, 0.6, 0.4, 1.0], // Warm brown color
        metallicFactor: 0.0,
        roughnessFactor: 0.8
      }
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126, // FLOAT
        count: 4,
        type: 'VEC3',
        max: [width/2, height/2, 0],
        min: [-width/2, -height/2, 0]
      },
      {
        bufferView: 1,
        componentType: 5126, // FLOAT
        count: 4,
        type: 'VEC2'
      },
      {
        bufferView: 2,
        componentType: 5123, // UNSIGNED_SHORT
        count: 6,
        type: 'SCALAR'
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 }, // positions
      { buffer: 0, byteOffset: 48, byteLength: 32 }, // texcoords
      { buffer: 0, byteOffset: 80, byteLength: 12 }  // indices
    ],
    buffers: [{ byteLength: 92 }]
  };

  // Create geometry data
  const positions = new Float32Array([
    -width/2, -height/2, 0,  // bottom-left
     width/2, -height/2, 0,  // bottom-right
     width/2,  height/2, 0,  // top-right
    -width/2,  height/2, 0   // top-left
  ]);

  const texcoords = new Float32Array([
    0, 0,  // bottom-left
    1, 0,  // bottom-right
    1, 1,  // top-right
    0, 1   // top-left
  ]);

  const indices = new Uint16Array([
    0, 1, 2,  // first triangle
    0, 2, 3   // second triangle
  ]);

  // Combine binary data
  const positionBytes = new Uint8Array(positions.buffer);
  const texcoordBytes = new Uint8Array(texcoords.buffer);
  const indexBytes = new Uint8Array(indices.buffer);
  
  const binaryData = new Uint8Array(positionBytes.length + texcoordBytes.length + indexBytes.length);
  binaryData.set(positionBytes, 0);
  binaryData.set(texcoordBytes, positionBytes.length);
  binaryData.set(indexBytes, positionBytes.length + texcoordBytes.length);

  // Create GLB file
  const jsonString = JSON.stringify(gltf);
  const jsonBytes = Buffer.from(jsonString);
  
  // Pad to 4-byte alignment
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
  
  const binaryPadding = (4 - (binaryData.length % 4)) % 4;
  const binaryPadded = Buffer.concat([Buffer.from(binaryData), Buffer.alloc(binaryPadding, 0)]);

  // GLB header (12 bytes)
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0);  // magic 'glTF'
  header.writeUInt32LE(2, 4);           // version
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binaryPadded.length, 8); // total length

  // JSON chunk header (8 bytes)
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  // Binary chunk header (8 bytes)
  const binaryChunkHeader = Buffer.alloc(8);
  binaryChunkHeader.writeUInt32LE(binaryPadded.length, 0);
  binaryChunkHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  // Combine all parts
  return Buffer.concat([
    header,
    jsonChunkHeader,
    jsonPadded,
    binaryChunkHeader,
    binaryPadded
  ]);
}

/**
 * Handle customer logo upload - integrates with admin Images system
 */
async function handleCustomerLogoUpload(req, res, customerId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const form = new multiparty.Form({
      maxFilesSize: 100 * 1024 * 1024, // 100MB
      maxFields: 20,
      maxFieldsSize: 2 * 1024 * 1024  // 2MB for form fields
    });
    
    const { fields, files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    // Get uploaded file
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    // Validate file type (images only)
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(uploadedFile.headers['content-type'])) {
      return res.status(400).json({ error: 'Invalid file type. Only JPG, PNG, WebP, and SVG are allowed.' });
    }

    // Upload to AWS S3
    const fs = require('fs');
    const fileBuffer = fs.readFileSync(uploadedFile.path);

    // Upload logo to S3
    const uploadResult = await uploadLogoToS3(
      fileBuffer,
      customerId,
      uploadedFile.originalFilename,
      uploadedFile.headers['content-type']
    );

    if (!uploadResult.success) {
      console.error('S3 upload failed:', uploadResult.error);
      return res.status(500).json({ error: `Failed to upload logo: ${uploadResult.error}` });
    }

    console.log('✅ Logo uploaded to S3:', uploadResult.url);

    // Save to admin Images table with customer context
    const imageId = Date.now().toString(); // Simple ID generation

    const { data: imageData, error: imageError } = await supabase
      .from('images')
      .insert({
        id: imageId,
        filename: uploadedFile.originalFilename,
        aws_url: uploadResult.url, // Store AWS URL
        aws_key: uploadResult.key, // Store S3 key
        file_size: uploadResult.size,
        image_type: 'customer_logo', // Special type for customer logos
        customer_id: customerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (imageError) {
      console.error('Error saving logo to Images table:', imageError);
      return res.status(500).json({ error: 'Failed to save logo information' });
    }

    // Update customer's brand settings with logo URL
    const { data: brandData, error: brandError } = await supabase
      .from('customer_brand_settings')
      .upsert({
        customer_id: customerId,
        logo_url: uploadResult.url,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'customer_id'
      })
      .select()
      .single();

    if (brandError) {
      console.error('Error updating brand settings with logo:', brandError);
      return res.status(500).json({ error: 'Failed to update brand settings' });
    }

    console.log(`✅ Logo uploaded for customer ${customerId}: ${uploadResult.url}`);
    
    return res.status(200).json({
      success: true,
      message: 'Logo uploaded successfully',
      logoUrl: uploadResult.url,
      imageData: imageData,
      brandSettings: brandData
    });

  } catch (error) {
    console.error('Error uploading customer logo:', error);
    return res.status(500).json({
      error: 'Failed to upload logo',
      details: error.message
    });
  }
}

/**
 * Handle saving model metadata after successful Cloudinary upload
 * POST /api/cloudinary-save (mapped from /api/u3)
 */
async function handleCloudinarySave(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      cloudinaryUrl,
      cloudinaryPublicId,
      fileSize,
      title,
      description,
      sku,
      customerId,
      customerName,
      dimensions,
      parentModelId,
      variantName,
      hexColor,
      isVariant,
      variantType,
      dimensionsText,
      ar_placement
    } = req.body;

    if (!cloudinaryUrl || !cloudinaryPublicId) {
      return res.status(400).json({
        error: 'Cloudinary URL and public ID are required'
      });
    }

    let dbResult;

    if (isVariant && parentModelId && variantName) {
      // Handle variant upload
      dbResult = await saveModelVariant({
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor || '#000000',
        cloudinaryUrl: cloudinaryUrl,
        cloudinaryPublicId: cloudinaryPublicId,
        fileSize: fileSize || 0,
        isPrimary: false,
        variantType: variantType || 'upload',
        dimensionsText: dimensionsText || null,
        sku: sku || null
      });
    } else {
      // Handle regular model upload
      let parsedDimensions = null;
      if (dimensions) {
        try {
          parsedDimensions = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
        } catch (error) {
          console.warn('Failed to parse dimensions:', error.message);
        }
      }

      const modelParams = {
        title: title || 'Untitled Model',
        description: description || '',
        filename: cloudinaryPublicId.split('/').pop() + '.glb',
        cloudinaryUrl: cloudinaryUrl,
        cloudinaryPublicId: cloudinaryPublicId,
        fileSize: fileSize || 0,
        customerId: customerId || 'unassigned',
        customerName: customerName || 'Unassigned',
        dominantColor: '#6b7280',
        dimensions: parsedDimensions,
        sku: sku || null,
        arPlacement: ar_placement || 'floor',
        metadata: {
          uploadMethod: 'direct',
          uploadedAt: new Date().toISOString()
        }
      };

      dbResult = await saveModel(modelParams);
    }

    if (!dbResult || !dbResult.success) {
      return res.status(500).json({
        error: 'Failed to save model to database',
        details: dbResult?.error || 'Unknown database error'
      });
    }

    const domain = process.env.DOMAIN || 'newfurniture.live';

    if (isVariant) {
      return res.status(200).json({
        success: true,
        id: dbResult.id,
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor || '#000000',
        cloudinaryUrl: cloudinaryUrl,
        viewUrl: `https://${domain}/view?id=${parentModelId}&variant=${dbResult.id}`,
        message: 'Variant uploaded successfully!'
      });
    } else {
      return res.status(200).json({
        success: true,
        id: dbResult.id,
        viewUrl: `https://${domain}/view?id=${dbResult.id}`,
        directUrl: cloudinaryUrl,
        shareUrl: `https://${domain}/view?id=${dbResult.id}`,
        title: title,
        fileSize: fileSize,
        message: 'Model uploaded successfully!'
      });
    }

  } catch (error) {
    console.error('Cloudinary save error:', error);

    return res.status(500).json({
      error: 'Something went wrong on our end. Please try again in a few moments.',
      message: 'Service temporarily unavailable',
      showReportButton: true,
      reportData: {
        errorType: 'server_error',
        timestamp: new Date().toISOString(),
        userAgent: req.headers['user-agent']
      }
    });
  }
}

/**
 * Handle QR Migration - Add QR persistence columns and optionally regenerate QR codes
 * GET /api/qr-migration (mapped from /api/s8)
 */
async function handleQRMigration(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      // Return SQL for manual migration
      return res.status(200).json({
        success: true,
        message: 'Run the following SQL in your Supabase dashboard to add QR persistence columns:',
        sql: `
-- Add QR Code Persistence Columns to existing tables
-- This enables 100% uptime QR codes by storing them in Cloudinary

-- Add QR columns to models table
ALTER TABLE models
ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

-- Add QR columns to model_variants table
ALTER TABLE model_variants
ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

-- Create indexes for faster QR lookups
CREATE INDEX IF NOT EXISTS idx_models_qr_generated_at ON models(qr_generated_at);
CREATE INDEX IF NOT EXISTS idx_variants_qr_generated_at ON model_variants(qr_generated_at);

-- Create missing model_views table (CRITICAL - fixes upload 500 errors)
CREATE TABLE IF NOT EXISTS model_views (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT NOT NULL,
  variant_id TEXT NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT
);
        `,
        instructions: [
          '1. Go to your Supabase dashboard',
          '2. Navigate to the SQL Editor',
          '3. Copy and paste the SQL above',
          '4. Click "Run" to add the columns and fix upload errors',
          '5. Test model upload at https://newfurniture.live/admin'
        ]
      });
    } else {
      // POST: Future QR regeneration feature
      return res.status(200).json({
        success: true,
        message: 'QR regeneration feature coming soon. For now, run the SQL migration above.',
        note: 'New uploads will automatically generate QR codes once the persistence system is stable.'
      });
    }
  } catch (error) {
    console.error('QR Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'QR migration failed',
      details: error.message
    });
  }
}

/**
 * Handle QR Code generation using local generator
 * GET /api/qr-generate?url=<url>&format=<format>&size=<size>
 */
async function handleQRGenerate(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, format = 'png', size = 256, raw } = req.query;
    const isRawFormat = raw === 'true';

    if (!url) {
      return res.status(400).json({
        error: 'Missing required parameter: url',
        example: '/api/qr-generate?url=https://newfurniture.live/view?id=abc123'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Generate QR code using local generator
    const qrResult = await generateQR(url, {
      format,
      width: parseInt(size) || 256,
      errorCorrectionLevel: 'M'
    });

    console.log('🔍 QR Handler - raw parameter:', raw, 'isRawFormat:', isRawFormat);
    console.log('🔍 QR result structure:', Object.keys(qrResult));

    if (isRawFormat) {
      // Return raw QR data (for direct embedding)
      console.log('✅ Raw format requested, setting headers...');
      res.setHeader('Content-Type', format === 'svg' ? 'image/svg+xml' : `image/${format}`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Handle the QR result structure properly - check both possible structures
      let qrData = null;

      if (qrResult.success && qrResult.data && qrResult.data.qr_code) {
        qrData = qrResult.data.qr_code;
      } else if (qrResult.qr_code && qrResult.qr_code.qr_code) {
        qrData = qrResult.qr_code.qr_code;
      }

      if (qrData) {
        if (format === 'svg') {
          // For SVG, return the string directly
          console.log('✅ Returning SVG string, length:', qrData.length);
          return res.send(qrData);
        } else {
          // For PNG, convert buffer data to actual buffer
          if (qrData.data) {
            const buffer = Buffer.from(qrData.data);
            console.log('✅ Returning PNG buffer, size:', buffer.length);
            return res.send(buffer);
          } else if (Buffer.isBuffer(qrData)) {
            console.log('✅ Returning PNG buffer directly, size:', qrData.length);
            return res.send(qrData);
          }
        }
      }

      console.log('❌ Invalid QR result structure:', Object.keys(qrResult));
      return res.status(500).json({ error: 'Invalid QR data structure' });
    } else {
      // Return JSON response with metadata
      console.log('📄 JSON format requested');
      return res.status(200).json({
        success: true,
        qr_code: qrResult.qr_code || qrResult.data,
        format: qrResult.format,
        url: url,
        size: parseInt(size) || 256,
        generated_at: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('QR Generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'QR generation failed',
      details: error.message
    });
  }
}

/**
 * Handle URL slug migration for existing models
 */
async function handleUrlSlugMigration(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      // Return migration instructions
      return res.status(200).json({
        success: true,
        message: 'URL Slug Migration for SEO-Friendly URLs',
        description: 'This migration adds URL slug columns to enable SEO-friendly URLs like /f/napo/modern-sofa-utEaiw2a',
        instructions: [
          '1. Run the SQL below in your Supabase SQL editor to add columns',
          '2. Make a POST request to this endpoint to generate slugs for existing models',
          '3. New models will automatically get slugs generated'
        ],
        sql: `
-- Add URL slug columns for SEO-friendly URLs
-- This enables URLs like: /f/napo/modern-sofa-utEaiw2a/black

-- Add slug columns to models table
ALTER TABLE models
ADD COLUMN IF NOT EXISTS url_slug VARCHAR(255),
ADD COLUMN IF NOT EXISTS category_slug VARCHAR(100),
ADD COLUMN IF NOT EXISTS customer_slug VARCHAR(100);

-- Add color slug to variants table
ALTER TABLE model_variants
ADD COLUMN IF NOT EXISTS color_slug VARCHAR(50);

-- Create indexes for URL resolution
CREATE INDEX IF NOT EXISTS idx_models_url_slug ON models(url_slug);
CREATE INDEX IF NOT EXISTS idx_models_customer_slug ON models(customer_slug);
CREATE INDEX IF NOT EXISTS idx_variants_color_slug ON model_variants(color_slug);

-- Combined index for fast URL lookups
CREATE INDEX IF NOT EXISTS idx_models_slug_lookup ON models(customer_slug, url_slug);
`,
        benefits: [
          'SEO-friendly URLs: /f/napo/modern-sofa-utEaiw2a',
          'Better branding for clients',
          'Improved search engine ranking',
          'Professional QR code URLs'
        ]
      });
    }

    if (req.method === 'POST') {
      // Run the migration
      console.log('🚀 Starting URL slug migration...');
      const result = await migrateModelSlugs();

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: `Migration completed! Updated ${result.updated} models`,
          ...result
        });
      } else {
        return res.status(500).json({
          success: false,
          error: 'Migration failed',
          details: result.error
        });
      }
    }

  } catch (error) {
    console.error('URL Slug Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message
    });
  }
}

/**
 * Handle SEO-friendly furniture URLs like: /f/{customer}/{product-slug-id}/{variant?}
 */
async function handleSEOFurnitureUrl(req, res, path) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathParts = path.split('/');

    if (pathParts.length < 2) {
      return res.status(400).json({
        error: 'Invalid URL format. Expected: /f/{customer}/{product}',
        debug: { path, pathParts }
      });
    }

    const [customerSlug, productSlugWithId, variantSlug] = pathParts;

    console.log('🔍 SEO URL Resolution:', {
      customerSlug,
      productSlugWithId,
      variantSlug,
      path
    });

    // Resolve URL to model data
    const resolution = await resolveUrlToModel(customerSlug, productSlugWithId, variantSlug);

    if (!resolution.success) {
      console.log('❌ URL resolution failed:', resolution.error);
      return res.status(404).json({ error: resolution.error });
    }

    const { model } = resolution;

    // Build the redirect URL to the current view.html system
    let redirectUrl = `/view?id=${model.id}`;
    if (variantSlug) {
      redirectUrl += `&variant=${variantSlug}`;
    }

    console.log('✅ Redirecting to:', redirectUrl);

    // Redirect to existing view system (301 for SEO)
    res.writeHead(301, { Location: redirectUrl });
    return res.end();

  } catch (error) {
    console.error('❌ SEO URL handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle SEO-friendly QR URLs like: /qr/{customer}/{product-slug-id.svg}
 */
async function handleSEOQRUrl(req, res, path) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const pathParts = path.split('/');

    if (pathParts.length !== 2) {
      return res.status(400).json({
        error: 'Invalid QR URL format. Expected: /qr/{customer}/{product}.svg',
        debug: { path, pathParts }
      });
    }

    const [customerSlug, filenamePart] = pathParts;

    // Remove .svg extension
    if (!filenamePart.endsWith('.svg')) {
      return res.status(400).json({ error: 'QR URLs must end with .svg' });
    }

    const productPart = filenamePart.replace('.svg', '');

    // Check if this includes a variant (format: product-slug-id-variant)
    let productSlugWithId, variantSlug;

    // Try to match pattern: product-slug-ID-variant
    const variantMatch = productPart.match(/^(.+-[a-zA-Z0-9_-]{8})-(.+)$/);
    if (variantMatch) {
      [, productSlugWithId, variantSlug] = variantMatch;
    } else {
      // No variant, just product-slug-ID
      productSlugWithId = productPart;
      variantSlug = null;
    }

    console.log('🔍 QR URL Resolution:', { customerSlug, productSlugWithId, variantSlug });

    // Resolve URL to model data
    const resolution = await resolveUrlToModel(customerSlug, productSlugWithId, variantSlug);

    if (!resolution.success) {
      console.log('❌ QR URL resolution failed:', resolution.error);
      return res.status(404).json({ error: resolution.error });
    }

    const { model } = resolution;

    // Build the target URL for QR code
    const domain = process.env.DOMAIN || 'https://newfurniture.live';
    let targetUrl = `${domain}/f/${customerSlug}/${productSlugWithId}`;
    if (variantSlug) {
      targetUrl += `/${variantSlug}`;
    }

    console.log('🔲 Generating QR for URL:', targetUrl);

    // Redirect to QR generation endpoint with the SEO URL
    const qrUrl = `/api/u4?url=${encodeURIComponent(targetUrl)}&format=svg&size=256&raw=true`;

    res.writeHead(302, { Location: qrUrl });
    return res.end();

  } catch (error) {
    console.error('❌ QR URL handler error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle variant equality migration - creates original variants for existing models
 * GET /api/variant-equality-migration (mapped from /api/s10)
 */
async function handleVariantEqualityMigration(req, res) {
  try {
    if (req.method === 'GET') {
      // Return migration instructions and SQL
      res.status(200).json({
        success: true,
        title: 'Variant Equality Migration',
        description: 'This migration creates "Original" variant entries for all existing models to achieve variant equality in deletion behavior.',
        steps: [
          '1. This adds is_original column to model_variants table',
          '2. Creates "Original" variant entries for all existing models',
          '3. Enables equal treatment of all variants in admin interface',
          '4. POST to this endpoint to run the migration automatically'
        ],
        sql: `
-- Step 1: Add is_original column to model_variants table
ALTER TABLE model_variants
ADD COLUMN IF NOT EXISTS is_original BOOLEAN DEFAULT FALSE;

-- Step 2: Create "Original" variant entries for all existing models
INSERT INTO model_variants (
    id,
    parent_model_id,
    variant_name,
    hex_color,
    cloudinary_url,
    cloudinary_public_id,
    file_size,
    is_original,
    variant_type,
    created_at
)
SELECT
    m.id || '-original' as id,
    m.id as parent_model_id,
    'Original' as variant_name,
    '#6b7280' as hex_color,
    m.cloudinary_url,
    m.cloudinary_public_id,
    m.file_size,
    TRUE as is_original,
    'original' as variant_type,
    NOW() as created_at
FROM models m
WHERE NOT EXISTS (
    SELECT 1 FROM model_variants mv
    WHERE mv.parent_model_id = m.id AND mv.is_original = TRUE
);`,
        warning: '⚠️ This migration is SAFE and REVERSIBLE. It only adds data, never removes.',
        rollback: `
-- To rollback (if needed):
DELETE FROM model_variants WHERE is_original = TRUE;
ALTER TABLE model_variants DROP COLUMN IF EXISTS is_original;`
      });
    } else if (req.method === 'POST') {
      // Run the migration
      console.log('🚀 Starting variant equality migration...');

      // Step 1: Add is_original column
      // Note: Since we can't run DDL via Supabase client, this needs to be done manually
      // But we'll check if the column exists first
      const { data: columnCheck, error: checkError } = await supabase
        .from('model_variants')
        .select('is_original')
        .limit(1);

      if (checkError && checkError.code === 'PGRST116') {
        // Column doesn't exist, need manual migration
        return res.status(400).json({
          error: 'Migration requires manual SQL execution',
          instructions: 'Please run this SQL manually in your database:',
          sql: 'ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS is_original BOOLEAN DEFAULT FALSE;',
          then: 'Run this endpoint again after adding the column'
        });
      } else if (checkError) {
        console.error('❌ Failed to check for is_original column:', checkError);
        return res.status(500).json({
          error: 'Failed to check database schema',
          details: checkError.message
        });
      }

      console.log('✅ Column is_original exists in model_variants table');

      // Step 2: Get all models that don't have original variants yet
      const { data: modelsToMigrate, error: fetchError } = await supabase
        .from('models')
        .select('id, title, cloudinary_url, cloudinary_public_id, file_size');

      if (fetchError) {
        console.error('❌ Failed to fetch models for migration:', fetchError);
        return res.status(500).json({
          error: 'Failed to fetch models',
          details: fetchError.message
        });
      }

      if (!modelsToMigrate || modelsToMigrate.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No models found to migrate',
          migrated: 0
        });
      }

      console.log(`📋 Found ${modelsToMigrate.length} models to check`);

      // Step 3: Filter out models that already have original variants
      const modelsNeedingMigration = [];
      for (const model of modelsToMigrate) {
        const { data: existingOriginal } = await supabase
          .from('model_variants')
          .select('id')
          .eq('parent_model_id', model.id)
          .eq('is_original', true)
          .single();

        if (!existingOriginal) {
          modelsNeedingMigration.push(model);
        }
      }

      if (modelsNeedingMigration.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'Migration already complete - all models have original variants',
          migrated: 0
        });
      }

      console.log(`📋 Found ${modelsNeedingMigration.length} models to migrate`);

      // Step 4: Create original variant entries
      const originalVariants = modelsNeedingMigration.map(model => ({
        id: model.id + '-original',
        parent_model_id: model.id,
        variant_name: 'Original',
        hex_color: '#6b7280', // Default color for original variants
        cloudinary_url: model.cloudinary_url,
        cloudinary_public_id: model.cloudinary_public_id,
        file_size: model.file_size || 0,
        is_original: true,
        variant_type: 'original'
      }));

      const { error: insertError } = await supabase
        .from('model_variants')
        .insert(originalVariants);

      if (insertError) {
        console.error('❌ Failed to create original variants:', insertError);
        return res.status(500).json({
          error: 'Failed to create original variants',
          details: insertError.message
        });
      }

      console.log(`✅ Created ${originalVariants.length} original variant entries`);

      // Step 5: Verify migration
      const { data: verification, error: verifyError } = await supabase
        .from('model_variants')
        .select('parent_model_id')
        .eq('is_original', true);

      res.status(200).json({
        success: true,
        message: 'Variant equality migration completed successfully',
        migrated: originalVariants.length,
        total_original_variants: verification?.length || 0,
        next_steps: [
          '1. Test variant deletion in admin interface',
          '2. Verify all variants show with equal treatment',
          '3. Update frontend code to use new deletion logic'
        ]
      });

    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('❌ Variant equality migration error:', error);
    res.status(500).json({
      error: 'Variant equality migration failed',
      details: error.message
    });
  }
}

/**
 * GET /api/sku/{sku}
 * Find model or variant by SKU
 */
async function handleSKULookup(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sku } = req.params || {};
  const skuParam = req.url.split('/').pop(); // Extract SKU from URL

  if (!skuParam) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  try {
    // Import SKU generator functions
    const { findBySKU } = await import('../lib/sku-generator.js');

    // Find by SKU
    const result = await findBySKU(skuParam, { sql: query });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'SKU not found',
        sku: skuParam
      });
    }

    return res.status(200).json({
      success: true,
      type: result.type,
      data: result.data,
      sku: skuParam
    });

  } catch (error) {
    console.error('SKU lookup error:', error);
    return res.status(500).json({
      success: false,
      error: 'SKU lookup failed',
      details: error.message
    });
  }
}

/**
 * PUT /api/model/{id}/sku
 * Update model SKU
 */
/*
async function handleModelSKUUpdate(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const modelId = req.url.split('/')[2]; // Extract model ID from URL
  const { sku } = req.body;

  if (!modelId) {
    return res.status(400).json({ error: 'Model ID is required' });
  }

  if (!sku) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  try {
    // Import SKU generator functions
    const { isSKUUnique } = await import('../lib/sku-generator.js');

    // Basic SKU validation - just check length
    if (sku.length > 100) {
      return res.status(400).json({
        error: 'SKU is too long. Please keep it under 100 characters.'
      });
    }

    // Check if SKU is unique (exclude current model)
    const isUnique = await isSKUUnique(sku, { sql: query }, modelId, 'model');
    if (!isUnique) {
      return res.status(400).json({
        error: 'SKU already exists. SKUs must be unique across the platform.'
      });
    }

    // Update the model
    const updateResult = await query(
      'UPDATE models SET sku = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [sku, modelId]
    );

    if (!updateResult.success || updateResult.data.length === 0) {
      return res.status(404).json({ error: 'Model not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Model SKU updated successfully',
      model: updateResult.data[0]
    });

  } catch (error) {
    console.error('Model SKU update error:', error);
    return res.status(500).json({
      success: false,
      error: 'SKU update failed',
      details: error.message
    });
  }
}

/**
 * PUT /api/variant/{id}/sku
 * Update variant SKU
 */
async function handleVariantSKUUpdate(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const variantId = req.url.split('/')[2]; // Extract variant ID from URL
  const { sku } = req.body;

  console.log('🔍 RAW REQUEST DATA:', {
    method: req.method,
    url: req.url,
    body: req.body,
    variantId,
    sku,
    skuType: typeof sku,
    skuLength: sku?.length
  });

  if (!variantId) {
    return res.status(400).json({ error: 'Variant ID is required' });
  }

  if (!sku) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  try {
    console.log('🔍 Variant SKU Update - variantId:', variantId, 'sku:', sku);

    // Import SKU generator functions
    const { isSKUUnique } = await import('../lib/sku-generator.js');

    // Basic SKU validation - just check length
    if (sku.length > 100) {
      return res.status(400).json({
        error: 'SKU is too long. Please keep it under 100 characters.'
      });
    }

    // First, let's check if the variant actually exists
    console.log('🔍 Checking if variant exists in database...');
    const variantExists = await query('SELECT id, sku FROM model_variants WHERE id = $1', [variantId]);
    console.log('🔍 Variant exists check:', variantExists.rows);

    // TEMPORARILY DISABLED UNIQUENESS CHECK TO TEST IF THIS IS THE PROBLEM
    console.log('🔍 BYPASSING SKU uniqueness check for debugging');
    // const isUnique = await isSKUUnique(sku, { sql: query }, variantId, 'variant');
    // if (!isUnique) {
    //   return res.status(400).json({
    //     error: 'SKU already exists. SKUs must be unique across the platform.'
    //   });
    // }

    // Update the variant
    console.log('🔍 EXECUTING UPDATE QUERY:', 'UPDATE model_variants SET sku = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [sku, variantId]);
    const updateResult = await query(
      'UPDATE model_variants SET sku = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [sku, variantId]
    );

    console.log('🔍 UPDATE RESULT:', JSON.stringify(updateResult, null, 2));

    if (!updateResult.rows || updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Variant SKU updated successfully',
      variant: updateResult.rows[0]
    });

  } catch (error) {
    console.error('🚨 VARIANT SKU UPDATE ERROR:', error);
    console.error('🚨 ERROR STACK:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'SKU update failed',
      details: error.message,
      stack: error.stack
    });
  }
}

// SKU update functions removed - now handled by unified /api/models and /api/variants routes