import { getModelsWithVariants } from '../../lib/supabase.js';
import { transformProductToSheetRow, transformVariantToSheetRow } from '../../lib/sheets-data-mapper.js';

/**
 * Test endpoint to verify BLUSH product and variant URL generation
 * GET /api/sheets/test-blush
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    console.log('Testing BLUSH product and variant URLs...');

    // Get all products to find BLUSH
    const allProducts = await getModelsWithVariants();

    // Find BLUSH product (searching by title or ID)
    const blushProduct = allProducts.find(product =>
      product.title?.toLowerCase().includes('blush') ||
      product.id === 'o8U54bIP'
    );

    if (!blushProduct) {
      return res.status(404).json({
        success: false,
        error: 'BLUSH product not found',
        message: 'Searched for product with title containing "blush" or ID "o8U54bIP"',
        totalProducts: allProducts.length
      });
    }

    console.log('Found BLUSH product:', blushProduct.id, blushProduct.title);

    // Transform main product
    const mainProductRow = transformProductToSheetRow(blushProduct);

    // Transform variants
    const variantRows = [];
    if (blushProduct.variants && blushProduct.variants.length > 0) {
      for (const variant of blushProduct.variants) {
        const variantRow = transformVariantToSheetRow(variant, blushProduct);
        variantRows.push({
          variant_id: variant.id,
          variant_name: variant.variant_name,
          variant_color: variant.hex_color,
          row_data: variantRow
        });
      }
    }

    // Test specific variant you mentioned
    const specificVariant = blushProduct.variants?.find(v => v.id === 'igaJuwvK');
    let specificVariantTest = null;
    if (specificVariant) {
      const specificRow = transformVariantToSheetRow(specificVariant, blushProduct);
      specificVariantTest = {
        variant_id: specificVariant.id,
        variant_name: specificVariant.variant_name,
        expected_url: `https://newfurniture.live/view?id=${blushProduct.id}&variant=${specificVariant.id}`,
        generated_url: specificRow[3], // AR_View_Link column
        qr_code_url: specificRow[4], // QR_Code_SVG column
        urls_match: specificRow[3] === `https://newfurniture.live/view?id=${blushProduct.id}&variant=${specificVariant.id}`
      };
    }

    return res.status(200).json({
      success: true,
      blush_product: {
        id: blushProduct.id,
        title: blushProduct.title,
        customer: blushProduct.customer_name,
        main_product_row: mainProductRow,
        variant_count: blushProduct.variants?.length || 0
      },
      variants: variantRows,
      specific_variant_test: specificVariantTest,
      url_verification: {
        expected_format: 'https://newfurniture.live/view?id=PRODUCT_ID&variant=VARIANT_ID',
        example_you_provided: 'https://newfurniture.live/view?id=o8U54bIP&variant=igaJuwvK',
        our_generation_working: specificVariantTest?.urls_match || false
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('BLUSH test error:', error);
    return res.status(500).json({
      success: false,
      error: 'Test failed',
      message: error.message
    });
  }
}