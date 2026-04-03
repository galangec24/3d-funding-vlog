import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== PROXY TRUST SETTING ====================
app.set('trust proxy', 1);
console.log('✅ Trust proxy setting enabled');

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://soundandsilence.web.app', 'https://soundandsilence.firebaseapp.com', 'https://d-funding-blog.web.app'],
  credentials: true
}));
app.use(express.json());

// Cloudflare Turnstile Configuration
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

// Email Configuration
let emailTransporter = null;

try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    emailTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    console.log('✅ Email service configured');
  } else {
    console.log('⚠️ Email credentials not set');
  }
} catch (error) {
  console.log('⚠️ Email error:', error.message);
}

// ==================== IP-BASED RATE LIMITING ====================

const submissionTracker = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, data] of submissionTracker.entries()) {
    if (now - data.timestamp > 24 * 60 * 60 * 1000) {
      submissionTracker.delete(key);
    }
  }
}, 60 * 60 * 1000);

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function checkRateLimit(ip, formType) {
  const now = Date.now();
  const key = `${ip}:${formType}`;
  const record = submissionTracker.get(key);
  
  const limits = {
    contact: { maxPerDay: 3, cooldownMinutes: 5 },
    support: { maxPerDay: 5, cooldownMinutes: 2 },
    volunteer: { maxPerDay: 2, cooldownMinutes: 10 },
    partner: { maxPerDay: 2, cooldownMinutes: 10 },
    donate: { maxPerDay: 2, cooldownMinutes: 10 }
  };
  
  const limit = limits[formType] || { maxPerDay: 3, cooldownMinutes: 5 };
  
  if (!record) {
    return { allowed: true, remaining: limit.maxPerDay };
  }
  
  const secondsSinceLast = (now - record.lastSubmission) / 1000;
  const cooldownSeconds = limit.cooldownMinutes * 60;
  if (secondsSinceLast < cooldownSeconds) {
    const waitSeconds = Math.ceil(cooldownSeconds - secondsSinceLast);
    return { allowed: false, reason: `Please wait ${waitSeconds} seconds before submitting again.`, waitSeconds };
  }
  
  const hoursSinceFirst = (now - record.timestamp) / (1000 * 60 * 60);
  if (hoursSinceFirst >= 24) {
    submissionTracker.delete(key);
    return { allowed: true, remaining: limit.maxPerDay };
  }
  
  if (record.count >= limit.maxPerDay) {
    const resetHours = 24 - hoursSinceFirst;
    return { allowed: false, reason: `Daily limit reached. You can submit again in ${Math.ceil(resetHours)} hours.`, resetHours };
  }
  
  return { allowed: true, remaining: limit.maxPerDay - record.count - 1 };
}

function recordSubmission(ip, formType) {
  const now = Date.now();
  const key = `${ip}:${formType}`;
  const existing = submissionTracker.get(key);
  
  const limits = { contact: 3, support: 5, volunteer: 2, partner: 2, donate: 2 };
  const limit = limits[formType] || 3;
  
  if (!existing) {
    submissionTracker.set(key, { count: 1, timestamp: now, lastSubmission: now });
  } else {
    submissionTracker.set(key, {
      count: existing.count + 1,
      timestamp: existing.timestamp,
      lastSubmission: now
    });
  }
}

// ==================== EMAIL FUNCTIONS ====================

async function sendContactEmailToAdmin(data) {
  if (!emailTransporter) return;
  
  const { firstName, lastName, email, message, supportType } = data;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `📧 New Contact Message from ${firstName} ${lastName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #8b5cf6;">New Contact Form Submission</h2>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          ${supportType ? `<p><strong>Inquiry Type:</strong> ${supportType}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
        <p style="color: #6b7280; font-size: 12px;">Reply directly to this email to respond to ${firstName}.</p>
      </div>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Admin email sent');
  } catch (error) {
    console.error('❌ Email error:', error);
  }
}

async function sendAutoReplyToUser(email, firstName, message) {
  if (!emailTransporter) return;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Thank you for contacting Sound & Silence',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #8b5cf6;">Thank you, ${firstName}!</h2>
        <p>We've received your message and will get back to you within 24 hours.</p>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Your message:</strong></p>
          <p>${message.substring(0, 200)}${message.length > 200 ? '...' : ''}</p>
        </div>
        <p style="color: #6b7280; font-size: 12px;">Sound & Silence - Science-based sober events in East London</p>
      </div>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Auto-reply sent');
  } catch (error) {
    console.error('❌ Auto-reply error:', error);
  }
}

