import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseKey) {
  console.error('⚠️ Missing Supabase environment variables - database operations will fail');
  console.error('SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('SUPABASE_ANON_KEY:', supabaseKey ? 'Set' : 'Missing');
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export { supabase };

/**
 * URL Utilities for SEO-friendly URLs
 */

// Generate SEO-friendly slug from title
function generateSlug(title) {
  if (!title) return 'untitled';

  return title
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05FF\u0600-\u06FF-]/g, '') // Keep Hebrew/Arabic chars
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-')      // Replace multiple hyphens
    .replace(/^-|-$/g, '')    // Remove leading/trailing hyphens
    .substring(0, 50);        // Limit length
}

// Generate customer slug
function generateCustomerSlug(customerName) {
  if (!customerName || customerName === 'Unassigned') return 'unassigned';
  return generateSlug(customerName);
}

// Generate category slug from title (basic categorization)
function generateCategorySlug(title) {
  const title_lower = title.toLowerCase();

  // Basic category detection
  if (title_lower.includes('sofa') || title_lower.includes('couch') || title_lower.includes('ספה')) return 'sofas';
  if (title_lower.includes('chair') || title_lower.includes('כיסא') || title_lower.includes('כורסא')) return 'chairs';
  if (title_lower.includes('table') || title_lower.includes('שולחן')) return 'tables';
  if (title_lower.includes('bed') || title_lower.includes('מיטה')) return 'beds';
  if (title_lower.includes('cabinet') || title_lower.includes('ארון')) return 'cabinets';
  if (title_lower.includes('desk') || title_lower.includes('שולחן עבודה')) return 'desks';
  if (title_lower.includes('wallpaper') || title_lower.includes('טפט')) return 'wallpapers';

  return 'furniture'; // Default category
}

// Build SEO-friendly URL
function buildProductUrl(customerSlug, productSlug, productId, variantSlug = null) {
  let url = `/f/${customerSlug}/${productSlug}-${productId}`;
  if (variantSlug) {
    url += `/${variantSlug}`;
  }
  return url;
}

// Build QR URL
function buildQRUrl(customerSlug, productSlug, productId, variantSlug = null) {
  let url = `/qr/${customerSlug}/${productSlug}-${productId}`;
  if (variantSlug) {
    url += `-${variantSlug}`;
  }
  url += '.svg';
  return url;
}

// Export URL utilities
export {
  generateSlug,
  generateCustomerSlug,
  generateCategorySlug,
  buildProductUrl,
  buildQRUrl
};

// Import QR persistence helper (lazy load to avoid circular deps)
// TODO: Re-enable once qr-persistence.js module issues are resolved
// let qrPersistence = null;
// async function getQRPersistence() {
//   if (!qrPersistence) {
//     qrPersistence = await import('./qr-persistence.js');
//   }
//   return qrPersistence;
// }

/**
 * Save model to Supabase
 */
