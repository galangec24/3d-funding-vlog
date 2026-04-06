import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import rateLimit from 'express-rate-limit';
import admin from 'firebase-admin';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

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

// ==================== ENVIRONMENT VALIDATION ====================
const requiredEnv = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const envVar of requiredEnv) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing ${envVar} in environment variables`);
    process.exit(1);
  }
}

// ==================== SUPABASE CLIENTS ====================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
console.log('✅ Supabase clients initialized (anon + admin)');

// ==================== CLOUDINARY CONFIGURATION (OVERWRITE ENABLED) ====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => ({
    folder: 'user_avatars',
    public_id: `user_${req.user.uid}`,   // Fixed per user – overwrites previous
    overwrite: true,
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'limit' }],
  }),
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  },
});

const blogImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'blog_images',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 1200, crop: 'limit' }],  // optional: resize for blog images
  },
});
const uploadBlogImage = multer({
  storage: blogImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for blog images
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images are allowed'), false);
  },
});

const blogMediaStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');
    return {
      folder: 'blog_media',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo ? ['mp4', 'webm', 'mov'] : ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: isVideo ? [{ width: 1280, crop: 'limit' }] : [{ width: 1200, crop: 'limit' }],
    };
  },
});

const uploadBlogMedia = multer({
  storage: blogMediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'), false);
    }
  },
});

// ==================== BREVO EMAIL API (DIRECT FETCH, NO SDK) ====================
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@yourdomain.com';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'Sound & Silence';

async function sendEmailViaBrevo({ to, subject, htmlContent }) {
  if (!BREVO_API_KEY) {
    console.warn('⚠️ BREVO_API_KEY missing – email not sent');
    return false;
  }

  const url = 'https://api.brevo.com/v3/smtp/email';
  const payload = {
    sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
    to: [{ email: to }],
    subject: subject,
    htmlContent: htmlContent
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Brevo API error (${response.status}):`, errorText);
      return false;
    }

    const data = await response.json();
    console.log(`✅ Email sent to ${to}`, data.messageId);
    return true;
  } catch (error) {
    console.error('Brevo fetch error:', error);
    return false;
  }
}

// ==================== CLOUDFLARE TURNSTILE ====================
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

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
    console.warn('⚠️ Firebase Admin credentials missing');
  }
} catch (err) {
  console.warn('⚠️ Firebase Admin init error:', err.message);
}

// ==================== MIDDLEWARE: VERIFY FIREBASE TOKEN ====================
const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  if (!token || !adminAuth) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ==================== ADMIN AUTHENTICATION MIDDLEWARE ====================
const verifyAdminToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  if (!token || !adminAuth) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
    if (!adminEmails.includes(decoded.email?.toLowerCase())) {
      return res.status(403).json({ success: false, error: 'Forbidden: Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Token verification error:', err);
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// ==================== HELPER: GET USER ID FROM FIREBASE TOKEN ====================
async function getUserIdFromToken(token) {
  if (!token || !adminAuth) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email;
    const { data: userByUid } = await supabaseAnon
      .from('app_users')
      .select('id')
      .eq('firebase_uid', decoded.uid)
      .maybeSingle();
    if (userByUid) return userByUid.id;
    if (email) {
      const { data: userByEmail } = await supabaseAnon
        .from('app_users')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      if (userByEmail) return userByEmail.id;
    }
    return null;
  } catch (err) {
    console.error('Token verification error:', err);
    return null;
  }
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
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many attempts. Please try again later.',
});

// ==================== REQUEST LOGGING ====================
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==================== PASSWORD RESET (using Brevo) ====================
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendPasswordResetEmail(email, code) {
  return sendEmailViaBrevo({
    to: email,
    subject: 'Sound & Silence – Password Reset OTP',
    htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;"><h2>Reset Your Password</h2><p>Use the following OTP to reset your password. It expires in 10 minutes.</p><div style="font-size: 32px; font-weight: bold; background: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px;">${code}</div><p>If you did not request this, please ignore this email.</p><hr><p style="font-size: 12px; color: #6b7280;">Sound & Silence – Science-based sober events</p></div>`
  });
}

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

  await supabaseAnon.from('password_resets').update({ used: true }).eq('email', email).eq('used', false);
  const { error } = await supabaseAnon.from('password_resets').insert([{
    email: email.toLowerCase(),
    code,
    expires_at: expiresAt.toISOString(),
    used: false
  }]);

  if (error) {
    console.error(error);
    return res.status(500).json({ success: false, error: 'Failed to save OTP' });
  }

  const sent = await sendPasswordResetEmail(email, code);
  if (!sent) {
    console.error('Failed to send password reset email');
    // Still return success to avoid email enumeration
  }
  res.json({ success: true, message: 'If the email exists, an OTP has been sent.' });
});

app.post('/api/auth/verify-reset-otp', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ success: false, error: 'Email and code required' });
  const { data, error } = await supabaseAnon
    .from('password_resets')
    .select('*')
    .eq('email', email.toLowerCase())
    .eq('code', code)
    .eq('used', false)
    .single();

  if (error || !data) return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
  if (new Date(data.expires_at) < new Date()) return res.status(400).json({ success: false, error: 'OTP has expired' });

  await supabaseAnon.from('password_resets').update({ used: true }).eq('id', data.id);
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
    await supabaseAnon.from('password_resets').delete().eq('email', email.toLowerCase());
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
    supabase: supabaseAnon ? 'connected' : 'not configured',
    turnstile: CLOUDFLARE_SITE_KEY ? 'configured' : 'not configured',
    brevo: BREVO_API_KEY ? 'configured' : 'not configured',
    firebaseAdmin: adminAuth ? 'configured' : 'not configured',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured'
  });
});

