import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://d-funding-blog.web.app', 'https://d-funding-blog.firebaseapp.com'],
  credentials: true
}));
app.use(express.json());

// Cloudflare Turnstile Configuration
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

// Turnstile verification function
async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) {
    console.warn('⚠️ Cloudflare Turnstile not configured. Skipping verification.');
    return true; // Skip verification in development
  }
  
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        secret: CLOUDFLARE_SECRET_KEY,
        response: token,
      }).toString(),
    });
    
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return false;
  }
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limit for login/submissions
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please try again later.',
});

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
  console.warn('⚠️ Running without Supabase - some features will not work');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ==================== TURNSTILE ====================

// Get Turnstile site key for frontend
app.get('/api/turnstile/site-key', (req, res) => {
  res.json({ siteKey: CLOUDFLARE_SITE_KEY });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    supabase: supabase ? 'connected' : 'not configured',
    turnstile: CLOUDFLARE_SITE_KEY ? 'configured' : 'not configured'
  });
});

// ==================== SUPPORT TICKETS ====================

// Get all support tickets
app.get('/api/support-tickets', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, tickets: [], message: 'Supabase not configured' });
  }
  
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      tickets: data || [],
      count: data?.length || 0,
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

// Create a new support ticket (with Turnstile verification)
app.post('/api/support-tickets', strictLimiter, async (req, res) => {
  const { name, email, message, turnstile_token } = req.body;
  
  // Verify human with Turnstile
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Human verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed. Please try again.' });
  }
  
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
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      ticket: { id: Date.now(), name, email, message, status: 'open', created_at: new Date().toISOString() },
      message: 'Ticket submitted (demo mode)'
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
  
  if (!supabase) {
    return res.json({ success: true, message: 'Ticket updated (demo mode)' });
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
  if (!supabase) {
    return res.json({ 
      success: true, 
      vlogs: [
        { id: 1, title: 'Funding Innovation 2026', video_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', thumbnail: 'https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg' },
        { id: 2, title: 'AI meets Venture Capital', video_url: 'https://www.youtube.com/embed/3JZ_D3ELwOQ', thumbnail: 'https://img.youtube.com/vi/3JZ_D3ELwOQ/0.jpg' },
        { id: 3, title: 'Startup Growth Hacks', video_url: 'https://www.youtube.com/embed/ScMzIvxBSi4', thumbnail: 'https://img.youtube.com/vi/ScMzIvxBSi4/0.jpg' },
      ],
      count: 3
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      vlogs: data || [],
      count: data?.length || 0,
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
  if (!finalThumbnail && video_url.includes('youtube.com/embed/')) {
    const videoId = video_url.split('embed/')[1]?.split('?')[0];
    if (videoId) {
      finalThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    }
  }
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      vlog: { id: Date.now(), title, video_url, thumbnail: finalThumbnail, created_at: new Date().toISOString() },
      message: 'Vlog created (demo mode)'
    });
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

// Update vlog entry
app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, video_url, thumbnail } = req.body;
  
  if (!title || !video_url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Title and video_url are required' 
    });
  }
  
  // Generate thumbnail if not provided
  let finalThumbnail = thumbnail;
  if (!finalThumbnail && video_url.includes('youtube.com/embed/')) {
    const videoId = video_url.split('embed/')[1]?.split('?')[0];
    if (videoId) {
      finalThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    }
  }
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      vlog: { id: parseInt(id), title, video_url, thumbnail: finalThumbnail, updated_at: new Date().toISOString() },
      message: 'Vlog updated (demo mode)'
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .update({ 
        title: title.trim(), 
        video_url, 
        thumbnail: finalThumbnail, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      vlog: data[0],
      message: 'Vlog updated successfully!'
    });
  } catch (error) {
    console.error('Error updating vlog:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete vlog entry
app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      message: 'Vlog deleted (demo mode)'
    });
  }
  
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

// ==================== BLOG POSTS ====================

