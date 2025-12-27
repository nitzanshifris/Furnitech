import { uploadImage } from '../lib/cloudinary.js';
const { uploadModelToS3, generateModelUrl, getS3Config } = require('../lib/aws-s3-simple.js');
import { saveModel, getModel, getAllModels, getModelsWithVariants, getModelsByCustomer, getModelsByCustomerWithVariants, getCustomers, getStats, deleteModel, incrementViewCount, updateModelCustomer, saveModelVariant, supabase, query } from '../lib/supabase.js';
import { deleteModel as deleteFromCloudinary } from '../lib/cloudinary.js';
import { getInternalEndpoint } from '../lib/endpoints.js';
import { generateQR, generateBatchQR, QRGeneratorError, getSupportedFormats, getOptimalSettings } from '../lib/qr-generator.js';
import multiparty from 'multiparty';
import bcrypt from 'bcryptjs';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

/**
 * Single catch-all API handler for all routes
 * Handles: upload, models, model/[id], model/[id]/info, model/[id]/view, upload-variant
 */
export default async function handler(req, res) {
  console.log('=== FUNCTION ENTRY v2.0 ===', new Date().toISOString());
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('User-Agent:', req.headers['user-agent']);
  
  // Log all requests that include 'users' for debugging
  if (req.url?.includes('users')) {
    console.log('🔍 USERS REQUEST DETECTED:', {
      url: req.url,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }
  
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Password');
  
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
    
    // Debug logging
    console.log('Route debug:', { 
      url: req.url, 
      pathname: url.pathname, 
      pathParts,
      externalRoutePath,
      routePath, 
      method: req.method 
    });
    
    // Additional debug for users routes specifically
    if (routePath?.includes('users')) {
      console.log('USERS ROUTE DEBUG:', { routePath, startsWithUsers: routePath?.startsWith('users/'), equalsUsers: routePath === 'users' });
    }
    
    // Additional debug for model routes
    if (routePath?.startsWith('model/')) {
      const routeParts = routePath.split('/');
      console.log('Model route debug:', {
        routePath,
        routeParts,
        modelId: routeParts[1],
        action: routeParts[2],
        partsLength: routeParts.length
      });
    }
    
    // Route: /api/init-db - Initialize database tables
    if (routePath === 'init-db') {
      return await handleInitDb(req, res);
    }

    // Route: /api/test-db-connection - Test database connectivity
    if (routePath === 'test-db-connection') {
      return await handleTestDbConnection(req, res);
    }

    // Route: /api/qr-migration - Add QR persistence columns and migrate existing models
    if (routePath === 'qr-migration') {
      return await handleQRMigration(req, res);
    }

    // Route: /api/sku-migration - Add SKU columns and generate SKUs for existing models
    if (routePath === 'sku-migration') {
      return await handleSKUMigration(req, res);
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

    // Route: /api/models
    if (routePath === 'models') {
      return await handleModels(req, res);
    }
    
    // Route: /api/customers
    if (routePath === 'customers') {
      return await handleCustomers(req, res);
    }
    
    // Route: /api/cleanup-variants
    if (routePath === 'cleanup-variants') {
      return await handleCleanupVariants(req, res);
    }
    
    // Route: /api/update-color
    if (routePath === 'update-color') {
      return await handleUpdateColor(req, res);
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
    
    // Route: /api/create-requests-table
    if (routePath === 'create-requests-table') {
      return await handleCreateRequestsTable(req, res);
    }
    
    // Route: /api/create-brand-settings-table
    if (routePath === 'create-brand-settings-table') {
      return await handleCreateBrandSettingsTable(req, res);
    }
    
    // Route: /api/create-variants-table
    if (routePath === 'create-variants-table') {
      return await handleCreateVariantsTable(req, res);
    }
    
    // Route: /api/requests - Customer furniture requests
    if (routePath === 'requests') {
      return await handleRequests(req, res);
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
    
    // Route: /api/create-user
    if (routePath === 'create-user') {
      return await handleCreateUser(req, res);
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

    // Route: /api/qr-generate - Single QR code generation
    if (routePath === 'qr-generate') {
      return await handleQRGenerate(req, res);
    }

    // Route: /api/qr-batch - Batch QR code generation
    if (routePath === 'qr-batch') {
      return await handleQRBatch(req, res);
    }

    // Route: /api/qr-formats - Get supported QR formats
    if (routePath === 'qr-formats') {
      return await handleQRFormats(req, res);
    }

    // Route: /api/customers/[id]/brand-settings
    if (routePath?.match(/^customers\/[^\/]+\/brand-settings$/)) {
      const customerId = routePath.split('/')[1];
      return await handleCustomerBrandSettings(req, res, customerId);
    }

    // Route: /api/customer/[id]
    if (routePath?.startsWith('customer/')) {
      const routeParts = routePath.split('/');
      const customerId = routeParts[1];

      if (routeParts.length === 2) {
        // /api/customer/[id] - Get customer models
        return await handleCustomerModels(req, res, customerId);
    }
    
    // Route: /api/model/[id]
    if (routePath?.startsWith('model/')) {
      const routeParts = routePath.split('/');
      const modelId = routeParts[1];
      
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
      } else if (routeParts.length === 3 && routeParts[2] === 'sku') {
        // /api/model/[id]/sku
        return await handleModelSKUUpdate(req, res, modelId);
      } else if (routeParts.length === 3 && routeParts[2] === 'category') {
        // /api/model/[id]/category
        console.log('🎯 CATEGORY ROUTE MATCHED in catch-all!');
        return await handleModelCategoryUpdate(req, res, modelId);
      }
    }

    // Route: /api/sku/{sku} - Find model or variant by SKU
    if (routePath?.startsWith('sku/')) {
      const sku = routePath.split('/')[1];
      return await handleSKULookup(req, res, sku);
    }

    // Route: /api/variant/{id}/sku - Update variant SKU
    if (routePath?.startsWith('variant/') && routePath.endsWith('/sku')) {
      console.log('🎨 Variant SKU route matched:', { routePath });
      const routeParts = routePath.split('/');
      console.log('🎨 Route parts:', routeParts, 'Length:', routeParts.length);
      if (routeParts.length === 3) {
        const variantId = routeParts[1];
        console.log('🎨 Calling handleVariantSKUUpdate with ID:', variantId);
        return await handleVariantSKUUpdate(req, res, variantId);
      }
    }

    // 404 for unknown routes
    console.log('🚨 Route not found:', { routePath, method: req.method, url: req.url });
    return res.status(404).json({ error: 'Route not found' });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

/**
 * Handle file upload (models and variants)
 */
async function handleUpload(req, res) {
  console.log('🚀 UPLOAD REQUEST STARTED:', {
    method: req.method,
    url: req.url,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data with increased limits
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

    // Check if this is a variant upload (has parentModelId field)
    const parentModelId = fields.parentModelId?.[0];
    const variantName = fields.variantName?.[0];
    
    // More robust variant detection - check for non-empty strings
    const isVariantUpload = parentModelId && variantName && 
                           parentModelId.trim() !== '' && variantName.trim() !== '';
    
    // Debug log the form fields to see what we're receiving
    console.log('📋 Form fields received:', Object.keys(fields).map(key => `${key}: ${fields[key]?.[0] || 'undefined'}`));
    console.log('📋 All form fields structure:', JSON.stringify(fields, null, 2));
    console.log('📋 Variant upload detection:', { 
      parentModelId, 
      variantName, 
      parentModelIdTrimmed: parentModelId?.trim(), 
      variantNameTrimmed: variantName?.trim(),
      parentModelIdEmpty: !parentModelId || parentModelId.trim() === '',
      variantNameEmpty: !variantName || variantName.trim() === '',
      isVariantUpload 
    });
    console.log('📋 Upload path decision:', isVariantUpload ? '🎨 VARIANT UPLOAD PATH' : '📦 REGULAR MODEL UPLOAD PATH');

    // Get file
    const uploadedFile = files.file?.[0];
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file type
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

    // Upload to AWS S3
    console.log('🔧 UPLOAD DEBUG: Starting AWS S3 upload');
    const modelId = require('crypto').randomBytes(4).toString('hex');
    const s3Result = await uploadModelToS3(fileBuffer, modelId);

    if (!s3Result.success) {
      throw new Error(`AWS S3 upload failed: ${s3Result.error}`);
    }

    const awsUrl = generateModelUrl(modelId);
    console.log('✅ AWS upload successful:', awsUrl);

    let dbResult;
    
    if (isVariantUpload) {
      // Handle variant upload
      console.log('Saving variant to database...');
      const hexColor = fields.hexColor?.[0] || '#000000';
      
      // Log the variant save parameters for debugging
      console.log('🎨 Saving variant with parameters:', {
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor,
        productUrl: fields.variantProductUrl?.[0] || fields.variant_product_url?.[0] || null,
        dimensionsText: fields.dimensionsText?.[0] || null,
        sku: fields.sku?.[0] || null,
        variantType: fields.variantType?.[0] || 'upload'
      });

      dbResult = await saveModelVariant({
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor,
        cloudinaryUrl: awsUrl, // Database field - populated with AWS URL
        cloudinaryPublicId: modelId, // Database field - populated with AWS model ID
        awsUrl: awsUrl,
        storageLocation: 'aws', // IMPORTANT: We only use AWS now
        fileSize: s3Result.size,
        isPrimary: false,
        variantType: fields.variantType?.[0] || 'upload',
        productUrl: fields.variantProductUrl?.[0] || fields.variant_product_url?.[0] || null,
        dimensionsText: fields.dimensionsText?.[0] || null,
        sku: fields.sku?.[0] || null
      });
    } else {
      // Handle regular model upload
      console.log('Saving model to database...');
      console.log('Data to save:', {
        title: fields.title?.[0] || uploadedFile.originalFilename.replace(/\.(glb|gltf)$/i, ''),
        description: fields.description?.[0] || '',
        filename: uploadedFile.originalFilename,
        awsUrl: awsUrl,
        awsFilename: `${modelId}.glb`,
        storageLocation: 'aws',
        fileSize: s3Result.size
      });
      
      // Parse dimensions if provided
      let dimensions = null;
      if (fields.dimensions?.[0]) {
        try {
          dimensions = JSON.parse(fields.dimensions[0]);
          console.log('📏 Parsed dimensions:', dimensions);
        } catch (error) {
          console.warn('⚠️ Failed to parse dimensions, skipping:', error.message);
        }
      }
      
      dbResult = await saveModel({
      title: fields.title?.[0] || uploadedFile.originalFilename.replace(/\.(glb|gltf)$/i, ''),
      description: fields.description?.[0] || '',
      filename: uploadedFile.originalFilename,
      cloudinaryUrl: awsUrl, // Database field - populated with AWS URL
      cloudinaryPublicId: modelId, // Database field - populated with AWS model ID
      awsUrl: awsUrl,
      awsFilename: `${modelId}.glb`,
      storageLocation: 'aws', // IMPORTANT: We only use AWS now
      fileSize: s3Result.size,
      customerId: fields.customerId?.[0] || 'unassigned',
      customerName: fields.customerName?.[0] || 'Unassigned',
      productUrl: fields.product_url?.[0] || null,
      dominantColor: '#6b7280', // Will be updated by frontend after color extraction
      dimensions: dimensions,
      metadata: {
        mimetype: uploadedFile.headers['content-type'],
        uploadedAt: new Date().toISOString()
      }
    });
    }

    console.log('Database save result:', dbResult);

    if (!dbResult.success) {
      console.error('Database save failed:', dbResult.error);
      const errorType = isVariantUpload ? 'variant' : 'model';
      return res.status(500).json({ 
        error: `Failed to save ${errorType} to database`,
        details: dbResult.error || 'Unknown database error'
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
        awsUrl: awsUrl,
        viewUrl: `https://${domain}/view?id=${parentModelId}&variant=${dbResult.id}`,
        message: 'Variant uploaded successfully!',
        debugInfo: {
          uploadType: 'variant',
          formFields: Object.keys(fields).map(key => `${key}: ${fields[key]?.[0] || 'undefined'}`),
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
        message: 'Model uploaded successfully!',
        debugInfo: {
          uploadType: 'model',
          formFields: Object.keys(fields).map(key => `${key}: ${fields[key]?.[0] || 'undefined'}`),
          detectedAs: 'regular model',
          variantDetectionResult: { parentModelId, variantName, isVariantUpload }
        }
      });
    }

  } catch (error) {
    console.error('❌ UPLOAD ERROR DETAILS:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });

    // Always return detailed error for debugging
    return res.status(500).json({
      error: 'Upload failed',
      details: error.message,
      stack: error.stack,
      errorType: 'server_error',
      timestamp: new Date().toISOString()
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
      res.status(500).json({ error: 'Failed to fetch models' });
    }
  }
  
  // Update a model
  else if (req.method === 'PUT') {
    const { modelId, id, title, description } = req.body;
    const actualModelId = modelId || id; // Accept both formats
    
    if (!actualModelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }
    
    try {
      // Build update object
      const updateData = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      
      const { data, error } = await supabase
        .from('models')
        .update(updateData)
        .eq('id', actualModelId)
        .select()
        .single();

      if (error) {
        console.error('Error updating model:', error);
        return res.status(500).json({ error: 'Failed to update model' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Model updated successfully',
        model: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
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
        
        // Get variant info first to delete from Cloudinary
        const { data: variant, error: fetchError } = await supabase
          .from('model_variants')
          .select('cloudinary_public_id')
          .eq('id', id)
          .single();
          
        if (fetchError) {
          console.warn('Could not fetch variant for cleanup:', fetchError);
        }
        
        // Delete from Cloudinary if public ID available
        if (variant?.cloudinary_public_id) {
          await deleteFromCloudinary(variant.cloudinary_public_id);
        }
        
        // Delete from database
        const { error: deleteError } = await supabase
          .from('model_variants')
          .delete()
          .eq('id', id);
          
        if (deleteError) {
          throw new Error('Failed to delete variant from database');
        }
        
        res.status(200).json({ success: true, message: 'Variant deleted successfully' });
        
      } else {
        // Delete model (original logic)
        // Delete from Cloudinary if public ID provided
        if (cloudinaryPublicId) {
          await deleteFromCloudinary(cloudinaryPublicId);
        }
        
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
 * Handle model file serving
 */
async function handleModelFile(req, res, modelId) {
  try {
    // Get model from database
    const model = await getModel(modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    // Redirect to Cloudinary URL for the actual file
    res.redirect(302, model.cloudinary_url);
    
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: 'Failed to fetch model' });
  }
}

/**
 * Handle model info with variants
 */
async function handleModelInfo(req, res, modelId) {
  try {
    const model = await getModel(modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
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
    
    // Return model info with variants (without Cloudinary URLs for security)
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
      metadata: model.metadata,
      // Include dimension data for AR scaling
      width_meters: model.width_meters,
      height_meters: model.height_meters,
      depth_meters: model.depth_meters,
      dimension_unit: model.dimension_unit,
      variants: (variants || []).map(variant => ({
        id: variant.id,
        variant_name: variant.variant_name,
        hex_color: variant.hex_color,
        is_primary: variant.is_primary,
        variant_type: variant.variant_type || 'upload',
        cloudinary_url: variant.cloudinary_url // Include for variant switching
      }))
    });
    
  } catch (error) {
    console.error('Error fetching model info:', error);
    res.status(500).json({ error: 'Failed to fetch model info' });
  }
}

/**
 * Handle model view tracking
 */
async function handleModelView(req, res, modelId) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const result = await incrementViewCount(modelId);
    
    if (!result.success) {
      return res.status(404).json({ error: 'Model not found' });
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
    const { modelId, dominantColor } = req.body;
    
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
 * Validate image access permissions
 */
async function validateImageAccess(req, imageType, customerId) {
  if (imageType === 'customer_logo') {
    const authHeader = req.headers['x-admin-password'];
    
    if (authHeader === process.env.ADMIN_PASSWORD) {
      return { authorized: true, role: 'admin' };
    }
    
    // For now, only admins can manage customer logos
    // TODO: Add customer session validation when customer auth is implemented
    return { authorized: false, error: 'Unauthorized: Customer logos require admin access' };
  }
  
  return { authorized: true };
}

/**
 * Validate and normalize customer ID
 */
async function validateCustomerId(customerId) {
  if (!customerId) return { valid: false, error: 'Customer ID required for customer logos' };
  
  const normalizedId = customerId.toLowerCase().trim();
  
  // Check if customer exists in models table
  const { data, error } = await supabase
    .from('models')
    .select('customer_id')
    .ilike('customer_id', normalizedId)
    .limit(1);
    
  if (error || !data || data.length === 0) {
    return { valid: false, error: `Customer '${normalizedId}' not found in system` };
  }
  
  return { valid: true, normalizedId };
}

/**
 * Enforce one logo per customer by cleaning up existing logos
 */
async function enforceOneLogoPerCustomer(customerId) {
  const { data: existingLogos } = await supabase
    .from('images')
    .select('id, cloudinary_public_id')
    .eq('image_type', 'customer_logo')
    .ilike('customer_id', customerId);
    
  if (existingLogos && existingLogos.length > 0) {
    console.log(`🧹 Replacing ${existingLogos.length} existing logo(s) for customer: ${customerId}`);
    
    // Delete from Cloudinary first
    const { deleteImage } = await import('../lib/cloudinary.js');
    for (const logo of existingLogos) {
      try {
        await deleteImage(logo.cloudinary_public_id);
      } catch (e) {
        console.warn('Failed to delete old logo from Cloudinary:', e.message);
      }
    }
    
    // Delete from database
    await supabase
      .from('images')
      .delete()
      .eq('image_type', 'customer_logo')
      .ilike('customer_id', customerId);
  }
}

/**
 * Standardize image types to prevent variations
 */
const ALLOWED_IMAGE_TYPES = {
  'customer_logo': 'customer_logo',
  'Customer_logo': 'customer_logo',
  'CUSTOMER_LOGO': 'customer_logo',
  'general': 'general',
  'brand_asset': 'brand_asset'
};

function normalizeImageType(rawType) {
  const normalized = ALLOWED_IMAGE_TYPES[rawType || 'general'];
  if (!normalized) {
    throw new Error(`Invalid image type: ${rawType}. Allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')}`);
  }
  return normalized;
}

/**
 * Handle image upload (logos, brand assets, etc.)
 */
async function handleImageUpload(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data with increased limits
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

    // Validate file type
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

    // Upload to Cloudinary
    console.log('Uploading image to Cloudinary...');
    const { uploadImage } = await import('../lib/cloudinary.js');
    const cloudinaryResult = await uploadImage(fileBuffer, uploadedFile.originalFilename);

    // Validate and normalize input data
    console.log('Validating image upload data...');
    const rawImageType = fields.imageType?.[0] || 'general';
    const rawCustomerId = fields.customerId?.[0] || null;
    const customerName = fields.customerName?.[0] || null;
    
    // Normalize and validate image type
    const imageType = normalizeImageType(rawImageType);
    
    // Validate permissions for this image type
    const accessCheck = await validateImageAccess(req, imageType, rawCustomerId);
    if (!accessCheck.authorized) {
      return res.status(403).json({ error: accessCheck.error });
    }
    
    let customerId = rawCustomerId;
    
    // For customer logos, validate customer ID and normalize it
    if (imageType === 'customer_logo') {
      const customerValidation = await validateCustomerId(rawCustomerId);
      if (!customerValidation.valid) {
        return res.status(400).json({ error: customerValidation.error });
      }
      customerId = customerValidation.normalizedId;
      
      // Enforce one logo per customer
      await enforceOneLogoPerCustomer(customerId);
    }
    
    console.log('Saving image to database...');
    
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
      
      let query = supabase.from('images').select('*');
      
      if (imageType) {
        // Normalize image type for consistent searching
        const normalizedType = normalizeImageType(imageType);
        query = query.eq('image_type', normalizedType);
      }
      
      if (customerId) {
        // Use case-insensitive matching for customer ID
        query = query.ilike('customer_id', customerId.toLowerCase().trim());
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
      
      // First, get the image to validate permissions
      const { data: image, error: fetchError } = await supabase
        .from('images')
        .select('*')
        .eq('id', id)
        .single();
        
      if (fetchError || !image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      // Validate permissions for deletion
      const accessCheck = await validateImageAccess(req, image.image_type, image.customer_id);
      if (!accessCheck.authorized) {
        return res.status(403).json({ error: accessCheck.error });
      }
      
      console.log(`🗑️ Deleting ${image.image_type} image for customer: ${image.customer_id || 'general'}`);
      
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
  metadata JSONB DEFAULT '{}',
  product_url TEXT,
  -- Real-world dimensions in meters (for AR scaling)
  width_meters DECIMAL(10,4),
  height_meters DECIMAL(10,4), 
  depth_meters DECIMAL(10,4),
  dimension_unit VARCHAR(10) DEFAULT 'cm',
  dimension_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_customer ON models(customer_id);
CREATE INDEX IF NOT EXISTS idx_models_created ON models(created_at);

-- Grant permissions
GRANT ALL ON models TO authenticated;
GRANT ALL ON models TO service_role;
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

    return res.status(200).json({
      success: true,
      message: 'Models table is ready!'
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
 * Handle requests table creation instructions
 */
async function handleCreateRequestsTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to create the customer_requests table',
    sql: `
-- Create customer_requests table for the requests feature
CREATE TABLE IF NOT EXISTS customer_requests (
  id TEXT PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL,
  product_url TEXT NOT NULL,
  title VARCHAR(255),
  description TEXT,
  reference_images TEXT[], -- Array of Cloudinary image URLs
  status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high
  estimated_completion DATE,
  notes TEXT, -- Customer notes
  admin_notes TEXT, -- Admin-only notes
  model_id TEXT, -- References models(id) when completed
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_requests_customer ON customer_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON customer_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON customer_requests(created_at);

-- Grant permissions
GRANT ALL ON customer_requests TO authenticated;
GRANT ALL ON customer_requests TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the customer_requests table'
    ]
  });
}

/**
 * Handle customer requests CRUD operations
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
  
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

/**
 * Handle brand settings table creation instructions
 */
async function handleCreateBrandSettingsTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to create the customer_brand_settings table',
    sql: `
-- Create customer_brand_settings table for complete brand customization
CREATE TABLE IF NOT EXISTS customer_brand_settings (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(100) NOT NULL UNIQUE,
  text_direction VARCHAR(3) DEFAULT 'ltr', -- 'ltr' or 'rtl'
  logo_url VARCHAR(500), -- URL to customer's logo in Cloudinary
  primary_color VARCHAR(7) DEFAULT '#58a6ff', -- Hex color for primary brand color
  secondary_color VARCHAR(7) DEFAULT '#79c0ff', -- Hex color for secondary brand color  
  font_family VARCHAR(100) DEFAULT 'Inter', -- Font family name
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_brand_settings_customer ON customer_brand_settings(customer_id);

-- Grant permissions
GRANT ALL ON customer_brand_settings TO authenticated;
GRANT ALL ON customer_brand_settings TO service_role;

-- Add comments for documentation
COMMENT ON TABLE customer_brand_settings IS 'Stores complete brand customization settings for each customer';
COMMENT ON COLUMN customer_brand_settings.text_direction IS 'Text direction: ltr (Left-to-Right) or rtl (Right-to-Left)';
COMMENT ON COLUMN customer_brand_settings.logo_url IS 'URL to customer logo stored in Cloudinary';
COMMENT ON COLUMN customer_brand_settings.primary_color IS 'Primary brand color in hex format (#RRGGBB)';
COMMENT ON COLUMN customer_brand_settings.secondary_color IS 'Secondary brand color in hex format (#RRGGBB)';
COMMENT ON COLUMN customer_brand_settings.font_family IS 'Brand font family name (e.g., Inter, Arial, Roboto)';
    `,
    migration: `
-- If table already exists, add new columns (safe migration)
ALTER TABLE customer_brand_settings 
  ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500),
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#58a6ff',
  ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) DEFAULT '#79c0ff',
  ADD COLUMN IF NOT EXISTS font_family VARCHAR(100) DEFAULT 'Inter';

-- Update comments
COMMENT ON TABLE customer_brand_settings IS 'Stores complete brand customization settings for each customer';
COMMENT ON COLUMN customer_brand_settings.logo_url IS 'URL to customer logo stored in Cloudinary';
COMMENT ON COLUMN customer_brand_settings.primary_color IS 'Primary brand color in hex format (#RRGGBB)';
COMMENT ON COLUMN customer_brand_settings.secondary_color IS 'Secondary brand color in hex format (#RRGGBB)';
COMMENT ON COLUMN customer_brand_settings.font_family IS 'Brand font family name (e.g., Inter, Arial, Roboto)';
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. If table does NOT exist: Copy and paste the "sql" above',
      '4. If table ALREADY exists: Copy and paste the "migration" above instead',
      '5. Click "Run" to create/update the customer_brand_settings table',
      '6. Test by visiting /api/customers/[customer-id]/brand-settings'
    ]
  });
}

/**
 * Handle customer brand settings CRUD operations
 */
async function handleCustomerBrandSettings(req, res, customerId) {
  console.log(`Brand settings request for customer: ${customerId}, method: ${req.method}`);
  
  if (req.method === 'GET') {
    // Get customer brand settings
    try {
      const { data, error } = await supabase
        .from('customer_brand_settings')
        .select('*')
        .eq('customer_id', customerId)
        .single();
      
      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error fetching brand settings:', error);
        return res.status(500).json({ error: 'Failed to fetch brand settings' });
      }
      
      // If no settings found, return defaults
      if (!data) {
        return res.status(200).json({
          textDirection: 'ltr'
        });
      }
      
      return res.status(200).json({
        textDirection: data.text_direction || 'ltr',
        updatedAt: data.updated_at
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  else if (req.method === 'PUT') {
    // Update customer brand settings
    try {
      const { textDirection } = req.body;
      
      if (!textDirection || !['ltr', 'rtl'].includes(textDirection)) {
        return res.status(400).json({ error: 'Valid textDirection (ltr or rtl) is required' });
      }
      
      // Validate that customer exists
      const customerValidation = await validateCustomerId(customerId);
      if (!customerValidation.valid) {
        return res.status(400).json({ error: customerValidation.error });
      }
      
      const normalizedCustomerId = customerValidation.normalizedId;
      
      // Upsert brand settings
      const { data, error } = await supabase
        .from('customer_brand_settings')
        .upsert({
          customer_id: normalizedCustomerId,
          text_direction: textDirection,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error saving brand settings:', error);
        return res.status(500).json({ error: 'Failed to save brand settings' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Brand settings saved successfully',
        settings: {
          textDirection: data.text_direction,
          updatedAt: data.updated_at
        }
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
 * Handle model_variants table creation instructions
 */
async function handleCreateVariantsTable(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    message: 'Please run the following SQL in your Supabase SQL editor to create the model_variants table',
    sql: `
-- Create model_variants table for furniture color/material variants
CREATE TABLE IF NOT EXISTS model_variants (
  id TEXT PRIMARY KEY,
  parent_model_id TEXT NOT NULL,
  variant_name VARCHAR(255) NOT NULL,
  hex_color VARCHAR(7) DEFAULT '#000000',
  cloudinary_url TEXT NOT NULL,
  cloudinary_public_id VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  variant_type VARCHAR(50) DEFAULT 'upload', -- 'upload' or 'color'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key constraint
  CONSTRAINT fk_parent_model FOREIGN KEY (parent_model_id) REFERENCES models(id) ON DELETE CASCADE
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_variants_parent ON model_variants(parent_model_id);
CREATE INDEX IF NOT EXISTS idx_variants_type ON model_variants(variant_type);
CREATE INDEX IF NOT EXISTS idx_variants_primary ON model_variants(is_primary);

-- Grant permissions
GRANT ALL ON model_variants TO authenticated;
GRANT ALL ON model_variants TO service_role;
    `,
    instructions: [
      '1. Go to your Supabase dashboard',
      '2. Navigate to SQL Editor',
      '3. Copy and paste the SQL above',
      '4. Click "Run" to create the model_variants table',
      '5. Test by trying a variant upload again'
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
 * Handle Cloudinary upload configuration for direct browser uploads
 */
async function handleCloudinaryConfig(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { v2: cloudinary } = await import('cloudinary');

    // Generate timestamp for signature
    const timestamp = Math.round(new Date().getTime() / 1000);

    // Upload parameters (must match exactly what Cloudinary signs)
    // NOTE: resource_type is NOT included in signature for raw uploads
    const uploadParams = {
      folder: 'furniture-models',
      timestamp: timestamp,
      upload_preset: 'furniture_models' // May be required for security
    };

    // Generate signature
    const signature = cloudinary.utils.api_sign_request(uploadParams, process.env.CLOUDINARY_API_SECRET);

    return res.status(200).json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp: timestamp,
      signature: signature,
      uploadParams: uploadParams
    });

  } catch (error) {
    console.error('Error generating Cloudinary config:', error);
    return res.status(500).json({
      error: 'Failed to generate upload configuration',
      details: error.message
    });
  }
}

/**
 * Handle saving model metadata after successful Cloudinary upload
 */
async function handleCloudinarySave(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enhanced debugging information
  console.log('🔍 [CLOUDINARY-SAVE] Request received at:', new Date().toISOString());
  console.log('🔍 [CLOUDINARY-SAVE] Environment check:');
  console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('  - SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
  console.log('  - DOMAIN:', process.env.DOMAIN || 'DEFAULT');

  try {
    const {
      cloudinaryUrl,
      cloudinaryPublicId,
      fileSize,
      title,
      description,
      customerId,
      customerName,
      dimensions,
      // Variant-specific fields
      parentModelId,
      variantName,
      hexColor,
      isVariant
    } = req.body;

    console.log('🔍 [CLOUDINARY-SAVE] Request body parsed:', {
      cloudinaryUrl: cloudinaryUrl ? 'SET' : 'MISSING',
      cloudinaryPublicId: cloudinaryPublicId ? 'SET' : 'MISSING',
      fileSize,
      title,
      isVariant,
      customerId,
      customerName
    });

    if (!cloudinaryUrl || !cloudinaryPublicId) {
      console.error('❌ [CLOUDINARY-SAVE] Missing required fields');
      return res.status(400).json({
        error: 'Cloudinary URL and public ID are required',
        received: {
          cloudinaryUrl: !!cloudinaryUrl,
          cloudinaryPublicId: !!cloudinaryPublicId
        }
      });
    }

    let dbResult;

    if (isVariant && parentModelId && variantName) {
      // Handle variant upload
      console.log('🎨 [CLOUDINARY-SAVE] Saving variant after direct upload...');
      console.log('🎨 [CLOUDINARY-SAVE] Variant params:', { parentModelId, variantName, hexColor });

      dbResult = await saveModelVariant({
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor || '#000000',
        cloudinaryUrl: cloudinaryUrl,
        cloudinaryPublicId: cloudinaryPublicId,
        fileSize: fileSize || 0,
        isPrimary: false,
        variantType: 'upload'
      });

      console.log('🎨 [CLOUDINARY-SAVE] Variant result:', { success: dbResult?.success, id: dbResult?.id });
    } else {
      // Handle regular model upload
      console.log('📦 [CLOUDINARY-SAVE] Saving model after direct upload...');

      // Parse dimensions if provided
      let parsedDimensions = null;
      if (dimensions) {
        try {
          parsedDimensions = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
          console.log('📏 [CLOUDINARY-SAVE] Parsed dimensions:', parsedDimensions);
        } catch (error) {
          console.warn('⚠️ [CLOUDINARY-SAVE] Failed to parse dimensions:', error.message);
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
        metadata: {
          uploadMethod: 'direct',
          uploadedAt: new Date().toISOString()
        }
      };

      console.log('📦 [CLOUDINARY-SAVE] Model params:', {
        ...modelParams,
        metadata: JSON.stringify(modelParams.metadata)
      });

      dbResult = await saveModel(modelParams);

      console.log('📦 [CLOUDINARY-SAVE] Model result:', { success: dbResult?.success, id: dbResult?.id, error: dbResult?.error });
    }

    if (!dbResult) {
      console.error('❌ [CLOUDINARY-SAVE] dbResult is null/undefined');
      return res.status(500).json({
        error: 'Database operation returned no result',
        debug: {
          isVariant,
          hasParentModelId: !!parentModelId,
          hasVariantName: !!variantName,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!dbResult.success) {
      console.error('❌ [CLOUDINARY-SAVE] Database save failed:', dbResult.error);
      return res.status(500).json({
        error: 'Failed to save model to database',
        details: dbResult.error,
        debug: {
          dbResultType: typeof dbResult,
          dbResultKeys: Object.keys(dbResult || {}),
          timestamp: new Date().toISOString()
        }
      });
    }

    console.log('✅ [CLOUDINARY-SAVE] Database save successful, generating response...');
    const domain = process.env.DOMAIN || 'newfurniture.live';

    if (isVariant) {
      // Variant response
      const variantResponse = {
        success: true,
        id: dbResult.id,
        parentModelId: parentModelId,
        variantName: variantName,
        hexColor: hexColor || '#000000',
        cloudinaryUrl: cloudinaryUrl,
        viewUrl: `https://${domain}/view?id=${parentModelId}&variant=${dbResult.id}`,
        message: 'Variant uploaded successfully!'
      };
      console.log('🎨 [CLOUDINARY-SAVE] Sending variant response:', variantResponse);
      return res.status(200).json(variantResponse);
    } else {
      // Model response
      const modelResponse = {
        success: true,
        id: dbResult.id,
        viewUrl: `https://${domain}/view?id=${dbResult.id}`,
        directUrl: cloudinaryUrl,
        shareUrl: `https://${domain}/view?id=${dbResult.id}`,
        title: title,
        fileSize: fileSize,
        message: 'Model uploaded successfully!'
      };
      console.log('📦 [CLOUDINARY-SAVE] Sending model response:', modelResponse);
      return res.status(200).json(modelResponse);
    }

  } catch (error) {
    console.error('💥 [CLOUDINARY-SAVE] Exception caught:', error);
    console.error('💥 [CLOUDINARY-SAVE] Error name:', error.name);
    console.error('💥 [CLOUDINARY-SAVE] Error message:', error.message);
    console.error('💥 [CLOUDINARY-SAVE] Error stack:', error.stack);
    console.error('💥 [CLOUDINARY-SAVE] Error type:', typeof error);
    console.error('💥 [CLOUDINARY-SAVE] Error keys:', Object.keys(error));

    // Check if it's a specific database error
    if (error.message && error.message.includes('Missing Supabase environment variables')) {
      return res.status(500).json({
        error: 'Database configuration error',
        details: 'Supabase environment variables are not configured properly',
        debug: {
          timestamp: new Date().toISOString(),
          errorType: 'ENVIRONMENT_ERROR'
        }
      });
    }

    return res.status(500).json({
      error: 'Failed to save model metadata',
      details: error.message,
      debug: {
        errorName: error.name,
        errorType: typeof error,
        timestamp: new Date().toISOString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}

/**
 * Rate limiting storage (in-memory for now, could be moved to Redis)
 */
const rateLimitStore = new Map();

/**
 * Simple rate limiter implementation
 */
function checkRateLimit(ip, route, limits) {
  const key = `${ip}:${route}`;
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour window

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limits.max - 1 };
  }

  const record = rateLimitStore.get(key);

  // Reset if window expired
  if (now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limits.max - 1 };
  }

  // Check if limit exceeded
  if (record.count >= limits.max) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime
    };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(key, record);

  return { allowed: true, remaining: limits.max - record.count };
}

/**
 * Handle single QR code generation
 * GET /api/qr-generate?url=<url>&format=<format>&size=<size>
 */
async function handleQRGenerate(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIP, 'qr-generate', { max: 100 });

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many QR generation requests. Please try again later.',
        details: {
          reset_time: new Date(rateLimit.resetTime).toISOString()
        }
      }
    });
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());

  try {
    const { url, format, size, errorCorrectionLevel, margin, color } = req.query;

    // Validate required parameters
    if (!url) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_URL',
          message: 'URL parameter is required',
          example: '/api/qr-generate?url=https://newfurniture.live/view?id=abc123'
        }
      });
    }

    // Build options object
    const options = {};
    if (format) options.format = format;
    if (size) options.size = parseInt(size);
    if (errorCorrectionLevel) options.errorCorrectionLevel = errorCorrectionLevel;
    if (margin) options.margin = parseInt(margin);

    // Handle color parameters
    if (color) {
      try {
        options.color = JSON.parse(color);
      } catch (e) {
        // If JSON parse fails, assume it's just the dark color
        options.color = { dark: color };
      }
    }

    // Generate QR code
    const result = await generateQR(url, options);

    // Set appropriate content type for direct image responses
    if (result.data.format === 'svg') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    } else if (result.data.format === 'png') {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }

    // Check if client wants just the QR code content (for direct embedding)
    if (req.query.raw === 'true') {
      if (result.data.format === 'png') {
        return res.status(200).send(result.data.qr_code);
      } else {
        return res.status(200).send(result.data.qr_code);
      }
    }

    // Return JSON response with metadata
    return res.status(200).json({
      success: true,
      data: {
        qr_code: result.data.qr_code,
        format: result.data.format,
        size: result.data.size,
        url: result.data.url,
        content_type: result.data.content_type,
        estimated_file_size: result.data.estimated_file_size,
        generated_at: result.data.generated_at
      },
      metadata: {
        processing_time_ms: result.metadata.processing_time_ms,
        estimated_scannable_distance: result.metadata.estimated_scannable_distance,
        error_correction: result.metadata.error_correction,
        rate_limit: {
          remaining: rateLimit.remaining,
          limit: 100
        }
      }
    });

  } catch (error) {
    console.error('QR Generation Error:', error);

    // Handle our custom QR errors
    if (error instanceof QRGeneratorError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          timestamp: error.timestamp
        }
      });
    }

    // Handle unexpected errors
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during QR generation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

/**
 * Handle batch QR code generation
 * POST /api/qr-batch
 * Body: { urls: [...], options: {...} }
 */
async function handleQRBatch(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting (stricter for batch operations)
  const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientIP, 'qr-batch', { max: 10 });

  if (!rateLimit.allowed) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many batch QR requests. Please try again later.',
        details: {
          reset_time: new Date(rateLimit.resetTime).toISOString()
        }
      }
    });
  }

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', '10');
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());

  try {
    const { urls, options = {} } = req.body;

    // Validate input
    if (!urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Request body must contain a "urls" array',
          example: { urls: ['https://example.com/1', 'https://example.com/2'], options: { format: 'svg' } }
        }
      });
    }

    if (urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_URLS_ARRAY',
          message: 'URLs array cannot be empty'
        }
      });
    }

    if (urls.length > 50) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_URLS',
          message: 'Maximum 50 URLs allowed per batch request',
          provided: urls.length,
          maximum: 50
        }
      });
    }

    // Generate QR codes in batch
    const result = await generateBatchQR(urls, options);

    return res.status(200).json({
      success: true,
      data: result.data,
      metadata: {
        rate_limit: {
          remaining: rateLimit.remaining,
          limit: 10
        }
      }
    });

  } catch (error) {
    console.error('Batch QR Generation Error:', error);

    // Handle our custom QR errors
    if (error instanceof QRGeneratorError) {
      return res.status(400).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          timestamp: error.timestamp
        }
      });
    }

    // Handle unexpected errors
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during batch QR generation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
}

/**
 * Handle QR formats and capabilities inquiry
 * GET /api/qr-formats
 */
async function handleQRFormats(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { useCase } = req.query;

    const formats = getSupportedFormats();

    let optimalSettings = null;
    if (useCase) {
      optimalSettings = getOptimalSettings(useCase);
    }

    return res.status(200).json({
      success: true,
      data: {
        supported_formats: formats,
        optimal_settings: optimalSettings,
        use_cases: ['web', 'print', 'mobile', 'embed'],
        size_limits: {
          minimum: 64,
          maximum: 1024,
          recommended: 256
        },
        error_correction_levels: {
          'L': { recovery: '~7%', use_case: 'Clean environments' },
          'M': { recovery: '~15%', use_case: 'Standard use (recommended)' },
          'Q': { recovery: '~25%', use_case: 'Noisy environments' },
          'H': { recovery: '~30%', use_case: 'Very noisy/damaged' }
        },
        rate_limits: {
          qr_generate: '100 requests per hour',
          qr_batch: '10 requests per hour (max 50 URLs per request)'
        }
      },
      examples: {
        single_qr: '/api/qr-generate?url=https://newfurniture.live/view?id=abc123&format=svg&size=256',
        batch_qr: {
          method: 'POST',
          endpoint: '/api/qr-batch',
          body: {
            urls: [
              'https://newfurniture.live/view?id=chair1',
              'https://newfurniture.live/view?id=table1'
            ],
            options: { format: 'svg', size: 200 }
          }
        },
        direct_svg: '/api/qr-generate?url=https://newfurniture.live/view?id=abc123&raw=true'
      }
    });

  } catch (error) {
    console.error('QR Formats Error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve QR format information'
      }
    });
  }
}


