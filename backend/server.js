import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials! Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== SUPPORT TICKETS ====================

// Get all support tickets (admin only - protected by API key in production)
app.get('/api/support-tickets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      tickets: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create a new support ticket
app.post('/api/support-tickets', async (req, res) => {
  const { name, email, message } = req.body;
  
  // Validation
  if (!name || !email || !message) {
    return res.status(400).json({ 
      success: false, 
      error: 'All fields (name, email, message) are required' 
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid email format' 
    });
  }
  
  // Message length validation
  if (message.length < 10) {
    return res.status(400).json({ 
      success: false, 
      error: 'Message must be at least 10 characters long' 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([{ 
        name: name.trim(), 
        email: email.trim().toLowerCase(), 
        message: message.trim(), 
        status: 'open', 
        created_at: new Date().toISOString() 
      }])
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      ticket: data[0],
      message: 'Ticket submitted successfully!'
    });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update ticket status
app.put('/api/support-tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status || !['open', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid status. Must be open, resolved, or closed' 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      ticket: data[0],
      message: 'Ticket status updated successfully!'
    });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== VLOG ENTRIES ====================

// Get all vlog entries
app.get('/api/vlogs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      vlogs: data,
      count: data.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching vlogs:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Create a new vlog entry
app.post('/api/vlogs', async (req, res) => {
  const { title, video_url, thumbnail } = req.body;
  
  if (!title || !video_url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Title and video_url are required' 
    });
  }
  
  // Generate thumbnail from YouTube URL if not provided
  let finalThumbnail = thumbnail;
  if (!finalThumbnail && video_url.includes('youtube.com')) {
    const videoId = video_url.split('embed/')[1]?.split('?')[0];
    if (videoId) {
      finalThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    }
  }
  
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .insert([{ 
        title: title.trim(), 
        video_url, 
        thumbnail: finalThumbnail,
        created_at: new Date().toISOString() 
      }])
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      vlog: data[0],
      message: 'Vlog entry created successfully!'
    });
  } catch (error) {
    console.error('Error creating vlog:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete vlog entry
app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const { error } = await supabase
      .from('vlog_entries')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: 'Vlog entry deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting vlog:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== STATISTICS ====================

// Get platform statistics
app.get('/api/stats', async (req, res) => {
  try {
    const [ticketsResult, vlogsResult] = await Promise.all([
      supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
      supabase.from('vlog_entries').select('*', { count: 'exact', head: true })
    ]);
    
    res.json({
      success: true,
      stats: {
        totalTickets: ticketsResult.count || 0,
        totalVlogs: vlogsResult.count || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `Route ${req.originalUrl} not found` 
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎥 Vlogs endpoint: http://localhost:${PORT}/api/vlogs`);
  console.log(`🎫 Tickets endpoint: http://localhost:${PORT}/api/support-tickets`);
});