const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Product = require('../models/Product');
const Event = require('../models/Event');
const GalleryItem = require('../models/GalleryItem');
const ArtistProfile = require('../models/ArtistProfile');
const SiteSettings = require('../models/SiteSettings');
const ArtDistrictConfig = require('../models/ArtDistrictConfig');
const ArtDistrictRegistration = require('../models/ArtDistrictRegistration');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const { uploadImage } = require('../services/mediaStorage');
const { parseCSV } = require('../utils/csvParser');
const { artistInviteEmail, bulkAnnouncementEmail } = require('../utils/emailTemplates');
const { getDefaultArtistImage } = require('../constants/defaultArtistImage');

const router = express.Router();

const os = require('os');
const path = require('path');
const fs = require('fs');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(os.tmpdir(), 'art-marketplace-uploads');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'image/gif') return cb(null, true);
    cb(new Error('Only image files (including GIF) are allowed'), false);
  }
});

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  if (process.env.DISABLE_ADMIN_AUTH === 'true' || process.env.NODE_ENV === 'development') {
    return next();
  }
  try {
    await authenticate(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Email transporter for admin notifications
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

const sendArtistInviteEmail = async (artistName, email) => {
  const dashboardUrl = process.env.ARTIST_DASHBOARD_URL || 'https://artist.artartist.com';
  const transporter = createTransporter();
  const mailOptions = {
    from: `"ArtArtist" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Welcome to ArtArtist — Your Artist Dashboard is Ready',
    html: artistInviteEmail(artistName, email, dashboardUrl)
  };
  await transporter.sendMail(mailOptions);
};

// Test Cloudinary Connection
router.get('/test-cloudinary', adminAuth, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    
    console.log('Pinging Cloudinary...');
    const pingResult = await cloudinary.api.ping();
    
    console.log('Testing small upload...');
    // 1x1 transparent pixel
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const uploadResult = await cloudinary.uploader.upload(pixel, {
      folder: 'test',
      timeout: 30000
    });
    
    res.json({ 
      status: 'ok', 
      ping: pingResult,
      upload: 'Success',
      publicId: uploadResult.public_id,
      url: uploadResult.secure_url
    });
  } catch (error) {
    console.error('Cloudinary test error:', error);
    res.status(500).json({ 
      error: 'Cloudinary test failed', 
      message: error.message,
      http_code: error.http_code,
      name: error.name,
      details: error
    });
  }
});

// Get admin dashboard stats
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const stats = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Event.countDocuments(),
      User.countDocuments({ role: 'artist' }),
      Product.countDocuments({ status: 'available' }),
      Event.countDocuments({ status: 'upcoming' })
    ]);

    const [
      totalUsers,
      totalProducts,
      totalEvents,
      totalArtists,
      availableProducts,
      upcomingEvents
    ] = stats;

    // Get recent activity
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('displayName email role createdAt');

    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('artist', 'displayName')
      .select('name price status createdAt');

    const recentEvents = await Event.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('organizer', 'displayName')
      .select('title date status createdAt');

    res.json({
      stats: {
        totalUsers,
        totalProducts,
        totalEvents,
        totalArtists,
        availableProducts,
        upcomingEvents
      },
      recentActivity: {
        users: recentUsers,
        products: recentProducts,
        events: recentEvents
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// User Management
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-preferences');

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.put('/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow password changes through this endpoint
    delete updates.password;

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-preferences');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Don't allow deleting admin users
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    await User.findByIdAndDelete(id);

    // Update products and events to remove reference to deleted user
    await Product.updateMany({ artist: id }, { $unset: { artist: 1 } });
    await Event.updateMany({ organizer: id }, { $unset: { organizer: 1 } });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Product Management
router.get('/products', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    // Keep admin list consistent with public site defaults
    query.status = status || 'available';
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('artist', 'displayName email')
      .populate('artistProfile', 'name image artForm location');

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.put('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const product = await Product.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    )
      .populate('artist', 'displayName email')
      .populate('artistProfile', 'name image artForm location');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Delete images from Cloudinary if needed
    if (product.images && product.images.length > 0) {
      // TODO: Add Cloudinary image deletion
    }

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Event Management
router.get('/events', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const events = await Event.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('organizer', 'displayName email');

    const total = await Event.countDocuments(query);

    res.json({
      events,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        count: total
      }
    });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.put('/events/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const event = await Event.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('organizer', 'displayName email');

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

router.delete('/events/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await Event.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Delete images from Cloudinary if needed
    if (event.images && event.images.length > 0) {
      // TODO: Add Cloudinary image deletion
    }

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// System Settings
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const settings = await SiteSettings.getSingleton();
    res.json(settings.toObject());
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', adminAuth, async (req, res) => {
  try {
    const updates = req.body;
    const settings = await SiteSettings.getSingleton();
    // Allowed fields for security
    const allowedFields = ['siteName', 'siteDescription', 'maintenanceMode', 'allowRegistrations', 'maxUploadSize', 'supportedImageFormats', 'currency', 'timezone'];
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) || key.startsWith('about')) {
        settings[key] = updates[key];
      }
    });
    await settings.save();
    res.json({ message: 'Settings updated successfully', settings: settings.toObject() });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Gallery (admin)
router.get('/gallery', adminAuth, async (req, res) => {
  try {
    const { search, isActive, galleryType } = req.query;
    const query = {};
    if (typeof isActive !== 'undefined' && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    if (galleryType && ['gallery', '3d-gallery'].includes(String(galleryType))) {
      query.galleryType = String(galleryType);
    }
    if (search) {
      query.$text = { $search: search };
    }

    const items = await GalleryItem.find(query).sort({ createdAt: -1 });
    res.json({ items });
  } catch (error) {
    console.error('Get admin gallery error:', error);
    res.status(500).json({ error: 'Failed to fetch gallery items' });
  }
});

router.post('/gallery', adminAuth, async (req, res) => {
  try {
    const { name, imageUrl, imageAlt, bio, galleryType = 'gallery', isActive = true } = req.body || {};
    if (!name || !imageUrl) {
      return res.status(400).json({ error: 'name and imageUrl are required' });
    }

    const item = await GalleryItem.create({
      name: String(name).trim(),
      galleryType: ['gallery', '3d-gallery'].includes(String(galleryType)) ? String(galleryType) : 'gallery',
      image: {
        url: String(imageUrl).trim(),
        alt: String(imageAlt || '').trim(),
        publicId: null
      },
      bio: String(bio || '').trim(),
      isActive: Boolean(isActive)
    });

    res.status(201).json(item);
  } catch (error) {
    console.error('Create gallery item error:', error);
    res.status(500).json({ error: 'Failed to create gallery item' });
  }
});

// Upload image for gallery (Admin -> Cloudinary)
router.post('/gallery/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'admin-gallery'
    });
    res.json(result);
  } catch (error) {
    console.error('Gallery upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload',
      message: error.message,
      details: error
    });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }
  }
});

// Upload image for products (Admin -> Cloudinary)
router.post('/products/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'admin-products'
    });
    res.json(result);
  } catch (error) {
    console.error('Product image upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload',
      message: error.message,
      details: error
    });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }
  }
});

// Upload image for events (Admin -> Cloudinary)
router.post('/events/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'admin-events'
    });
    res.json(result);
  } catch (error) {
    console.error('Event image upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload',
      message: error.message,
      details: error
    });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }
  }
});

// Upload image for announcements/hero (Admin -> Cloudinary)
router.post('/announcements/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'admin-announcements'
    });
    res.json(result);
  } catch (error) {
    console.error('Announcement image upload error:', error);
    res.status(500).json({ 
      error: 'Failed to upload',
      message: error.message,
      details: error
    });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }
  }
});

router.put('/gallery/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, imageUrl, imageAlt, bio, galleryType, isActive } = req.body || {};

    const updates = {};
    if (typeof name !== 'undefined') updates.name = String(name).trim();
    if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
    if (typeof galleryType !== 'undefined') {
      updates.galleryType = ['gallery', '3d-gallery'].includes(String(galleryType))
        ? String(galleryType)
        : 'gallery';
    }
    if (typeof bio !== 'undefined') updates.bio = String(bio || '').trim();
    if (typeof imageUrl !== 'undefined' || typeof imageAlt !== 'undefined') {
      updates.image = {};
      if (typeof imageUrl !== 'undefined') updates.image.url = String(imageUrl).trim();
      if (typeof imageAlt !== 'undefined') updates.image.alt = String(imageAlt || '').trim();
    }

    const item = await GalleryItem.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!item) return res.status(404).json({ error: 'Gallery item not found' });
    res.json(item);
  } catch (error) {
    console.error('Update gallery item error:', error);
    res.status(500).json({ error: 'Failed to update gallery item' });
  }
});

router.delete('/gallery/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const item = await GalleryItem.findByIdAndDelete(id);
    if (!item) return res.status(404).json({ error: 'Gallery item not found' });
    res.json({ message: 'Gallery item deleted' });
  } catch (error) {
    console.error('Delete gallery item error:', error);
    res.status(500).json({ error: 'Failed to delete gallery item' });
  }
});

// Artists (admin)
router.get('/artists', adminAuth, async (req, res) => {
  try {
    const { search = '', isActive, isTeamMember } = req.query;
    const query = {};
    if (typeof isActive !== 'undefined' && isActive !== '') {
      query.isActive = isActive === 'true';
    }
    if (typeof isTeamMember !== 'undefined' && isTeamMember !== '') {
      query.isTeamMember = isTeamMember === 'true';
    }
    if (search && String(search).trim()) {
      const t = String(search).trim();
      query.$or = [
        { name: { $regex: t, $options: 'i' } },
        { artForm: { $regex: t, $options: 'i' } },
        { teamRole: { $regex: t, $options: 'i' } },
        { 'location.city': { $regex: t, $options: 'i' } }
      ];
    }
    const artists = await ArtistProfile.find(query).sort({ displayOrder: 1, createdAt: -1 });
    res.json({ artists });
  } catch (error) {
    console.error('Get artists error:', error);
    res.status(500).json({ error: 'Failed to fetch artists' });
  }
});

router.post('/artists', adminAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('Create artist payload:', { name: payload.name, email: payload.email, phone: payload.phone });
    
    if (!payload.name || !payload.imageUrl || !payload.artForm) {
      return res.status(400).json({ error: 'name, imageUrl and artForm are required' });
    }

    const createData = {
      artistNumber: String(payload.artistNumber || '').trim(),
      name: String(payload.name).trim(),
      phone: String(payload.phone || '').trim(),
      image: {
        url: String(payload.imageUrl).trim(),
        alt: String(payload.imageAlt || '').trim(),
        publicId: null
      },
      artForm: String(payload.artForm).trim(),
      teamRole: String(payload.teamRole || '').trim(),
      isTeamMember: Boolean(payload.isTeamMember ?? false),
      displayOrder: Number(payload.displayOrder || 0),
      location: {
        city: String(payload.city || '').trim(),
        state: String(payload.state || '').trim(),
        country: String(payload.country || '').trim()
      },
      social: {
        instagram: String(payload.instagram || '').trim(),
        facebook: String(payload.facebook || '').trim(),
        twitter: String(payload.twitter || '').trim(),
        linkedin: String(payload.linkedin || '').trim(),
        website: String(payload.website || '').trim()
      },
      bio: String(payload.bio || '').trim(),
      isActive: Boolean(payload.isActive ?? true)
    };

    if (payload.email && String(payload.email).trim()) {
      createData.email = String(payload.email).trim().toLowerCase();
    }
    if (payload.username && String(payload.username).trim()) {
      createData.username = String(payload.username).trim().toLowerCase();
    }

    const artist = await ArtistProfile.create(createData);
    
    console.log('Created artist:', { id: artist._id, email: artist.email, phone: artist.phone });

    res.status(201).json(artist);
  } catch (error) {
    console.error('Create artist error:', error);
    res.status(500).json({ error: 'Failed to create artist', details: error.message });
  }
});

router.put('/artists/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body || {};
    
    // Debug logging
    console.log('Update artist payload:', { id, email: p.email, phone: p.phone });
    
    const updates = {
      ...(typeof p.artistNumber !== 'undefined' ? { artistNumber: String(p.artistNumber).trim() } : {}),
      ...(typeof p.name !== 'undefined' ? { name: String(p.name).trim() } : {}),
      ...(typeof p.phone !== 'undefined' ? { phone: String(p.phone).trim() } : {}),
      ...(typeof p.artForm !== 'undefined' ? { artForm: String(p.artForm).trim() } : {}),
      ...(typeof p.teamRole !== 'undefined' ? { teamRole: String(p.teamRole).trim() } : {}),
      ...(typeof p.isTeamMember !== 'undefined' ? { isTeamMember: Boolean(p.isTeamMember) } : {}),
      ...(typeof p.displayOrder !== 'undefined' ? { displayOrder: Number(p.displayOrder || 0) } : {}),
      ...(typeof p.bio !== 'undefined' ? { bio: String(p.bio).trim() } : {}),
      ...(typeof p.isActive !== 'undefined' ? { isActive: Boolean(p.isActive) } : {}),
      ...(typeof p.imageUrl !== 'undefined' || typeof p.imageAlt !== 'undefined'
        ? {
            image: {
              ...(typeof p.imageUrl !== 'undefined' ? { url: String(p.imageUrl).trim() } : {}),
              ...(typeof p.imageAlt !== 'undefined' ? { alt: String(p.imageAlt).trim() } : {})
            }
          }
        : {}),
      location: {
        city: String(p.city || '').trim(),
        state: String(p.state || '').trim(),
        country: String(p.country || '').trim()
      },
      social: {
        instagram: String(p.instagram || '').trim(),
        facebook: String(p.facebook || '').trim(),
        twitter: String(p.twitter || '').trim(),
        linkedin: String(p.linkedin || '').trim(),
        website: String(p.website || '').trim()
      }
    };

    const updateQuery = { $set: updates };
    const unsets = {};

    if (typeof p.email !== 'undefined') {
      const emailVal = String(p.email).trim().toLowerCase();
      if (emailVal) {
        updates.email = emailVal;
      } else {
        unsets.email = 1;
      }
    }

    if (typeof p.username !== 'undefined') {
      const usernameVal = String(p.username).trim().toLowerCase();
      if (usernameVal) {
        updates.username = usernameVal;
      } else {
        unsets.username = 1;
      }
    }

    if (Object.keys(unsets).length > 0) {
      updateQuery.$unset = unsets;
    }
    
    console.log('Update artist query object:', updateQuery);

    const artist = await ArtistProfile.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true, runValidators: true }
    );
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    
    console.log('Updated artist:', { id: artist._id, email: artist.email, phone: artist.phone });
    res.json(artist);
  } catch (error) {
    console.error('Update artist error:', error);
    res.status(500).json({ error: 'Failed to update artist', details: error.message });
  }
});

router.delete('/artists/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const artist = await ArtistProfile.findByIdAndDelete(id);
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    res.json({ message: 'Artist deleted' });
  } catch (error) {
    console.error('Delete artist error:', error);
    res.status(500).json({ error: 'Failed to delete artist' });
  }
});

router.post('/artists/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'admin-artists'
    });
    res.json(result);
  } catch (error) {
    console.error('Artist image upload error:', error);
    res.status(500).json({
      error: 'Failed to upload',
      message: error.message,
      details: error
    });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
      });
    }
  }
});

// Bulk CSV artist upload with invite emails
router.post('/artists/bulk-upload', adminAuth, async (req, res) => {
  try {
    const { csvText, sendEmails = true } = req.body || {};
    if (!csvText || typeof csvText !== 'string') {
      return res.status(400).json({ error: 'CSV text is required' });
    }

    const rows = parseCSV(csvText);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'CSV is empty or malformed' });
    }

    const results = {
      created: [],
      updated: [],
      failed: [],
      emailsSent: 0,
      emailsFailed: 0
    };

    // Minimal CSV: Artist ID + Email only (artists complete profile after invite)
    const allowedIdKeys = [
      'id', 's.no', 'sno', 'sl.no', 'slno', 's.no.', 'sl.no.',
      'number', 'no', 'no.', 'artist number', 'artist_number',
      'artist number / id', 'artist number/id', 'artist_id',
      'artist id', 'artistid', 'artist no', 'artist no.', 'artist_no'
    ];

    const emailHeaderKeys = ['email', 'e-mail', 'mail', 'mail id', 'mailid'];

    const extractArtistId = (row) => {
      for (const key of Object.keys(row)) {
        const k = key.trim().toLowerCase();
        if (allowedIdKeys.includes(k)) {
          const val = String(row[key] ?? '').trim();
          if (val) return val;
        }
      }
      // Fallback: any non-email column (supports custom headers)
      for (const key of Object.keys(row)) {
        const k = key.trim().toLowerCase();
        if (!emailHeaderKeys.includes(k)) {
          const val = String(row[key] ?? '').trim();
          if (val) return val;
        }
      }
      return '';
    };

    const extractEmail = (row) => {
      for (const key of Object.keys(row)) {
        const k = key.trim().toLowerCase();
        if (emailHeaderKeys.includes(k)) {
          return String(row[key] ?? '').trim().toLowerCase();
        }
      }
      return String(row.email || row.Email || row.EMAIL || '').trim().toLowerCase();
    };

    const normalizeArtistId = (raw) => String(raw ?? '').trim().slice(0, 64);

    const placeholderNameFromEmail = (email, artistNumber) => {
      const local = email.split('@')[0]?.replace(/[._+-]/g, ' ').trim();
      if (local && local.length >= 2) {
        return local.charAt(0).toUpperCase() + local.slice(1);
      }
      return artistNumber ? `Artist ${artistNumber}` : 'Artist';
    };

    const processedEmails = new Set();
    const processedUsernames = new Set();

    for (const row of rows) {
      try {
        const id = normalizeArtistId(extractArtistId(row));
        const email = extractEmail(row);

        if (!email) {
          results.failed.push({ row, reason: 'Email is required' });
          continue;
        }
        if (!id) {
          results.failed.push({ row, reason: 'Artist ID is required (letters, numbers, or both)' });
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.failed.push({ row, reason: 'Invalid email address' });
          continue;
        }

        // Skip duplicate emails in current CSV batch gracefully
        if (processedEmails.has(email)) {
          results.failed.push({ row, reason: 'Duplicate email in CSV batch' });
          continue;
        }
        processedEmails.add(email);

        // Skip duplicate emails that already exist in database gracefully
        const existingArtistByEmail = await ArtistProfile.findOne({ email });
        if (existingArtistByEmail) {
          results.failed.push({ row, reason: 'Email already exists in database' });
          continue;
        }

        const artistId = id;
        const baseUsername = artistId.toLowerCase().trim();
        let username = baseUsername;

        // Ensure username is unique and never empty
        if (!username) {
          results.failed.push({ row, reason: 'Cannot generate a valid username from Artist ID' });
          continue;
        }

        const existingUser = await ArtistProfile.findOne({ username });
        if (existingUser || processedUsernames.has(username)) {
          username = `${baseUsername}_${Date.now()}`;
          // Belt and suspenders fallback in case timestamp is duplicated (extremely unlikely)
          let attempts = 0;
          while ((await ArtistProfile.findOne({ username })) || processedUsernames.has(username)) {
            username = `${baseUsername}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            attempts++;
            if (attempts > 10) break;
          }
        }
        processedUsernames.add(username);

        const placeholderName = placeholderNameFromEmail(email, artistId);
        const artist = await ArtistProfile.create({
          artistNumber: artistId,
          name: placeholderName,
          email,
          username,
          phone: '',
          artForm: 'Artist',
          image: getDefaultArtistImage(placeholderName),
          location: { city: '', state: '', country: '' },
          social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
          bio: '',
          isActive: true
        });
        results.created.push({ id: artist._id, name: artist.name, email: artist.email, username: artist.username });

        // Send invite email
        if (sendEmails && artist.email) {
          try {
            await sendArtistInviteEmail(artist.name, artist.email);
            results.emailsSent++;
          } catch (emailErr) {
            console.error('Failed to send invite email to', artist.email, emailErr.message);
            results.emailsFailed++;
          }
        }
      } catch (rowErr) {
        console.error('Bulk upload row error:', rowErr);
        results.failed.push({ row, reason: rowErr.message });
      }
    }

    res.json({
      success: true,
      summary: {
        total: rows.length,
        created: results.created.length,
        updated: results.updated.length,
        failed: results.failed.length,
        emailsSent: results.emailsSent,
        emailsFailed: results.emailsFailed
      },
      results
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Bulk upload failed', details: error.message });
  }
});

