import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://soundandsilence.web.app', 'https://soundandsilence.firebaseapp.com', 'https://d-funding-blog.web.app'],
  credentials: true
}));
app.use(express.json());

// Cloudflare Turnstile Configuration
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

// Turnstile verification function (simplified - actual implementation would call Cloudflare API)
async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) {
    console.warn('⚠️ Cloudflare Turnstile not configured. Skipping verification.');
    return true;
  }
  // In production, call Cloudflare API to verify token
  return true;
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
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
  console.error('❌ Missing Supabase credentials!');
  console.warn('⚠️ Running without Supabase - some features will not work');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ==================== TURNSTILE ====================

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

app.get('/api/support-tickets', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, tickets: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, tickets: data || [] });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/support-tickets', strictLimiter, async (req, res) => {
  const { name, email, message, turnstile_token } = req.body;
  
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Human verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }
  
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  
  if (!supabase) {
    return res.json({ success: true, ticket: { id: Date.now(), name, email, message, status: 'open' } });
  }
  
  try {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([{ name: name.trim(), email: email.trim().toLowerCase(), message: message.trim(), status: 'open', created_at: new Date().toISOString() }])
      .select();
    
    if (error) throw error;
    res.json({ success: true, ticket: data[0] });
  } catch (error) {
    console.error('Error creating ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/support-tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status || !['open', 'resolved', 'closed'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase
      .from('support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating ticket:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VLOG ENTRIES ====================

app.get('/api/vlogs', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, vlogs: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, vlogs: data || [] });
  } catch (error) {
    console.error('Error fetching vlogs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vlogs', async (req, res) => {
  const { title, video_url, thumbnail } = req.body;
  
  if (!title || !video_url) {
    return res.status(400).json({ success: false, error: 'Title and video_url required' });
  }
  
  let finalThumbnail = thumbnail;
  if (!finalThumbnail && video_url.includes('youtube.com/embed/')) {
    const videoId = video_url.split('embed/')[1]?.split('?')[0];
    if (videoId) finalThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
  }
  
  if (!supabase) {
    return res.json({ success: true, vlog: { id: Date.now() } });
  }
  
  try {
    const { data, error } = await supabase
      .from('vlog_entries')
      .insert([{ title: title.trim(), video_url, thumbnail: finalThumbnail, created_at: new Date().toISOString() }])
      .select();
    
    if (error) throw error;
    res.json({ success: true, vlog: data[0] });
  } catch (error) {
    console.error('Error creating vlog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, video_url, thumbnail } = req.body;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase
      .from('vlog_entries')
      .update({ title, video_url, thumbnail, updated_at: new Date().toISOString() })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating vlog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase.from('vlog_entries').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting vlog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BLOG POSTS ====================

app.get('/api/blog/posts', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, posts: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/admin/posts', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, posts: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    console.error('Error fetching all posts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true, post: null });
  }
  
  try {
    await supabase.rpc('increment_blog_view', { post_id: parseInt(id) });
    const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, post: data });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/blog/posts', strictLimiter, async (req, res) => {
  const { title, content, author_name, author_email, excerpt, featured_image, tags, turnstile_token } = req.body;
  
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Human verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }
  
  if (!title || !content || !author_name || !author_email) {
    return res.status(400).json({ success: false, error: 'Required fields missing' });
  }
  
  const excerptText = excerpt || content.substring(0, 150);
  const defaultImage = `https://picsum.photos/800/400?random=${Date.now()}`;
  
  if (!supabase) {
    return res.json({ success: true, post: { id: Date.now() } });
  }
  
  try {
    const { data, error } = await supabase
      .from('blog_posts')
      .insert([{ title: title.trim(), content, author_name: author_name.trim(), author_email: author_email.trim().toLowerCase(), excerpt: excerptText, featured_image: featured_image || defaultImage, tags: tags || [], status: 'pending', created_at: new Date().toISOString() }])
      .select();
    
    if (error) throw error;
    res.json({ success: true, post: data[0] });
  } catch (error) {
    console.error('Error creating blog post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, excerpt, featured_image, status, tags } = req.body;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  const updateData = {};
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (excerpt !== undefined) updateData.excerpt = excerpt;
  if (featured_image !== undefined) updateData.featured_image = featured_image;
  if (status !== undefined) updateData.status = status;
  if (tags !== undefined) updateData.tags = tags;
  if (status === 'published' && !updateData.published_at) updateData.published_at = new Date().toISOString();
  updateData.updated_at = new Date().toISOString();
  
  try {
    const { error } = await supabase.from('blog_posts').update(updateData).eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating blog post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase.from('blog_posts').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting blog post:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== EVENTS ====================

app.get('/api/events', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, events: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', 'upcoming')
      .order('event_date', { ascending: true });
    
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/admin', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, events: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) {
    console.error('Error fetching all events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true, event: null });
  }
  
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, description, event_date, location, address, price, capacity, image_url, event_type, status, registration_link } = req.body;
  
  if (!title || !description || !event_date || !location) {
    return res.status(400).json({ success: false, error: 'Required fields missing' });
  }
  
  if (!supabase) {
    return res.json({ success: true, event: { id: Date.now() } });
  }
  
  try {
    const { data, error } = await supabase
      .from('events')
      .insert([{ title: title.trim(), description, event_date, location: location.trim(), address: address || null, price: price || 'Free', capacity: capacity || null, image_url: image_url || null, event_type: event_type || 'regular', status: status || 'upcoming', registration_link: registration_link || null, created_at: new Date().toISOString() }])
      .select();
    
    if (error) throw error;
    res.json({ success: true, event: data[0] });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  updates.updated_at = new Date().toISOString();
  
  try {
    const { error } = await supabase.from('events').update(updates).eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase.from('events').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events/:id/register', async (req, res) => {
  const { id } = req.params;
  const { user_name, user_email, user_phone, special_requests } = req.body;
  
  if (!user_name || !user_email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { data: event, error: eventError } = await supabase.from('events').select('capacity, status').eq('id', id).single();
    if (eventError) throw eventError;
    
    if (event.status !== 'upcoming') {
      return res.status(400).json({ success: false, error: 'Event is not open for registration' });
    }
    
    if (event.capacity) {
      const { count, error: countError } = await supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('event_id', id);
      if (countError) throw countError;
      if (count >= event.capacity) {
        return res.status(400).json({ success: false, error: 'Event is full' });
      }
    }
    
    const { data, error } = await supabase
      .from('event_registrations')
      .insert([{ event_id: id, user_name: user_name.trim(), user_email: user_email.trim().toLowerCase(), user_phone: user_phone || null, special_requests: special_requests || null, registered_at: new Date().toISOString() }])
      .select();
    
    if (error) throw error;
    res.json({ success: true, registration: data[0] });
  } catch (error) {
    console.error('Error registering for event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id/registrations', async (req, res) => {
  const { id } = req.params;
  
  if (!supabase) {
    return res.json({ success: true, registrations: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .order('registered_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, registrations: data || [] });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS ====================

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
  }
  
  res.json({ success: true, stats: { totalTickets, totalVlogs, totalBlogs } });
});

app.post('/api/online/track', async (req, res) => {
  const { session_id, user_name, user_id, current_page, user_agent, ip_address } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }
  
  if (!supabase) {
    return res.json({ success: true, onlineCount: 1 });
  }
  
  try {
    // Check if session exists
    const { data: existing, error: findError } = await supabase
      .from('online_users')
      .select('id')
      .eq('session_id', session_id)
      .single();
    
    if (existing) {
      // Update existing session
      const { error: updateError } = await supabase
        .from('online_users')
        .update({ 
          last_seen: new Date().toISOString(),
          current_page,
          user_name: user_name || null,
          user_id: user_id || null
        })
        .eq('session_id', session_id);
      
      if (updateError) throw updateError;
    } else {
      // Create new session
      const { error: insertError } = await supabase
        .from('online_users')
        .insert([{ 
          session_id, 
          user_name: user_name || 'Guest',
          user_id: user_id || null,
          current_page,
          user_agent: user_agent || null,
          ip_address: ip_address || null,
          last_seen: new Date().toISOString()
        }]);
      
      if (insertError) throw insertError;
    }
    
    // Get current online count
    const { count, error: countError } = await supabase
      .from('online_users')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    
    if (countError) throw countError;
    
    // Also get active users list
    const { data: users, error: usersError } = await supabase
      .from('online_users')
      .select('user_name, current_page, last_seen')
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('last_seen', { ascending: false });
    
    if (usersError) throw usersError;
    
    res.json({ 
      success: true, 
      onlineCount: count || 0,
      users: users || []
    });
  } catch (error) {
    console.error('Error tracking user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/online/count', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, onlineCount: 1, users: [] });
  }
  
  try {
    // Clean up old sessions first
    await supabase.rpc('cleanup_old_sessions');
    
    const { count, error: countError } = await supabase
      .from('online_users')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString());
    
    if (countError) throw countError;
    
    const { data: users, error: usersError } = await supabase
      .from('online_users')
      .select('user_name, current_page, last_seen')
      .gte('last_seen', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order('last_seen', { ascending: false })
      .limit(20);
    
    if (usersError) throw usersError;
    
    res.json({ 
      success: true, 
      onlineCount: count || 0,
      users: users || []
    });
  } catch (error) {
    console.error('Error getting online count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Sound & Silence API',
    version: '2.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      turnstile: '/api/turnstile/site-key',
      tickets: '/api/support-tickets',
      vlogs: '/api/vlogs',
      blog: '/api/blog/posts',
      blogAdmin: '/api/blog/admin/posts',
      events: '/api/events',
      eventsAdmin: '/api/events/admin',
      stats: '/api/stats'
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`\n🎵 Sound & Silence API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 Cloudflare Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});