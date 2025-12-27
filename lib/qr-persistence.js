/**
 * QR Code Persistence Layer for 100% Uptime
 * Handles QR generation, caching, and fallback strategies
 */

import { supabase } from './supabase.js';
import { generateQR } from './qr-generator.js';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary (needed for this module)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Generate and persist QR code with multiple fallback strategies
 * @param {string} url - URL to encode
 * @param {object} options - QR generation options
 * @param {string} modelId - Model ID for storage
 * @param {string} variantId - Optional variant ID
 * @returns {Promise<object>} - QR code URL and metadata
 */
async function generateAndPersistQR(url, options = {}, modelId, variantId = null) {
  const startTime = Date.now();

  try {
    // Step 1: Check if QR already exists in database
    const existingQR = await getExistingQR(modelId, variantId);
    if (existingQR && !isQRExpired(existingQR.qr_generated_at)) {
      console.log(`✅ Using cached QR for ${variantId || modelId}`);
      return {
        success: true,
        qr_code_url: existingQR.qr_code_url,
        source: 'cache',
        cached_at: existingQR.qr_generated_at
      };
    }

    // Step 2: Generate QR locally (primary method)
    let qrData = null;
    let generationMethod = null;

    try {
      const qrResult = await generateQR(url, {
        format: 'svg', // SVG is best for storage (smaller, scalable)
        size: options.size || 512,
        errorCorrectionLevel: options.errorCorrectionLevel || 'H', // High for reliability
        ...options
      });

      qrData = qrResult.data.qr_code;
      generationMethod = 'local';
      console.log(`✅ Generated QR locally for ${variantId || modelId}`);

    } catch (localError) {
      console.error('❌ Local QR generation failed:', localError);

      // Step 3: Fallback to external API
      qrData = await generateQRFallback(url, options);
      generationMethod = 'fallback';
      console.log(`⚠️ Used fallback QR generation for ${variantId || modelId}`);
    }

    // Step 4: Upload to Cloudinary for persistence
    const cloudinaryUrl = await uploadQRToCloudinary(qrData, modelId, variantId);

    // Step 5: Save URL to database
    await saveQRToDatabase(cloudinaryUrl, modelId, variantId);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      qr_code_url: cloudinaryUrl,
      source: generationMethod,
      processing_time_ms: processingTime,
      generated_at: new Date().toISOString()
    };

  } catch (error) {
    console.error('❌ QR persistence failed:', error);

    // Last resort: Generate a temporary QR without persistence
    try {
      const emergencyQR = await generateEmergencyQR(url);
      return {
        success: true,
        qr_code_url: emergencyQR,
        source: 'emergency',
        warning: 'QR generated but not persisted',
        error: error.message
      };
    } catch (emergencyError) {
      throw new Error(`Complete QR generation failure: ${emergencyError.message}`);
    }
  }
}

/**
 * Check if existing QR exists in database
 */
async function getExistingQR(modelId, variantId) {
  try {
    if (variantId) {
      const { data, error } = await supabase
        .from('model_variants')
        .select('qr_code_url, qr_generated_at')
        .eq('id', variantId)
        .single();

      if (!error && data?.qr_code_url) {
        return data;
      }
    } else {
      const { data, error } = await supabase
        .from('models')
        .select('qr_code_url, qr_generated_at')
        .eq('id', modelId)
        .single();

      if (!error && data?.qr_code_url) {
        return data;
      }
    }
  } catch (error) {
    console.warn('Could not check existing QR:', error);
  }

  return null;
}

/**
 * Check if QR code is expired (older than 30 days)
 */
function isQRExpired(generatedAt) {
  if (!generatedAt) return true;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return new Date(generatedAt) < thirtyDaysAgo;
}

/**
 * Fallback QR generation using external API
 */
