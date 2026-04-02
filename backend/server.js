import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://soundandsilence.web.app', 'https://soundandsilence.firebaseapp.com', 'https://d-funding-blog.web.app'],
  credentials: true
}));
app.use(express.json());

// ==================== EMAIL CONFIGURATION ====================
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Generate random OTP code
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification email
async function sendVerificationEmail(email, code) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Sound & Silence - Email Verification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #8b5cf6;">Welcome to Sound & Silence!</h2>
        <p>Thank you for registering. Please use the following code to verify your email address:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 10px; color: #8b5cf6;">
          ${code}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <p style="color: #6b7280; font-size: 12px;">Sound & Silence - Science-based sober events in East London</p>
      </div>
    `
  };
  await emailTransporter.sendMail(mailOptions);
}

// Cloudflare Turnstile Configuration
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) return true;
  return true; // Simplified for demo
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
});
app.use('/api/', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many attempts',
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ==================== TURNSTILE ====================
app.get('/api/turnstile/site-key', (req, res) => {
  res.json({ siteKey: CLOUDFLARE_SITE_KEY });
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ==================== USER AUTHENTICATION ====================

// Register user with OTP
app.post('/api/auth/register', async (req, res) => {
  const { email, name } = req.body;
  
  if (!email || !name) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  
  if (!supabase) {
    return res.json({ success: true, message: 'Verification code sent (demo mode)' });
  }
  
  try {
    const { data: existing } = await supabase
      .from('app_users')
      .select('id, is_verified')
      .eq('email', email.toLowerCase())
      .single();
    
    if (existing && existing.is_verified) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    await supabase.from('email_verifications').insert([{
      email: email.toLowerCase(),
      code,
      expires_at: expiresAt.toISOString()
    }]);
    
    await sendVerificationEmail(email, code);
    
    if (existing && !existing.is_verified) {
      await supabase.from('app_users').update({ name }).eq('email', email.toLowerCase());
    } else {
      await supabase.from('app_users').insert([{
        email: email.toLowerCase(),
        name,
        user_type: 'user',
        is_verified: false
      }]);
    }
    
    res.json({ success: true, message: 'Verification code sent to your email' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify OTP
app.post('/api/auth/verify', async (req, res) => {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.status(400).json({ success: false, error: 'Email and code required' });
  }
  
  if (!supabase) {
    return res.json({ success: true, user: { id: 1, email, name: 'Test User', user_type: 'user' } });
  }
  
  try {
    const { data: verification } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('code', code)
      .eq('used', false)
      .single();
    
    if (!verification) {
      return res.status(400).json({ success: false, error: 'Invalid or expired code' });
    }
    
    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Code has expired' });
    }
    
    await supabase.from('email_verifications').update({ used: true }).eq('id', verification.id);
    
    const { data: user } = await supabase
      .from('app_users')
      .update({ is_verified: true, updated_at: new Date().toISOString() })
      .eq('email', email.toLowerCase())
      .select()
      .single();
    
    const sessionToken = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    
    res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, user_type: user.user_type }, session_token: sessionToken });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Google Login (simplified - Firebase handles actual Google auth)
app.post('/api/auth/google', async (req, res) => {
  const { email, name, google_id } = req.body;
  
  if (!email) {
    return res.status(400).json({ success: false, error: 'Email required' });
  }
  
  if (!supabase) {
    return res.json({ success: true, user: { id: 1, email, name: name || email.split('@')[0], user_type: 'user' } });
  }
  
  try {
    let { data: user } = await supabase.from('app_users').select('*').eq('email', email.toLowerCase()).single();
    
    if (!user) {
      const { data: newUser } = await supabase.from('app_users').insert([{
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        user_type: 'user',
        is_verified: true,
        last_login: new Date().toISOString()
      }]).select().single();
      user = newUser;
    } else {
      await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', user.id);
    }
    
    const sessionToken = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, user_type: user.user_type }, session_token: sessionToken });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token || !supabase) return res.json({ success: false, user: null });
  
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data: user } = await supabase.from('app_users').select('id, email, name, user_type').eq('id', userId).single();
    res.json({ success: true, user: user || null });
  } catch (error) {
    res.json({ success: false, user: null });
  }
});

// ==================== ONLINE USERS ====================

app.post('/api/online/track', async (req, res) => {
  const { session_id, user_name, user_id, current_page, user_agent, auth_token } = req.body;
  
  if (!session_id) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }
  
  let authenticatedUserId = null;
  let isAuthenticated = false;
  
  if (auth_token && supabase) {
    try {
      const userId = parseInt(Buffer.from(auth_token, 'base64').toString().split(':')[0]);
      const { data: user } = await supabase.from('app_users').select('id, name').eq('id', userId).single();
      if (user) {
        authenticatedUserId = user.id;
        isAuthenticated = true;
      }
    } catch (e) {}
  }
  
  if (!supabase) {
    return res.json({ success: true, onlineCount: 1, users: [] });
  }
  
  try {
    const now = new Date().toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    await supabase.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    
    const { data: existing } = await supabase.from('online_users').select('id').eq('session_id', session_id).maybeSingle();
    
    if (existing) {
      await supabase.from('online_users').update({ last_seen: now, current_page: current_page || null, user_name: user_name || 'Guest', user_id: authenticatedUserId, is_authenticated: isAuthenticated }).eq('session_id', session_id);
    } else {
      await supabase.from('online_users').insert([{ session_id, user_name: user_name || 'Guest', user_id: authenticatedUserId, is_authenticated: isAuthenticated, current_page: current_page || null, user_agent: user_agent || null, last_seen: now }]);
    }
    
    const { count: totalCount } = await supabase.from('online_users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo);
    const { data: authenticatedUsers } = await supabase.from('online_users').select('user_name, user_id, current_page, last_seen').eq('is_authenticated', true).gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false });
    const { data: guestUsers } = await supabase.from('online_users').select('user_name, current_page, last_seen').eq('is_authenticated', false).gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false }).limit(10);
    
    res.json({ success: true, onlineCount: totalCount || 0, authenticatedCount: authenticatedUsers?.length || 0, users: [...(authenticatedUsers || []), ...(guestUsers || [])] });
  } catch (error) {
    console.error('Error tracking user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/online/count', async (req, res) => {
  if (!supabase) return res.json({ success: true, onlineCount: 0, users: [] });
  
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    const { count } = await supabase.from('online_users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo);
    const { data: users } = await supabase.from('online_users').select('user_name, current_page, last_seen, is_authenticated').gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false });
    
    const uniqueUsers = [];
    const seenSessions = new Set();
    for (const user of users) {
      const key = `${user.user_name}_${user.current_page}`;
      if (!seenSessions.has(key)) {
        seenSessions.add(key);
        uniqueUsers.push(user);
      }
    }
    
    res.json({ success: true, onlineCount: uniqueUsers.length, users: uniqueUsers.slice(0, 20) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SUPPORT TICKETS ====================
app.get('/api/support-tickets', async (req, res) => {
  if (!supabase) return res.json({ success: true, tickets: [] });
  try {
    const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, tickets: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/support-tickets', strictLimiter, async (req, res) => {
  const { name, email, message, turnstile_token } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!name || !email || !message) return res.status(400).json({ success: false, error: 'All fields required' });
  
  if (!supabase) return res.json({ success: true, ticket: { id: Date.now() } });
  
  try {
    const { data, error } = await supabase.from('support_tickets').insert([{ name: name.trim(), email: email.trim().toLowerCase(), message: message.trim(), status: 'open', created_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, ticket: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/support-tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VLOGS ====================
app.get('/api/vlogs', async (req, res) => {
  if (!supabase) return res.json({ success: true, vlogs: [] });
  try {
    const { data, error } = await supabase.from('vlog_entries').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, vlogs: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vlogs', async (req, res) => {
  const { title, video_url, thumbnail } = req.body;
  if (!title || !video_url) return res.status(400).json({ success: false, error: 'Title and URL required' });
  
  let finalThumbnail = thumbnail;
  if (!finalThumbnail && video_url.includes('youtube.com/embed/')) {
    const videoId = video_url.split('embed/')[1]?.split('?')[0];
    if (videoId) finalThumbnail = `https://img.youtube.com/vi/${videoId}/0.jpg`;
  }
  
  if (!supabase) return res.json({ success: true, vlog: { id: Date.now() } });
  try {
    const { data, error } = await supabase.from('vlog_entries').insert([{ title: title.trim(), video_url, thumbnail: finalThumbnail, created_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, vlog: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, video_url, thumbnail } = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('vlog_entries').update({ title, video_url, thumbnail, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('vlog_entries').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BLOG POSTS ====================
app.get('/api/blog/posts', async (req, res) => {
  if (!supabase) return res.json({ success: true, posts: [] });
  try {
    const { data, error } = await supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/admin/posts', async (req, res) => {
  if (!supabase) return res.json({ success: true, posts: [] });
  try {
    const { data, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true, post: null });
  try {
    await supabase.rpc('increment_blog_view', { post_id: parseInt(id) });
    const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, post: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/blog/posts', strictLimiter, async (req, res) => {
  const { title, content, author_name, author_email, excerpt, featured_image, tags, turnstile_token } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!title || !content || !author_name || !author_email) return res.status(400).json({ success: false, error: 'Required fields missing' });
  
  const excerptText = excerpt || content.substring(0, 150);
  const defaultImage = `https://picsum.photos/800/400?random=${Date.now()}`;
  
  if (!supabase) return res.json({ success: true, post: { id: Date.now() } });
  try {
    const { data, error } = await supabase.from('blog_posts').insert([{ title: title.trim(), content, author_name: author_name.trim(), author_email: author_email.trim().toLowerCase(), excerpt: excerptText, featured_image: featured_image || defaultImage, tags: tags || [], status: 'pending', created_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, post: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
  updates.updated_at = new Date().toISOString();
  if (updates.status === 'published' && !updates.published_at) updates.published_at = new Date().toISOString();
  try {
    await supabase.from('blog_posts').update(updates).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('blog_posts').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== EVENTS ====================
app.get('/api/events', async (req, res) => {
  if (!supabase) return res.json({ success: true, events: [] });
  try {
    const { data, error } = await supabase.from('events').select('*').eq('status', 'upcoming').order('event_date', { ascending: true });
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/admin', async (req, res) => {
  if (!supabase) return res.json({ success: true, events: [] });
  try {
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true, event: null });
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, description, event_date, location, address, price, capacity, image_url, event_type, status, registration_link } = req.body;
  if (!title || !description || !event_date || !location) return res.status(400).json({ success: false, error: 'Required fields missing' });
  if (!supabase) return res.json({ success: true, event: { id: Date.now() } });
  try {
    const { data, error } = await supabase.from('events').insert([{ title: title.trim(), description, event_date, location: location.trim(), address: address || null, price: price || 'Free', capacity: capacity || null, image_url: image_url || null, event_type: event_type || 'regular', status: status || 'upcoming', registration_link: registration_link || null, created_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, event: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
  updates.updated_at = new Date().toISOString();
  try {
    await supabase.from('events').update(updates).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('events').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events/:id/register', async (req, res) => {
  const { id } = req.params;
  const { user_name, user_email, user_phone, special_requests } = req.body;
  if (!user_name || !user_email) return res.status(400).json({ success: false, error: 'Name and email required' });
  if (!supabase) return res.json({ success: true });
  try {
    const { data: event } = await supabase.from('events').select('capacity, status').eq('id', id).single();
    if (event.status !== 'upcoming') return res.status(400).json({ success: false, error: 'Event not open for registration' });
    if (event.capacity) {
      const { count } = await supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('event_id', id);
      if (count >= event.capacity) return res.status(400).json({ success: false, error: 'Event is full' });
    }
    const { data, error } = await supabase.from('event_registrations').insert([{ event_id: id, user_name: user_name.trim(), user_email: user_email.trim().toLowerCase(), user_phone: user_phone || null, special_requests: special_requests || null, registered_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, registration: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS ====================
app.get('/api/stats', async (req, res) => {
  let totalTickets = 0, totalVlogs = 0, totalBlogs = 0;
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
    } catch (error) {}
  }
  res.json({ success: true, stats: { totalTickets, totalVlogs, totalBlogs } });
});

// ==================== ROOT ====================
app.get('/', (req, res) => {
  res.json({ name: 'Sound & Silence API', version: '2.0.0', status: 'running' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🎵 Sound & Silence API running on port ${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`👥 Online: http://localhost:${PORT}/api/online/count`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth/me`);
});