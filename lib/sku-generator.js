/**
 * SKU Generation and Management Utility
 *
 * Handles SKU generation for products and variants in the AR Furniture Platform
 * SKU Format:
 * - Product: {CUSTOMER_CODE}-{PRODUCT_CODE}-{ID_SUFFIX}
 * - Variant: {PRODUCT_SKU}-{VARIANT_CODE}
 */

/**
 * Generate customer code from customer name
 * @param {string} customerName - The customer/brand name
 * @returns {string} 3-4 character customer code
 */
function generateCustomerCode(customerName = 'UNASSIGNED') {
    // Remove non-alphabetic characters and convert to uppercase
    const cleanName = customerName.replace(/[^A-Za-z]/g, '').toUpperCase();

    if (cleanName.length >= 4) {
        return cleanName.substring(0, 4);
    } else if (cleanName.length >= 3) {
        return cleanName.padEnd(3, 'X');
    } else {
        return 'UNKN';
    }
}

/**
 * Generate product code from title
 * @param {string} title - The product title
 * @returns {string} Product code (max 8 chars)
 */
function generateProductCode(title) {
    // Remove special characters, keep alphanumeric and spaces
    const cleanTitle = title.replace(/[^A-Za-z0-9 ]/g, '');
    // Remove spaces and take first 8 characters
    const productCode = cleanTitle.replace(/\s+/g, '').toUpperCase();
    return productCode.substring(0, 8);
}

/**
 * Generate variant code from variant name or color
 * @param {string} variantName - The variant name
 * @param {string} hexColor - The hex color code (fallback)
 * @returns {string} Variant code (max 6 chars)
 */
function generateVariantCode(variantName, hexColor = null) {
    if (variantName && variantName.trim()) {
        // Use variant name
        const cleanVariant = variantName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        return cleanVariant.substring(0, 6);
    } else if (hexColor) {
        // Use color code
        return hexColor.replace('#', 'C').toUpperCase();
    } else {
        return 'VAR';
    }
}

/**
 * Generate full product SKU
 * @param {string} customerName - Customer/brand name
 * @param {string} title - Product title
 * @param {string} modelId - Model ID
 * @returns {string} Complete product SKU
 */
function generateProductSKU(customerName, title, modelId) {
    const customerCode = generateCustomerCode(customerName);
    const productCode = generateProductCode(title);
    const idSuffix = modelId.slice(-4).toUpperCase();

    return `${customerCode}-${productCode}-${idSuffix}`;
}

/**
 * Generate full variant SKU
 * @param {string} productSKU - Parent product SKU
 * @param {string} variantName - Variant name
 * @param {string} hexColor - Hex color (fallback)
 * @returns {string} Complete variant SKU
 */
function generateVariantSKU(productSKU, variantName, hexColor = null) {
    const variantCode = generateVariantCode(variantName, hexColor);
    return `${productSKU}-${variantCode}`;
}

/**
 * Validate SKU format
 * @param {string} sku - SKU to validate
 * @param {string} type - 'product' or 'variant'
 * @returns {boolean} Whether SKU format is valid
 */
function validateSKU(sku, type = 'product') {
    if (!sku || typeof sku !== 'string') return false;

    if (type === 'product') {
        // Product SKU format: XXX-XXXXXXXX-XXXX (3-4 chars, 8 chars max, 4 chars)
        return /^[A-Z]{3,4}-[A-Z0-9]{1,8}-[A-Z0-9]{4}$/.test(sku);
    } else if (type === 'variant') {
        // Variant SKU format: Product SKU + -XXXXXX (6 chars max)
        return /^[A-Z]{3,4}-[A-Z0-9]{1,8}-[A-Z0-9]{4}-[A-Z0-9C]{1,6}$/.test(sku);
    }

    return false;
}

/**
 * Parse SKU components
 * @param {string} sku - SKU to parse
 * @returns {object} Parsed SKU components
 */
function parseSKU(sku) {
    if (!sku) return null;

    const parts = sku.split('-');

    if (parts.length === 3) {
        // Product SKU
        return {
            type: 'product',
            customerCode: parts[0],
            productCode: parts[1],
            idSuffix: parts[2],
            variantCode: null
        };
    } else if (parts.length === 4) {
        // Variant SKU
        return {
            type: 'variant',
            customerCode: parts[0],
            productCode: parts[1],
            idSuffix: parts[2],
            variantCode: parts[3],
            productSKU: `${parts[0]}-${parts[1]}-${parts[2]}`
        };
    }

    return null;
}

/**
 * Check if SKU is unique in database
 * @param {string} sku - SKU to check
 * @param {object} db - Database connection
 * @param {string} excludeId - ID to exclude from check (when editing existing item)
 * @param {string} excludeType - Type of excluded item ('model' or 'variant')
 * @returns {Promise<boolean>} Whether SKU is unique
 */
