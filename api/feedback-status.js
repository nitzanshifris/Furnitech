import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // PATCH /api/feedback-status - Update feedback status
  if (req.method === 'PATCH') {
    try {
      const { feedbackId, status } = req.body;

      if (!feedbackId || !status) {
        return res.status(400).json({ error: 'Missing feedbackId or status' });
      }

      if (!['active', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Status must be active or archived' });
      }

      const { data, error } = await supabase
        .from('feedback')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', feedbackId)
        .select()
        .single();

      if (error) {
        console.error('Error updating feedback status:', error);
        return res.status(500).json({
          error: 'Failed to update feedback status',
          details: error.message
        });
      }

      return res.status(200).json({
        success: true,
        message: `Feedback ${status === 'archived' ? 'archived' : 'restored'}`,
        feedback: data
      });

    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}