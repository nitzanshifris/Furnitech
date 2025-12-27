/**
 * Security utilities for file validation and rate limiting
 */

// File type magic numbers for validation
const MAGIC_NUMBERS = {
  // 3D model formats
  'glb': [0x67, 0x6C, 0x54, 0x46], // glTF binary header "glTF"
  'gltf': [0x7B], // JSON starting with '{'
  
  // Image formats
  'jpg': [0xFF, 0xD8, 0xFF],
  'jpeg': [0xFF, 0xD8, 0xFF],
  'png': [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  'webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
  'svg': [0x3C, 0x3F, 0x78, 0x6D, 0x6C], // "<?xml" or similar
};

// Rate limiting store (in-memory for simplicity)
const rateLimitStore = new Map();

/**
 * Validate file based on magic numbers and content
 */
export function validateFileContent(fileBuffer, filename, allowedTypes = []) {
  if (!fileBuffer || fileBuffer.length === 0) {
    return { valid: false, error: 'Empty file' };
  }
  
  const ext = filename.toLowerCase().split('.').pop();
  
  if (!allowedTypes.includes(ext)) {
    return { valid: false, error: 'File type not allowed' };
  }
  
  const magicNumbers = MAGIC_NUMBERS[ext];
  if (!magicNumbers) {
    return { valid: false, error: 'Unknown file type' };
  }
  
  // Check magic numbers
  const headerBytes = fileBuffer.slice(0, magicNumbers.length);
  const matches = magicNumbers.every((byte, index) => headerBytes[index] === byte);
  
  if (!matches && ext !== 'svg' && ext !== 'gltf') {
    return { valid: false, error: 'File content does not match extension' };
  }
  
  // Additional content validation
  if (ext === 'svg') {
    const content = fileBuffer.toString('utf8');
    
    // Check for malicious content in SVG
    if (content.includes('<script') || content.includes('javascript:') || content.includes('xlink:href="data:')) {
      return { valid: false, error: 'SVG contains potentially malicious content' };
    }
    
    if (!content.includes('<svg') && !content.includes('<?xml')) {
      return { valid: false, error: 'Invalid SVG format' };
    }
  }
  
  if (ext === 'gltf') {
    try {
      const content = fileBuffer.toString('utf8');
      JSON.parse(content); // Validate JSON structure
    } catch (e) {
      return { valid: false, error: 'Invalid glTF JSON format' };
    }
  }
  
  return { valid: true };
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .slice(0, 100);
}

/**
 * Rate limiting implementation
 */
export function checkRateLimit(identifier, windowMs = 60000, maxRequests = 10) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(identifier)) {
    rateLimitStore.set(identifier, []);
  }
  
  const requests = rateLimitStore.get(identifier);
  
  // Clean old requests
  const validRequests = requests.filter(time => time > windowStart);
  
  if (validRequests.length >= maxRequests) {
    return {
      allowed: false,
      resetTime: Math.ceil((validRequests[0] + windowMs) / 1000),
      remaining: 0
    };
  }
  
  // Add current request
  validRequests.push(now);
  rateLimitStore.set(identifier, validRequests);
  
  return {
    allowed: true,
    remaining: maxRequests - validRequests.length,
    resetTime: Math.ceil((now + windowMs) / 1000)
  };
}

/**
 * Generate rate limit headers
 */
export function getRateLimitHeaders(rateLimit) {
  return {
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': rateLimit.resetTime.toString()
  };
}

/**
 * Clean up old rate limit entries (call periodically)
 */
export function cleanupRateLimit() {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(time => time > oneHourAgo);
    
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
}

/**
 * Hash IP address for privacy-compliant rate limiting
 */
export function hashIP(ip) {
  // Simple hash for IP addresses (use crypto.createHash in production)
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}

/**
 * Validate that all required environment variables are present
 */
export function validateEnvironmentVariables() {
  const required = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY', 
    'CLOUDINARY_API_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];
  
  const missing = required.filter(variable => !process.env[variable]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Validate format of key environment variables
  if (!process.env.SUPABASE_URL.startsWith('https://')) {
    throw new Error('SUPABASE_URL must be a valid HTTPS URL');
  }
  
  console.log('✅ All required environment variables are present and valid');
  return true;
}