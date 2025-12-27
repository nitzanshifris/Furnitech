/**
 * Test endpoint to verify deployment timestamp
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    message: 'Deployment is working',
    timestamp: new Date().toISOString(),
    deploymentVersion: 'v2025-11-06-upload-fix',
    gitCommit: '80858b9',
    note: 'If you see this, the new deployment is live'
  });
}