// Bulk announcement email to all users/artists
router.post('/announcements/bulk-email', adminAuth, async (req, res) => {
  try {
    const { subject, message, includeEvents = false, targetAudience = 'all' } = req.body || {};

    if (!subject || !message) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    // Build recipient query based on target audience
    let recipientQuery = {};
    if (targetAudience === 'artists') {
      // Get emails from ArtistProfile collection
      const artists = await ArtistProfile.find({ isActive: true }).select('email name').lean();
      const artistEmails = artists.map(a => a.email).filter(Boolean);

      // Also include users with artist role
      const artistUsers = await User.find({ role: 'artist', isActive: true }).select('email displayName').lean();
      const userEmails = artistUsers.map(u => u.email).filter(Boolean);

      const allArtistEmails = [...new Set([...artistEmails, ...userEmails])];

      if (allArtistEmails.length === 0) {
        return res.status(400).json({ error: 'No artist recipients found' });
      }

      recipientQuery = { email: { $in: allArtistEmails } };
    } else if (targetAudience === 'users') {
      recipientQuery = { role: 'user', isActive: true };
    } else {
      // all - get all active users and artists
      recipientQuery = { isActive: true };
    }

    // Fetch recipients
    const recipients = await User.find(recipientQuery).select('email displayName').lean();
    const emails = recipients.map(r => r.email).filter(Boolean);

    // Also get artist profiles not linked to User accounts
    if (targetAudience === 'all' || targetAudience === 'artists') {
      const artistProfiles = await ArtistProfile.find({ isActive: true }).select('email name').lean();
      const profileEmails = artistProfiles.map(a => a.email).filter(Boolean);
      emails.push(...profileEmails);
    }

    // Deduplicate emails
    const uniqueEmails = [...new Set(emails)];

    if (uniqueEmails.length === 0) {
      return res.status(400).json({ error: 'No recipients found' });
    }

    // Fetch upcoming events if requested
    let events = [];
    if (includeEvents) {
      const now = new Date();
      events = await Event.find({
        status: 'published',
        'date.end': { $gte: now }
      })
        .sort({ 'date.start': 1 })
        .limit(3)
        .select('title description category date location images')
        .lean();
    }

    // Send emails
    const transporter = createTransporter();
    let sent = 0;
    let failed = 0;
    const failedEmails = [];

    // Send in batches to avoid overwhelming the SMTP server
    const BATCH_SIZE = 50;
    for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
      const batch = uniqueEmails.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (email) => {
          try {
            await transporter.sendMail({
              from: `"ArtArtist" <${process.env.SMTP_USER}>`,
              to: email,
              subject: subject,
              html: bulkAnnouncementEmail(subject, message, events)
            });
            sent++;
          } catch (err) {
            console.error('Failed to send announcement to', email, err.message);
            failed++;
            failedEmails.push({ email, error: err.message });
          }
        })
      );
    }

    res.json({
      success: true,
      summary: {
        total: uniqueEmails.length,
        sent,
        failed
      },
      failedEmails: failedEmails.slice(0, 10) // Limit failed details
    });
  } catch (error) {
    console.error('Bulk announcement email error:', error);
    res.status(500).json({ error: 'Failed to send bulk announcement', details: error.message });
  }
});