// ==================== AVATAR UPLOAD ====================
app.post(
  '/api/users/avatar',
  verifyFirebaseToken,
  uploadAvatar.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const avatarUrl = req.file.path;
      const { uid } = req.user;

      const { error } = await supabaseAdmin
        .from('app_users')
        .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
        .eq('firebase_uid', uid);

      if (error) throw error;

      res.json({ success: true, avatarUrl });
    } catch (error) {
      console.error('Avatar upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// ==================== EMAIL CHANGE WITH OTP ====================
// Ensure table exists: CREATE TABLE email_change_requests (user_uid TEXT PRIMARY KEY, new_email TEXT NOT NULL, otp_code TEXT NOT NULL, expires_at TIMESTAMP NOT NULL, created_at TIMESTAMP DEFAULT NOW());

app.post('/api/auth/request-email-change', verifyFirebaseToken, async (req, res) => {
  const { newEmail } = req.body;
  const { uid, email: currentEmail } = req.user;

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }
  if (newEmail === currentEmail) {
    return res.status(400).json({ success: false, error: 'New email must be different from current email' });
  }

  // Check if user has password provider
  try {
    const userRecord = await adminAuth.getUser(uid);
    const hasPasswordProvider = userRecord.providerData.some(p => p.providerId === 'password');
    if (!hasPasswordProvider) {
      return res.status(403).json({ success: false, error: 'Email cannot be changed for social login users' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Failed to verify user' });
  }

  // Check if new email already in use
  try {
    const existingUser = await adminAuth.getUserByEmail(newEmail);
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      console.error(err);
      return res.status(500).json({ success: false, error: 'Error checking email availability' });
    }
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const { error: upsertError } = await supabaseAdmin
    .from('email_change_requests')
    .upsert({ user_uid: uid, new_email: newEmail, otp_code: otp, expires_at: expiresAt }, { onConflict: 'user_uid' });
  if (upsertError) {
    console.error(upsertError);
    return res.status(500).json({ success: false, error: 'Failed to store request' });
  }

  const emailSent = await sendEmailViaBrevo({
    to: newEmail,
    subject: 'Verify your new email – Sound & Silence',
    htmlContent: `<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px;"><h2>Email Change Request</h2><p>You requested to change the email address associated with your account to this email.</p><p>Use the following OTP to complete the change. It expires in 10 minutes.</p><div style="font-size: 32px; font-weight: bold; background: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px;">${otp}</div><p>If you did not request this, please ignore this email.</p></div>`
  });

  if (!emailSent) {
    return res.status(500).json({ success: false, error: 'Failed to send OTP email' });
  }

  res.json({ success: true, message: 'OTP sent to your new email address' });
});

app.post('/api/auth/verify-email-change', verifyFirebaseToken, async (req, res) => {
  const { otp } = req.body;
  const { uid } = req.user;

  if (!otp || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ success: false, error: '6-digit OTP required' });
  }

  const { data: pending, error: fetchError } = await supabaseAdmin
    .from('email_change_requests')
    .select('*')
    .eq('user_uid', uid)
    .single();

  if (fetchError || !pending) {
    return res.status(400).json({ success: false, error: 'No pending email change request' });
  }

  if (pending.otp_code !== otp) {
    return res.status(400).json({ success: false, error: 'Invalid OTP' });
  }

  if (new Date(pending.expires_at) < new Date()) {
    await supabaseAdmin.from('email_change_requests').delete().eq('user_uid', uid);
    return res.status(400).json({ success: false, error: 'OTP expired. Please request a new one.' });
  }

  try {
    await adminAuth.updateUser(uid, { email: pending.new_email });
    await supabaseAdmin
      .from('app_users')
      .update({ email: pending.new_email, updated_at: new Date().toISOString() })
      .eq('firebase_uid', uid);
    await supabaseAdmin.from('email_change_requests').delete().eq('user_uid', uid);
    res.json({ success: true, message: 'Email updated successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to update email' });
  }
});

// ==================== CONTACT FORM ====================
async function sendContactEmailToAdmin({ firstName, lastName, email, message, supportType }) {
  const adminEmail = process.env.ADMIN_EMAIL || BREVO_SENDER_EMAIL;
  if (!adminEmail) return;
  await sendEmailViaBrevo({
    to: adminEmail,
    subject: `New Contact Message from ${firstName} ${lastName}`,
    htmlContent: `<div><h2>New Contact Form Submission</h2><p><strong>Name:</strong> ${firstName} ${lastName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Type:</strong> ${supportType || 'General'}</p><p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p></div>`
  });
}

async function sendAutoReplyToUser(email, firstName, userMessage) {
  await sendEmailViaBrevo({
    to: email,
    subject: 'We received your message – Sound & Silence',
    htmlContent: `<div><h2>Hello ${firstName},</h2><p>Thank you for reaching out. We will get back to you within 24 hours.</p><p><strong>Your message:</strong><br>${userMessage.replace(/\n/g, '<br>')}</p></div>`
  });
}

app.post('/api/contact', async (req, res) => {
  const { firstName, lastName, email, message, turnstile_token, supportType } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!firstName || !lastName || !email || !message) return res.status(400).json({ success: false, error: 'All fields required' });

  await sendContactEmailToAdmin({ firstName, lastName, email, message, supportType });
  await sendAutoReplyToUser(email, firstName, message);

  try {
    await supabaseAnon.from('contact_messages').insert([{
      first_name: firstName.trim(), last_name: lastName.trim(),
      email: email.trim().toLowerCase(), message: message.trim(),
      support_type: supportType || null, status: 'unread',
      created_at: new Date().toISOString()
    }]);
  } catch (error) { console.error('Error saving contact message:', error); }
  res.json({ success: true, message: 'Message sent successfully!' });
});

app.get('/api/contact/messages', async (req, res) => {
  try {
    const { data, error } = await supabaseAnon.from('contact_messages').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, messages: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== SUPPORT TICKETS ====================
async function sendSupportTicketEmailToAdmin({ name, email, message }) {
  const adminEmail = process.env.ADMIN_EMAIL || BREVO_SENDER_EMAIL;
  if (!adminEmail) return;
  await sendEmailViaBrevo({
    to: adminEmail,
    subject: `New Support Ticket from ${name}`,
    htmlContent: `<div><h2>Support Ticket</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p></div>`
  });
}

app.get('/api/support-tickets', async (req, res) => {
  try {
    const { data, error } = await supabaseAnon.from('support_tickets').select('*').order('created_at', { ascending: false });
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

  try {
    const { data, error } = await supabaseAnon.from('support_tickets').insert([{
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
  try {
    await supabaseAnon.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== SUPPORT US ====================
async function sendSupportInquiryEmailToAdmin({ firstName, lastName, email, phone, message, supportType, organization, donationAmount }) {
  const adminEmail = process.env.ADMIN_EMAIL || BREVO_SENDER_EMAIL;
  if (!adminEmail) return;
  await sendEmailViaBrevo({
    to: adminEmail,
    subject: `New Support Inquiry: ${supportType || 'General'} from ${firstName} ${lastName}`,
    htmlContent: `<div><h2>Support Inquiry</h2><p><strong>Name:</strong> ${firstName} ${lastName}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || 'Not provided'}</p><p><strong>Organization:</strong> ${organization || 'Not provided'}</p><p><strong>Type:</strong> ${supportType || 'Not specified'}</p><p><strong>Donation:</strong> ${donationAmount || 'Not specified'}</p><p><strong>Message:</strong></p><p>${message ? message.replace(/\n/g, '<br>') : 'No message provided'}</p></div>`
  });
}

app.post('/api/support-us', async (req, res) => {
  const { firstName, lastName, email, phone, message, interests, availability, organization, donationAmount, supportType, turnstile_token } = req.body;
  if (!turnstile_token) return res.status(400).json({ success: false, error: 'Verification required' });
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) return res.status(400).json({ success: false, error: 'Verification failed' });
  if (!firstName || !lastName || !email) return res.status(400).json({ success: false, error: 'Name and email required' });

  await sendSupportInquiryEmailToAdmin({ firstName, lastName, email, phone, message, supportType, organization, donationAmount });

  try {
    await supabaseAnon.from('support_inquiries').insert([{
      first_name: firstName.trim(), last_name: lastName.trim(), email: email.trim().toLowerCase(),
      phone: phone || null, message: message || null, interests: interests || [], availability: availability || null,
      organization: organization || null, donation_amount: donationAmount || null, support_type: supportType,
      status: 'pending', created_at: new Date().toISOString()
    }]);
    res.json({ success: true, message: 'Thank you for your support! We will contact you soon.' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== USER AUTHENTICATION ====================
app.get('/api/users/my-events', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  if (!token) return res.json({ success: false, registrations: [], error: 'No token' });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email;
    if (!email) return res.json({ success: false, registrations: [] });

    const { data, error } = await supabaseAnon
      .from('event_registrations')
      .select(`
        id,
        registered_at,
        status,
        events!inner (id, title, event_date, location, image_url)
      `)
      .ilike('user_email', email);

    if (error) throw error;

    const registrations = (data || []).map(reg => ({
      id: reg.id,
      registered_at: reg.registered_at,
      status: reg.status || 'pending',
      event_id: reg.events.id,
      event_title: reg.events.title,
      event_date: reg.events.event_date,
      event_location: reg.events.location,
      event_image: reg.events.image_url
    }));

    res.json({ success: true, registrations });
  } catch (err) {
    console.error('Server error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.json({ success: false, user: null });
  try {
    const userId = parseInt(Buffer.from(token, 'base64').toString().split(':')[0]);
    const { data: user } = await supabaseAnon.from('app_users').select('id, email, name, user_type, nickname, hobbies, music_genres, location, bio, birth_date, gender, avatar_url').eq('id', userId).single();
    res.json({ success: true, user: user || null });
  } catch (error) { res.json({ success: false, user: null }); }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, nickname, birth_date, hobbies, music_genres, location, bio, gender } = req.body;
  try {
    const { error } = await supabaseAnon
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
  try {
    const { count, error } = await supabaseAnon.from('app_users').select('*', { count: 'exact', head: true });
    if (error) throw error;
    res.json({ success: true, count: count || 0 });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/users/stats/age', async (req, res) => {
  try {
    const { data: users } = await supabaseAnon.from('app_users').select('birth_date');
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
  try {
    const { data: user } = await supabaseAnon.from('app_users').select('id, name, nickname, location, bio, hobbies, music_genres, birth_date, gender, avatar_url').eq('id', id).single();
    res.json({ success: true, user });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== ONLINE USERS ====================
app.post('/api/online/track', async (req, res) => {
  const { session_id, user_name, user_id, current_page, user_agent, auth_token } = req.body;
  if (!session_id) return res.status(400).json({ success: false, error: 'Session ID required' });
  let authenticatedUserId = null;
  let isAuthenticated = false;
  if (auth_token) {
    try {
      const userId = parseInt(Buffer.from(auth_token, 'base64').toString().split(':')[0]);
      const { data: user } = await supabaseAnon.from('app_users').select('id').eq('id', userId).single();
      if (user) { authenticatedUserId = userId; isAuthenticated = true; }
    } catch (e) {}
  }

  try {
    const now = new Date().toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabaseAnon.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    const { data: existing } = await supabaseAnon.from('online_users').select('id').eq('session_id', session_id).maybeSingle();
    if (existing) {
      await supabaseAnon.from('online_users').update({ last_seen: now, current_page: current_page || null, user_id: authenticatedUserId, is_authenticated: isAuthenticated }).eq('session_id', session_id);
    } else if (isAuthenticated) {
      await supabaseAnon.from('online_users').insert([{ session_id, user_name: user_name || 'User', user_id: authenticatedUserId, is_authenticated: true, current_page: current_page || null, user_agent: user_agent || null, last_seen: now }]);
    }
    const { count } = await supabaseAnon.from('online_users').select('*', { count: 'exact', head: true }).gte('last_seen', fiveMinutesAgo);
    const { data: users } = await supabaseAnon.from('online_users').select('user_name, current_page, last_seen').gte('last_seen', fiveMinutesAgo).order('last_seen', { ascending: false });
    res.json({ success: true, onlineCount: count || 0, users: users || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/online/count', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabaseAnon.from('online_users').delete().lt('last_seen', fiveMinutesAgo);
    const { count } = await supabaseAnon.from('online_users').select('*', { count: 'exact', head: true });
    const { data: users } = await supabaseAnon.from('online_users').select('user_name, current_page, last_seen').order('last_seen', { ascending: false });
    res.json({ success: true, onlineCount: count || 0, users: users || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== VLOGS ====================
app.get('/api/vlogs', async (req, res) => {
  try {
    const { data, error } = await supabaseAnon.from('vlog_entries').select('*').order('created_at', { ascending: false });
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
  try {
    const { data, error } = await supabaseAdmin.from('vlog_entries').insert([{ title: title.trim(), video_url, thumbnail: finalThumbnail, created_at: new Date().toISOString() }]).select();
    if (error) throw error;
    res.json({ success: true, vlog: data[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.put('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  const { title, video_url, thumbnail } = req.body;
  try {
    await supabaseAdmin.from('vlog_entries').update({ title, video_url, thumbnail, updated_at: new Date().toISOString() }).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/vlogs/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAdmin.from('vlog_entries').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== BLOG POSTS ====================
app.get('/api/blog/posts', async (req, res) => {
  try {
    const { data, error } = await supabaseAnon
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/admin/posts', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from('blog_posts').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, posts: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/blog/upload-image', verifyFirebaseToken, uploadBlogImage.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image uploaded' });
    }
    const imageUrl = req.file.path; // Cloudinary secure URL
    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('Blog image upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/blog/upload-media', verifyFirebaseToken, uploadBlogMedia.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const mediaUrl = req.file.path; // Cloudinary secure URL
    const mediaType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    res.json({ success: true, mediaUrl, type: mediaType });
  } catch (error) {
    console.error('Blog media upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAdmin.rpc('increment_blog_view', { post_id: parseInt(id) });
    const { data, error } = await supabaseAnon.from('blog_posts').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, post: data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/blog/posts', strictLimiter, async (req, res) => {
  const {
    title,
    content,
    author_name,
    author_email,
    excerpt,
    mediaItems,     
    tags,
    turnstile_token
  } = req.body;

  // Turnstile validation
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Verification required' });
  }
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }

  // Required fields
  if (!title || !content || !author_name || !author_email) {
    return res.status(400).json({ success: false, error: 'Required fields missing' });
  }

  const excerptText = excerpt || content.substring(0, 150);

  try {
    const { data, error } = await supabaseAdmin.from('blog_posts').insert([{
      title: title.trim(),
      content,
      author_name: author_name.trim(),
      author_email: author_email.trim().toLowerCase(),
      excerpt: excerptText,
      images: mediaItems || [],          // store the array of objects
      tags: tags || [],
      status: 'published',               // immediate publication
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }]).select();

    if (error) throw error;

    res.json({ success: true, post: data[0] });
  } catch (error) {
    console.error('Blog post creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content, excerpt, mediaItems, tags, status } = req.body;

  const updates = {};
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (excerpt !== undefined) updates.excerpt = excerpt;
  if (mediaItems !== undefined) updates.images = mediaItems;
  if (tags !== undefined) updates.tags = tags;
  if (status !== undefined) updates.status = status;

  updates.updated_at = new Date().toISOString();
  if (status === 'published' && !updates.published_at) {
    updates.published_at = new Date().toISOString();
  }

  try {
    const { error } = await supabaseAdmin
      .from('blog_posts')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Blog post update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/blog/posts/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const { reaction } = req.body; // 'like', 'love', 'insightful', 'support'
  const userId = req.user.uid;

  if (!reaction) {
    return res.status(400).json({ success: false, error: 'Reaction type required' });
  }

  try {
    // Upsert: insert or update on conflict
    const { data, error } = await supabaseAdmin
      .from('blog_reactions')
      .upsert({
        post_id: parseInt(id),
        user_id: userId,
        reaction: reaction,
        created_at: new Date().toISOString()
      }, { onConflict: 'post_id, user_id' })
      .select();

    if (error) throw error;
    res.json({ success: true, reaction: data[0] });
  } catch (error) {
    console.error('Error adding reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/blog/posts/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const { error } = await supabaseAdmin
      .from('blog_reactions')
      .delete()
      .eq('post_id', parseInt(id))
      .eq('user_id', userId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/posts/:id/reactions', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let userId = null;
  if (token && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
    } catch (err) { /* ignore */ }
  }

  try {
    // Get counts per reaction type
    const { data: counts, error: countError } = await supabaseAdmin
      .from('blog_reactions')
      .select('reaction', { count: 'exact' })
      .eq('post_id', parseInt(id));

    if (countError) throw countError;

    const reactionCounts = {
      like: 0,
      love: 0,
      insightful: 0,
      support: 0
    };
    counts.forEach(r => {
      if (reactionCounts[r.reaction] !== undefined) reactionCounts[r.reaction]++;
    });

    // Get user's reaction (if logged in)
    let userReaction = null;
    if (userId) {
      const { data: userReact, error: userError } = await supabaseAdmin
        .from('blog_reactions')
        .select('reaction')
        .eq('post_id', parseInt(id))
        .eq('user_id', userId)
        .maybeSingle();
      if (!userError && userReact) userReaction = userReact.reaction;
    }

    res.json({ success: true, counts: reactionCounts, userReaction });
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/blog/posts/reactions/batch', async (req, res) => {
  const { postIds } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let userId = null;
  if (token && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
    } catch (err) { /* ignore */ }
  }

  if (!postIds || !Array.isArray(postIds)) {
    return res.status(400).json({ success: false, error: 'postIds array required' });
  }

  try {
    // Get all reactions for these posts
    const { data, error } = await supabaseAdmin
      .from('blog_reactions')
      .select('post_id, reaction')
      .in('post_id', postIds);

    if (error) throw error;

    // Build counts per post
    const countsMap = {};
    postIds.forEach(id => {
      countsMap[id] = { like: 0, love: 0, insightful: 0, support: 0 };
    });
    data.forEach(r => {
      if (countsMap[r.post_id] && countsMap[r.post_id][r.reaction] !== undefined) {
        countsMap[r.post_id][r.reaction]++;
      }
    });

    // Get user's reactions (if logged in)
    let userReactions = {};
    if (userId) {
      const { data: userData, error: userError } = await supabaseAdmin
        .from('blog_reactions')
        .select('post_id, reaction')
        .in('post_id', postIds)
        .eq('user_id', userId);
      if (!userError && userData) {
        userData.forEach(r => {
          userReactions[r.post_id] = r.reaction;
        });
      }
    }

    res.json({ success: true, counts: countsMap, userReactions });
  } catch (error) {
    console.error('Error batch fetching reactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/blog/posts/:id/reactions/users', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let currentUserId = null;
  if (token && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      currentUserId = decoded.uid;
    } catch (err) { /* ignore */ }
  }

  try {
    // Get reactions with user_id (Firebase UID)
    const { data: reactions, error } = await supabaseAdmin
      .from('blog_reactions')
      .select('user_id, reaction')
      .eq('post_id', parseInt(id));
    if (error) throw error;

    if (!reactions.length) {
      return res.json({ success: true, reactionUsers: { like: [], love: [], insightful: [], support: [] } });
    }

    // Get all unique user_ids (Firebase UIDs)
    const userIds = [...new Set(reactions.map(r => r.user_id))];
    // Fetch user details from app_users using firebase_uid
    const { data: users, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('firebase_uid, name, avatar_url')
      .in('firebase_uid', userIds);
    if (userError) throw userError;

    // Map firebase_uid -> user info
    const userMap = {};
    users.forEach(u => {
      userMap[u.firebase_uid] = {
        name: u.name || 'Anonymous',
        avatar: u.avatar_url || null
      };
    });

    // Build reaction users object
    const reactionUsers = {
      like: [],
      love: [],
      insightful: [],
      support: []
    };
    reactions.forEach(r => {
      const userInfo = userMap[r.user_id] || { name: 'Anonymous', avatar: null };
      reactionUsers[r.reaction].push({
        userId: r.user_id,
        name: userInfo.name,
        avatar: userInfo.avatar,
        isCurrentUser: r.user_id === currentUserId
      });
    });

    res.json({ success: true, reactionUsers });
  } catch (error) {
    console.error('Error fetching reaction users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/blog/posts/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAdmin.from('blog_posts').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== EVENTS ====================
app.get('/api/events', async (req, res) => {
  try {
    const { data, error } = await supabaseAnon.from('events').select('*').eq('status', 'upcoming').order('event_date', { ascending: true });
    if (error) throw error;
    res.json({ success: true, events: data || [] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/events/reactions/batch', async (req, res) => {
  const { eventIds } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let userId = null;
  if (token && adminAuth) {
    try { const decoded = await adminAuth.verifyIdToken(token); userId = decoded.uid; } catch (err) {}
  }
  if (!eventIds || !Array.isArray(eventIds)) return res.status(400).json({ success: false, error: 'eventIds array required' });
  try {
    // Get all reactions for these events
    const { data } = await supabaseAdmin.from('event_reactions').select('event_id, reaction').in('event_id', eventIds);
    const countsMap = {};
    eventIds.forEach(id => { countsMap[id] = { like: 0, love: 0, insightful: 0, support: 0 }; });
    data.forEach(r => { if (countsMap[r.event_id] && countsMap[r.event_id][r.reaction] !== undefined) countsMap[r.event_id][r.reaction]++; });
    let userReactions = {};
    if (userId) {
      const { data: userData } = await supabaseAdmin.from('event_reactions').select('event_id, reaction').in('event_id', eventIds).eq('user_id', userId);
      userData.forEach(r => { userReactions[r.event_id] = r.reaction; });
    }
    res.json({ success: true, counts: countsMap, userReactions });
  } catch (error) {
    console.error('Batch event reactions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/events/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const { reaction } = req.body;
  const userId = req.user.uid;
  if (!reaction) return res.status(400).json({ success: false, error: 'Reaction type required' });
  try {
    const { data, error } = await supabaseAdmin
      .from('event_reactions')
      .upsert({
        event_id: parseInt(id),
        user_id: userId,
        reaction: reaction,
        created_at: new Date().toISOString()
      }, { onConflict: 'event_id, user_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, reaction: data[0] });
  } catch (error) {
    console.error('Error adding event reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/events/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;
  try {
    await supabaseAdmin.from('event_reactions').delete().eq('event_id', parseInt(id)).eq('user_id', userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing event reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id/reactions/users', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let currentUserId = null;
  if (token && adminAuth) {
    try { const decoded = await adminAuth.verifyIdToken(token); currentUserId = decoded.uid; } catch (err) {}
  }
  try {
    const { data: reactions, error } = await supabaseAdmin
      .from('event_reactions')
      .select('user_id, reaction')
      .eq('event_id', parseInt(id));
    if (error) throw error;
    if (!reactions.length) {
      return res.json({ success: true, reactionUsers: { like: [], love: [], insightful: [], support: [] } });
    }
    const userIds = [...new Set(reactions.map(r => r.user_id))];
    const { data: users } = await supabaseAdmin
      .from('app_users')
      .select('firebase_uid, name, avatar_url')
      .in('firebase_uid', userIds);
    const userMap = {};
    users.forEach(u => {
      userMap[u.firebase_uid] = { name: u.name || 'Anonymous', avatar: u.avatar_url || null };
    });
    const reactionUsers = { like: [], love: [], insightful: [], support: [] };
    reactions.forEach(r => {
      const userInfo = userMap[r.user_id] || { name: 'Anonymous', avatar: null };
      reactionUsers[r.reaction].push({
        userId: r.user_id,
        name: userInfo.name,
        avatar: userInfo.avatar,
        isCurrentUser: r.user_id === currentUserId
      });
    });
    res.json({ success: true, reactionUsers });
  } catch (error) {
    console.error('Error fetching event reaction users:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id/comments', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let currentUserId = null;
  if (token && adminAuth) {
    try { const decoded = await adminAuth.verifyIdToken(token); currentUserId = decoded.uid; } catch (err) {}
  }
  try {
    // Fetch all comments (including replies) for this event
    const { data: comments, error } = await supabaseAdmin
      .from('event_comments')
      .select('*')
      .eq('event_id', parseInt(id))
      .order('created_at', { ascending: true });
    if (error) throw error;
    if (!comments.length) return res.json({ success: true, comments: [] });
    
    const commentIds = comments.map(c => c.id);
    // Fetch all reactions for these comments
    const { data: reactions } = await supabaseAdmin.from('comment_reactions').select('comment_id, reaction').in('comment_id', commentIds);
    const reactionCounts = {};
    const userReactions = {};
    commentIds.forEach(cid => { reactionCounts[cid] = { like: 0, love: 0, insightful: 0, support: 0 }; });
    reactions.forEach(r => { if (reactionCounts[r.comment_id] && reactionCounts[r.comment_id][r.reaction] !== undefined) reactionCounts[r.comment_id][r.reaction]++; });
    if (currentUserId) {
      const { data: userReacts } = await supabaseAdmin.from('comment_reactions').select('comment_id, reaction').in('comment_id', commentIds).eq('user_id', currentUserId);
      userReacts.forEach(r => { userReactions[r.comment_id] = r.reaction; });
    }
    res.json({ success: true, comments, reactionCounts, userReactions });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.post('/api/events/:id/comments', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const { content, parent_comment_id } = req.body;
  const userId = req.user.uid;
  const userEmail = req.user.email;
  const { data: userData, error: userError } = await supabaseAdmin
    .from('app_users')
    .select('name, avatar_url')
    .eq('firebase_uid', userId)
    .single();
  if (userError && userError.code !== 'PGRST116') console.error(userError);
  const userName = userData?.name || userEmail?.split('@')[0] || 'Anonymous';
  const userAvatar = userData?.avatar_url || null;
  if (!content || content.trim().length === 0) return res.status(400).json({ success: false, error: 'Comment cannot be empty' });
  try {
    const insertData = {
      event_id: parseInt(id),
      user_id: userId,
      user_name: userName,
      user_avatar: userAvatar,
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    if (parent_comment_id) insertData.parent_comment_id = parseInt(parent_comment_id);
    const { data, error } = await supabaseAdmin.from('event_comments').insert([insertData]).select();
    if (error) throw error;
    res.json({ success: true, comment: data[0] });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/comments/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const { reaction } = req.body;
  const userId = req.user.uid;
  if (!reaction) return res.status(400).json({ success: false, error: 'Reaction type required' });
  try {
    const { data, error } = await supabaseAdmin
      .from('comment_reactions')
      .upsert({ comment_id: parseInt(id), user_id: userId, reaction, created_at: new Date().toISOString() }, { onConflict: 'comment_id, user_id' })
      .select();
    if (error) throw error;
    res.json({ success: true, reaction: data[0] });
  } catch (error) {
    console.error('Error adding comment reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/comments/:id/react', verifyFirebaseToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;
  try {
    await supabaseAdmin.from('comment_reactions').delete().eq('comment_id', parseInt(id)).eq('user_id', userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing comment reaction:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/events/:id/reactions', async (req, res) => {
  const { id } = req.params;
  const authHeader = req.headers.authorization;
  const token = authHeader?.split('Bearer ')[1];
  let userId = null;
  if (token && adminAuth) {
    try { const decoded = await adminAuth.verifyIdToken(token); userId = decoded.uid; } catch (err) {}
  }
  try {
    const { data: counts } = await supabaseAdmin.from('event_reactions').select('reaction').eq('event_id', parseInt(id));
    const reactionCounts = { like: 0, love: 0, insightful: 0, support: 0 };
    counts.forEach(r => { if (reactionCounts[r.reaction] !== undefined) reactionCounts[r.reaction]++; });
    let userReaction = null;
    if (userId) {
      const { data: userReact } = await supabaseAdmin.from('event_reactions').select('reaction').eq('event_id', parseInt(id)).eq('user_id', userId).maybeSingle();
      if (userReact) userReaction = userReact.reaction;
    }
    res.json({ success: true, counts: reactionCounts, userReaction });
  } catch (error) {
    console.error('Error fetching event reactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});



app.get('/api/events/admin', async (req, res) => {
  try {
    const { data: events, error } = await supabaseAdmin.from('events').select('*').order('event_date', { ascending: false });
    if (error) throw error;
    const { data: counts } = await supabaseAdmin.from('event_registrations').select('event_id');
    const countMap = {};
    if (counts) counts.forEach(reg => { countMap[reg.event_id] = (countMap[reg.event_id] || 0) + 1; });
    const eventsWithCount = events.map(event => ({ ...event, registrations_count: countMap[event.id] || 0 }));
    res.json({ success: true, events: eventsWithCount });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAnon.from('events').select('*').eq('id', id).single();
    if (error) throw error;
    res.json({ success: true, event: data });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.post('/api/events', async (req, res) => {
  const { title, description, event_date, location, address, price, capacity, image_url, event_type, status, registration_link } = req.body;
  if (!title || !description || !event_date || !location) return res.status(400).json({ success: false, error: 'Required fields missing' });
  try {
    const { data, error } = await supabaseAdmin.from('events').insert([{
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
  updates.updated_at = new Date().toISOString();
  try {
    await supabaseAdmin.from('events').update(updates).eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await supabaseAdmin.from('events').delete().eq('id', id);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ==================== REGISTRATION (PUBLIC) ====================
app.post('/api/events/:id/register', async (req, res) => {
  const { id } = req.params;
  const { user_name, user_email, user_phone, special_requests } = req.body;
  const token = req.headers.authorization?.split('Bearer ')[1];

  if (!user_name || !user_email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }

  let userId = null;
  let firebaseUid = null;

  if (token && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      firebaseUid = decoded.uid;
      const email = decoded.email || user_email;

      let { data: existingUser } = await supabaseAnon
        .from('app_users')
        .select('id')
        .eq('firebase_uid', firebaseUid)
        .maybeSingle();

      if (!existingUser) {
        const { data: userByEmail } = await supabaseAnon
          .from('app_users')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        if (userByEmail) {
          await supabaseAnon
            .from('app_users')
            .update({ firebase_uid: firebaseUid })
            .eq('id', userByEmail.id);
          userId = userByEmail.id;
        } else {
          const { data: newUser, error: createError } = await supabaseAnon
            .from('app_users')
            .insert([{
              firebase_uid: firebaseUid,
              email: email.toLowerCase(),
              name: user_name,
              user_type: 'user',
              created_at: new Date().toISOString(),
              last_login: new Date().toISOString()
            }])
            .select()
            .single();
          if (!createError && newUser) userId = newUser.id;
        }
      } else {
        userId = existingUser.id;
      }
    } catch (err) {
      console.error('Token processing error:', err);
    }
  }

  if (!userId && user_email) {
    const { data: userByEmail } = await supabaseAnon
      .from('app_users')
      .select('id')
      .eq('email', user_email.toLowerCase())
      .maybeSingle();
    if (userByEmail) userId = userByEmail.id;
  }

  let duplicateQuery = supabaseAnon
    .from('event_registrations')
    .select('id, status')
    .eq('event_id', id);
  if (userId) {
    duplicateQuery = duplicateQuery.eq('user_id', userId);
  } else {
    duplicateQuery = duplicateQuery.eq('user_email', user_email.toLowerCase());
  }
  const { data: existingReg } = await duplicateQuery.maybeSingle();
  if (existingReg) {
    const statusMsg = existingReg.status === 'pending' ? 'pending approval' : existingReg.status;
    return res.status(400).json({ success: false, error: `You have already registered for this event (${statusMsg}). You cannot register again.` });
  }

  try {
    const { data: event, error: eventError } = await supabaseAnon
      .from('events')
      .select('capacity, status, price')
      .eq('id', id)
      .single();
    if (eventError || !event) return res.status(404).json({ success: false, error: 'Event not found' });
    if (event.status !== 'upcoming') return res.status(400).json({ success: false, error: 'Event is not open for registration' });

    if (event.capacity) {
      const { count } = await supabaseAnon
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);
      if (count >= event.capacity) return res.status(400).json({ success: false, error: 'Event is full' });
    }

    const isFree = !event.price || event.price.toLowerCase() === 'free' || event.price === '0' || event.price === '£0';
    const registrationStatus = isFree ? 'accepted' : 'pending';

    const insertData = {
      event_id: id,
      user_name: user_name.trim(),
      user_email: user_email.trim().toLowerCase(),
      user_phone: user_phone || null,
      special_requests: special_requests || null,
      registered_at: new Date().toISOString(),
      status: registrationStatus
    };
    if (userId) insertData.user_id = userId;

    const { data, error } = await supabaseAnon
      .from('event_registrations')
      .insert([insertData])
      .select();
    if (error) throw error;

    res.json({ success: true, registration: data[0] });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== REGISTRATION MANAGEMENT (ADMIN) ====================
app.get('/api/events/:id/registrations', async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabaseAdmin
      .from('event_registrations')
      .select('*')
      .eq('event_id', id)
      .order('registered_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, registrations: data });
  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/event-registrations/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  try {
    const { data: existing, error: findError } = await supabaseAdmin
      .from('event_registrations')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      console.error('Error checking registration existence:', findError);
      return res.status(500).json({ success: false, error: 'Database error' });
    }

    if (!existing) {
      console.log(`⚠️ Registration with id ${id} not found`);
      return res.status(404).json({ success: false, error: 'Registration not found' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('event_registrations')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', id)
      .select();

    if (error) throw error;

    if (!updated || updated.length === 0) {
      console.log(`⚠️ No rows updated for id ${id}`);
      return res.status(404).json({ success: false, error: 'Registration not found or no changes made' });
    }

    console.log(`✅ Updated registration ${id} to status ${status}`);
    res.json({ success: true, registration: updated[0] });
  } catch (error) {
    console.error('Error updating registration status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== STATISTICS ====================
app.get('/api/stats', async (req, res) => {
  let totalTickets = 0, totalVlogs = 0, totalBlogs = 0;
  try {
    const [ticketsResult, vlogsResult, blogsResult] = await Promise.all([
      supabaseAnon.from('support_tickets').select('*', { count: 'exact', head: true }),
      supabaseAnon.from('vlog_entries').select('*', { count: 'exact', head: true }),
      supabaseAnon.from('blog_posts').select('*', { count: 'exact', head: true }).eq('status', 'published')
    ]);
    totalTickets = ticketsResult.count || 0;
    totalVlogs = vlogsResult.count || 0;
    totalBlogs = blogsResult.count || 0;
  } catch (error) { console.error('Stats error:', error); }
  res.json({ success: true, stats: { totalTickets, totalVlogs, totalBlogs } });
});

// ==================== ROOT & ERROR HANDLING ====================
app.get('/', (req, res) => {
  res.json({ name: 'Sound & Silence API', version: '2.1.0', status: 'running' });
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
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`📧 Brevo Email: ${BREVO_API_KEY ? 'Configured (HTTPS)' : 'Not configured'}`);
  console.log(`🔐 Firebase Admin: ${adminAuth ? 'Configured' : 'Not configured'}`);
  console.log(`📋 Rate Limiting: Active`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`👥 Online: http://localhost:${PORT}/api/online/count`);
  console.log(`👤 Users: http://localhost:${PORT}/api/users/count`);
  console.log(`🔐 Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`🖼️ Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'Not configured'}`);
  console.log(`🛡️ Admin routes use service_role key to bypass RLS`);
});