import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/feedback - Get feedback (admin or filtered)
  if (req.method === 'GET') {
    try {
      const { customer, type, model, status } = req.query;

      let query = supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply filters if provided
      if (customer) {
        query = query.eq('customer_id', customer);
      }
      if (type) {
        query = query.eq('feedback_type', type);
      }
      if (model) {
        query = query.eq('model_id', model);
      }
      // Status filter: IMPORTANT distinction
      // - Admin panel ALWAYS sends status parameter (active or archived)
      // - Customer requests should see ALL feedback regardless of archive status
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;

      if (error) {
        console.error('Error fetching feedback:', error);
        return res.status(500).json({ error: 'Failed to fetch feedback' });
      }

      // Get image counts for each feedback
      if (data && data.length > 0) {
        const feedbackIds = data.map(f => f.id);
        const { data: imageCounts, error: imageError } = await supabase
          .from('feedback_images')
          .select('feedback_id, id')
          .in('feedback_id', feedbackIds);

        if (!imageError && imageCounts) {
          // Count images per feedback
          const imageCountMap = {};
          imageCounts.forEach(img => {
            imageCountMap[img.feedback_id] = (imageCountMap[img.feedback_id] || 0) + 1;
          });

          // Add image count to each feedback item
          data.forEach(feedback => {
            feedback.imageCount = imageCountMap[feedback.id] || 0;
          });
        }
      }

      return res.status(200).json({
        feedback: data || [],
        success: true
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/feedback - Submit new feedback
  else if (req.method === 'POST') {
    try {
      const { type, categories, comment, customerId, itemId, itemName, approvalStatus, variantId, variantName } = req.body;

      if (!type || !customerId || !itemId) {
        return res.status(400).json({ error: 'Missing required fields: type, customerId, itemId' });
      }
      
      // Generate feedback ID
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Build insert object with variant fields (columns now exist)
      const insertData = {
        id: feedbackId,
        feedback_type: type,
        categories: categories || [],
        comment: comment || null,
        customer_id: customerId,
        model_id: itemId,
        model_name: itemName || '',
        variant_id: variantId || 'original',
        variant_name: variantName || 'Original',
        user_agent: req.headers['user-agent'] || '',
        approval_status: approvalStatus || 'pending',
        approved_at: (approvalStatus === 'perfect' || approvalStatus === 'approved_with_notes' || approvalStatus === 'approved' || type === 'approved') ? new Date().toISOString() : null,
        status: 'active'
      };

      const { data, error } = await supabase
        .from('feedback')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('Error saving feedback:', error);
        return res.status(500).json({
          error: 'Failed to save feedback',
          details: error.message || error.toString()
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Feedback submitted successfully',
        feedbackId: feedbackId
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE /api/feedback?id=xxx - Delete specific feedback
  else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Feedback ID is required' });
      }

      console.log(`🗑️ Deleting feedback with ID: ${id}`);

      // First, delete any associated feedback images
      const { error: imageDeleteError } = await supabase
        .from('feedback_images')
        .delete()
        .eq('feedback_id', id);

      if (imageDeleteError) {
        console.error('Error deleting feedback images:', imageDeleteError);
        // Continue with feedback deletion even if images fail
      }

      // Now delete the feedback itself
      const { data, error } = await supabase
        .from('feedback')
        .delete()
        .eq('id', id)
        .select();

      if (error) {
        console.error('Error deleting feedback:', error);
        return res.status(500).json({
          error: 'Failed to delete feedback',
          message: error.message
        });
      }

      if (!data || data.length === 0) {
        return res.status(404).json({
          error: 'Feedback not found',
          message: 'No feedback found with the provided ID'
        });
      }

      console.log(`✅ Successfully deleted feedback: ${id}`);
      return res.status(200).json({
        success: true,
        message: 'Feedback deleted successfully',
        deletedFeedback: data[0]
      });

    } catch (error) {
      console.error('Error in delete feedback handler:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}