export async function saveModel({
  title,
  description,
  filename,
  awsUrl,
  awsFilename,
  storageLocation = 'aws',
  fileSize,
  customerId = 'unassigned',
  customerName = 'Unassigned',
  dominantColor = '#6b7280',
  productUrl = null,
  metadata = {},
  dimensions = null,
  sku = null,
  category = null,
  arPlacement = 'floor'
}) {
  // Check if Supabase is initialized
  if (!supabase) {
    console.error('❌ Supabase not initialized - cannot save model');
    throw new Error('Database connection not configured');
  }

  // Dynamic import for nanoid to avoid ES module issues
  const { nanoid } = await import('nanoid');
  const id = nanoid(8);

  // Generate URL slugs
  const productTitle = title || filename.replace(/\.(glb|gltf)$/i, '');
  const urlSlug = generateSlug(productTitle);
  const categorySlug = generateCategorySlug(productTitle);
  const customerSlug = generateCustomerSlug(customerName);

  try {
    console.log('🔍 SaveModel params:', { title, description, filename, awsUrl, awsFilename, fileSize, customerId, customerName, sku });
    console.log('🏷️ Generated slugs:', { urlSlug, categorySlug, customerSlug });
    
    const insertData = {
      id,
      title: title || filename,
      description: description || '',
      filename,
      aws_url: awsUrl,
      aws_filename: awsFilename,
      storage_location: 'aws',
      file_size: fileSize,
      customer_id: customerId,
      customer_name: customerName,
      dominant_color: dominantColor,
      product_url: productUrl,
      metadata: metadata || {},
      // New URL slug columns
      url_slug: urlSlug,
      category_slug: categorySlug,
      customer_slug: customerSlug,
      // SKU column (user-provided or NULL)
      sku: sku || null,
      // Product category columns
      product_category: category || null,
      // AR placement type (floor or wall)
      ar_placement: arPlacement || 'floor'
    };
    
    // Add dimensions if provided
    if (dimensions) {
      insertData.width_meters = dimensions.width;
      insertData.height_meters = dimensions.height; 
      insertData.depth_meters = dimensions.depth;
      insertData.dimension_unit = dimensions.unit || 'cm';
      insertData.dimension_notes = dimensions.notes || null;
      console.log('📏 Adding dimensions to insert data:', {
        width: dimensions.width,
        height: dimensions.height,
        depth: dimensions.depth,
        unit: dimensions.unit
      });
    }
    
    console.log('🔍 Insert data:', insertData);
    
    const { data, error } = await supabase
      .from('models')
      .insert([insertData])
      .select();

    if (error) {
      console.error('❌ Supabase insert error:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('✅ SaveModel successful, inserted:', data[0]);

    // TODO: Re-enable QR generation once module issues are resolved
    // Generate and persist QR code asynchronously (don't block the upload)
    // setTimeout(async () => {
    //   try {
    //     const qr = await getQRPersistence();
    //     const modelUrl = `https://newfurniture.live/view?id=${id}`;
    //     const qrResult = await qr.generateAndPersistQR(modelUrl, {}, id);
    //     console.log(`✅ QR generated for model ${id}:`, qrResult.qr_code_url);
    //   } catch (qrError) {
    //     console.error(`❌ QR generation failed for model ${id}:`, qrError);
    //     // Don't fail the upload if QR fails - it can be regenerated later
    //   }
    // }, 100);

    return { id, success: true };
  } catch (error) {
    console.error('💥 SaveModel exception:', error);
    console.error('💥 Error name:', error.name);
    console.error('💥 Error message:', error.message);
    console.error('💥 Error stack:', error.stack);
    return { success: false, error: error.message };
  }
}

/**
 * Get model by ID
 */
export async function getModel(id) {
  try {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Supabase get error:', error);
    return null;
  }
}

/**
 * Increment view count
 */
export async function incrementViewCount(modelId, variantId = null) {
  try {
    // First, get the current view count
    const { data: model, error: fetchError } = await supabase
      .from('models')
      .select('view_count')
      .eq('id', modelId)
      .single();
      
    if (fetchError) {
      console.error('Error fetching model for view increment:', fetchError);
      return { success: false };
    }
    
    // Increment the total model view count
    const newViewCount = (model.view_count || 0) + 1;
    
    const { error: updateError } = await supabase
      .from('models')
      .update({ view_count: newViewCount })
      .eq('id', modelId);
      
    if (updateError) {
      console.error('Error updating model view count:', updateError);
      return { success: false };
    }
    
    // Record the specific view with variant info (for future analytics)
    try {
      await supabase
        .from('model_views')
        .insert({
          model_id: modelId,
          variant_id: variantId,
          viewed_at: new Date().toISOString()
        });
      console.log(`📊 View recorded: model ${modelId}, variant: ${variantId || 'original'}`);
    } catch (viewsError) {
      // If model_views table doesn't exist yet, just log - don't fail the main operation
      console.warn('Could not record detailed view (table may not exist):', viewsError.message);
    }
    
    console.log(`Total view count incremented for model ${modelId}: ${newViewCount}`);
    return { success: true };
  } catch (error) {
    console.error('Supabase increment error:', error);
    return { success: false };
  }
}

/**
 * Get all models
 */
export async function getAllModels(limit = 100, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Supabase list error:', error);
    return [];
  }
}

/**
 * Get models by customer ID
 */
export async function getModelsByCustomer(customerId, limit = 100, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('models')
      .select('*')
      .eq('customer_id', customerId)
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Supabase customer list error:', error);
    return [];
  }
}

