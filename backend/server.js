import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import net from 'net';  // for SMTP debug endpoint

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ==================== PROXY TRUST ====================
app.set('trust proxy', 1);
console.log('✅ Trust proxy setting enabled');

// ==================== MIDDLEWARE ====================
app.use(cors({
  origin: ['http://localhost:5173', 'https://soundandsilence.web.app', 'https://soundandsilence.firebaseapp.com', 'https://d-funding-blog.web.app'],
  credentials: true
}));
app.use(express.json());

// ==================== CLOUDFLARE TURNSTILE ====================
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

// ==================== EMAIL CONFIGURATION (FIXED) ====================
let emailTransporter = null;
try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    // Explicit SMTP configuration with timeouts – solves connection timeout
    emailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',      // or process.env.SMTP_HOST if you switch providers
      port: 587,                    // or process.env.SMTP_PORT
      secure: false,                // true for 465, false for 587
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Critical timeouts (milliseconds)
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    console.log('✅ Email service configured (explicit SMTP)');
  } else {
    console.log('⚠️ Email credentials not set - email features disabled');
  }
} catch (error) {
  console.log('⚠️ Email service not configured:', error.message);
}

// ==================== FIREBASE ADMIN SDK ====================
let adminAuth = null;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  if (serviceAccount.project_id) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    adminAuth = getAdminAuth();
    console.log('✅ Firebase Admin SDK initialized');
  } else {
    console.warn('⚠️ Firebase Admin credentials missing – password reset will not work');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin init error:', err.message);
}

// ==================== TURNSTILE VERIFICATION ====================
async function verifyTurnstile(token) {
  if (!token) return false;
  if (!CLOUDFLARE_SECRET_KEY) {
    console.warn('⚠️ Cloudflare Turnstile not configured. Skipping verification.');
    return true;
  }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

// ==================== RATE LIMITING ====================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please try again later.',
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== SUPABASE CLIENT ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.warn('⚠️ Running without Supabase - some features will not work');
}
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// ==================== PROFESSIONAL EMAIL TEMPLATES ====================
// All email sending functions – now using the fixed transporter

async function sendContactEmailToAdmin({ firstName, lastName, email, message, supportType }) {
  if (!emailTransporter) return;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `New Contact Message from ${firstName} ${lastName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Type:</strong> ${supportType || 'General'}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      </div>
    `
  };
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Admin contact email sent');
  } catch (error) {
    console.error('❌ Failed to send admin contact email:', error);
  }
}

async function sendAutoReplyToUser(email, firstName, userMessage) {
  if (!emailTransporter) return;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'We received your message – Sound & Silence',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>Hello ${firstName},</h2>
        <p>Thank you for reaching out to Sound & Silence. We have received your message and will get back to you within 24 hours.</p>
        <p><strong>Your message:</strong><br>${userMessage.replace(/\n/g, '<br>')}</p>
        <p>In the meantime, feel free to explore our <a href="https://soundandsilence.com/events">upcoming events</a>.</p>
        <hr>
        <p style="font-size: 12px;">Sound & Silence – Science-based sober events</p>
      </div>
    `
  };
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Auto-reply sent to', email);
  } catch (error) {
    console.error('❌ Failed to send auto-reply:', error);
  }
}

async function sendSupportTicketEmailToAdmin({ name, email, message }) {
  if (!emailTransporter) return;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `New Support Ticket from ${name}`,
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Support Ticket</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      </div>
    `
  };
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Support ticket email sent to admin');
  } catch (error) {
    console.error('❌ Failed to send support ticket email:', error);
  }
}

async function sendSupportInquiryEmailToAdmin({ firstName, lastName, email, phone, message, supportType, organization, donationAmount }) {
  if (!emailTransporter) return;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `New Support Inquiry: ${supportType || 'General'} from ${firstName} ${lastName}`,
    html: `
      <div style="font-family: Arial, sans-serif;">
        <h2>Support Inquiry</h2>
        <p><strong>Name:</strong> ${firstName} ${lastName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
        <p><strong>Organization:</strong> ${organization || 'Not provided'}</p>
        <p><strong>Support Type:</strong> ${supportType || 'Not specified'}</p>
        <p><strong>Donation Amount:</strong> ${donationAmount || 'Not specified'}</p>
        <p><strong>Message:</strong></p>
        <p>${message ? message.replace(/\n/g, '<br>') : 'No message provided'}</p>
      </div>
    `
  };
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Support inquiry email sent to admin');
  } catch (error) {
    console.error('❌ Failed to send support inquiry email:', error);
  }
}