/**
 * GET /api/qr-migration
 * Add QR persistence columns to database and optionally regenerate all QR codes
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

-- Optional: Create a QR generation log table for monitoring
CREATE TABLE IF NOT EXISTS qr_generation_log (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT,
  variant_id TEXT,
  generation_method VARCHAR(20), -- 'local', 'fallback', 'emergency'
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  processing_time_ms INTEGER,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for log queries
CREATE INDEX IF NOT EXISTS idx_qr_log_model_variant ON qr_generation_log(model_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_qr_log_generated_at ON qr_generation_log(generated_at DESC);
        `,
        instructions: [
          '1. Go to your Supabase dashboard',
          '2. Navigate to the SQL Editor',
          '3. Copy and paste the SQL above',
          '4. Click "Run" to add the columns',
          '5. POST to /api/qr-migration to regenerate all QR codes'
        ]
      });
    } else {
      // POST: Regenerate all QR codes for existing models
      const { regenerateAll } = req.body;

      if (regenerateAll) {
        // TODO: Fix QR persistence module import issues
        // const qrPersistence = await import('../lib/qr-persistence.js');
        // const results = await qrPersistence.regenerateAllQRCodes();

        return res.status(200).json({
          success: true,
          message: 'QR regeneration temporarily disabled due to module conflicts',
          results: { disabled: true }
        });
      } else {
        return res.status(200).json({
          success: true,
          message: 'QR persistence columns are ready. Send { "regenerateAll": true } to regenerate all QR codes.'
        });
      }
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
 * GET/POST /api/sku-migration
 * Add SKU columns to database and optionally generate SKUs for existing models
 */
