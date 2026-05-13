const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { uploadImage } = require('../services/mediaStorage');
const ArtistProfile = require('../models/ArtistProfile');

const router = express.Router();

// Multer config for artist image uploads
const artistUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// In-memory OTP storage for artists (email -> { otp, expiresAt })
const artistOtpStore = new Map();

// Clean up expired OTPs every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of artistOtpStore.entries()) {
    if (value.expiresAt < now) {
      artistOtpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Create SMTP transporter
const createTransporter = () => {
  return nodemailer.createTransport({
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

// Send OTP email to artist
const sendArtistOTPEmail = async (email, otp, artistName) => {
  const transporter = createTransporter();
  
  const mailOptions = {
    from: `"ArtArtist" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Artist Dashboard Login OTP - ArtArtist',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">ArtArtist Dashboard</h1>
            <p style="color: #666; margin-top: 5px;">Artist Login Verification</p>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0 0 15px 0; color: #555; font-size: 16px;">Hello ${artistName || 'Artist'},</p>
            <p style="margin: 0 0 15px 0; color: #555; font-size: 16px;">Your One-Time Password (OTP) for dashboard login:</p>
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
            <p style="margin: 0;">This is an automated message from ArtArtist Artist Portal</p>
            <p style="margin: 5px 0 0 0;">© ${new Date().getFullYear()} ArtArtist. All rights reserved.</p>
          </div>
        </div>
      </div>
    `
  };
  
  await transporter.sendMail(mailOptions);
};

// Middleware to authenticate artist by JWT
const authenticateArtist = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verify artist exists
    const artist = await ArtistProfile.findById(decoded.artistId);
    if (!artist || !artist.isActive) {
      return res.status(401).json({ error: 'Artist not found or inactive.' });
    }

    req.artist = artist;
    next();
  } catch (error) {
    console.error('Artist auth middleware error:', error);
    res.status(401).json({ error: 'Invalid token.' });
  }
};

// City name aliases for common misspellings / alternate names
const cityAliases = {
  hyderabad: ['hydrabad', 'hyd', 'secunderabad'],
  mumbai: ['bombay', 'bom'],
  delhi: ['new delhi', 'ncr', 'delhi ncr', 'noida', 'gurgaon', 'gurugram'],
  bangalore: ['bengaluru', 'blr'],
  chennai: ['madras'],
  kolkata: ['calcutta'],
  pune: ['poona'],
  varanasi: ['banaras', 'benares'],
  trivandrum: ['thiruvananthapuram'],
  cochin: ['kochi'],
  mysore: ['mysuru'],
  baroda: ['vadodara'],
  calicut: ['kozhikode'],
};

// Escape a string so it can be safely used inside a RegExp
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build a regex that matches the term and its known aliases
const buildFlexibleRegex = (term) => {
  const lower = term.toLowerCase().trim();
  const aliases = cityAliases[lower] || [];
  const allTerms = [lower, ...aliases].map(t => escapeRegex(t));
  return new RegExp(allTerms.join('|'), 'i');
};

// Artist Dashboard Authentication Routes
// Request OTP for artist login
router.post('/login/request-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Find artist by email
    const artist = await ArtistProfile.findOne({ email: email.toLowerCase() });
    
    if (!artist) {
      return res.status(404).json({ success: false, message: 'Artist not found with this email' });
    }

    if (!artist.isActive) {
      return res.status(403).json({ success: false, message: 'Your account is currently inactive' });
    }

    // Generate OTP
    const otp = generateOTP();
    
    // Store OTP with 10 minute expiry
    artistOtpStore.set(email.toLowerCase(), {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      artistId: artist._id
    });

    // Send OTP email
    await sendArtistOTPEmail(email, otp, artist.name);

    res.json({ 
      success: true, 
      message: 'OTP sent to your email',
      email: email.toLowerCase()
    });
  } catch (error) {
    console.error('Artist OTP request error:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP and login
router.post('/login/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const emailLower = email.toLowerCase();
    const storedData = artistOtpStore.get(emailLower);
    
    if (!storedData) {
      return res.status(400).json({ success: false, message: 'OTP expired or not requested' });
    }

    if (storedData.expiresAt < Date.now()) {
      artistOtpStore.delete(emailLower);
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Get artist
    const artist = await ArtistProfile.findById(storedData.artistId);
    if (!artist || !artist.isActive) {
      return res.status(404).json({ success: false, message: 'Artist not found or inactive' });
    }

    // Clear OTP after successful verification
    artistOtpStore.delete(emailLower);

    // Find associated User document for attribution
    const User = require('../models/User');
    const user = await User.findOne({ email: emailLower });

    // Generate JWT token
    const token = jwt.sign(
      { 
        artistId: artist._id, 
        userId: user ? user._id : null, // Include userId for attribution in general routes
        email: artist.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      artist: {
        _id: artist._id,
        userId: user ? user._id : null,
        name: artist.name,
        email: artist.email,
        artForm: artist.artForm,
        image: artist.image,
        location: artist.location,
        bio: artist.bio,
        phone: artist.phone,
        social: artist.social
      }
    });
  } catch (error) {
    console.error('Artist OTP verification error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

// Get current artist profile (protected)
router.get('/me', authenticateArtist, async (req, res) => {
  try {
    const artist = req.artist;
    res.json({
      success: true,
      data: {
        _id: artist._id,
        name: artist.name,
        email: artist.email,
        artForm: artist.artForm,
        image: artist.image,
        location: artist.location,
        bio: artist.bio,
        phone: artist.phone,
        social: artist.social,
        isActive: artist.isActive
      }
    });
  } catch (error) {
    console.error('Get artist profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to get profile' });
  }
});

// Update current artist profile (protected)
router.put('/me', authenticateArtist, async (req, res) => {
  try {
    const artist = req.artist;
    const updates = req.body;
    
    // Fields that artists can update themselves (email cannot be changed)
    const allowedUpdates = [
      'name', 'artForm', 'bio', 'phone', 'image', 'location', 'social'
    ];
    
    const updateData = {};
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    const updatedArtist = await ArtistProfile.findByIdAndUpdate(
      artist._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        _id: updatedArtist._id,
        name: updatedArtist.name,
        email: updatedArtist.email,
        artForm: updatedArtist.artForm,
        image: updatedArtist.image,
        location: updatedArtist.location,
        bio: updatedArtist.bio,
        phone: updatedArtist.phone,
        social: updatedArtist.social,
        isActive: updatedArtist.isActive
      }
    });
  } catch (error) {
    console.error('Update artist profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Upload artist profile image (protected)
router.post('/me/upload-image', authenticateArtist, artistUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const result = await uploadImage({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'artist-profiles'
    });

    // Update artist image in database
    const updatedArtist = await ArtistProfile.findByIdAndUpdate(
      req.artist._id,
      { $set: { image: { url: result.url, publicId: result.publicId, alt: req.artist.name || 'Artist image' } } },
      { new: true }
    );

    res.json({
      success: true,
      url: result.url,
      publicId: result.publicId,
      data: {
        _id: updatedArtist._id,
        name: updatedArtist.name,
        email: updatedArtist.email,
        artForm: updatedArtist.artForm,
        image: updatedArtist.image,
        location: updatedArtist.location,
        bio: updatedArtist.bio,
        phone: updatedArtist.phone,
        social: updatedArtist.social,
        isActive: updatedArtist.isActive
      }
    });
  } catch (error) {
    console.error('Artist image upload error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
});

// Public search/suggestions for hero search
router.get('/search', async (req, res) => {
  try {
    const { q = '', limit = 8, artForm, location } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 8, 100);

    const query = { isActive: true };
    const hasFilter = (artForm && String(artForm).trim()) || (location && String(location).trim());

    if (hasFilter) {
      // When specific filters are provided, use them as the primary match
      const andConditions = [];

      if (artForm && String(artForm).trim()) {
        const safeArtForm = escapeRegex(String(artForm).trim());
        andConditions.push({
          $or: [
            { artForm: { $regex: safeArtForm, $options: 'i' } },
            { name: { $regex: safeArtForm, $options: 'i' } }
          ]
        });
      }

      if (location && String(location).trim()) {
        const locRegex = buildFlexibleRegex(String(location).trim());
        andConditions.push({
          $or: [
            { 'location.city': locRegex },
            { 'location.state': locRegex },
            { 'location.country': locRegex }
          ]
        });
      }

      if (andConditions.length === 1) {
        // Single filter: merge $or conditions into top-level query
        const orClause = andConditions[0].$or;
        if (andConditions[0].artForm !== undefined) {
          // artForm filter only
          query.$or = orClause;
        } else {
          // location filter only
          query.$or = orClause;
        }
      } else if (andConditions.length > 1) {
        query.$and = andConditions;
      }
    } else if (q && String(q).trim()) {
      // General text search (no specific filters)
      const text = escapeRegex(String(q).trim());
      const locRegex = buildFlexibleRegex(String(q).trim());
      query.$or = [
        { name: { $regex: text, $options: 'i' } },
        { artForm: { $regex: text, $options: 'i' } },
        { bio: { $regex: text, $options: 'i' } },
        { 'location.city': locRegex },
        { 'location.state': locRegex },
        { 'location.country': locRegex }
      ];
    }

    const artists = await ArtistProfile.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json({ artists });
  } catch (error) {
    console.error('Artist search error:', error);
    res.status(500).json({ error: 'Failed to search artists' });
  }
});

router.get('/team', async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 12, 50);
    const artists = await ArtistProfile.find({ isActive: true, isTeamMember: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(safeLimit);
    res.json({ artists });
  } catch (error) {
    console.error('Get team artists error:', error);
    res.status(500).json({ error: 'Failed to get team artists' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const artist = await ArtistProfile.findById(req.params.id);
    if (!artist || !artist.isActive) {
      return res.status(404).json({ error: 'Artist not found' });
    }
    res.json(artist);
  } catch (error) {
    console.error('Get artist error:', error);
    res.status(500).json({ error: 'Failed to get artist' });
  }
});

module.exports = router;