async function sendSupportTicketEmailToAdmin(data) {
  if (!emailTransporter) return;
  
  const { name, email, message } = data;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `🎫 New Support Ticket from ${name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #8b5cf6;">New Support Ticket</h2>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Support ticket email sent');
  } catch (error) {
    console.error('❌ Support ticket email error:', error);
  }
}

async function sendSupportInquiryEmailToAdmin(data) {
  if (!emailTransporter) return;
  
  const { firstName, lastName, email, message, supportType, organization, donationAmount } = data;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `🤝 New ${supportType.charAt(0).toUpperCase() + supportType.slice(1)} Inquiry from ${firstName} ${lastName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #8b5cf6;">New ${supportType.toUpperCase()} Inquiry</h2>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>Name:</strong> ${firstName} ${lastName}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          ${organization ? `<p><strong>Organization:</strong> ${organization}</p>` : ''}
          ${donationAmount ? `<p><strong>Donation Amount:</strong> ${donationAmount}</p>` : ''}
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message || 'No additional message.'}</p>
        </div>
      </div>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`✅ ${supportType} inquiry email sent`);
  } catch (error) {
    console.error(`❌ ${supportType} email error:`, error);
  }
}

// Turnstile verification
async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) return true;
  
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: CLOUDFLARE_SECRET_KEY, response: token }).toString(),
    });
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Turnstile error:', error);
    return false;
  }
}

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
  keyGenerator: (req) => getClientIp(req),
});
app.use('/api/', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many attempts',
  keyGenerator: (req) => getClientIp(req),
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

app.post('/api/auth/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  const isValid = await verifyTurnstile(token);
  if (isValid) res.json({ success: true });
  else res.status(400).json({ success: false, error: 'Verification failed' });
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    email: emailTransporter ? 'configured' : 'not configured'
  });
});

// ==================== RATE LIMIT STATUS ====================

app.get('/api/rate-limit-status', (req, res) => {
  const ip = getClientIp(req);
  const formType = req.query.type || 'contact';
  const result = checkRateLimit(ip, formType);
  res.json({ success: true, allowed: result.allowed, remaining: result.remaining || 0, reason: result.reason || null });
});

// ==================== CONTACT FORM ====================

