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

// Turnstile verification function
async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) {
    console.warn('⚠️ Cloudflare Turnstile not configured. Skipping verification.');
    return true;
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
  const siteKey = process.env.CLOUDFLARE_SITE_KEY || '';
  console.log('Turnstile site key requested, configured:', siteKey ? 'Yes' : 'No');
  res.json({ siteKey: siteKey });
});

app.post('/api/auth/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  
  console.log('Turnstile verification request received');
  
  if (!token) {
    console.log('No token provided');
    return res.status(400).json({ success: false, error: 'Turnstile token required' });
  }
  
  const secretKey = process.env.CLOUDFLARE_SECRET_KEY;
  
  if (!secretKey) {
    console.error('CLOUDFLARE_SECRET_KEY not set in environment');
    return res.status(500).json({ success: false, error: 'Server configuration error' });
  }
  
  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    });
    
    const data = await response.json();
    console.log('Cloudflare verification response:', data.success ? 'Success' : 'Failed', data['error-codes']);
    
    if (data.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Verification failed',
        details: data['error-codes'] 
      });
    }
  } catch (error) {
    console.error('Turnstile verification error:', error);
    res.status(500).json({ success: false, error: 'Verification service error' });
  }
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

//#region Authentication

// Get current user
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token || !supabase) return res.json({ success: false, user: null });
  
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data: user } = await supabase.from('app_users').select('id, email, name, user_type, nickname, hobbies, music_genres, location, bio, birth_date').eq('id', userId).single();
    res.json({ success: true, user: user || null });
  } catch (error) {
    res.json({ success: false, user: null });
  }
});

app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: false, user: null });
  
  try {
    const { data: user } = await supabase
      .from('app_users')
      .select('id, name, nickname, location, bio, hobbies, music_genres, birth_date')
      .eq('id', id)
      .single();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
//#endregion

//#region User Management
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, nickname, birth_date, hobbies, music_genres, location, bio } = req.body;
  
  if (!supabase) return res.json({ success: true });
  
  try {
    const { error } = await supabase
      .from('app_users')
      .update({ 
        name, 
        nickname, 
        birth_date, 
        hobbies, 
        music_genres, 
        location, 
        bio,
        birthdate_set: !!birth_date,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
//#endregion

// ==================== USER STATISTICS ====================

// Get user age statistics
app.get('/api/users/stats/age', async (req, res) => {
  if (!supabase) {
    return res.json({ 
      success: true, 
      stats: {
        totalUsers: 0,
        ageGroups: { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 },
        ages: [],
        averageAge: 0,
        minAge: null,
        maxAge: null
      }
    });
  }
  
  try {
    const { data: users, error } = await supabase
      .from('app_users')
      .select('birth_date');
    
    if (error) throw error;
    
    const totalUsers = users?.length || 0;
    
    let ageGroups = {
      child: 0,      // 0-12
      teenager: 0,   // 13-19
      youngAdult: 0, // 20-35
      adult: 0,      // 36-59
      senior: 0      // 60+
    };
    
    const ages = [];
    
    users?.forEach(user => {
      if (user.birth_date) {
        const birthDate = new Date(user.birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
        
        if (age >= 0 && age < 120) { // Sanity check
          ages.push(age);
          if (age <= 12) ageGroups.child++;
          else if (age <= 19) ageGroups.teenager++;
          else if (age <= 35) ageGroups.youngAdult++;
          else if (age <= 59) ageGroups.adult++;
          else ageGroups.senior++;
        }
      }
    });
    
    const averageAge = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const minAge = ages.length > 0 ? Math.min(...ages) : null;
    const maxAge = ages.length > 0 ? Math.max(...ages) : null;
    
    res.json({ 
      success: true, 
      stats: {
        totalUsers,
        ageGroups,
        ages: ages.sort((a, b) => a - b),
        averageAge,
        minAge,
        maxAge
      }
    });
  } catch (error) {
    console.error('Error fetching age stats:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      stats: {
        totalUsers: 0,
        ageGroups: { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 },
        averageAge: 0,
        minAge: null,
        maxAge: null
      }
    });
  }
});

//#region User Count
app.get('/api/users/count', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, count: 0 });
  }
  
  try {
    const { count, error } = await supabase
      .from('app_users')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    
    res.json({ success: true, count: count || 0 });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({ success: false, error: error.message });
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
      await supabase.from('online_users').update({ 
        last_seen: now, 
        current_page: current_page || null, 
        user_name: user_name || 'Guest', 
        user_id: authenticatedUserId, 
        is_authenticated: isAuthenticated 
      }).eq('session_id', session_id);
    } else {
      await supabase.from('online_users').insert([{ 
        session_id, 
        user_name: user_name || 'Guest', 
        user_id: authenticatedUserId, 
        is_authenticated: isAuthenticated, 
        current_page: current_page || null, 
        user_agent: user_agent || null, 
        last_seen: now 
      }]);
    }
    
    const { count: totalCount } = await supabase.from('online_users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo);
    const { data: authenticatedUsers } = await supabase.from('online_users').select('user_name, user_id, current_page, last_seen').eq('is_authenticated', true).gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false });
    const { data: guestUsers } = await supabase.from('online_users').select('user_name, current_page, last_seen').eq('is_authenticated', false).gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false }).limit(10);
    
    res.json({ 
      success: true, 
      onlineCount: totalCount || 0, 
      authenticatedCount: authenticatedUsers?.length || 0, 
      users: [...(authenticatedUsers || []), ...(guestUsers || [])] 
    });
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
//#endregion

//#region Contact Us
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, message, turnstile_token, supportType } = req.body;
  
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }
  
  if (!firstName || !lastName || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }
  
  if (!supabase) {
    console.log('Contact form submission:', { firstName, lastName, email, message, supportType });
    return res.json({ success: true, message: 'Message sent successfully!' });
  }
  
  try {
    const { error } = await supabase
      .from('contact_messages')
      .insert([{
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim(),
        support_type: supportType || null,
        status: 'unread',
        created_at: new Date().toISOString()
      }]);
    
    if (error) throw error;
    
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    console.error('Error saving contact message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get contact messages (admin only)
app.get('/api/contact/messages', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, messages: [] });
  }
  
  try {
    const { data, error } = await supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    res.json({ success: true, messages: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
//#endregion

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
  console.log(`👤 Users: http://localhost:${PORT}/api/users/count`);
  console.log(`🔐 Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});