async function isSKUUnique(sku, db, excludeId = null, excludeType = null) {
    try {
        console.log('🔍 isSKUUnique called with:', { sku, excludeId, excludeType });

        // Handle both { sql: query } and direct query function
        const queryFn = db.sql || db;
        console.log('🔍 Query function type:', typeof queryFn);

        // Check in models table - exclude NULL SKUs
        let modelQuery = `SELECT id FROM models WHERE sku = $1 AND sku IS NOT NULL`;
        let modelParams = [sku];

        if (excludeType === 'model' && excludeId) {
            modelQuery += ` AND id != $2`;
            modelParams.push(excludeId);
        }

        console.log('🔍 Model query:', modelQuery, 'params:', modelParams);

        // Check in model_variants table - exclude NULL SKUs
        let variantQuery = `SELECT id FROM model_variants WHERE sku = $1 AND sku IS NOT NULL`;
        let variantParams = [sku];

        if (excludeType === 'variant' && excludeId) {
            variantQuery += ` AND id != $2`;
            variantParams.push(excludeId);
        }

        console.log('🔍 Variant query:', variantQuery, 'params:', variantParams);

        console.log('🔍 EXECUTING MODEL QUERY:', modelQuery, 'WITH PARAMS:', modelParams);
        const modelCheck = await queryFn(modelQuery, modelParams);
        console.log('🔍 MODEL QUERY RESULT:', JSON.stringify(modelCheck, null, 2));

        console.log('🔍 EXECUTING VARIANT QUERY:', variantQuery, 'WITH PARAMS:', variantParams);
        const variantCheck = await queryFn(variantQuery, variantParams);
        console.log('🔍 VARIANT QUERY RESULT:', JSON.stringify(variantCheck, null, 2));

        // Handle different result structures
        const modelRows = modelCheck.rows || modelCheck || [];
        const variantRows = variantCheck.rows || variantCheck || [];

        console.log('🔍 PROCESSED MODEL ROWS:', modelRows);
        console.log('🔍 PROCESSED VARIANT ROWS:', variantRows);
        console.log('🔍 MODEL ROWS COUNT:', modelRows.length);
        console.log('🔍 VARIANT ROWS COUNT:', variantRows.length);

        const isUnique = modelRows.length === 0 && variantRows.length === 0;
        console.log('🔍 FINAL UNIQUENESS RESULT:', isUnique, '(modelRows.length === 0:', modelRows.length === 0, ', variantRows.length === 0:', variantRows.length === 0, ')');

        return isUnique;
    } catch (error) {
        console.error('Error checking SKU uniqueness:', error);
        return false;
    }
}

/**
 * Generate unique SKU with collision handling
 * @param {string} baseSKU - Base SKU to start with
 * @param {object} db - Database connection
 * @param {number} maxAttempts - Maximum attempts to find unique SKU
 * @returns {Promise<string>} Unique SKU
 */
async function generateUniqueSKU(baseSKU, db, maxAttempts = 10) {
    let currentSKU = baseSKU;
    let attempt = 0;

    while (attempt < maxAttempts) {
        const isUnique = await isSKUUnique(currentSKU, db);
        if (isUnique) {
            return currentSKU;
        }

        // Append number to make it unique
        attempt++;
        const suffix = attempt.toString().padStart(2, '0');

        // For product SKUs, append to the end
        // For variant SKUs, append to variant code
        if (currentSKU.split('-').length === 3) {
            // Product SKU
            currentSKU = `${baseSKU}${suffix}`;
        } else {
            // Variant SKU - modify the variant code part
            const parts = baseSKU.split('-');
            parts[3] = `${parts[3]}${suffix}`;
            currentSKU = parts.join('-');
        }
    }

    throw new Error(`Could not generate unique SKU after ${maxAttempts} attempts`);
}

/**
 * Search models by SKU
 * @param {string} sku - SKU to search for
 * @param {object} db - Database connection
 * @returns {Promise<object>} Model or variant data
 */
async function findBySKU(sku, db) {
    try {
        // First try to find in models table
        const modelResult = await db.sql`
            SELECT * FROM models WHERE sku = ${sku}
        `;

        if (modelResult.length > 0) {
            return {
                type: 'product',
                data: modelResult[0]
            };
        }

        // Then try to find in model_variants table
        const variantResult = await db.sql`
            SELECT mv.*, m.title as parent_title, m.customer_name
            FROM model_variants mv
            JOIN models m ON mv.parent_model_id = m.id
            WHERE mv.sku = ${sku}
        `;

        if (variantResult.length > 0) {
            return {
                type: 'variant',
                data: variantResult[0]
            };
        }

        return null;
    } catch (error) {
        console.error('Error finding by SKU:', error);
        return null;
    }
}

export {
    generateCustomerCode,
    generateProductCode,
    generateVariantCode,
    generateProductSKU,
    generateVariantSKU,
    validateSKU,
    parseSKU,
    isSKUUnique,
    generateUniqueSKU,
    findBySKU
};