// Broadcast message to all active artists
router.post('/artists/broadcast-message', adminAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    // Find or create the ArtArtist system User account
    const User = require('../models/User');
    const ArtistProfile = require('../models/ArtistProfile');
    const Message = require('../models/Message');
    const { getIO } = require('../services/socketService');

    let systemUser = await User.findOne({ email: 'artartistofficial@gmail.com' });
    if (!systemUser) {
      systemUser = await User.create({
        firebaseUid: 'system-artartist-broadcast-uid',
        email: 'artartistofficial@gmail.com',
        displayName: 'ArtArtist',
        role: 'admin',
        photoURL: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg'
      });
    }

    // Get all active artists
    const activeArtists = await ArtistProfile.find({ isActive: true });
    if (activeArtists.length === 0) {
      return res.status(404).json({ error: 'No active artists found' });
    }

    const messagesSaved = [];
    const io = getIO();

    for (const artist of activeArtists) {
      const message = new Message({
        sender: systemUser._id,
        senderModel: 'User',
        recipient: artist._id,
        recipientModel: 'ArtistProfile',
        text: text.trim(),
        senderType: 'admin',
        recipientType: 'artist',
        status: 'sent'
      });

      await message.save();

      // Populate sender and recipient for proper frontend rendering
      const populated = await Message.findById(message._id)
        .populate('sender', 'displayName email photoURL role')
        .populate('recipient', 'name email image');

      messagesSaved.push(populated);

      // Emit real-time socket events for smooth instant reception in browser
      try {
        // Robust room naming: sorting emails
        const senderEmail = systemUser.email;
        const recipientEmail = artist.email;
        let conversationId;
        if (senderEmail && recipientEmail) {
          conversationId = [senderEmail.toLowerCase(), recipientEmail.toLowerCase()].sort().join('_');
        } else {
          conversationId = [systemUser._id.toString(), artist._id.toString()].sort().join('_');
        }

        io.to(conversationId).emit('receive_message', populated);

        // Notify artist of new message
        io.to(`user_${artist._id}`).emit('new_message_notification', populated);
      } catch (socketErr) {
        console.warn(`Socket emit failed for artist ${artist.name}:`, socketErr.message);
      }
    }

    res.json({
      success: true,
      message: `Successfully broadcasted message to ${activeArtists.length} artists`,
      sentCount: activeArtists.length
    });

  } catch (error) {
    console.error('Broadcast message error:', error);
    res.status(500).json({ error: 'Failed to broadcast message', details: error.message });
  }
});