/**
 * Get all customers with model counts (UNIVERSAL - includes both models table and users table)
 */
export async function getCustomers() {
  try {
    // Get customers from models table (customers with furniture)
    const { data: modelsData, error: modelsError } = await supabase
      .from('models')
      .select('customer_id, customer_name')
      .order('customer_name');

    if (modelsError) throw modelsError;

    // Get customers from users table (all customer users, even without furniture)
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('customer_id, customer_name')
      .eq('role', 'customer')
      .not('customer_id', 'is', null)
      .order('customer_name');

    // Don't throw error if users table doesn't exist - just continue with models data
    const allUsersData = usersError ? [] : (usersData || []);

    // Group by customer and count models
    const customerMap = new Map();
    
    // First, add all customers from users table (ensures even customers with no furniture appear)
    allUsersData.forEach(user => {
      if (user.customer_id && user.customer_name) {
        customerMap.set(user.customer_id, {
          id: user.customer_id,
          name: user.customer_name,
          count: 0
        });
      }
    });
    
    // Then, add/update customers from models and count their furniture
    modelsData.forEach(model => {
      const key = model.customer_id;
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          id: model.customer_id,
          name: model.customer_name,
          count: 0
        });
      }
      customerMap.get(key).count++;
    });

    console.log(`🔄 Universal customers loaded: ${customerMap.size} total (${allUsersData.length} from users, models from ${modelsData.length} furniture)`);
    return Array.from(customerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Supabase customers error:', error);
    return [{ id: 'unassigned', name: 'Unassigned', count: 0 }];
  }
}

/**
 * Delete model
 */
