import { query } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const testSku = 'DEBUG-TEST-SKU';

    // Test 1: Count all records with this SKU
    const modelCount = await query('SELECT COUNT(*) as count FROM models WHERE sku = $1', [testSku]);
    const variantCount = await query('SELECT COUNT(*) as count FROM model_variants WHERE sku = $1', [testSku]);

    // Test 2: Count all records with this SKU excluding NULL
    const modelCountNonNull = await query('SELECT COUNT(*) as count FROM models WHERE sku = $1 AND sku IS NOT NULL', [testSku]);
    const variantCountNonNull = await query('SELECT COUNT(*) as count FROM model_variants WHERE sku = $1 AND sku IS NOT NULL', [testSku]);

    // Test 3: Count all NULL SKUs
    const modelNullCount = await query('SELECT COUNT(*) as count FROM models WHERE sku IS NULL');
    const variantNullCount = await query('SELECT COUNT(*) as count FROM model_variants WHERE sku IS NULL');

    // Test 4: Get variant rovKYO1_ specifically
    const specificVariant = await query('SELECT id, sku FROM model_variants WHERE id = $1', ['rovKYO1_']);

    // Test 5: Manual uniqueness check for variant rovKYO1_
    const { isSKUUnique } = await import('../lib/sku-generator.js');
    const isUniqueResult = await isSKUUnique(testSku, { sql: query }, 'rovKYO1_', 'variant');

    // Test 6: Raw SQL like the actual function runs
    const rawModelCheck = await query('SELECT id FROM model_variants WHERE sku = $1 AND sku IS NOT NULL AND id != $2', [testSku, 'rovKYO1_']);
    const rawVariantCheck = await query('SELECT id FROM models WHERE sku = $1 AND sku IS NOT NULL', [testSku]);

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
      rawModelCheck: rawModelCheck.rows,
      rawVariantCheck: rawVariantCheck.rows,
      message: 'DIRECT DATABASE TEST - NO OBFUSCATION BULLSHIT'
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      stack: error.stack,
      message: 'Raw error from direct debug'
    });
  }
}