// ════════════════════════════════════════════
// ArtDistrict — Config (prices, payment link, gallery)
// ════════════════════════════════════════════

// GET config
router.get('/art-district/config', adminAuth, async (req, res) => {
  try {
    const config = await ArtDistrictConfig.getSingleton();
    res.json(config.toObject());
  } catch (error) {
    console.error('Get ArtDistrict config error:', error);
    res.status(500).json({ error: 'Failed to fetch ArtDistrict config' });
  }
});

// PUT config (prices + payment link)
router.put('/art-district/config', adminAuth, async (req, res) => {
  try {
    const { passes, heroImages, testimonials, stats } = req.body || {};
    const config = await ArtDistrictConfig.getSingleton();
    
    if (passes && Array.isArray(passes)) {
      config.passes = passes.map(p => ({
        title: String(p.title || '').trim(),
        subtitle: String(p.subtitle || '').trim(),
        price: String(p.price || '').trim(),
        period: String(p.period || '').trim(),
        features: Array.isArray(p.features) ? p.features.map(f => String(f).trim()) : [],
        iconType: String(p.iconType || 'palette').trim(),
        paymentLink: String(p.paymentLink || '').trim(),
        themeColor: String(p.themeColor || 'black').trim()
      }));
    }

    if (heroImages && Array.isArray(heroImages)) {
      config.heroImages = heroImages.map(url => String(url).trim());
    }

    if (testimonials && Array.isArray(testimonials)) {
      config.testimonials = testimonials.map(t => ({
        text: String(t.text || '').trim(),
        name: String(t.name || '').trim(),
        jobtitle: String(t.jobtitle || '').trim(),
        image: String(t.image || '').trim(),
        social: String(t.social || '').trim()
      }));
    }

    if (stats && Array.isArray(stats)) {
      config.stats = stats.map(s => ({
        num: String(s.num || '').trim(),
        label: String(s.label || '').trim()
      }));
    }

    await config.save();
    res.json({ message: 'Config updated', config: config.toObject() });
  } catch (error) {
    console.error('Update ArtDistrict config error:', error);
    res.status(500).json({ error: 'Failed to update ArtDistrict config' });
  }
});

