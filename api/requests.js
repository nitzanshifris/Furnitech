import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/requests?customer={id} - Get customer requests (or all requests if no customer specified for admin)
  if (req.method === 'GET') {
    try {
      const { customer } = req.query;
      
      let query = supabase
        .from('customer_requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      // If customer specified, filter by customer_id
      if (customer) {
        query = query.eq('customer_id', customer);
      }
      
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching requests:', error);
        return res.status(500).json({ error: 'Failed to fetch requests' });
      }
      
      return res.status(200).json({
        requests: data || [],
        success: true
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/requests - Submit new request
  else if (req.method === 'POST') {
    try {
      const { customerId, productUrl, title, description, notes } = req.body;
      
      if (!customerId || !productUrl) {
        return res.status(400).json({ error: 'Customer ID and product URL are required' });
      }
      
      // Generate request ID
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      
      const { data, error } = await supabase
        .from('customer_requests')
        .insert({
          id: requestId,
          customer_id: customerId,
          product_url: productUrl,
          title: title || 'Custom Furniture Request',
          description: description || '',
          notes: notes || '',
          reference_images: [],
          status: 'pending',
          priority: 'normal',
          metadata: {
            submitted_at: new Date().toISOString(),
            user_agent: req.headers['user-agent']
          }
        })
        .select()
        .single();
      
      if (error) {
        console.error('Error creating request:', error);
        return res.status(500).json({ error: 'Failed to create request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request submitted successfully!',
        request: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // PUT /api/requests - Update request (admin only for now)  
  else if (req.method === 'PUT') {
    try {
      const { id, status, adminNotes, estimatedCompletion, modelId } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID required' });
      }
      
      const updateData = { updated_at: new Date().toISOString() };
      
      if (status) updateData.status = status;
      if (adminNotes) updateData.admin_notes = adminNotes;
      if (estimatedCompletion) updateData.estimated_completion = estimatedCompletion;
      if (modelId) updateData.model_id = modelId;
      
      const { data, error } = await supabase
        .from('customer_requests')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Error updating request:', error);
        return res.status(500).json({ error: 'Failed to update request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request updated successfully',
        request: data
      });
      
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
  
  // DELETE /api/requests - Delete request
  else if (req.method === 'DELETE') {
    try {
      const { id, customerId } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Request ID required' });
      }
      
      // Verify the request belongs to this customer (security check)
      if (customerId) {
        const { data: existingRequest, error: fetchError } = await supabase
          .from('customer_requests')
          .select('customer_id')
          .eq('id', id)
          .single();
          
        if (fetchError || !existingRequest) {
          return res.status(404).json({ error: 'Request not found' });
        }
        
        if (existingRequest.customer_id !== customerId) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }
      
      const { data, error } = await supabase
        .from('customer_requests')
        .delete()
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        console.error('Error deleting request:', error);
        return res.status(500).json({ error: 'Failed to delete request' });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Request deleted successfully',
        deletedRequest: data
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