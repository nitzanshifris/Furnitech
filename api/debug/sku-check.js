import { getModelsWithVariants } from '../../lib/supabase.js';

/**
 * Check SKU values in database to debug the sync issue
 * GET /api/debug/sku-check?customer=CUSTOMER_NAME
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    // Get all products from database
    const allProducts = await getModelsWithVariants();

    const customerName = req.query.customer || 'Napo'; // Default to Napo

    // Filter for specific customer if requested
    let products = allProducts;
    if (customerName && customerName !== 'all') {
      products = allProducts.filter(product =>
        product.customer_name === customerName ||
        product.customer_id === customerName.toLowerCase() ||
        product.customer_name?.toLowerCase() === customerName.toLowerCase()
      );
    }

    // Analyze SKU data
    const skuAnalysis = {
      totalProducts: products.length,
      productsWithSku: 0,
      productsWithoutSku: 0,
      variantsWithSku: 0,
      variantsWithoutSku: 0,
      examples: []
    };

    products.forEach(product => {
      // Check product SKU
      const hasSku = product.sku && product.sku.trim() !== '';
      if (hasSku) {
        skuAnalysis.productsWithSku++;
      } else {
        skuAnalysis.productsWithoutSku++;
      }

      // Add example
      if (skuAnalysis.examples.length < 5) {
        skuAnalysis.examples.push({
          type: 'product',
          id: product.id,
          title: product.title,
          sku: product.sku || '(empty)',
          customer_name: product.customer_name,
          customer_id: product.customer_id,
          hasSku: hasSku
        });
      }

      // Check variant SKUs
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(variant => {
          const variantHasSku = variant.sku && variant.sku.trim() !== '';
          if (variantHasSku) {
            skuAnalysis.variantsWithSku++;
          } else {
            skuAnalysis.variantsWithoutSku++;
          }

          // Add variant example
          if (skuAnalysis.examples.length < 10) {
            skuAnalysis.examples.push({
              type: 'variant',
              id: variant.id,
              parentId: product.id,
              title: variant.name || `${product.title} - Variant`,
              sku: variant.sku || '(empty)',
              customer_name: product.customer_name,
              hasSku: variantHasSku
            });
          }
        });
      }
    });

    // Summary statistics
    const summary = {
      customer: customerName,
      totalItems: skuAnalysis.totalProducts + skuAnalysis.variantsWithSku + skuAnalysis.variantsWithoutSku,
      itemsWithSku: skuAnalysis.productsWithSku + skuAnalysis.variantsWithSku,
      itemsWithoutSku: skuAnalysis.productsWithoutSku + skuAnalysis.variantsWithoutSku,
      percentageWithSku: Math.round(((skuAnalysis.productsWithSku + skuAnalysis.variantsWithSku) / (skuAnalysis.totalProducts + skuAnalysis.variantsWithSku + skuAnalysis.variantsWithoutSku)) * 100)
    };

    return res.status(200).json({
      success: true,
      customer: customerName,
      summary,
      details: skuAnalysis,
      message: summary.itemsWithoutSku > 0
        ? `⚠️ Found ${summary.itemsWithoutSku} items without SKUs`
        : `✅ All ${summary.itemsWithSku} items have SKUs`
    });

  } catch (error) {
    console.error('SKU check error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}