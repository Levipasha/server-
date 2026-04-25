const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');

const router = express.Router();

// In-memory OTP storage (otp -> { email, expiresAt })
const otpStore = new Map();

// Clean up expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (value.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Create SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"ARTLOVE Admin" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Admin Login OTP - ARTLOVE',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">ARTLOVE Admin</h1>
            <p style="color: #666; margin-top: 5px;">Secure Login Verification</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0 0 15px 0; color: #555; font-size: 16px;">Your One-Time Password (OTP) for admin login:</p>
            <div style="text-align: center; padding: 20px; background: white; border-radius: 8px; border: 2px dashed #ddd;">
              <span style="font-size: 36px; font-weight: bold; color: #dc2626; letter-spacing: 8px;">${otp}</span>
            </div>
          </div>
          
          <div style="color: #666; font-size: 14px; line-height: 1.6;">
            <p style="margin: 0 0 10px 0;"><strong>Important:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>This OTP is valid for 10 minutes only</li>
              <li>Do not share this code with anyone</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
            <p style="margin: 0;">This is an automated message from ARTLOVE Admin Portal</p>
            <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} ARTLOVE. All rights reserved.</p>
          </div>
        </div>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};

// Middleware to verify Firebase token (mocked for development)
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // For development, accept any token and create a mock user
    // TODO: Replace with real Firebase verification when you have credentials
    const decodedToken = {
      uid: 'mock-user-' + Math.random().toString(36).substr(2, 9),
      email: 'user@example.com',
      displayName: 'Demo User'
    };
    
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Login/Register with Firebase
router.post('/login', verifyFirebaseToken, async (req, res) => {
  try {
    const { email, uid, displayName, photoURL } = req.user;

    // Check if user exists in our database
    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      // Create new user
      user = new User({
        firebaseUid: uid,
        email,
        displayName,
        photoURL,
        lastLogin: new Date()
      });
      await user.save();
    } else {
      // Update last login
      user.lastLogin = new Date();
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, firebaseUid: user.firebaseUid, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      profile: user.profile,
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user profile
router.put('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      profile: user.profile,
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Logout (client-side token removal)
router.post('/logout', verifyFirebaseToken, async (req, res) => {
  try {
    // For development, just return success
    // TODO: Add Firebase token revocation when you have real credentials
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Admin OTP Login Routes
// Request OTP for admin login
router.post('/admin/request-otp', async (req, res) => {
  try {
    const { username } = req.body;
    
    // Verify username is ARTLOVE
    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(401).json({ error: 'Invalid username' });
    }
    
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return res.status(500).json({ error: 'Admin email not configured' });
    }
    
    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with expiration (10 minutes)
    otpStore.set(otp, {
      email: adminEmail,
      username: username,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
    
    // Send OTP email
    await sendOTPEmail(adminEmail, otp);
    
    res.json({ 
      message: 'OTP sent successfully',
      email: adminEmail.replace(/(.{2}).*(@.*)/, '$1***$2') // Mask email for display
    });
  } catch (error) {
    console.error('OTP request error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP and login admin
router.post('/admin/verify-otp', async (req, res) => {
  try {
    const { username, otp } = req.body;
    
    // Verify username
    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(401).json({ error: 'Invalid username' });
    }
    
    // Check if OTP exists and is valid
    const otpData = otpStore.get(otp);
    if (!otpData) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }
    
    // Check if OTP is expired
    if (otpData.expiresAt < Date.now()) {
      otpStore.delete(otp);
      return res.status(401).json({ error: 'OTP has expired' });
    }
    
    // Verify username matches
    if (otpData.username !== username) {
      return res.status(401).json({ error: 'Invalid OTP for this user' });
    }
    
    // Delete used OTP
    otpStore.delete(otp);
    
    // Create or get admin user
    let user = await User.findOne({ email: process.env.ADMIN_EMAIL });
    
    if (!user) {
      // Create admin user
      user = new User({
        firebaseUid: 'admin-' + Date.now(),
        email: process.env.ADMIN_EMAIL,
        displayName: 'ARTLOVE Admin',
        role: 'admin',
        lastLogin: new Date()
      });
      await user.save();
    } else {
      // Ensure user has admin role
      if (user.role !== 'admin') {
        user.role = 'admin';
      }
      user.lastLogin = new Date();
      await user.save();
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, firebaseUid: user.firebaseUid, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );
    
    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;