async function handleSKUMigration(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      // Return SQL for manual migration
      return res.status(200).json({
        success: true,
        message: 'Run the following SQL in your Supabase dashboard to add SKU support:',
        sql: `
-- Add SKU Support to AR Furniture Platform
-- Migration: Add SKU columns to models and model_variants tables

-- Add SKU column to models table
ALTER TABLE models ADD COLUMN IF NOT EXISTS sku VARCHAR(50) UNIQUE;

-- Add SKU column to model_variants table
ALTER TABLE model_variants ADD COLUMN IF NOT EXISTS sku VARCHAR(60) UNIQUE;

-- Create indexes for fast SKU lookups
CREATE INDEX IF NOT EXISTS idx_models_sku ON models(sku);
CREATE INDEX IF NOT EXISTS idx_model_variants_sku ON model_variants(sku);

-- Create function to generate customer code from customer_name
CREATE OR REPLACE FUNCTION generate_customer_code(customer_name TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Extract 3-4 character code from customer name
    RETURN UPPER(
        CASE
            WHEN LENGTH(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g')) >= 4 THEN
                LEFT(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g'), 4)
            ELSE
                LPAD(REGEXP_REPLACE(customer_name, '[^A-Za-z]', '', 'g'), 3, 'X')
        END
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to generate product code from title
CREATE OR REPLACE FUNCTION generate_product_code(title TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Extract meaningful product code from title
    RETURN UPPER(
        LEFT(
            REGEXP_REPLACE(
                REGEXP_REPLACE(title, '[^A-Za-z0-9 ]', '', 'g'),
                '\\s+', '', 'g'
            ),
            8
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to generate variant code from variant_name
CREATE OR REPLACE FUNCTION generate_variant_code(variant_name TEXT, hex_color TEXT DEFAULT NULL)
RETURNS TEXT AS $$
BEGIN
    -- Use variant_name if available, otherwise use color
    IF variant_name IS NOT NULL AND variant_name != '' THEN
        RETURN UPPER(LEFT(REGEXP_REPLACE(variant_name, '[^A-Za-z0-9]', '', 'g'), 6));
    ELSIF hex_color IS NOT NULL THEN
        RETURN UPPER(REPLACE(hex_color, '#', 'C'));
    ELSE
        RETURN 'VAR';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate full product SKU
CREATE OR REPLACE FUNCTION generate_product_sku(customer_name TEXT, title TEXT, model_id TEXT)
RETURNS TEXT AS $$
DECLARE
    customer_code TEXT;
    product_code TEXT;
    id_suffix TEXT;
BEGIN
    customer_code := generate_customer_code(COALESCE(customer_name, 'UNASSIGNED'));
    product_code := generate_product_code(title);
    id_suffix := UPPER(RIGHT(model_id, 4));

    RETURN customer_code || '-' || product_code || '-' || id_suffix;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate full variant SKU
CREATE OR REPLACE FUNCTION generate_variant_sku(product_sku TEXT, variant_name TEXT, hex_color TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    variant_code TEXT;
BEGIN
    variant_code := generate_variant_code(variant_name, hex_color);
    RETURN product_sku || '-' || variant_code;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON COLUMN models.sku IS 'Unique Stock Keeping Unit for the product. Format: {CUSTOMER_CODE}-{PRODUCT_CODE}-{ID_SUFFIX}';
COMMENT ON COLUMN model_variants.sku IS 'Unique Stock Keeping Unit for the variant. Format: {PRODUCT_SKU}-{VARIANT_CODE}';
        `,
        instructions: [
          '1. Go to your Supabase dashboard',
          '2. Navigate to the SQL Editor',
          '3. Copy and paste the SQL above',
          '4. Click "Run" to add the columns and functions',
          '5. POST to /api/sku-migration with {"generateSKUs": true} to generate SKUs for existing models'
        ]
      });
    } else {
      // POST: Generate SKUs for existing models
      const { generateSKUs } = req.body;

      if (generateSKUs) {
        try {
          // Import SKU generator
          const { generateProductSKU, generateVariantSKU, generateUniqueSKU } = await import('../lib/sku-generator.js');

          let updateCount = 0;
          let variantUpdateCount = 0;
          let errors = [];

          // Generate SKUs for models without SKUs
          const modelsResult = await query(`
            SELECT id, title, customer_name, sku
            FROM models
            WHERE sku IS NULL OR sku = ''
          `);

          if (modelsResult.success && modelsResult.data.length > 0) {
            for (const model of modelsResult.data) {
              try {
                const baseSKU = generateProductSKU(model.customer_name, model.title, model.id);
                const uniqueSKU = await generateUniqueSKU(baseSKU, { sql: query });

                const updateResult = await query(
                  'UPDATE models SET sku = $1 WHERE id = $2',
                  [uniqueSKU, model.id]
                );

                if (updateResult.success) {
                  updateCount++;
                } else {
                  errors.push(`Failed to update model ${model.id}: ${updateResult.error}`);
                }
              } catch (error) {
                errors.push(`Error generating SKU for model ${model.id}: ${error.message}`);
              }
            }
          }

          // Generate SKUs for variants without SKUs
          const variantsResult = await query(`
            SELECT mv.id, mv.variant_name, mv.hex_color, mv.parent_model_id, m.sku as parent_sku
            FROM model_variants mv
            JOIN models m ON mv.parent_model_id = m.id
            WHERE (mv.sku IS NULL OR mv.sku = '') AND m.sku IS NOT NULL
          `);

          if (variantsResult.success && variantsResult.data.length > 0) {
            for (const variant of variantsResult.data) {
              try {
                const baseSKU = generateVariantSKU(variant.parent_sku, variant.variant_name, variant.hex_color);
                const uniqueSKU = await generateUniqueSKU(baseSKU, { sql: query });

                const updateResult = await query(
                  'UPDATE model_variants SET sku = $1 WHERE id = $2',
                  [uniqueSKU, variant.id]
                );

                if (updateResult.success) {
                  variantUpdateCount++;
                } else {
                  errors.push(`Failed to update variant ${variant.id}: ${updateResult.error}`);
                }
              } catch (error) {
                errors.push(`Error generating SKU for variant ${variant.id}: ${error.message}`);
              }
            }
          }

          return res.status(200).json({
            success: true,
            message: 'SKU generation completed',
            results: {
              modelsUpdated: updateCount,
              variantsUpdated: variantUpdateCount,
              errors: errors.length > 0 ? errors : null
            }
          });

        } catch (error) {
          return res.status(500).json({
            success: false,
            error: 'SKU generation failed',
            details: error.message
          });
        }
      } else {
        return res.status(200).json({
          success: true,
          message: 'SKU columns are ready. Send { "generateSKUs": true } to generate SKUs for existing models.'
        });
      }
    }
  } catch (error) {
    console.error('SKU Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'SKU migration failed',
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
    const { validateSKU, isSKUUnique } = await import('../lib/sku-generator.js');

    // Basic SKU validation - just check length and no dangerous characters
    if (sku.length > 100) {
      return res.status(400).json({
        error: 'SKU is too long. Please keep it under 100 characters.'
      });
    }

    // Check if SKU is unique
    const isUnique = await isSKUUnique(sku, { sql: query });
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
 * PUT /api/model/{id}/category
 * Update model category
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
 * PUT /api/variant/{id}/sku
 * Update variant SKU
 */
async function handleVariantSKUUpdate(req, res) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const variantId = req.url.split('/')[2]; // Extract variant ID from URL
  const { sku } = req.body;

  if (!variantId) {
    return res.status(400).json({ error: 'Variant ID is required' });
  }

  if (!sku) {
    return res.status(400).json({ error: 'SKU is required' });
  }

  try {
    // Import SKU generator functions
    const { validateSKU, isSKUUnique } = await import('../lib/sku-generator.js');

    // Basic SKU validation - just check length and no dangerous characters
    if (sku.length > 100) {
      return res.status(400).json({
        error: 'SKU is too long. Please keep it under 100 characters.'
      });
    }

    // Check if SKU is unique
    const isUnique = await isSKUUnique(sku, { sql: query });
    if (!isUnique) {
      return res.status(400).json({
        error: 'SKU already exists. SKUs must be unique across the platform.'
      });
    }

    // Update the variant
    const updateResult = await query(
      'UPDATE model_variants SET sku = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [sku, variantId]
    );

    if (!updateResult.success || updateResult.data.length === 0) {
      return res.status(404).json({ error: 'Variant not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Variant SKU updated successfully',
      variant: updateResult.data[0]
    });

  } catch (error) {
    console.error('Variant SKU update error:', error);
    return res.status(500).json({
      success: false,
      error: 'SKU update failed',
      details: error.message
    });
  }
}

/**
 * Test database connection specifically for cloudinary-save debugging
 * GET /api/test-db-connection
 */
async function handleTestDbConnection(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  console.log('🔍 [DB-TEST] Starting database connectivity test at:', new Date().toISOString());

  try {
    // Check environment variables
    const envCheck = {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING',
      DOMAIN: process.env.DOMAIN || 'DEFAULT'
    };

    console.log('🔍 [DB-TEST] Environment variables:', envCheck);

    // Test basic Supabase connection
    console.log('🔍 [DB-TEST] Testing Supabase connection...');
    const { data: pingTest, error: pingError } = await supabase
      .from('models')
      .select('id')
      .limit(1);

    const connectionTime = Date.now() - startTime;

    if (pingError) {
      console.error('❌ [DB-TEST] Supabase connection failed:', pingError);
      return res.status(500).json({
        success: false,
        error: 'Database connection failed',
        details: pingError.message,
        debug: {
          environment: envCheck,
          connectionTimeMs: connectionTime,
          timestamp: new Date().toISOString(),
          errorCode: pingError.code,
          errorHint: pingError.hint
        }
      });
    }

    console.log('✅ [DB-TEST] Basic connection successful');

    // Test saveModel function with dummy data
    console.log('🔍 [DB-TEST] Testing saveModel function...');
    const testModelResult = await saveModel({
      title: `TEST_MODEL_${Date.now()}`,
      description: 'Test model for debugging cloudinary-save issue',
      filename: 'test-model.glb',
      cloudinaryUrl: 'https://example.com/test.glb',
      cloudinaryPublicId: 'test/test-model',
      fileSize: 1000,
      customerId: 'test-customer',
      customerName: 'Test Customer',
      dominantColor: '#ff0000',
      dimensions: null,
      metadata: {
        uploadMethod: 'test',
        uploadedAt: new Date().toISOString()
      }
    });

    const totalTime = Date.now() - startTime;

    if (!testModelResult.success) {
      console.error('❌ [DB-TEST] saveModel failed:', testModelResult.error);
      return res.status(500).json({
        success: false,
        error: 'saveModel function failed',
        details: testModelResult.error,
        debug: {
          environment: envCheck,
          connectionTimeMs: connectionTime,
          totalTimeMs: totalTime,
          timestamp: new Date().toISOString(),
          testResult: testModelResult
        }
      });
    }

    console.log('✅ [DB-TEST] saveModel test successful, ID:', testModelResult.id);

    // Clean up test record
    try {
      await supabase
        .from('models')
        .delete()
        .eq('id', testModelResult.id);
      console.log('🧹 [DB-TEST] Test record cleaned up');
    } catch (cleanupError) {
      console.warn('⚠️ [DB-TEST] Failed to clean up test record:', cleanupError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Database connectivity test passed',
      debug: {
        environment: envCheck,
        connectionTimeMs: connectionTime,
        totalTimeMs: totalTime,
        testModelId: testModelResult.id,
        modelsTableCount: pingTest?.length || 0,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('💥 [DB-TEST] Exception:', error);

    return res.status(500).json({
      success: false,
      error: 'Database test failed with exception',
      details: error.message,
      debug: {
        errorName: error.name,
        errorType: typeof error,
        totalTimeMs: totalTime,
        timestamp: new Date().toISOString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
}

/**
 * Initialize database tables
 * GET /api/init-db
 */
async function handleInitDb(req, res) {
  if (req.method \!== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("🔧 Initializing database tables...");

    // Test connection first
    const { data: connectionTest, error: connectionError } = await supabase
      .from("models")
      .select("count")
      .limit(1);

    if (connectionError) {
      console.error("❌ Database connection failed:", connectionError);
      return res.status(500).json({
        success: false,
        error: "Database connection failed",
        details: connectionError.message,
        fix: "Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables"
      });
    }

    console.log("✅ Database connection successful");

    // Try to query each table to see if it exists
    const tables = ["models", "model_variants", "users", "model_views"];
    const tableStatus = {};

    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .limit(1);

        if (error) {
          tableStatus[table] = { exists: false, error: error.message };
        } else {
          tableStatus[table] = { exists: true, count: data?.length || 0 };
        }
      } catch (error) {
        tableStatus[table] = { exists: false, error: error.message };
      }
    }

    return res.status(200).json({
      success: true,
      message: "Database initialization check complete",
      connection: "OK",
      tables: tableStatus,
      timestamp: new Date().toISOString(),
      note: "If tables do not exist, they need to be created in Supabase dashboard"
    });

  } catch (error) {
    console.error("💥 Init DB failed:", error);
    return res.status(500).json({
      success: false,
      error: "Database initialization failed",
      details: error.message
    });
  }
}