// Get all published blog posts (public)
app.get('/api/blog/posts', async (req, res) => {
  if (!supabase) {
    return res.json({ 
      success: true, 
      posts: [
        { id: 1, title: 'How AI is Transforming Venture Capital', author_name: 'Sarah Johnson', excerpt: 'Discover how AI is changing the investment landscape', featured_image: 'https://picsum.photos/800/400?random=1', status: 'published', views: 234, published_at: new Date().toISOString() }
      ] 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      posts: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all blog posts (admin only - includes pending)
app.get('/api/blog/admin/posts', async (req, res) => {
  if (!supabase) {
    return res.json({ 
      success: true, 
      posts: [
        { id: 1, title: 'How AI is Transforming Venture Capital', content: 'Full content here...', author_name: 'Sarah Johnson', author_email: 'sarah@example.com', status: 'published', views: 234, created_at: new Date().toISOString() },
        { id: 2, title: 'Pending Post Example', content: 'Pending content...', author_name: 'John Doe', author_email: 'john@example.com', status: 'pending', views: 0, created_at: new Date().toISOString() }
      ] 
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      posts: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('Error fetching all posts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single blog post by ID (with view count increment)
app.get('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      post: { 
        id: parseInt(id), 
        title: 'Sample Blog Post', 
        content: 'This is sample content for the blog post...', 
        author_name: 'Sarah Johnson', 
        author_email: 'sarah@example.com',
        featured_image: 'https://picsum.photos/800/400?random=1',
        views: 234,
        published_at: new Date().toISOString()
      } 
    });
  }
  
  try {
    // Increment view count
    await supabase.rpc('increment_blog_view', { post_id: parseInt(id) });
    
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      post: data
    });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create a new blog post (with Turnstile verification)
app.post('/api/blog/posts', strictLimiter, async (req, res) => {
  const { title, content, author_name, author_email, excerpt, featured_image, tags, turnstile_token } = req.body;
  
  // Verify human with Turnstile
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Human verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed. Please try again.' });
  }
  
  // Validation
  if (!title || !content || !author_name || !author_email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Title, content, author name, and email are required' 
    });
  }
  
  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(author_email)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid email format' 
    });
  }
  
  const excerptText = excerpt || content.substring(0, 150);
  const defaultImage = `https://picsum.photos/800/400?random=${Date.now()}`;
  
  if (!supabase) {
    return res.json({ 
      success: true, 
      post: { 
        id: Date.now(), 
        title, 
        content, 
        author_name, 
        author_email, 
        excerpt: excerptText,
        featured_image: featured_image || defaultImage,
        status: 'pending',
        created_at: new Date().toISOString()
      },
      message: 'Post submitted for review (demo mode)!'
    });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .insert([{
        title: title.trim(),
        content,
        author_name: author_name.trim(),
        author_email: author_email.trim().toLowerCase(),
        excerpt: excerptText,
        featured_image: featured_image || defaultImage,
        tags: tags || [],
        status: 'pending',
        created_at: new Date().toISOString()
      }])
      .select();
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      post: data[0],
      message: 'Your post has been submitted for review! Admin will review and publish it soon.'
    });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Update blog post (admin only)
app.put('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, excerpt, featured_image, status, tags } = req.body;
  
  if (!supabase) {
    return res.json({ success: true, message: 'Post updated (demo mode)' });
  }
  
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (excerpt !== undefined) updateData.excerpt = excerpt;
  if (featured_image !== undefined) updateData.featured_image = featured_image;
  if (status !== undefined) updateData.status = status;
  if (tags !== undefined) updateData.tags = tags;
  
  // Set published_at when status changes to published
  if (status === 'published' && !updateData.published_at) {
    updateData.published_at = new Date().toISOString();
  }
  
  updateData.updated_at = new Date().toISOString();
  
  try {
    const { error } = await supabase
      .from('blog_posts')
      .update(updateData)
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: 'Post updated successfully!'
    });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Delete blog post (admin only)
app.delete('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true, message: 'Post deleted (demo mode)' });
  }
  
  try {
    const { error } = await supabase
      .from('blog_posts')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({ 
      success: true, 
      message: 'Blog post deleted successfully!'
    });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ==================== STATISTICS ====================

// Get platform statistics
app.get('/api/stats', async (req, res) => {
  let totalTickets = 0;
  let totalVlogs = 0;
  let totalBlogs = 0;
  
  if (supabase) {
    try {
      const [ticketsResult, vlogsResult, blogsResult] = await Promise.all([
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
        supabase.from('vlog_entries').select('*', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published')
      ]);
      
      totalTickets = ticketsResult.count || 0;
      totalVlogs = vlogsResult.count || 0;
      totalBlogs = blogsResult.count || 0;
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  } else {
    // Demo stats
    totalTickets = 3;
    totalVlogs = 4;
    totalBlogs = 3;
  }
  
  res.json({
    success: true,
    stats: {
      totalTickets,
      totalVlogs,
      totalBlogs,
      timestamp: new Date().toISOString()
    }
  });
});

// ==================== ROOT ENDPOINT ====================

app.get('/', (req, res) => {
  res.json({
    name: '3D Funding Vlog API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      turnstile: '/api/turnstile/site-key',
      tickets: '/api/support-tickets',
      vlogs: '/api/vlogs',
      blog: '/api/blog/posts',
      blogAdmin: '/api/blog/admin/posts',
      stats: '/api/stats'
    }
  });
});

// ==================== 404 HANDLER ====================

app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `Route ${req.originalUrl} not found` 
  });
});

// ==================== ERROR HANDLING MIDDLEWARE ====================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error',
    message: err.message 
  });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎥 Vlogs endpoint: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog endpoint: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets endpoint: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📈 Stats endpoint: http://localhost:${PORT}/api/stats`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Cloudflare Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});