/**
 * QR Code Generation Utility for AR Furniture Platform
 * Optimized for web performance and reliability
 */

const QRCode = require('qrcode');

// Optimal configuration constants based on testing
const DEFAULT_CONFIG = {
  errorCorrectionLevel: 'M', // Medium - best balance for furniture URLs
  margin: 4, // Optimal quiet zone
  width: 256, // Default size for web display
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
};

// Allowed domains for security
const ALLOWED_DOMAINS = [
  'newfurniture.live',
  'localhost',
  '127.0.0.1',
  'vercel.app'  // Allow all Vercel preview domains
];

// Size constraints based on best practices
const SIZE_LIMITS = {
  min: 64,
  max: 1024,
  default: 256
};

// Error correction level mapping with metadata
const ERROR_LEVELS = {
  'L': { name: 'Low', recovery: '~7%', use_case: 'Clean environments' },
  'M': { name: 'Medium', recovery: '~15%', use_case: 'Standard use (recommended)' },
  'Q': { name: 'Quartile', recovery: '~25%', use_case: 'Noisy environments' },
  'H': { name: 'High', recovery: '~30%', use_case: 'Very noisy/damaged' }
};

/**
 * Custom error classes for better error handling
 */
class QRGeneratorError extends Error {
  constructor(message, code, details = null) {
    super(message);
    this.name = 'QRGeneratorError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Validate URL for QR code generation
 * @param {string} url - URL to validate
 * @returns {object} - Validation result with success flag and error details
 */
function validateURL(url) {
  try {
    // Basic URL format check
    const urlObj = new URL(url);

    // Protocol validation
    if (urlObj.protocol !== 'https:' && urlObj.protocol !== 'http:') {
      return {
        valid: false,
        error: 'URL must use HTTP or HTTPS protocol',
        code: 'INVALID_PROTOCOL'
      };
    }

    // Domain whitelist check (for security)
    const hostname = urlObj.hostname;
    const isAllowedDomain = ALLOWED_DOMAINS.some(domain => {
      return hostname === domain || hostname.endsWith('.' + domain);
    });

    if (!isAllowedDomain && process.env.NODE_ENV === 'production') {
      return {
        valid: false,
        error: `Domain '${hostname}' is not allowed`,
        code: 'DOMAIN_NOT_ALLOWED',
        allowedDomains: ALLOWED_DOMAINS
      };
    }

    // URL length check (QR code capacity)
    if (url.length > 2048) {
      return {
        valid: false,
        error: 'URL is too long (max 2048 characters)',
        code: 'URL_TOO_LONG'
      };
    }

    return {
      valid: true,
      hostname: hostname,
      protocol: urlObj.protocol
    };

  } catch (error) {
    return {
      valid: false,
      error: 'Invalid URL format',
      code: 'MALFORMED_URL',
      details: error.message
    };
  }
}

/**
 * Validate QR generation options
 * @param {object} options - QR generation options
 * @returns {object} - Validated options with defaults applied
 */
function validateOptions(options = {}) {
  const validated = { ...DEFAULT_CONFIG };
  const errors = [];

  // Validate format
  if (options.format && !['svg', 'png', 'dataurl'].includes(options.format)) {
    errors.push('Format must be svg, png, or dataurl');
  } else {
    validated.format = options.format || 'svg';
  }

  // Validate size
  if (options.size !== undefined) {
    const size = parseInt(options.size);
    if (isNaN(size) || size < SIZE_LIMITS.min || size > SIZE_LIMITS.max) {
      errors.push(`Size must be between ${SIZE_LIMITS.min} and ${SIZE_LIMITS.max} pixels`);
    } else {
      validated.width = size;
    }
  }

  // Validate error correction level
  if (options.errorCorrectionLevel && !ERROR_LEVELS[options.errorCorrectionLevel]) {
    errors.push('Error correction level must be L, M, Q, or H');
  } else if (options.errorCorrectionLevel) {
    validated.errorCorrectionLevel = options.errorCorrectionLevel;
  }

  // Validate margin
  if (options.margin !== undefined) {
    const margin = parseInt(options.margin);
    if (isNaN(margin) || margin < 0 || margin > 10) {
      errors.push('Margin must be between 0 and 10 modules');
    } else {
      validated.margin = margin;
    }
  }

  // Validate colors
  if (options.color) {
    if (options.color.dark && !/^#[0-9A-F]{6}$/i.test(options.color.dark)) {
      errors.push('Dark color must be a valid hex color (#RRGGBB)');
    } else if (options.color.dark) {
      validated.color.dark = options.color.dark.toUpperCase();
    }

    if (options.color.light && !/^#[0-9A-F]{6}$/i.test(options.color.light)) {
      errors.push('Light color must be a valid hex color (#RRGGBB)');
    } else if (options.color.light) {
      validated.color.light = options.color.light.toUpperCase();
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    options: validated
  };
}

/**
 * Calculate estimated scannable distance based on QR size and error correction
 * @param {number} size - QR code size in pixels
 * @param {string} errorLevel - Error correction level
 * @returns {string} - Estimated distance in meters
 */
function calculateScannableDistance(size, errorLevel) {
  // Base formula: distance ≈ size * 0.01 meters per pixel, adjusted for error correction
  const baseDistance = size * 0.01;
  const errorAdjustment = {
    'L': 0.8,
    'M': 1.0,
    'Q': 1.2,
    'H': 1.3
  };

  const distance = baseDistance * (errorAdjustment[errorLevel] || 1.0);
  return `${Math.round(distance * 10) / 10}m`;
}

/**
 * Generate QR code with comprehensive error handling and metadata
 * @param {string} url - URL to encode
 * @param {object} options - Generation options
 * @returns {Promise<object>} - Generated QR code with metadata
 */
async function generateQR(url, options = {}) {
  const startTime = Date.now();

  try {
    // Validate URL
    const urlValidation = validateURL(url);
    if (!urlValidation.valid) {
      throw new QRGeneratorError(
        urlValidation.error,
        urlValidation.code,
        urlValidation
      );
    }

    // Validate options
    const optionsValidation = validateOptions(options);
    if (!optionsValidation.valid) {
      throw new QRGeneratorError(
        `Invalid options: ${optionsValidation.errors.join(', ')}`,
        'INVALID_OPTIONS',
        { errors: optionsValidation.errors }
      );
    }

    const qrOptions = optionsValidation.options;
    let qrCode, contentType, estimatedSize;

    // Generate QR code based on format
    switch (qrOptions.format) {
      case 'svg':
        qrCode = await QRCode.toString(url, {
          ...qrOptions,
          type: 'svg'
        });
        contentType = 'image/svg+xml';
        estimatedSize = qrCode.length;
        break;

      case 'png':
        qrCode = await QRCode.toBuffer(url, {
          ...qrOptions,
          type: 'png'
        });
        contentType = 'image/png';
        estimatedSize = qrCode.length;
        break;

      case 'dataurl':
        qrCode = await QRCode.toDataURL(url, {
          ...qrOptions,
          type: 'image/png'
        });
        contentType = 'text/plain';
        estimatedSize = qrCode.length;
        break;

      default:
        throw new QRGeneratorError(
          `Unsupported format: ${qrOptions.format}`,
          'UNSUPPORTED_FORMAT'
        );
    }

    const processingTime = Date.now() - startTime;

    // Calculate QR code modules (size in terms of data squares)
    const estimatedModules = Math.ceil(Math.sqrt(url.length * 8));

    return {
      success: true,
      data: {
        qr_code: qrCode,
        format: qrOptions.format,
        size: qrOptions.width,
        url: url,
        content_type: contentType,
        estimated_file_size: `${Math.round(estimatedSize / 1024 * 100) / 100} KB`,
        generated_at: new Date().toISOString()
      },
      metadata: {
        processing_time_ms: processingTime,
        modules: estimatedModules,
        error_correction: {
          level: qrOptions.errorCorrectionLevel,
          ...ERROR_LEVELS[qrOptions.errorCorrectionLevel]
        },
        estimated_scannable_distance: calculateScannableDistance(qrOptions.width, qrOptions.errorCorrectionLevel),
        options_used: qrOptions,
        url_validation: urlValidation
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;

    // Handle QR generation library errors
    if (error.name === 'QRGeneratorError') {
      throw error; // Re-throw our custom errors
    }

    // Handle QRCode library errors
    throw new QRGeneratorError(
      `QR generation failed: ${error.message}`,
      'GENERATION_FAILED',
      {
        processing_time_ms: processingTime,
        original_error: error.message,
        url_length: url?.length || 0
      }
    );
  }
}

/**
 * Generate multiple QR codes in batch with parallel processing
 * @param {Array<string>} urls - Array of URLs to encode
 * @param {object} options - Generation options
 * @returns {Promise<object>} - Batch generation results
 */
async function generateBatchQR(urls, options = {}) {
  const startTime = Date.now();

  if (!Array.isArray(urls)) {
    throw new QRGeneratorError('URLs must be an array', 'INVALID_INPUT');
  }

  if (urls.length === 0) {
    throw new QRGeneratorError('URLs array cannot be empty', 'EMPTY_ARRAY');
  }

  if (urls.length > 200) {
    throw new QRGeneratorError(
      'Too many URLs in batch (max 200)',
      'BATCH_TOO_LARGE',
      { provided: urls.length, max: 200 }
    );
  }

  try {
    // Process URLs in parallel
    const results = await Promise.allSettled(
      urls.map(async (url, index) => {
        try {
          const result = await generateQR(url, options);
          return { index, url, ...result };
        } catch (error) {
          return {
            index,
            url,
            success: false,
            error: {
              message: error.message,
              code: error.code,
              details: error.details
            }
          };
        }
      })
    );

    // Categorize results
    const successful = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value);

    const failed = results
      .filter(r => r.status === 'fulfilled' && !r.value.success)
      .map(r => r.value);

    const processingTime = Date.now() - startTime;

    return {
      success: true,
      data: {
        qr_codes: successful,
        failed_codes: failed,
        summary: {
          total_requested: urls.length,
          successful: successful.length,
          failed: failed.length,
          processing_time_ms: processingTime,
          average_time_per_qr: Math.round(processingTime / urls.length)
        }
      }
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;

    throw new QRGeneratorError(
      `Batch QR generation failed: ${error.message}`,
      'BATCH_FAILED',
      {
        processing_time_ms: processingTime,
        urls_count: urls.length
      }
    );
  }
}

/**
 * Get supported formats and their capabilities
 * @returns {object} - Format information
 */
function getSupportedFormats() {
  return {
    svg: {
      name: 'SVG Vector',
      mime_type: 'image/svg+xml',
      scalable: true,
      typical_size: '1-3 KB',
      use_case: 'Web display, print, scaling'
    },
    png: {
      name: 'PNG Raster',
      mime_type: 'image/png',
      scalable: false,
      typical_size: '2-5 KB',
      use_case: 'Image processing, mobile apps'
    },
    dataurl: {
      name: 'Data URL (Base64)',
      mime_type: 'text/plain',
      scalable: false,
      typical_size: '3-7 KB',
      use_case: 'Direct embedding in HTML/CSS'
    }
  };
}

/**
 * Get optimal settings recommendation based on use case
 * @param {string} useCase - Use case: 'web', 'print', 'mobile', 'embed'
 * @returns {object} - Recommended settings
 */
function getOptimalSettings(useCase = 'web') {
  const recommendations = {
    web: {
      format: 'svg',
      size: 256,
      errorCorrectionLevel: 'M',
      margin: 4,
      reason: 'Optimal for web display with good balance of size and reliability'
    },
    print: {
      format: 'svg',
      size: 512,
      errorCorrectionLevel: 'Q',
      margin: 6,
      reason: 'Higher resolution and error correction for printed materials'
    },
    mobile: {
      format: 'png',
      size: 200,
      errorCorrectionLevel: 'M',
      margin: 4,
      reason: 'Smaller size for mobile bandwidth, PNG for app integration'
    },
    embed: {
      format: 'dataurl',
      size: 256,
      errorCorrectionLevel: 'M',
      margin: 4,
      reason: 'Data URL for direct HTML embedding without external files'
    }
  };

  return recommendations[useCase] || recommendations.web;
}

// Export all functions and constants for external use
module.exports = {
  QRGeneratorError,
  validateURL,
  validateOptions,
  calculateScannableDistance,
  generateQR,
  generateBatchQR,
  getSupportedFormats,
  getOptimalSettings,
  DEFAULT_CONFIG,
  SIZE_LIMITS,
  ERROR_LEVELS,
  ALLOWED_DOMAINS
};