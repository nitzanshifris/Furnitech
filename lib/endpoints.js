/**
 * API endpoint obfuscation mapping
 * Maps internal descriptive endpoints to external obfuscated ones
 */

// Internal to external endpoint mapping
const ENDPOINT_MAPPING = {
  // Upload endpoints
  'upload-simple': 'u1',
  'upload-image': 'u2',
  'cloudinary-save': 'u3',
  'qr-generate': 'u4',
  
  // Data endpoints  
  'models': 'd1',
  'customers': 'd2',
  'users': 'd3',
  'images': 'd4',
  'feedback': 'd5',
  
  // Action endpoints
  'login': 'a1',
  'create-user': 'a2',
  'update-color': 'a3',
  'update-variant-color': 'a4',
  'cleanup-variants': 'a5',
  'reset-view-counts': 'a6',
  
  // Setup endpoints
  'init-db': 's0',
  'init-models-db': 's1',
  'create-images-table': 's2',
  'create-model-views-table': 's3',
  'create-feedback-table': 's4',
  'create-brand-settings-table': 's5',
  'test-save-model': 's6',
  'test-brand-settings-schema': 's7',
  'qr-migration': 's8',
  'url-slug-migration': 's9',
  'variant-equality-migration': 's10',
  'test-sku-check': 's11'
};

// Reverse mapping for internal use
const REVERSE_MAPPING = Object.fromEntries(
  Object.entries(ENDPOINT_MAPPING).map(([k, v]) => [v, k])
);

/**
 * Get obfuscated endpoint name for external use
 */
export function getExternalEndpoint(internalName) {
  return ENDPOINT_MAPPING[internalName] || internalName;
}

/**
 * Get internal endpoint name from obfuscated external name
 */
export function getInternalEndpoint(externalName) {
  return REVERSE_MAPPING[externalName] || externalName;
}

/**
 * Transform all endpoint references in client-side code
 */
export function obfuscateEndpoints(htmlContent) {
  let content = htmlContent;
  
  // Replace API endpoint calls
  Object.entries(ENDPOINT_MAPPING).forEach(([internal, external]) => {
    // Replace fetch calls
    content = content.replace(
      new RegExp(`/api/${internal}`, 'g'),
      `/api/${external}`
    );
    
    // Replace string references
    content = content.replace(
      new RegExp(`'${internal}'`, 'g'),
      `'${external}'`
    );
    content = content.replace(
      new RegExp(`"${internal}"`, 'g'),
      `"${external}"`
    );
  });
  
  return content;
}

/**
 * Create versioned API paths to further obscure structure
 */
export function getVersionedPath(endpoint) {
  const version = process.env.API_VERSION || 'v1';
  return `/${version}/${getExternalEndpoint(endpoint)}`;
}

/**
 * Generate API endpoint documentation with obfuscated names only
 */
export function getPublicEndpointDocs() {
  return Object.values(ENDPOINT_MAPPING).map(endpoint => ({
    path: `/api/${endpoint}`,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    description: 'API endpoint'
  }));
}