export async function deleteModel(id) {
  try {
    const { error } = await supabase
      .from('models')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Supabase delete error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get statistics
 */
export async function getStats() {
  try {
    const { data: models, error } = await supabase
      .from('models')
      .select('view_count, file_size');

    if (error) throw error;

    const stats = models.reduce((acc, model) => ({
      totalModels: acc.totalModels + 1,
      totalViews: acc.totalViews + (model.view_count || 0),
      totalSize: acc.totalSize + (model.file_size || 0)
    }), { totalModels: 0, totalViews: 0, totalSize: 0 });

    return stats;
  } catch (error) {
    console.error('Supabase stats error:', error);
    return { totalModels: 0, totalViews: 0, totalSize: 0 };
  }
}

/**
 * Update model customer assignment and ensure user exists
 */
export async function updateModelCustomer(modelId, customerId, customerName) {
  try {
    // First, ensure the customer exists as a user
    await ensureCustomerUserExists(customerId, customerName);
    
    const { data, error } = await supabase
      .from('models')
      .update({ 
        customer_id: customerId, 
        customer_name: customerName 
      })
      .eq('id', modelId)
      .select();

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (error) {
    console.error('Supabase update customer error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ensure a customer exists as a user record
 */
async function ensureCustomerUserExists(customerId, customerName) {
  try {
    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('customer_id', customerId)
      .single();
      
    if (existingUser) {
      console.log(`User already exists for customer ${customerId}`);
      return;
    }
    
    // Create user record for this customer
    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('nanoid');
    
    const userId = nanoid(8);
    const defaultPassword = `${customerId}123`; // Simple default password
    const hashedPassword = await bcrypt.default.hash(defaultPassword, 10);
    
    const { error: createError } = await supabase
      .from('users')
      .insert([{
        id: userId,
        username: customerId,
        password_hash: hashedPassword,
        role: 'customer',
        customer_id: customerId,
        customer_name: customerName,
        is_active: true
      }]);
      
    if (createError) {
      console.error('Error creating user for customer:', createError);
    } else {
      console.log(`Created user for customer ${customerId} with default password: ${defaultPassword}`);
    }
    
  } catch (error) {
    console.error('Error ensuring customer user exists:', error);
  }
}

/**
 * Migrate existing customers to users (one-time migration)
 */
export async function migrateCustomersToUsers() {
  try {
    console.log('🚀 Starting migration...');
    
    // Get all unique customers from models
    const customers = await getCustomers();
    console.log(`📊 Found ${customers.length} customers:`, customers);
    
    const bcrypt = await import('bcryptjs');
    const { nanoid } = await import('nanoid');
    
    let migratedCount = 0;
    let existingCount = 0;
    const migrationResults = [];
    
    for (const customer of customers) {
      if (customer.id === 'unassigned') {
        console.log('⏭️ Skipping unassigned customer');
        continue;
      }
      
      console.log(`🔍 Checking customer: ${customer.id} (${customer.name})`);
      
      // Check if user already exists
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, username')
        .eq('customer_id', customer.id)
        .single();
        
      if (checkError && checkError.code !== 'PGRST116') {
        console.error(`❌ Error checking user for ${customer.id}:`, checkError);
        continue;
      }
        
      if (existingUser) {
        console.log(`✅ User already exists for ${customer.id}: ${existingUser.username}`);
        existingCount++;
        migrationResults.push({ customer: customer.id, status: 'exists', username: existingUser.username });
      } else {
        console.log(`🆕 Creating user for ${customer.id}...`);
        
        const userId = nanoid(8);
        const defaultPassword = `${customer.id}123`;
        const hashedPassword = await bcrypt.default.hash(defaultPassword, 10);
        
        const { error: createError } = await supabase
          .from('users')
          .insert([{
            id: userId,
            username: customer.id,
            password_hash: hashedPassword,
            role: 'customer',
            customer_id: customer.id,
            customer_name: customer.name,
            is_active: true
          }]);
          
        if (createError) {
          console.error(`❌ Failed to create user for ${customer.id}:`, createError);
          migrationResults.push({ customer: customer.id, status: 'failed', error: createError.message });
        } else {
          migratedCount++;
          console.log(`✅ Created user for ${customer.id} with password: ${defaultPassword}`);
          migrationResults.push({ customer: customer.id, status: 'created', username: customer.id, password: defaultPassword });
        }
      }
    }
    
    console.log(`🎉 Migration complete! Created: ${migratedCount}, Existing: ${existingCount}`);
    console.log('📋 Migration results:', migrationResults);
    
    return { 
      success: true, 
      migratedCount, 
      existingCount, 
      totalCustomers: customers.length,
      results: migrationResults
    };
  } catch (error) {
    console.error('💥 Migration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save model variant to Supabase
 */
export async function saveModelVariant({
  parentModelId,
  variantName,
  hexColor,
  awsUrl,
  storageLocation = 'aws',
  fileSize,
  isPrimary = false,
  variantType = 'upload',
  productUrl = null,
  dimensionsText = null,
  sku = null
}) {
  // Check if Supabase is initialized
  if (!supabase) {
    console.error('❌ Supabase not initialized - cannot save variant');
    throw new Error('Database connection not configured');
  }

  const { nanoid } = await import('nanoid');
  const id = nanoid(8);
  
  try {
    console.log('🎨 Attempting to save variant:', {
      id,
      parentModelId,
      variantName,
      hexColor,
      variantType,
      sku,
      awsUrl
    });

    const { data, error } = await supabase
      .from('model_variants')
      .insert([
        {
          id,
          parent_model_id: parentModelId,
          variant_name: variantName,
          hex_color: hexColor,
          aws_url: awsUrl,
          storage_location: 'aws',
          file_size: fileSize,
          is_primary: isPrimary,
          variant_type: variantType,
          product_url: productUrl,
          dimensions_text: dimensionsText,
          sku: sku || null
        }
      ])
      .select();

    if (error) {
      console.error('❌ Variant save error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      
      // Check if it's a table missing error
      if (error.code === '42P01') {
        throw new Error('model_variants table does not exist. Please create it first.');
      }
      
      throw error;
    }

    console.log('✅ Variant saved successfully:', data[0]);

    // TODO: Re-enable QR generation once module issues are resolved
    // Generate and persist QR code asynchronously (don't block the upload)
    // setTimeout(async () => {
    //   try {
    //     const qr = await getQRPersistence();
    //     const variantUrl = `https://newfurniture.live/view?id=${parentModelId}&variant=${id}`;
    //     const qrResult = await qr.generateAndPersistQR(variantUrl, {}, parentModelId, id);
    //     console.log(`✅ QR generated for variant ${id}:`, qrResult.qr_code_url);
    //   } catch (qrError) {
    //     console.error(`❌ QR generation failed for variant ${id}:`, qrError);
    //     // Don't fail the upload if QR fails - it can be regenerated later
    //   }
    // }, 100);

    return { id, success: true, data: data[0] };
  } catch (error) {
    console.error('💥 Supabase save variant error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all variants for a model
 */
export async function getModelVariants(modelId) {
  try {
    const { data, error } = await supabase
      .from('model_variants')
      .select('*')
      .eq('parent_model_id', modelId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Supabase get variants error:', error);
    return [];
  }
}

/**
 * Get models with their variants
 */
export async function getModelsWithVariants(limit = 100, offset = 0) {
  try {
    // Get models
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('*')
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (modelsError) throw modelsError;

    // DEBUG: Log what SKU data we're getting from database
    console.log('🗄️ RAW DATABASE MODELS WITH SKUs:');
    models.forEach(model => {
      if (model.sku) {
        console.log(`   📦 ${model.id}: SKU="${model.sku}" (${typeof model.sku})`);
      } else {
        console.log(`   📦 ${model.id}: NO SKU (${typeof model.sku})`);
      }
    });

    // Get variants for all models
    const modelIds = models.map(m => m.id);
    const { data: variants, error: variantsError } = await supabase
      .from('model_variants')
      .select('*')
      .in('parent_model_id', modelIds)
      .order('is_primary', { ascending: false });

    if (variantsError) throw variantsError;

    // Group variants by model
    const variantsByModel = variants.reduce((acc, variant) => {
      if (!acc[variant.parent_model_id]) {
        acc[variant.parent_model_id] = [];
      }
      acc[variant.parent_model_id].push(variant);
      return acc;
    }, {});

    // Add variants to models
    const modelsWithVariants = models.map(model => ({
      ...model,
      variants: variantsByModel[model.id] || []
    }));

    // DEBUG: Log final API response data
    console.log('🚀 FINAL API RESPONSE MODELS WITH SKUs:');
    modelsWithVariants.forEach(model => {
      if (model.sku) {
        console.log(`   📤 ${model.id}: SKU="${model.sku}" (${typeof model.sku}) - SENDING TO FRONTEND`);
      } else {
        console.log(`   📤 ${model.id}: NO SKU (${typeof model.sku}) - SENDING TO FRONTEND`);
      }
    });

    return modelsWithVariants;
  } catch (error) {
    console.error('Supabase get models with variants error:', error);
    return [];
  }
}

/**
 * Get models by customer with their variants
 */
export async function getModelsByCustomerWithVariants(customerId, limit = 100, offset = 0) {
  try {
    // Get models for this customer
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('*')
      .eq('customer_id', customerId)
      .order('upload_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (modelsError) throw modelsError;

    // Get variants for these models
    const modelIds = models.map(m => m.id);
    if (modelIds.length === 0) return [];

    const { data: variants, error: variantsError } = await supabase
      .from('model_variants')
      .select('*')
      .in('parent_model_id', modelIds)
      .order('is_primary', { ascending: false });

    if (variantsError) throw variantsError;

    // Group variants by model
    const variantsByModel = variants.reduce((acc, variant) => {
      if (!acc[variant.parent_model_id]) {
        acc[variant.parent_model_id] = [];
      }
      acc[variant.parent_model_id].push(variant);
      return acc;
    }, {});

    // Add variants to models
    const modelsWithVariants = models.map(model => ({
      ...model,
      variants: variantsByModel[model.id] || []
    }));

    return modelsWithVariants;
  } catch (error) {
    console.error('Supabase get customer models with variants error:', error);
    return [];
  }
}

/**
 * Delete model variant
 */
export async function deleteModelVariant(variantId) {
  try {
    const { error } = await supabase
      .from('model_variants')
      .delete()
      .eq('id', variantId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Supabase delete variant error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Set primary variant for a model (only one can be primary)
 */
export async function setPrimaryVariant(modelId, variantId) {
  try {
    // First, unset all variants for this model as primary
    const { error: unsetError } = await supabase
      .from('model_variants')
      .update({ is_primary: false })
      .eq('parent_model_id', modelId);

    if (unsetError) throw unsetError;

    // Then set the specified variant as primary
    const { error: setPrimaryError } = await supabase
      .from('model_variants')
      .update({ is_primary: true })
      .eq('id', variantId);

    if (setPrimaryError) throw setPrimaryError;

    return { success: true };
  } catch (error) {
    console.error('Supabase set primary variant error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Execute a raw SQL query (Supabase compatible)
 */
export async function query(sql, params = []) {
  try {
    console.log('Executing query:', sql, params);
    
    // Handle user queries specifically
    if (sql.includes('SELECT') && sql.includes('users')) {
      if (sql.includes('SUM(m.view_count)')) {
        // This is the users with view counts query
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, username, role, customer_id, customer_name, is_active, created_at');
          
        if (usersError) throw usersError;
        
        // Get view counts for each customer
        const { data: models, error: modelsError } = await supabase
          .from('models')
          .select('customer_id, view_count');
          
        if (modelsError) throw modelsError;
        
        // Calculate total views per customer
        const viewCounts = {};
        models.forEach(model => {
          if (model.customer_id) {
            viewCounts[model.customer_id] = (viewCounts[model.customer_id] || 0) + (model.view_count || 0);
          }
        });
        
        // Add total_views to users
        const usersWithViews = users.map(user => ({
          ...user,
          total_views: user.role === 'customer' ? (viewCounts[user.customer_id] || 0) : 0
        }));
        
        return { success: true, data: usersWithViews };
      }
      
      // Handle login query - SELECT * FROM users WHERE username = '...' AND is_active = true
      if (sql.includes("WHERE username = '") && sql.includes('AND is_active = true')) {
        const usernameMatch = sql.match(/WHERE username = '([^']+)'/);
        if (usernameMatch) {
          const username = usernameMatch[1];
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .single();
            
          if (error) {
            if (error.code === 'PGRST116') { // No rows found
              return { success: true, data: [] };
            }
            throw error;
          }
          
          return { success: true, data: [data] };
        }
      }
    }
    
    if (sql.includes('UPDATE users SET password_hash')) {
      const [hashedPassword, userId] = params;
      const { error } = await supabase
        .from('users')
        .update({ password_hash: hashedPassword })
        .eq('id', userId);
        
      if (error) throw error;
      return { success: true };
    }
    
    if (sql.includes('UPDATE users SET is_active = NOT is_active')) {
      const [userId] = params;
      
      // First get user info including username and role
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('is_active, username, role')
        .eq('id', userId)
        .single();
        
      if (fetchError) throw fetchError;
      
      // Protect admin users from deactivation
      if (user.username === 'admin' || user.role === 'admin') {
        throw new Error('Cannot deactivate admin user');
      }
      
      // Toggle the status
      const { error: updateError } = await supabase
        .from('users')
        .update({ is_active: !user.is_active })
        .eq('id', userId);
        
      if (updateError) throw updateError;
      return { success: true };
    }
    
    // Handle UPDATE queries on models table
    if (sql.includes('UPDATE models') && sql.includes('SET')) {
      // Extract the WHERE clause to get the ID
      const whereMatch = sql.match(/WHERE id = \$(\d+)/);
      if (!whereMatch) {
        throw new Error('UPDATE models query must include WHERE id = parameter');
      }

      const whereParamIndex = parseInt(whereMatch[1]) - 1; // Convert to 0-based index
      const modelId = params[whereParamIndex];

      if (!modelId) {
        throw new Error('Model ID is required for update');
      }

      // Build update object from SET clause
      const updateData = {};

      // Check for title update
      if (sql.includes('title =')) {
        const titleMatch = sql.match(/title = \$(\d+)/);
        if (titleMatch) {
          const titleParamIndex = parseInt(titleMatch[1]) - 1;
          updateData.title = params[titleParamIndex];
        }
      }

      // Check for product_url update
      if (sql.includes('product_url =')) {
        const urlMatch = sql.match(/product_url = \$(\d+)/);
        if (urlMatch) {
          const urlParamIndex = parseInt(urlMatch[1]) - 1;
          updateData.product_url = params[urlParamIndex];
        }
      }

      // Check for product_category update
      if (sql.includes('product_category =')) {
        const categoryMatch = sql.match(/product_category = \$(\d+)/);
        if (categoryMatch) {
          const categoryParamIndex = parseInt(categoryMatch[1]) - 1;
          updateData.product_category = params[categoryParamIndex];
          console.log('📁 MODEL CATEGORY UPDATE:', params[categoryParamIndex]);
        }
      }

      // Check for sku update
      if (sql.includes('sku =')) {
        console.log('🏷️ MODEL SKU UPDATE DETECTED in SQL:', sql);
        const skuMatch = sql.match(/sku\s*=\s*\$(\d+)/);
        if (skuMatch) {
          const skuParamIndex = parseInt(skuMatch[1]) - 1;
          updateData.sku = params[skuParamIndex];
          console.log('🏷️ MODEL SKU PARAM EXTRACTED:', params[skuParamIndex], 'from index', skuParamIndex);
        } else {
          console.log('🏷️ MODEL SKU REGEX FAILED TO MATCH in SQL:', sql);
        }
      }

      console.log('🔄 Updating model:', modelId, 'with data:', updateData);

      const { error } = await supabase
        .from('models')
        .update(updateData)
        .eq('id', modelId);

      if (error) throw error;
      return { success: true };
    }
    
    // Handle UPDATE queries on model_variants table
    if (sql.includes('UPDATE model_variants') && sql.includes('SET')) {
      const whereMatch = sql.match(/WHERE id = \$(\d+)/);
      if (!whereMatch) {
        throw new Error('UPDATE model_variants query must include WHERE id = parameter');
      }
      
      const whereParamIndex = parseInt(whereMatch[1]) - 1;
      const variantId = params[whereParamIndex];
      
      if (!variantId) {
        throw new Error('Variant ID is required for update');
      }
      
      const updateData = {};
      
      if (sql.includes('product_url =')) {
        const urlMatch = sql.match(/product_url = \$(\d+)/);
        if (urlMatch) {
          const urlParamIndex = parseInt(urlMatch[1]) - 1;
          updateData.product_url = params[urlParamIndex];
        }
      }

      // Check for sku update
      if (sql.includes('sku =')) {
        console.log('🏷️ VARIANT SKU UPDATE DETECTED in SQL:', sql);
        const skuMatch = sql.match(/sku\s*=\s*\$(\d+)/);
        if (skuMatch) {
          const skuParamIndex = parseInt(skuMatch[1]) - 1;
          updateData.sku = params[skuParamIndex];
          console.log('🏷️ VARIANT SKU PARAM EXTRACTED:', params[skuParamIndex], 'from index', skuParamIndex);
        } else {
          console.log('🏷️ VARIANT SKU REGEX FAILED TO MATCH in SQL:', sql);
        }
      }

      console.log('🔄 Updating variant:', variantId, 'with data:', updateData);
      
      const { error } = await supabase
        .from('model_variants')
        .update(updateData)
        .eq('id', variantId);
        
      if (error) throw error;
      return { success: true };
    }
    
    // Handle customer_categories table operations
    if (sql.includes('customer_categories')) {
      // Handle INSERT INTO customer_categories
      if (sql.includes('INSERT INTO customer_categories')) {
        const [customerId, categoryName, categorySlug] = params;

        // Check if category already exists
        const { data: existing } = await supabase
          .from('customer_categories')
          .select('*')
          .eq('customer_id', customerId)
          .eq('category_slug', categorySlug)
          .single();

        if (existing) {
          // Update existing category
          const { data, error } = await supabase
            .from('customer_categories')
            .update({ category_name: categoryName })
            .eq('customer_id', customerId)
            .eq('category_slug', categorySlug)
            .select();

          if (error) throw error;
          return { success: true, data };
        } else {
          // Insert new category
          const { data, error } = await supabase
            .from('customer_categories')
            .insert({
              customer_id: customerId,
              category_name: categoryName,
              category_slug: categorySlug
            })
            .select();

          if (error) throw error;
          return { success: true, data };
        }
      }

      // Handle SELECT FROM customer_categories
      if (sql.includes('SELECT') && sql.includes('FROM customer_categories')) {
        const [customerId] = params;
        const { data, error } = await supabase
          .from('customer_categories')
          .select('id, category_name, category_slug, display_order')
          .eq('customer_id', customerId)
          .order('display_order')
          .order('category_name');

        if (error) throw error;
        return { success: true, data: data || [] };
      }

      // Handle DELETE FROM customer_categories
      if (sql.includes('DELETE FROM customer_categories')) {
        const [categoryId, customerId] = params;
        const { error } = await supabase
          .from('customer_categories')
          .delete()
          .eq('id', categoryId)
          .eq('customer_id', customerId);

        if (error) throw error;
        return { success: true };
      }
    }

    // Handle ALTER TABLE queries (for migrations)
    if (sql.includes('ALTER TABLE') && sql.includes('ADD COLUMN')) {
      // For ALTER TABLE queries, we'll return success since we can't execute these through Supabase client
      // These need to be run manually in the Supabase SQL editor
      console.log('⚠️  ALTER TABLE query detected - this needs to be run manually in Supabase SQL editor');
      console.log('SQL:', sql);
      throw new Error('ALTER TABLE queries must be run manually in Supabase SQL editor');
    }

    // If we get here, it's an unsupported query
    throw new Error('Unsupported query type: ' + sql.substring(0, 50));

  } catch (error) {
    console.error('Query error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * URL Slug Migration Functions
 */

// Generate slugs for existing models that don't have them
export async function migrateModelSlugs() {
  try {
    console.log('🔄 Starting URL slug migration for existing models...');

    // Get all models that don't have URL slugs
    const { data: modelsToUpdate, error: fetchError } = await supabase
      .from('models')
      .select('id, title, filename, customer_name')
      .or('url_slug.is.null,category_slug.is.null,customer_slug.is.null');

    if (fetchError) {
      console.error('❌ Error fetching models for migration:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!modelsToUpdate || modelsToUpdate.length === 0) {
      console.log('✅ No models need slug migration');
      return { success: true, updated: 0 };
    }

    console.log(`📝 Found ${modelsToUpdate.length} models to update`);
    let updatedCount = 0;

    // Update each model with generated slugs
    for (const model of modelsToUpdate) {
      try {
        const productTitle = model.title || model.filename.replace(/\.(glb|gltf)$/i, '');
        const urlSlug = generateSlug(productTitle);
        const categorySlug = generateCategorySlug(productTitle);
        const customerSlug = generateCustomerSlug(model.customer_name);

        const { error: updateError } = await supabase
          .from('models')
          .update({
            url_slug: urlSlug,
            category_slug: categorySlug,
            customer_slug: customerSlug
          })
          .eq('id', model.id);

        if (updateError) {
          console.error(`❌ Error updating model ${model.id}:`, updateError);
        } else {
          console.log(`✅ Updated slugs for model ${model.id}: ${urlSlug}`);
          updatedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing model ${model.id}:`, error);
      }
    }

    console.log(`🎉 Migration complete! Updated ${updatedCount} models`);
    return { success: true, updated: updatedCount };

  } catch (error) {
    console.error('❌ Migration error:', error);
    return { success: false, error: error.message };
  }
}

// URL Resolution Functions
export async function resolveUrlToModel(customerSlug, productSlugWithId, variantSlug = null) {
  try {
    // Extract ID from product slug (format: "product-slug-ID")
    const match = productSlugWithId.match(/^(.+)-([a-zA-Z0-9_-]{8})$/);
    if (!match) {
      return { success: false, error: 'Invalid product URL format' };
    }

    const [, expectedSlug, modelId] = match;

    // Get model by ID
    const { data: model, error } = await supabase
      .from('models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (error || !model) {
      return { success: false, error: 'Model not found' };
    }

    // Verify slugs match (for SEO consistency)
    if (model.customer_slug !== customerSlug || model.url_slug !== expectedSlug) {
      console.warn('⚠️ URL slug mismatch, but ID is valid. Allowing access.');
      // We could redirect to correct URL here in the future
    }

    return {
      success: true,
      model,
      variantSlug
    };

  } catch (error) {
    console.error('URL resolution error:', error);
    return { success: false, error: error.message };
  }
}