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

// Cloudflare Turnstile Configuration
const CLOUDFLARE_SECRET_KEY = process.env.CLOUDFLARE_SECRET_KEY || '';
const CLOUDFLARE_SITE_KEY = process.env.CLOUDFLARE_SITE_KEY || '';

// Email Configuration
let emailTransporter = null;

// Configure email transporter
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
    console.log('⚠️ Email credentials not set - email features disabled');
  }
} catch (error) {
  console.log('⚠️ Email service not configured:', error.message);
}

// ==================== PROFESSIONAL EMAIL TEMPLATES ====================

// Send contact form email to admin
async function sendContactEmailToAdmin(data) {
  if (!emailTransporter) {
    console.log('📧 Email not configured. Would have sent:', data);
    return;
  }
  
  const { firstName, lastName, email, message, supportType } = data;
  const currentDate = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
  
  const mailOptions = {
    from: `"${firstName} ${lastName} via Sound & Silence" <${process.env.EMAIL_USER}>`,
    replyTo: email,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `📬 New Contact Form Submission from ${firstName} ${lastName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Contact Form Submission</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
          .info-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #8b5cf6; }
          .label { font-weight: bold; color: #4b5563; margin-bottom: 5px; }
          .value { color: #1f2937; margin-bottom: 15px; }
          .message-box { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-top: 10px; white-space: pre-wrap; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
          .reply-note { background: #fef3c7; padding: 10px; border-radius: 5px; margin-top: 15px; text-align: center; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Sound & Silence</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0;">New Contact Form Submission</p>
          </div>
          <div class="content">
            <div class="info-box">
              <div class="label">📋 Submission Details</div>
              <div class="value">Date: ${currentDate}</div>
              <div class="label">👤 From:</div>
              <div class="value">${firstName} ${lastName}</div>
              <div class="label">📧 Email:</div>
              <div class="value"><a href="mailto:${email}" style="color: #8b5cf6;">${email}</a></div>
              ${supportType ? `<div class="label">🏷️ Inquiry Type:</div><div class="value">${supportType.charAt(0).toUpperCase() + supportType.slice(1)}</div>` : ''}
              <div class="label">💬 Message:</div>
              <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <div class="reply-note">
              💡 <strong>Quick Reply:</strong> Simply click "Reply" to respond directly to ${firstName} at ${email}
            </div>
          </div>
          <div class="footer">
            <p>Sound & Silence — Science-based sober events in East London</p>
            <p>© ${new Date().getFullYear()} Sound & Silence. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Admin email sent for contact form');
  } catch (error) {
    console.error('❌ Failed to send admin email:', error);
  }
}

// Send auto-reply to user
async function sendAutoReplyToUser(email, firstName, message) {
  if (!emailTransporter) return;
  
  const mailOptions = {
    from: `"Sound & Silence Team" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: '✨ Thank you for contacting Sound & Silence',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Thank You for Contacting Sound & Silence</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
          .greeting { font-size: 18px; margin-bottom: 20px; }
          .message-preview { background: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
          .button { display: inline-block; background: #8b5cf6; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
          .social-links { margin-top: 15px; }
          .social-links a { color: #8b5cf6; text-decoration: none; margin: 0 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Sound & Silence</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0;">We've received your message</p>
          </div>
          <div class="content">
            <div class="greeting">
              <p>Dear ${firstName},</p>
              <p>Thank you for reaching out to <strong>Sound & Silence</strong>. We truly appreciate you taking the time to connect with us.</p>
            </div>
            <p>This email confirms that we have received your message. Our team will review it and get back to you within <strong>24 hours</strong>.</p>
            <div class="message-preview">
              <p style="font-weight: bold; margin-bottom: 10px;">📝 Your message:</p>
              <p style="color: #4b5563;">"${message.substring(0, 200)}${message.length > 200 ? '...' : ''}"</p>
            </div>
            <p>In the meantime, here are some helpful resources:</p>
            <ul>
              <li>📅 <a href="https://soundandsilence.web.app/events" style="color: #8b5cf6;">Upcoming Events</a> - Join our sober social gatherings</li>
              <li>👥 <a href="https://soundandsilence.web.app/community" style="color: #8b5cf6;">Community Blog</a> - Read stories from our members</li>
              <li>🤝 <a href="https://soundandsilence.web.app/support/volunteer" style="color: #8b5cf6;">Get Involved</a> - Volunteer, partner, or donate</li>
            </ul>
            <div style="text-align: center;">
              <a href="https://soundandsilence.web.app" class="button">Visit Our Website</a>
            </div>
          </div>
          <div class="footer">
            <p>Sound & Silence — Science-based sober events in East London</p>
            <div class="social-links">
              <a href="#">Instagram</a> • <a href="#">Twitter</a> • <a href="#">TikTok</a>
            </div>
            <p>© ${new Date().getFullYear()} Sound & Silence. All rights reserved.</p>
            <p style="font-size: 11px;">You received this email because you contacted us through our website.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Auto-reply sent to user');
  } catch (error) {
    console.error('❌ Failed to send auto-reply:', error);
  }
}

// Send support ticket email to admin
async function sendSupportTicketEmailToAdmin(data) {
  if (!emailTransporter) return;
  
  const { name, email, message } = data;
  const ticketId = 'TKT-' + Date.now().toString().slice(-8);
  const currentDate = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
  
  const mailOptions = {
    from: `"${name} via Sound & Silence Support" <${process.env.EMAIL_USER}>`,
    replyTo: email,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: `🎫 New Support Ticket #${ticketId} from ${name}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Support Ticket</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
          .ticket-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ef4444; }
          .label { font-weight: bold; color: #4b5563; margin-bottom: 5px; }
          .value { color: #1f2937; margin-bottom: 15px; }
          .priority-high { background: #fee2e2; padding: 5px 10px; border-radius: 5px; display: inline-block; font-size: 12px; color: #dc2626; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Sound & Silence</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0;">New Support Ticket</p>
          </div>
          <div class="content">
            <div class="ticket-box">
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <span class="label">🎫 Ticket #:</span>
                <span class="value" style="font-family: monospace;">${ticketId}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <span class="label">📅 Date:</span>
                <span class="value">${currentDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
                <span class="label">⚠️ Priority:</span>
                <span class="priority-high">Normal</span>
              </div>
              <div class="label">👤 From:</div>
              <div class="value">${name}</div>
              <div class="label">📧 Email:</div>
              <div class="value"><a href="mailto:${email}" style="color: #8b5cf6;">${email}</a></div>
              <div class="label">💬 Message:</div>
              <div class="value" style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-top: 5px;">${message.replace(/\n/g, '<br>')}</div>
            </div>
            <div style="background: #e0e7ff; padding: 12px; border-radius: 6px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">💡 Reply to this email to respond to ${name}</p>
            </div>
          </div>
          <div class="footer">
            <p>Manage tickets in the <a href="https://soundandsilence.web.app/admin" style="color: #8b5cf6;">Admin Dashboard</a></p>
            <p>© ${new Date().getFullYear()} Sound & Silence. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('✅ Support ticket email sent to admin');
  } catch (error) {
    console.error('❌ Failed to send support ticket email:', error);
  }
}

// Send support inquiry email (volunteer/partner/donate)
async function sendSupportInquiryEmailToAdmin(data) {
  if (!emailTransporter) return;
  
  const { firstName, lastName, email, phone, message, supportType, organization, donationAmount } = data;
  const currentDate = new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
  
  const typeColors = {
    volunteer: '#8b5cf6',
    partner: '#ec4899',
    donate: '#10b981'
  };
  const color = typeColors[supportType] || '#8b5cf6';
  
  const subject = `🤝 New ${supportType.charAt(0).toUpperCase() + supportType.slice(1)} Inquiry from ${firstName} ${lastName}`;
  
  let detailsHtml = '';
  if (organization) detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span class="label">🏢 Organization:</span><span class="value">${organization}</span></div>`;
  if (phone) detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span class="label">📞 Phone:</span><span class="value">${phone}</span></div>`;
  if (donationAmount) detailsHtml += `<div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><span class="label">💰 Donation Amount:</span><span class="value">${donationAmount}</span></div>`;
  
  const mailOptions = {
    from: `"${firstName} ${lastName} via Sound & Silence" <${process.env.EMAIL_USER}>`,
    replyTo: email,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
    subject: subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Support Inquiry</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, ${color}, ${color}dd); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none; }
          .inquiry-box { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid ${color}; }
          .label { font-weight: bold; color: #4b5563; margin-bottom: 5px; }
          .value { color: #1f2937; margin-bottom: 12px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
          .badge { display: inline-block; background: ${color}20; color: ${color}; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎵 Sound & Silence</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0;">New ${supportType.charAt(0).toUpperCase() + supportType.slice(1)} Inquiry</p>
          </div>
          <div class="content">
            <div class="inquiry-box">
              <div style="text-align: center;">
                <span class="badge">${supportType.toUpperCase()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span class="label">📅 Date:</span>
                <span class="value">${currentDate}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span class="label">👤 Name:</span>
                <span class="value">${firstName} ${lastName}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                <span class="label">📧 Email:</span>
                <span class="value"><a href="mailto:${email}" style="color: ${color};">${email}</a></span>
              </div>
              ${detailsHtml}
              <div class="label">💬 Message:</div>
              <div class="value" style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-top: 5px;">${message || 'No additional message provided.'}</div>
            </div>
            <div style="background: #e0e7ff; padding: 12px; border-radius: 6px; text-align: center;">
              <p style="margin: 0; font-size: 14px;">💡 Reply to this email to respond to ${firstName}</p>
            </div>
          </div>
          <div class="footer">
            <p>Sound & Silence — Science-based sober events in East London</p>
            <p>© ${new Date().getFullYear()} Sound & Silence. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };
  
  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`✅ ${supportType} inquiry email sent to admin`);
  } catch (error) {
    console.error(`❌ Failed to send ${supportType} inquiry email:`, error);
  }
}

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
  res.json({ siteKey: CLOUDFLARE_SITE_KEY });
});

app.post('/api/auth/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  
  if (!token) {
    return res.status(400).json({ success: false, error: 'Turnstile token required' });
  }
  
  const isValid = await verifyTurnstile(token);
  
  if (isValid) {
    res.json({ success: true });
  } else {
    res.status(400).json({ success: false, error: 'Verification failed' });
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
    turnstile: CLOUDFLARE_SITE_KEY ? 'configured' : 'not configured',
    email: emailTransporter ? 'configured' : 'not configured'
  });
});

// ==================== CONTACT FORM ====================

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
  
  // Send email to admin
  await sendContactEmailToAdmin({ firstName, lastName, email, message, supportType });
  
  // Send auto-reply to user
  await sendAutoReplyToUser(email, firstName, message);
  
  // Save to database
  if (supabase) {
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
    } catch (error) {
      console.error('Error saving contact message:', error);
    }
  }
  
  res.json({ success: true, message: 'Message sent successfully! We\'ll get back to you soon.' });
});

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
  
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }
  
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'All fields required' });
  }
  
  // Send email notification to admin
  await sendSupportTicketEmailToAdmin({ name, email, message });
  
  if (!supabase) {
    return res.json({ success: true, ticket: { id: Date.now() } });
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
    res.json({ success: true, ticket: data[0] });
  } catch (error) {
    console.error('Error creating ticket:', error);
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

// ==================== SUPPORT US (Volunteer/Partner/Donate) ====================

app.post('/api/support-us', async (req, res) => {
  const { firstName, lastName, email, phone, message, interests, availability, organization, donationAmount, supportType, turnstile_token } = req.body;
  
  if (!turnstile_token) {
    return res.status(400).json({ success: false, error: 'Verification required' });
  }
  
  const isHuman = await verifyTurnstile(turnstile_token);
  if (!isHuman) {
    return res.status(400).json({ success: false, error: 'Verification failed' });
  }
  
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ success: false, error: 'Name and email required' });
  }
  
  // Send email notification to admin
  await sendSupportInquiryEmailToAdmin({
    firstName, lastName, email, phone, message, supportType, organization, donationAmount
  });
  
  if (!supabase) {
    return res.json({ success: true });
  }
  
  try {
    const { error } = await supabase
      .from('support_inquiries')
      .insert([{
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone || null,
        message: message || null,
        interests: interests || [],
        availability: availability || null,
        organization: organization || null,
        donation_amount: donationAmount || null,
        support_type: supportType,
        status: 'pending',
        created_at: new Date().toISOString()
      }]);
    
    if (error) throw error;
    res.json({ success: true, message: 'Thank you for your support! We will contact you soon.' });
  } catch (error) {
    console.error('Error saving support inquiry:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER AUTHENTICATION ====================

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

// Get user profile by ID


// Update user profile
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

// ==================== USER STATISTICS ====================

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

app.get('/api/users/stats/age', async (req, res) => {
  if (!supabase) {
    return res.json({ 
      success: true, 
      stats: {
        totalUsers: 0,
        ageGroups: { child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0 },
        ages: []
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
      child: 0, teenager: 0, youngAdult: 0, adult: 0, senior: 0
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
    
    res.json({ 
      success: true, 
      stats: {
        totalUsers,
        ageGroups,
        ages: ages.sort((a, b) => a - b),
        averageAge: ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
        minAge: ages.length > 0 ? Math.min(...ages) : null,
        maxAge: ages.length > 0 ? Math.max(...ages) : null
      }
    });
  } catch (error) {
    console.error('Error fetching age stats:', error);
    res.status(500).json({ success: false, error: error.message });
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
  console.log(`📧 Email: ${emailTransporter ? 'Configured' : 'Not configured'}`);
  console.log(`🎥 Vlogs: http://localhost:${PORT}/api/vlogs`);
  console.log(`📝 Blog: http://localhost:${PORT}/api/blog/posts`);
  console.log(`🎫 Tickets: http://localhost:${PORT}/api/support-tickets`);
  console.log(`📅 Events: http://localhost:${PORT}/api/events`);
  console.log(`👥 Online: http://localhost:${PORT}/api/online/count`);
  console.log(`👤 Users: http://localhost:${PORT}/api/users/count`);
  console.log(`🔐 Turnstile: ${CLOUDFLARE_SITE_KEY ? 'Configured' : 'Not configured'}\n`);
});