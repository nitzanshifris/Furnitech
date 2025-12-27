/**
 * Debug endpoint to capture and display recent errors
 */

let recentLogs = [];

// Function to add log (call this from other files)
export function addDebugLog(level, message, data = null) {
  recentLogs.push({
    timestamp: new Date().toISOString(),
    level,
    message,
    data,
    id: Math.random().toString(36).substr(2, 9)
  });

  // Keep only last 50 logs
  if (recentLogs.length > 50) {
    recentLogs = recentLogs.slice(-50);
  }

  console.log(`[${level}] ${message}`, data || '');
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Clear logs if requested
  if (req.query.clear === 'true') {
    recentLogs = [];
    return res.status(200).json({ message: 'Logs cleared' });
  }

  // Return recent logs
  return res.status(200).json({
    logs: recentLogs.slice(-20), // Last 20 logs
    count: recentLogs.length,
    latest: recentLogs[recentLogs.length - 1] || null
  });
}