app.post('/api/contact', async (req, res) => {
  try {
    const { firstName, lastName, email, message, turnstile_token, supportType } = req.body;
    const ip = getClientIp(req);
    
    console.log('📬 Contact received:', { firstName, lastName, email });
    
    if (!firstName || !lastName || !email || !message) {
      return res.status(400).json({ success: false, error: 'All fields required' });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }
    
    const rateLimitResult = checkRateLimit(ip, 'contact');
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ success: false, error: rateLimitResult.reason });
    }
    
    if (!turnstile_token) {
      return res.status(400).json({ success: false, error: 'Verification required' });
    }
    
    const isHuman = await verifyTurnstile(turnstile_token);
    if (!isHuman) {
      return res.status(400).json({ success: false, error: 'Verification failed' });
    }
    
    recordSubmission(ip, 'contact');
    
    // Fire and forget emails
    sendContactEmailToAdmin({ firstName, lastName, email, message, supportType }).catch(console.error);
    sendAutoReplyToUser(email, firstName, message).catch(console.error);
    
    if (supabase) {
      try {
        await supabase.from('contact_messages').insert([{
          first_name: firstName.trim(), last_name: lastName.trim(),
          email: email.trim().toLowerCase(), message: message.trim(),
          support_type: supportType || null, ip_address: ip,
          status: 'unread', created_at: new Date().toISOString()
        }]);
        console.log('✅ Contact saved to database');
      } catch (dbError) {
        console.error('Database error:', dbError);
      }
    }
    
    res.json({ success: true, message: 'Message sent successfully!' });
    
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/contact/messages', async (req, res) => {
  if (!supabase) return res.json({ success: true, messages: [] });
  try {
    const { data } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
    res.json({ success: true, messages: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SUPPORT TICKETS ====================

app.get('/api/support-tickets', async (req, res) => {
  if (!supabase) return res.json({ success: true, tickets: [] });
  try {
    const { data } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    res.json({ success: true, tickets: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/support-tickets', strictLimiter, async (req, res) => {
  const { name, email, message, turnstile_token } = req.body;
  const ip = getClientIp(req);
  
  const rateLimitResult = checkRateLimit(ip, 'support');
  if (!rateLimitResult.allowed) {
    return res.status(429).json({ success: false, error: rateLimitResult.reason });
  }
  
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!name || !email || !message) return res.status(400).json({ success: false, error: 'All fields required' });
  
  recordSubmission(ip, 'support');
  sendSupportTicketEmailToAdmin({ name, email, message }).catch(console.error);
  
  if (!supabase) return res.json({ success: true });
  
  try {
    const { data } = await supabase.from('support_tickets').insert([{
      name: name.trim(), email: email.trim().toLowerCase(), message: message.trim(),
      status: 'open', ip_address: ip, created_at: new Date().toISOString()
    }]).select();
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
    await supabase.from('support_tickets').update({ status }).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SUPPORT US ====================

app.post('/api/support-us', async (req, res) => {
  const { firstName, lastName, email, phone, message, supportType, organization, donationAmount, turnstile_token } = req.body;
  const ip = getClientIp(req);
  
  const rateLimitResult = checkRateLimit(ip, supportType);
  if (!rateLimitResult.allowed) {
    return res.status(429).json({ success: false, error: rateLimitResult.reason });
  }
  
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!firstName || !lastName || !email) return res.status(400).json({ success: false, error: 'Name and email required' });
  
  recordSubmission(ip, supportType);
  sendSupportInquiryEmailToAdmin({ firstName, lastName, email, phone, message, supportType, organization, donationAmount }).catch(console.error);
  
  if (!supabase) return res.json({ success: true });
  
  try {
    await supabase.from('support_inquiries').insert([{
      first_name: firstName.trim(), last_name: lastName.trim(),
      email: email.trim().toLowerCase(), phone: phone || null, message: message || null,
      organization: organization || null, donation_amount: donationAmount || null,
      support_type: supportType, ip_address: ip, status: 'pending', created_at: new Date().toISOString()
    }]);
    res.json({ success: true, message: 'Thank you for your support!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER AUTHENTICATION ====================

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token || !supabase) return res.json({ success: false, user: null });
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data: user } = await supabase.from('app_users').select('id, email, name').eq('id', userId).single();
    res.json({ success: true, user: user || null });
  } catch (error) {
    res.json({ success: false, user: null });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('app_users').update(updates).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER STATISTICS ====================

app.get('/api/users/count', async (req, res) => {
  if (!supabase) return res.json({ success: true, count: 0 });
  try {
    const { count } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
    res.json({ success: true, count: count || 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/users/stats/age', async (req, res) => {
  if (!supabase) {
    return res.json({ success: true, stats: { totalUsers: 0, ageGroups: { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 } } });
  }
  try {
    const { data: users } = await supabase.from('app_users').select('birth_date');
    const totalUsers = users?.length || 0;
    let ageGroups = { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 };
    const ages = [];
    users?.forEach(user => {
      if (user.birth_date) {
        const birthDate = new Date(user.birth_date);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
        if (age >= 0) {
          ages.push(age);
          if (age <= 12) ageGroups.child++;
          else if (age <= 19) ageGroups.teenager++;
          else if (age <= 35) ageGroups.youngAdult++;
          else if (age <= 59) ageGroups.adult++;
          else ageGroups.senior++;
        }
      }
    });
    res.json({ success: true, stats: { totalUsers, ageGroups, averageAge: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0 } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: false, user: null });
  try {
    const { data: user } = await supabase.from('app_users').select('id, name, nickname, location, bio, hobbies, music_genres, birth_date').eq('id', id).single();
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== ONLINE USERS ====================

app.post('/api/online/track', async (req, res) => {
  const { session_id, user_name, user_id, current_page, user_agent, auth_token } = req.body;
  if (!session_id) return res.status(400).json({ success: false, error: 'Session ID required' });
  
  let authenticatedUserId = null;
  let isAuthenticated = false;
  
  if (auth_token && supabase) {
    try {
      const userId = parseInt(Buffer.from(auth_token, 'base64').toString().split(':')[0]);
      const { data: user } = await supabase.from('app_users').select('id').eq('id', userId).single();
      if (user) { authenticatedUserId = user.id; isAuthenticated = true; }
    } catch (e) {}
  }
  
  if (!supabase) return res.json({ success: true, onlineCount: 0, users: [] });
  
  try {
    const now = new Date().toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    
    const { data: existing } = await supabase.from('online_users').select('id').eq('session_id', session_id).maybeSingle();
    if (existing) {
      await supabase.from('online_users').update({ last_seen: now, current_page: current_page || null, user_id: authenticatedUserId, is_authenticated: isAuthenticated }).eq('session_id', session_id);
    } else if (isAuthenticated) {
      await supabase.from('online_users').insert([{ session_id, user_name: user_name || 'User', user_id: authenticatedUserId, is_authenticated: true, current_page: current_page || null, user_agent: user_agent || null, last_seen: now }]);
    }
    
    const { count } = await supabase.from('online_users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo);
    const { data: users } = await supabase.from('online_users').select('user_name, current_page, last_seen').gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false });
    
    res.json({ success: true, onlineCount: count || 0, users: users || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/online/count', async (req, res) => {
  if (!supabase) return res.json({ success: true, onlineCount: 0, users: [] });
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    const { count } = await supabase.from('online_users').select('*', { count: 'exact', head: true });
    const { data: users } = await supabase.from('online_users').select('user_name, current_page, last_seen').order('last_seen', { ascending: false });
    res.json({ success: true, onlineCount: count || 0, users: users || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== VLOGS ====================

app.get('/api/vlogs', async (req, res) => {
  if (!supabase) return res.json({ success: true, vlogs: [] });
  try {
    const { data } = await supabase.from('vlog_entries').select('*').order('created_at', { ascending: false });
    res.json({ success: true, vlogs: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/vlogs', async (req, res) => {
  const { title, video_url, thumbnail } = req.body;
  if (!title || !video_url) return res.status(400).json({ success: false, error: 'Title and URL required' });
  if (!supabase) return res.json({ success: true });
  try {
    const { data } = await supabase.from('vlog_entries').insert([{ title: title.trim(), video_url, thumbnail, created_at: new Date().toISOString() }]).select();
    res.json({ success: true, vlog: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('vlog_entries').update(updates).eq('id', id);
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
    const { data } = await supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/admin/posts', async (req, res) => {
  if (!supabase) return res.json({ success: true, posts: [] });
  try {
    const { data } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
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
    const { data } = await supabase.from('blog_posts').select('*').eq('id', id).single();
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
  
  if (!supabase) return res.json({ success: true });
  try {
    const { data } = await supabase.from('blog_posts').insert([{ title: title.trim(), content, author_name: author_name.trim(), author_email: author_email.trim().toLowerCase(), excerpt: excerptText, featured_image: featured_image || defaultImage, tags: tags || [], status: 'pending', created_at: new Date().toISOString() }]).select();
    res.json({ success: true, post: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
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
    const { data } = await supabase.from('events').select('*').eq('status', 'upcoming').order('event_date', { ascending: true });
    res.json({ success: true, events: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/admin', async (req, res) => {
  if (!supabase) return res.json({ success: true, events: [] });
  try {
    const { data } = await supabase.from('events').select('*').order('event_date', { ascending: false });
    res.json({ success: true, events: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true, event: null });
  try {
    const { data } = await supabase.from('events').select('*').eq('id', id).single();
    res.json({ success: true, event: data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, description, event_date, location, address, price, capacity, image_url, event_type, status, registration_link } = req.body;
  if (!title || !description || !event_date || !location) return res.status(400).json({ success: false, error: 'Required fields missing' });
  if (!supabase) return res.json({ success: true });
  try {
    const { data } = await supabase.from('events').insert([{ title: title.trim(), description, event_date, location: location.trim(), address: address || null, price: price || 'Free', capacity: capacity || null, image_url: image_url || null, event_type: event_type || 'regular', status: status || 'upcoming', registration_link: registration_link || null, created_at: new Date().toISOString() }]).select();
    res.json({ success: true, event: data[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
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
    if (event.status !== 'upcoming') return res.status(400).json({ success: false, error: 'Event not open' });
    if (event.capacity) {
      const { count } = await supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('event_id', id);
      if (count >= event.capacity) return res.status(400).json({ success: false, error: 'Event is full' });
    }
    const { data } = await supabase.from('event_registrations').insert([{ event_id: id, user_name: user_name.trim(), user_email: user_email.trim().toLowerCase(), user_phone: user_phone || null, special_requests: special_requests || null, registered_at: new Date().toISOString() }]).select();
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
      const [tickets, vlogs, blogs] = await Promise.all([
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }),
        supabase.from('vlog_entries').select('*', { count: 'exact', head: true }),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published')
      ]);
      totalTickets = tickets.count || 0;
      totalVlogs = vlogs.count || 0;
      totalBlogs = blogs.count || 0;
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
  console.log(`📧 Email: ${emailTransporter ? 'Configured' : 'Not configured'}`);
  console.log(`📋 Rate Limiting: Active`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`👥 Online: http://localhost:${PORT}/api/online/count`);
  console.log(`👤 Users: http://localhost:${PORT}/api/users/count`);
  console.log(`🔐 Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});