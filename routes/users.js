const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Event = require('../models/Event');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user's profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-firebaseUid');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user's profile
router.put('/profile', auth, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-firebaseUid');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Get user's products
router.get('/products', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { artist: req.user.userId };
    if (status) query.status = status;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Get user's events
router.get('/events', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      sortBy = 'date.start',
      sortOrder = 'asc'
    } = req.query;

    const query = { organizer: req.user.userId };
    if (status) query.status = status;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const events = await Event.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Event.countDocuments(query);

    res.json({
      events,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get user's registered events
router.get('/registered-events', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'date.start',
      sortOrder = 'asc'
    } = req.query;

    const events = await Event.find({
      'attendees.user': req.user.userId,
      status: 'published'
    })
    .populate('organizer', 'displayName photoURL')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

    const total = await Event.countDocuments({
      'attendees.user': req.user.userId,
      status: 'published'
    });

    res.json({
      events,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get registered events error:', error);
    res.status(500).json({ error: 'Failed to get registered events' });
  }
});

// Get user's liked products
router.get('/liked-products', auth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const products = await Product.find({
      likes: req.user.userId,
      status: 'available'
    })
    .populate('artist', 'displayName photoURL')
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .exec();

    const total = await Product.countDocuments({
      likes: req.user.userId,
      status: 'available'
    });

    res.json({
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get liked products error:', error);
    res.status(500).json({ error: 'Failed to get liked products' });
  }
});

// Search users (for artist discovery)
router.get('/search', async (req, res) => {
  try {
    const {
      q,
      page = 1,
      limit = 20,
      role
    } = req.query;

    const query = { isActive: true };
    
    if (role) query.role = role;
    
    if (q) {
      query.$or = [
        { displayName: new RegExp(q, 'i') },
        { 'profile.firstName': new RegExp(q, 'i') },
        { 'profile.lastName': new RegExp(q, 'i') },
        { 'profile.bio': new RegExp(q, 'i') },
        { 'profile.artistInfo.specialization': new RegExp(q, 'i') }
      ];
    }

    const users = await User.find(query)
      .select('displayName photoURL role profile')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await User.countDocuments(query);

    res.json({
      users,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [
      productCount,
      eventCount,
      registeredEventCount,
      likedProductCount
    ] = await Promise.all([
      Product.countDocuments({ artist: userId }),
      Event.countDocuments({ organizer: userId }),
      Event.countDocuments({ 'attendees.user': userId }),
      Product.countDocuments({ likes: userId })
    ]);

    res.json({
      products: productCount,
      events: eventCount,
      registeredEvents: registeredEventCount,
      likedProducts: likedProductCount
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

module.exports = router;