async function generateQRFallback(url, options = {}) {
  const size = options.size || 512;
  const errorCorrection = options.errorCorrectionLevel || 'H';

  // Using qr-server.com as fallback
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=${errorCorrection}&data=${encodeURIComponent(url)}&format=svg`;

  const response = await fetch(qrApiUrl);
  if (!response.ok) {
    throw new Error(`Fallback QR API failed: ${response.status}`);
  }

  return await response.text();
}

/**
 * Upload QR code to Cloudinary
 */
async function uploadQRToCloudinary(qrData, modelId, variantId) {
  try {
    // Create unique public ID
    const publicId = variantId
      ? `qr_codes/models/${modelId}/variants/${variantId}`
      : `qr_codes/models/${modelId}/original`;

    // Upload SVG as text file
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'raw', // For SVG files
          folder: 'qr_codes',
          overwrite: true,
          invalidate: true, // Clear CDN cache
          format: 'svg'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      // Convert string to buffer and upload
      const buffer = Buffer.from(qrData, 'utf-8');
      uploadStream.end(buffer);
    });

    return uploadResult.secure_url;

  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    // Return data URL as fallback
    const base64 = Buffer.from(qrData).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }
}

/**
 * Save QR URL to database
 */
async function saveQRToDatabase(qrUrl, modelId, variantId) {
  try {
    const now = new Date().toISOString();

    if (variantId) {
      await supabase
        .from('model_variants')
        .update({
          qr_code_url: qrUrl,
          qr_generated_at: now,
          updated_at: now
        })
        .eq('id', variantId);
    } else {
      await supabase
        .from('models')
        .update({
          qr_code_url: qrUrl,
          qr_generated_at: now,
          updated_at: now
        })
        .eq('id', modelId);
    }
  } catch (error) {
    console.error('Database update failed:', error);
    // Continue even if DB update fails - we still have the QR
  }
}

/**
 * Emergency QR generation - returns data URL
 */
async function generateEmergencyQR(url) {
  try {
    // Try local generation first
    const qrResult = await generateQR(url, {
      format: 'dataurl',
      size: 256,
      errorCorrectionLevel: 'M'
    });
    return qrResult.data.qr_code;
  } catch (error) {
    // Last resort: use external API and return as data URL
    const size = 256;
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&format=png`;
    return qrApiUrl; // Return direct link to external API
  }
}

/**
 * Regenerate all QR codes (maintenance task)
 */
async function regenerateAllQRCodes() {
  console.log('🔄 Starting QR regeneration for all models...');

  try {
    // Get all models
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select('id, title');

    if (modelsError) throw modelsError;

    // Get all variants
    const { data: variants, error: variantsError } = await supabase
      .from('model_variants')
      .select('id, parent_model_id, variant_name');

    if (variantsError) throw variantsError;

    const results = {
      models: { success: 0, failed: 0 },
      variants: { success: 0, failed: 0 }
    };

    // Regenerate model QRs
    for (const model of models) {
      try {
        const url = `https://newfurniture.live/view?id=${model.id}`;
        await generateAndPersistQR(url, {}, model.id);
        results.models.success++;
      } catch (error) {
        console.error(`Failed to regenerate QR for model ${model.id}:`, error);
        results.models.failed++;
      }
    }

    // Regenerate variant QRs
    for (const variant of variants) {
      try {
        const url = `https://newfurniture.live/view?id=${variant.parent_model_id}&variant=${variant.id}`;
        await generateAndPersistQR(url, {}, variant.parent_model_id, variant.id);
        results.variants.success++;
      } catch (error) {
        console.error(`Failed to regenerate QR for variant ${variant.id}:`, error);
        results.variants.failed++;
      }
    }

    console.log('✅ QR regeneration complete:', results);
    return results;

  } catch (error) {
    console.error('❌ QR regeneration failed:', error);
    throw error;
  }
}

export {
  generateAndPersistQR,
  getExistingQR,
  regenerateAllQRCodes,
  isQRExpired
};