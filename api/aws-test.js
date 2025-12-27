/**
 * AWS S3 Connectivity Test Endpoint
 * Completely isolated from main API - no imports from main handlers
 * Tests basic AWS S3 connection and environment setup
 */

const { testS3Connection, getS3Config } = require('../lib/aws-s3-simple.js');

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('🧪 AWS Test: Starting connectivity test');

    // Get configuration
    const config = getS3Config();
    console.log('🧪 AWS Test: Configuration loaded', {
      bucket: config.bucket,
      region: config.region,
      hasCloudfront: !!config.cloudfrontDomain
    });

    // Test S3 connection
    const connectionTest = await testS3Connection();
    console.log('🧪 AWS Test: Connection result', connectionTest);

    // Check environment variables (without exposing values)
    const envCheck = {
      AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
      AWS_S3_BUCKET: !!process.env.AWS_S3_BUCKET,
      AWS_REGION: !!process.env.AWS_REGION,
      AWS_CLOUDFRONT_DOMAIN: !!process.env.AWS_CLOUDFRONT_DOMAIN,
    };

    const allEnvPresent = Object.values(envCheck).every(present => present);

    // Return comprehensive test results
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      test: 'AWS S3 Connectivity',
      environment: {
        variables: envCheck,
        allRequired: allEnvPresent,
        bucket: config.bucket,
        region: config.region,
        cloudfrontConfigured: !!config.cloudfrontDomain
      },
      s3Connection: connectionTest,
      status: connectionTest.status === 'success' ? '✅ Ready for AWS migration' : '❌ AWS setup incomplete',
      nextSteps: connectionTest.status === 'success'
        ? ['Test single model upload', 'Migrate one model', 'Test AR viewer integration']
        : ['Check AWS credentials in Vercel environment variables', 'Verify S3 bucket exists', 'Test permissions']
    });

  } catch (error) {
    console.error('🧪 AWS Test: Error occurred', error);

    return res.status(500).json({
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      status: '❌ AWS test failed',
      help: 'Check Vercel environment variables and AWS credentials'
    });
  }
}