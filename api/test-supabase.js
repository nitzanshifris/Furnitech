/**
 * Test endpoint to verify Supabase connection
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results = {
    envVars: {},
    supabaseConnection: false,
    tableCheck: {},
    error: null
  };

  try {
    // Check environment variables
    results.envVars.SUPABASE_URL = process.env.SUPABASE_URL ? 'Set' : 'Missing';
    results.envVars.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ? 'Set' : 'Missing';

    // Try to import supabase
    let supabase;
    try {
      const supabaseModule = await import('../lib/supabase.js');
      supabase = supabaseModule.supabase;
      results.supabaseConnection = supabase ? true : false;
    } catch (importError) {
      results.error = `Import error: ${importError.message}`;
      return res.status(200).json(results);
    }

    // If supabase is available, test table access
    if (supabase) {
      // Test models table
      try {
        const { data, error } = await supabase
          .from('models')
          .select('id')
          .limit(1);
        results.tableCheck.models = error ? `Error: ${error.message}` : 'OK';
      } catch (e) {
        results.tableCheck.models = `Exception: ${e.message}`;
      }

      // Test model_variants table
      try {
        const { data, error } = await supabase
          .from('model_variants')
          .select('id')
          .limit(1);
        results.tableCheck.model_variants = error ? `Error: ${error.message}` : 'OK';
      } catch (e) {
        results.tableCheck.model_variants = `Exception: ${e.message}`;
      }

      // Test customer_categories table
      try {
        const { data, error } = await supabase
          .from('customer_categories')
          .select('id')
          .limit(1);
        results.tableCheck.customer_categories = error ? `Error: ${error.message}` : 'OK';
      } catch (e) {
        results.tableCheck.customer_categories = `Exception: ${e.message}`;
      }
    }

    return res.status(200).json(results);

  } catch (error) {
    results.error = error.message;
    return res.status(200).json(results);
  }
}