/**
 * Debug endpoint to check private key format
 * GET /api/sheets/debug
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!privateKey) {
      return res.status(500).json({ error: 'GOOGLE_PRIVATE_KEY not found' });
    }

    return res.status(200).json({
      success: true,
      privateKey: {
        length: privateKey.length,
        startsWithBegin: privateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
        endsWithEnd: privateKey.endsWith('-----END PRIVATE KEY-----'),
        hasNewlines: privateKey.includes('\n'),
        hasEscapedNewlines: privateKey.includes('\\n'),
        firstChars: privateKey.substring(0, 50),
        lastChars: privateKey.substring(privateKey.length - 50),
        lineCount: privateKey.split('\n').length
      },
      allEnvVars: {
        GOOGLE_PROJECT_ID: !!process.env.GOOGLE_PROJECT_ID,
        GOOGLE_PRIVATE_KEY_ID: !!process.env.GOOGLE_PRIVATE_KEY_ID,
        GOOGLE_PRIVATE_KEY: !!process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_CLIENT_EMAIL: !!process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
        GOOGLE_SHEET_ID: !!process.env.GOOGLE_SHEET_ID
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}