// ==================== FORGOT PASSWORD – OTP FUNCTIONS ====================
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendPasswordResetEmail(email, code) {
  if (!emailTransporter) return;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Sound & Silence – Password Reset OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;">
        <h2>Reset Your Password</h2>
        <p>Use the following OTP to reset your password. It expires in 10 minutes.</p>
        <div style="font-size: 32px; font-weight: bold; background: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px;">
          ${code}
        </div>
        <p>If you did not request this, please ignore this email.</p>
        <hr>
        <p style="font-size: 12px; color: #6b7280;">Sound & Silence – Science-based sober events</p>
      </div>
    `
  };
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Password reset OTP sent to', email);
  } catch (error) {
    console.error('❌ Failed to send password reset OTP:', error);
    throw error; // Re-throw so the endpoint knows it failed
  }
}

// ==================== DEBUG SMTP ENDPOINT ====================
app.get('/api/debug/smtp-test', (req, res) => {
  const socket = net.createConnection(587, 'smtp.gmail.com');
  socket.setTimeout(5000);

  socket.on('connect', () => {
    socket.destroy();
    res.json({ success: true, message: 'Can reach smtp.gmail.com:587' });
  });

  socket.on('timeout', () => {
    socket.destroy();
    res.status(500).json({ success: false, error: 'Connection timeout' });
  });

  socket.on('error', (err) => {
    socket.destroy();
    res.status(500).json({ success: false, error: err.message });
  });
});

// ==================== PASSWORD RESET ENDPOINTS ====================
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email required' });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ success: false, error: 'Invalid email' });

  if (adminAuth) {
    try {
      await adminAuth.getUserByEmail(email);
    } catch (err) {
      return res.status(404).json({ success: false, error: 'No account found with this email' });
    }
  }

  const code = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  if (!supabase) return res.status(500).json({ success: false, error: 'Database error' });

  await supabase.from('password_resets').update({ used: true }).eq('email', email).eq('used', false);
  const { error } = await supabase.from('password_resets').insert([{
    email: email.toLowerCase(),
    code,
    expires_at: expiresAt.toISOString(),
    used: false
  }]);

  if (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to save OTP' });
  }

  try {
    await sendPasswordResetEmail(email, code);
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (emailError) {
    // If email fails, still return success to user (don't leak internal error), but log it
    console.error('Email send failed, but OTP saved in DB:', emailError);
    res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
  }
});

app.post('/api/auth/verify-reset-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ success: false, error: 'Email and code required' });
  const { data, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('code', code)
    .eq('used', false)
    .single();

  if (error || !data) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
  if (new Date(data.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'OTP has expired' });

  await supabase.from('password_resets').update({ used: true }).eq('id', data.id);
  res.json({ success: true, message: 'OTP verified' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) return res.status(400).json({ success: false, error: 'Email and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  if (!adminAuth) return res.status(500).json({ success: false, error: 'Password reset service unavailable' });

  try {
    const userRecord = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(userRecord.uid, { password: newPassword });
    await supabase.from('password_resets').delete().eq('email', email.toLowerCase());
    res.json({ success: true, message: 'Password updated successfully. Please log in.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to update password' });
  }
});

// ==================== TURNSTILE ENDPOINTS ====================
app.get('/api/turnstile/site-key', (req, res) => {
  res.json({ siteKey: CLOUDFLARE_SITE_KEY });
});

app.post('/api/auth/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Turnstile token required' });
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
    environment: process.env.NODE_ENV || 'development',
    supabase: supabase ? 'connected' : 'not configured',
    turnstile: CLOUDFLARE_SITE_KEY ? 'configured' : 'not configured',
    email: emailTransporter ? 'configured' : 'not configured',
    firebaseAdmin: adminAuth ? 'configured' : 'not configured'
  });
});

// ==================== CONTACT FORM ====================
app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, message, turnstile_token, supportType } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!firstName || !lastName || !email || !message) return res.status(400).json({ success: false, error: 'All fields required' });

  await sendContactEmailToAdmin({ firstName, lastName, email, message, supportType });
  await sendAutoReplyToUser(email, firstName, message);

  if (supabase) {
    try {
      await supabase.from('contact_messages').insert([{
        first_name: firstName.trim(), last_name: lastName.trim(),
        email: email.trim().toLowerCase(), message: message.trim(),
        support_type: supportType || null, status: 'unread',
        created_at: new Date().toISOString()
      }]);
    } catch (error) { console.error('Error saving contact message:', error); }
  }
  res.json({ success: true, message: 'Message sent successfully! We\'ll get back to you soon.' });
});

app.get('/api/contact/messages', async (req, res) => {
  if (!supabase) return res.json({ success: true, messages: [] });
  try {
    const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, messages: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== SUPPORT TICKETS ====================
app.get('/api/support-tickets', async (req, res) => {
  if (!supabase) return res.json({ success: true, tickets: [] });
  try {
    const { data, error } = await supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, tickets: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/support-tickets', strictLimiter, async (req, res) => {
  const { name, email, message, turnstile_token } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!name || !email || !message) return res.status(400).json({ success: false, error: 'All fields required' });

  await sendSupportTicketEmailToAdmin({ name, email, message });
  if (!supabase) return res.json({ success: true, ticket: { id: Date.now() } });

  try {
    const { data, error } = await supabase.from('support_tickets').insert([{
      name: name.trim(), email: email.trim().toLowerCase(), message: message.trim(),
      status: 'open', created_at: new Date().toISOString()
    }]).select();
    if (error) throw error;
    res.json({ success: true, ticket: data[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/support-tickets/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== SUPPORT US ====================
app.post('/api/support-us', async (req, res) => {
  const { firstName, lastName, email, phone, message, interests, availability, organization, donationAmount, supportType, turnstile_token } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!firstName || !lastName || !email) return res.status(400).json({ success: false, error: 'Name and email required' });

  await sendSupportInquiryEmailToAdmin({ firstName, lastName, email, phone, message, supportType, organization, donationAmount });
  if (!supabase) return res.json({ success: true });

  try {
    await supabase.from('support_inquiries').insert([{
      first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase(),
      phone: phone || null, message: message || null, interests: interests || [], availability: availability || null,
      organization: organization || null, donation_amount: donationAmount || null, support_type: supportType,
      status: 'pending', created_at: new Date().toISOString()
    }]);
    res.json({ success: true, message: 'Thank you for your support! We will contact you soon.' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== USER AUTHENTICATION ====================
app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token || !supabase) return res.json({ success: false, user: null });
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data: user } = await supabase.from('app_users').select('id, email, name, user_type, nickname, hobbies, music_genres, location, bio, birth_date, gender').eq('id', userId).single();
    res.json({ success: true, user: user || null });
  } catch (error) { res.json({ success: false, user: null }); }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, nickname, birth_date, hobbies, music_genres, location, bio, gender } = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    const { error } = await supabase
      .from('app_users')
      .update({ 
        name, nickname, birth_date, hobbies, music_genres, location, bio,
        birthdate_set: !!birth_date,
        gender: gender || 'prefer_not_to_say',
        updated_at: new Date().toISOString()
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER STATISTICS ====================
app.get('/api/users/count', async (req, res) => {
  if (!supabase) return res.json({ success: true, count: 0 });
  try {
    const { count, error } = await supabase.from('app_users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ success: true, count: count || 0 });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/users/stats/age', async (req, res) => {
  if (!supabase) return res.json({ success: true, stats: { totalUsers: 0, ageGroups: { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 } } });
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
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: false, user: null });
  try {
    const { data: user } = await supabase.from('app_users').select('id, name, nickname, location, bio, hobbies, music_genres, birth_date, gender').eq('id', id).single();
    res.json({ success: true, user });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/users/my-events', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token || !supabase) return res.json({ success: false, registrations: [] });
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data, error } = await supabase
      .from('event_registrations')
      .select(`id, registered_at, events!inner (id, title, event_date, location, image_url)`)
      .eq('user_id', userId);
    if (error) throw error;
    const registrations = (data || []).map(reg => ({
      id: reg.id,
      registered_at: reg.registered_at,
      event_id: reg.events.id,
      event_title: reg.events.title,
      event_date: reg.events.event_date,
      event_location: reg.events.location,
      event_image: reg.events.image_url
    }));
    res.json({ success: true, registrations });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
      if (user) { authenticatedUserId = userId; isAuthenticated = true; }
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
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/online/count', async (req, res) => {
  if (!supabase) return res.json({ success: true, onlineCount: 0, users: [] });
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    const { count } = await supabase.from('online_users').select('*', { count: 'exact', head: true });
    const { data: users } = await supabase.from('online_users').select('user_name, current_page, last_seen').order('last_seen', { ascending: false });
    res.json({ success: true, onlineCount: count || 0, users: users || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== VLOGS ====================
app.get('/api/vlogs', async (req, res) => {
  if (!supabase) return res.json({ success: true, vlogs: [] });
  try {
    const { data, error } = await supabase.from('vlog_entries').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, vlogs: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, video_url, thumbnail } = req.body;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('vlog_entries').update({ title, video_url, thumbnail, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('vlog_entries').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== BLOG POSTS ====================
app.get('/api/blog/posts', async (req, res) => {
  if (!supabase) return res.json({ success: true, posts: [] });
  try {
    const { data, error } = await supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/blog/admin/posts', async (req, res) => {
  if (!supabase) return res.json({ success: true, posts: [] });
  try {
    const { data, error } = await supabase.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true, post: null });
  try {
    await supabase.rpc('increment_blog_view', { post_id: parseInt(id) });
    const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, post: data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    const { data, error } = await supabase.from('blog_posts').insert([{
      title: title.trim(), content, author_name: author_name.trim(), author_email: author_email.trim().toLowerCase(),
      excerpt: excerptText, featured_image: featured_image || defaultImage, tags: tags || [], status: 'pending',
      created_at: new Date().toISOString()
    }]).select();
    if (error) throw error;
    res.json({ success: true, post: data[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('blog_posts').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== EVENTS ====================
app.get('/api/events', async (req, res) => {
  if (!supabase) return res.json({ success: true, events: [] });
  try {
    const { data, error } = await supabase.from('events').select('*').eq('status', 'upcoming').order('event_date', { ascending: true });
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/events/admin', async (req, res) => {
  if (!supabase) return res.json({ success: true, events: [] });
  try {
    const { data, error } = await supabase.from('events').select('*').order('event_date', { ascending: false });
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true, event: null });
  try {
    const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/events', async (req, res) => {
  const { title, description, event_date, location, address, price, capacity, image_url, event_type, status, registration_link } = req.body;
  if (!title || !description || !event_date || !location) return res.status(400).json({ success: false, error: 'Required fields missing' });
  if (!supabase) return res.json({ success: true, event: { id: Date.now() } });
  try {
    const { data, error } = await supabase.from('events').insert([{
      title: title.trim(), description, event_date, location: location.trim(), address: address || null,
      price: price || 'Free', capacity: capacity || null, image_url: image_url || null,
      event_type: event_type || 'regular', status: status || 'upcoming', registration_link: registration_link || null,
      created_at: new Date().toISOString()
    }]).select();
    if (error) throw error;
    res.json({ success: true, event: data[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!supabase) return res.json({ success: true });
  updates.updated_at = new Date().toISOString();
  try {
    await supabase.from('events').update(updates).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  if (!supabase) return res.json({ success: true });
  try {
    await supabase.from('events').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
    const { data, error } = await supabase.from('event_registrations').insert([{
      event_id: id, user_name: user_name.trim(), user_email: user_email.trim().toLowerCase(),
      user_phone: user_phone || null, special_requests: special_requests || null,
      registered_at: new Date().toISOString()
    }]).select();
    if (error) throw error;
    res.json({ success: true, registration: data[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
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
  console.log(`📧 Email: ${emailTransporter ? 'Configured' : 'Not configured'}`);
  console.log(`🔐 Firebase Admin: ${adminAuth ? 'Configured' : 'Not configured'}`);
  console.log(`📋 Rate Limiting: Active`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`👥 Online: http://localhost:${PORT}/api/online/count`);
  console.log(`👤 Users: http://localhost:${PORT}/api/users/count`);
  console.log(`🔐 Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});