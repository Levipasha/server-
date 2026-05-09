const express = require('express');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Product = require('../models/Product');
const Event = require('../models/Event');
const GalleryItem = require('../models/GalleryItem');
const ArtistProfile = require('../models/ArtistProfile');
const SiteSettings = require('../models/SiteSettings');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const { uploadImage } = require('../services/mediaStorage');
const { parseCSV } = require('../utils/csvParser');
const { artistInviteEmail, bulkAnnouncementEmail } = require('../utils/emailTemplates');

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
      if (allowedFields.includes(key)) {
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

    const artist = await ArtistProfile.create({
      name: String(payload.name).trim(),
      email: String(payload.email || '').trim().toLowerCase(),
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
    });
    
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
      ...(typeof p.name !== 'undefined' ? { name: String(p.name).trim() } : {}),
      ...(typeof p.email !== 'undefined' ? { email: String(p.email).trim().toLowerCase() } : {}),
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
    
    console.log('Update artist updates object:', updates);

    const artist = await ArtistProfile.findByIdAndUpdate(
      id,
      { $set: updates },
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

    // Normalize CSV headers based on user's format: ID, name, instagram, artform, Mob#, Email, Location
    for (const row of rows) {
      try {
        const id = row.id || row.ID || '';
        const name = row.name || row.Name || row.NAME || '';
        const instagram = row.instagram || row.Instagram || row.INSTAGRAM || '';
        const artForm = row.artform || row.artForm || row.ArtForm || row['art form'] || row['Art Form'] || '';
        const phone = row.mob || row['mob#'] || row.Mob || row['Mob#'] || row.phone || row.Phone || row.PHONE || '';
        const email = row.email || row.Email || row.EMAIL || '';
        const locationRaw = row.location || row.Location || row.LOCATION || '';

        if (!name || !email) {
          results.failed.push({ row, reason: 'name and email are required' });
          continue;
        }

        // Parse location into city/state/country (e.g., "Hyderabad" or "Hyderabad, Telangana, India")
        const locParts = locationRaw.split(',').map((s) => s.trim());
        const location = {
          city: locParts[0] || '',
          state: locParts[1] || '',
          country: locParts[2] || ''
        };

        const social = {
          instagram: instagram,
          facebook: '',
          twitter: '',
          linkedin: '',
          website: ''
        };

        // Default placeholder image until they upload one
        const defaultImage = {
          url: 'https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg',
          alt: name,
          publicId: null
        };

        let artist;
        let isNew = false;

        if (id && id.trim()) {
          // Try to update existing artist by custom ID reference (email is the real key)
          artist = await ArtistProfile.findOneAndUpdate(
            { email: email.toLowerCase() },
            {
              $set: {
                name: name.trim(),
                artForm: artForm.trim() || 'Artist',
                phone: phone.trim(),
                email: email.trim().toLowerCase(),
                location,
                social,
                isActive: true
              }
            },
            { new: true }
          );
        }

        if (!artist) {
          // Check if artist exists by email
          artist = await ArtistProfile.findOne({ email: email.toLowerCase() });
        }

        if (artist) {
          // Update existing
          artist.name = name.trim();
          artist.artForm = artForm.trim() || artist.artForm || 'Artist';
          artist.phone = phone.trim();
          artist.location = location;
          artist.social = { ...artist.social, ...social };
          artist.isActive = true;
          await artist.save();
          results.updated.push({ id: artist._id, name: artist.name, email: artist.email });
        } else {
          // Create new
          artist = await ArtistProfile.create({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            artForm: artForm.trim() || 'Artist',
            image: defaultImage,
            location,
            social,
            bio: '',
            isActive: true
          });
          isNew = true;
          results.created.push({ id: artist._id, name: artist.name, email: artist.email });
        }

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

module.exports = router;
