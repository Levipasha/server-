const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Product = require('../models/Product');
const Event = require('../models/Event');
const GalleryItem = require('../models/GalleryItem');
const ArtistProfile = require('../models/ArtistProfile');
const SiteSettings = require('../models/SiteSettings');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const { uploadImage } = require('../services/mediaStorage');

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
    if (!payload.name || !payload.imageUrl || !payload.artForm) {
      return res.status(400).json({ error: 'name, imageUrl and artForm are required' });
    }

    const artist = await ArtistProfile.create({
      name: String(payload.name).trim(),
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

    res.status(201).json(artist);
  } catch (error) {
    console.error('Create artist error:', error);
    res.status(500).json({ error: 'Failed to create artist' });
  }
});

router.put('/artists/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body || {};
    const updates = {
      ...(typeof p.name !== 'undefined' ? { name: String(p.name).trim() } : {}),
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

    const artist = await ArtistProfile.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!artist) return res.status(404).json({ error: 'Artist not found' });
    res.json(artist);
  } catch (error) {
    console.error('Update artist error:', error);
    res.status(500).json({ error: 'Failed to update artist' });
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

module.exports = router;