// GET gallery images list
router.get('/art-district/gallery', adminAuth, async (req, res) => {
  try {
    const config = await ArtDistrictConfig.getSingleton();
    res.json({ galleryImages: config.galleryImages });
  } catch (error) {
    console.error('Get ArtDistrict gallery error:', error);
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

// PUT gallery images (replace entire array)
router.put('/art-district/gallery', adminAuth, async (req, res) => {
  try {
    const { galleryImages } = req.body || {};
    if (!Array.isArray(galleryImages)) {
      return res.status(400).json({ error: 'galleryImages must be an array' });
    }
    const config = await ArtDistrictConfig.getSingleton();
    config.galleryImages = galleryImages.map((img, i) => ({
      url:     String(img.url     || '').trim(),
      alt:     String(img.alt     || '').trim(),
      caption: String(img.caption || '').trim(),
      order:   typeof img.order !== 'undefined' ? Number(img.order) : i
    }));
    await config.save();
    res.json({ message: 'Gallery updated', galleryImages: config.galleryImages });
  } catch (error) {
    console.error('Update ArtDistrict gallery error:', error);
    res.status(500).json({ error: 'Failed to update gallery' });
  }
});

// Upload an image for the ArtDistrict gallery (Admin → Cloudinary)
router.post('/art-district/gallery/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      filePath: req.file.path,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'art-district-gallery'
    });
    res.json(result);
  } catch (error) {
    console.error('ArtDistrict gallery upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  } finally {
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

// ════════════════════════════════════════════
// ArtDistrict — Registrations (admin view + manual issue)
// ════════════════════════════════════════════

// GET all registrations (with optional search/filter)
router.get('/art-district/registrations', adminAuth, async (req, res) => {
  try {
    const { search = '', passType = '', category = '' } = req.query;
    const query = {};
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email:    { $regex: search, $options: 'i' } },
        { memberId: { $regex: search, $options: 'i' } }
      ];
    }
    if (passType) query.passType = { $regex: passType, $options: 'i' };
    if (category) query.category = category;

    const registrations = await ArtDistrictRegistration.find(query)
      .sort({ createdAt: -1 });
    res.json({ registrations });
  } catch (error) {
    console.error('Get ArtDistrict registrations error:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

// POST — admin manually issues a walk-in pass
router.post('/art-district/registrations', adminAuth, async (req, res) => {
  try {
    const { fullName, email, insta, category, passType, paymentMethod } = req.body || {};
    if (!fullName || !email || !passType) {
      return res.status(400).json({ error: 'fullName, email and passType are required' });
    }

    const config = await ArtDistrictConfig.getSingleton();
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const today  = new Date();
    const validFrom = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`;

    const expiry = new Date();
    if (passType.toLowerCase().includes('daily'))       expiry.setDate(today.getDate() + 1);
    else if (passType.toLowerCase().includes('weekly')) expiry.setDate(today.getDate() + 7);
    else                                                 expiry.setDate(today.getDate() + 30);
    const validThru = `${expiry.getDate()} ${months[expiry.getMonth()]} ${expiry.getFullYear()}`;

    const names    = fullName.trim().split(' ');
    const initials = names.length > 1
      ? (names[0][0] + names[names.length - 1][0]).toUpperCase()
      : names[0].substring(0, 2).toUpperCase();

    const randomId = Math.floor(1000 + Math.random() * 9000);
    const memberId = `AA-2026-${randomId}`;

    let price = `₹${config.daily}`;
    if (passType.toLowerCase().includes('weekly'))      price = `₹${config.weekly}`;
    else if (passType.toLowerCase().includes('monthly')) price = `₹${config.monthly}`;

    const qrData  = encodeURIComponent(`ID:${memberId}|Name:${fullName}|Pass:${passType}`);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qrData}`;

    const reg = await ArtDistrictRegistration.create({
      fullName: fullName.trim(),
      email:    email.trim().toLowerCase(),
      insta:    (insta || '').trim().startsWith('@') ? insta.trim() : `@${(insta || '').trim()}`,
      category: (category || '').trim(),
      passType: passType.trim(),
      price,
      initials,
      memberId,
      validFrom,
      validThru,
      qrCodeUrl,
      paymentMethod: paymentMethod || 'UPI',
      source: 'manual'
    });

    res.status(201).json(reg);
  } catch (error) {
    console.error('Create ArtDistrict registration error:', error);
    res.status(500).json({ error: 'Failed to create registration', details: error.message });
  }
});

// DELETE a registration
router.delete('/art-district/registrations/:id', adminAuth, async (req, res) => {
  try {
    const reg = await ArtDistrictRegistration.findByIdAndDelete(req.params.id);
    if (!reg) return res.status(404).json({ error: 'Registration not found' });
    res.json({ message: 'Registration deleted' });
  } catch (error) {
    console.error('Delete ArtDistrict registration error:', error);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
});

module.exports = router;

