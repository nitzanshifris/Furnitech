/**
 * Save model metadata after successful S3 upload
 * Called after direct browser upload to S3
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'save-model-metadata endpoint is working',
      timestamp: new Date().toISOString()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🚀 SAVE METADATA REQUEST STARTED');

    // Import the functions inside the handler
    let saveModel, saveModelVariant;
    try {
      const supabaseModule = await import('../lib/supabase.js');
      saveModel = supabaseModule.saveModel;
      saveModelVariant = supabaseModule.saveModelVariant;
      console.log('✅ Supabase module loaded successfully');
    } catch (importError) {
      console.error('❌ Failed to import from supabase.js:', importError);
      return res.status(500).json({
        error: 'Server configuration error: Unable to load database functions',
        details: importError.message,
        stack: importError.stack
      });
    }

    // Check if body exists
    if (!req.body) {
      console.error('❌ No request body received');
      return res.status(400).json({ error: 'No request body' });
    }
    // Log incoming request data
    console.log('📥 Incoming save-model-metadata request:', {
      method: req.method,
      body: req.body,
      headers: req.headers
    });

    const {
      modelId,
      awsUrl,
      fileSize,
      title,
      description,
      sku,
      customerId,
      customerName,
      isVariant,
      parentModelId,
      variantName,
      hexColor,
      variantType,
      dimensionsText,
      variantProductUrl,  // Client sends this for variants
      productUrl,  // Sometimes sent as productUrl
      ar_placement  // AR placement type (floor or wall)
    } = req.body;

    let result;

    if (isVariant && parentModelId) {
      // Save as variant
      console.log('💾 Saving variant with params:', {
        parentModelId,
        variantName: variantName || title,
        modelId,
        awsUrl,
        fileSize,
        hexColor: hexColor || '#6b7280',
        variantType: variantType || 'upload'
      });

      try {
        result = await saveModelVariant({
          parentModelId,
          variantName: variantName || title,
          hexColor: hexColor || '#6b7280',
          awsUrl,
          storageLocation: 'aws',
          fileSize,
          sku: sku || null,
          variantType: variantType || 'upload',
          dimensionsText: dimensionsText || null,
          productUrl: variantProductUrl || productUrl || null, // Handle both field names
          isPrimary: false
        });

        console.log('✅ Variant save result:', result);
      } catch (variantError) {
        console.error('❌ Variant save error:', variantError);
        throw new Error(`Variant save failed: ${variantError.message}`);
      }
    } else {
      // Save as regular model
      console.log('💾 Saving regular model with params:', {
        title: title || 'Untitled Model',
        modelId,
        awsUrl,
        fileSize,
        customerId: customerId || 'unassigned'
      });

      console.log('📝 About to save model with params:', {
        title: title || 'Untitled Model',
        arPlacement: ar_placement || 'floor',
        customerId: customerId || 'unassigned'
      });

      try {
        result = await saveModel({
          title: title || 'Untitled Model',
          description: description || '',
          filename: `${modelId}.glb`,
          awsUrl,
          awsFilename: `${modelId}.glb`,
          storageLocation: 'aws',
          fileSize,
          customerId: customerId || 'unassigned',
          customerName: customerName || 'Unassigned',
          sku: sku || null,
          dominantColor: '#6b7280',
          // arPlacement: ar_placement || 'floor', // Temporarily disabled until migration runs
          metadata: {
            uploadedAt: new Date().toISOString(),
            uploadMethod: 'direct-s3'
          }
        });

        console.log('✅ Model save result:', result);
      } catch (modelError) {
        console.error('❌ Model save error details:', {
          message: modelError.message,
          stack: modelError.stack,
          name: modelError.name,
          code: modelError.code
        });
        throw new Error(`Model save failed: ${modelError.message}`);
      }
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to save model metadata');
    }

    return res.status(200).json({
      success: true,
      modelId: result.id,
      message: isVariant ? 'Variant saved successfully' : 'Model saved successfully',
      viewUrl: `/view?id=${result.id}`,
      directUrl: awsUrl
    });

  } catch (error) {
    console.error('Error saving model metadata:', error);
    console.error('Stack trace:', error.stack);

    // Always return detailed error in response for debugging
    return res.status(500).json({
      error: 'Failed to save model metadata',
      details: error.message,
      stack: error.stack
    });
  }
}