const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../services/mediaStorage');

const router = express.Router();

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get all products with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      artist,
      artistProfile,
      featured,
      status = 'available'
    } = req.query;

    // Build query - 'all' shows every status (for admin), otherwise filter
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (category) {
      if (typeof category === 'string') {
        const cleanCategory = category.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanCategory === 'digitalart') {
          query.category = { $in: ['digital-art', 'Digital Art', 'digitalart', 'digitalArt'] };
        } else {
          query.category = { $regex: new RegExp(`^${category}$`, 'i') };
        }
      } else {
        query.category = category;
      }
    }
    if (artist) query.artist = artist;
    if (artistProfile) query.artistProfile = artistProfile;
    if (featured) query.featured = featured === 'true';
    
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    if (search) {
      query.$text = { $search: search };
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const products = await Product.find(query)
      .populate('artist', 'displayName photoURL')
      .populate('artistProfile', 'name image artForm location social bio')
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
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Failed to get products' });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('artist', 'displayName photoURL profile')
      .populate('artistProfile', 'name image artForm location social bio');

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Increment views
    product.views += 1;
    await product.save();

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Failed to get product' });
  }
});

// Create new product (requires authentication)
router.post('/', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const productData = req.body.productData ? JSON.parse(req.body.productData) : req.body;

    // Fetch user to get email
    const User = require('../models/User');
    const ArtistProfile = require('../models/ArtistProfile');
    const user = await User.findById(req.user.userId);
    
    let artistProfileId = productData.artistProfile;
    
    // If no artistProfile provided, try to find one by user email
    if (!artistProfileId && user) {
      const profile = await ArtistProfile.findOne({ email: user.email.toLowerCase() });
      if (profile) {
        artistProfileId = profile._id;
      }
    }

    // Check artwork limit (3 per artist)
    if (artistProfileId) {
      const artworkCount = await Product.countDocuments({ artistProfile: artistProfileId });
      if (artworkCount >= 3) {
        return res.status(400).json({ 
          error: 'Upload limit reached', 
          message: 'Each artist can upload a maximum of 3 artworks. Please delete an existing artwork to upload a new one.' 
        });
      }
    } else if (req.user.role !== 'admin') {
      // If no profile found and not admin, check by userId
      const artworkCount = await Product.countDocuments({ artist: req.user.userId });
      if (artworkCount >= 3) {
        return res.status(400).json({ 
          error: 'Upload limit reached', 
          message: 'Each artist can upload a maximum of 3 artworks.' 
        });
      }
    }

    let images = productData.images || [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await Promise.all(
        req.files.map(f => 
          uploadImage({
            buffer: f.buffer,
            mimetype: f.mimetype,
            filename: f.originalname,
            folder: 'products'
          })
        )
      );
      images = uploadedImages.map(img => ({
        url: img.url,
        publicId: img.publicId,
        alt: productData.name || 'artwork'
      }));
    }

    const product = new Product({
      ...productData,
      images,
      artist: req.user.userId,
      artistProfile: artistProfileId,
      artistName: user ? user.displayName : productData.artistName
    });

    await product.save();
    await product.populate('artist', 'displayName photoURL');
    if (artistProfileId) {
      await product.populate('artistProfile', 'name image artForm location');
    }

    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Failed to create product', message: error.message });
  }
});

// Update product (requires authentication — admin can edit any, others only own)
router.put('/:id', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Allow admin to update any product; others only their own
    if (req.user.role !== 'admin' && product.artist.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    const updates = req.body.productData ? JSON.parse(req.body.productData) : req.body;

    // Automatically link artistProfile if missing
    if (!product.artistProfile || !updates.artistProfile) {
      const User = require('../models/User');
      const ArtistProfile = require('../models/ArtistProfile');
      const user = await User.findById(req.user.userId);
      if (user) {
        const profile = await ArtistProfile.findOne({ email: user.email.toLowerCase() });
        if (profile) {
          updates.artistProfile = profile._id;
        }
      }
    }

    // Upload new images using Promise wrapper
    if (req.files && req.files.length > 0) {
      const uploadedImages = await Promise.all(
        req.files.map(f => 
          uploadImage({
            buffer: f.buffer,
            mimetype: f.mimetype,
            filename: f.originalname,
            folder: 'products'
          })
        )
      );
      const newImages = uploadedImages.map(img => ({
        url: img.url,
        publicId: img.publicId,
        alt: updates.name || product.name
      }));
      updates.images = [...(product.images || []), ...newImages];
    }

    Object.assign(product, updates);
    await product.save();
    await product.populate('artist', 'displayName photoURL');
    if (product.artistProfile) {
      await product.populate('artistProfile', 'name image artForm location');
    }

    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Failed to update product', message: error.message });
  }
});

// Delete product (requires authentication — admin can delete any)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Allow admin to delete any product; others only their own
    if (req.user.role !== 'admin' && product.artist.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      await Promise.all(
        product.images
          .filter(img => img.publicId)
          .map(img => req.app.locals.cloudinary.uploader.destroy(img.publicId))
      );
    }

    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product', message: error.message });
  }
});

// Like/unlike product
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const userId = req.user.userId;
    const likeIndex = product.likes.indexOf(userId);
    
    if (likeIndex > -1) {
      // Unlike
      product.likes.splice(likeIndex, 1);
    } else {
      // Like
      product.likes.push(userId);
    }

    await product.save();
    res.json({ liked: likeIndex === -1 });
  } catch (error) {
    console.error('Like product error:', error);
    res.status(500).json({ error: 'Failed to like product' });
  }
});

// Add review to product
router.post('/:id/reviews', authenticate, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if user already reviewed
    const existingReview = product.reviews.find(
      review => review.user.toString() === req.user.userId
    );

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this product' });
    }

    product.reviews.push({
      user: req.user.userId,
      rating,
      comment
    });

    await product.save();
    await product.populate('reviews.user', 'displayName photoURL');

    res.status(201).json(product.reviews[product.reviews.length - 1]);
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ error: 'Failed to add review' });
  }
});

module.exports = router;
