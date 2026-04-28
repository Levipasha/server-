const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');

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
      featured,
      status = 'available'
    } = req.query;

    // Build query - 'all' shows every status (for admin), otherwise filter
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (category) query.category = category;
    if (artist) query.artist = artist;
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

    // Upload images to Cloudinary using Promise wrapper
    const uploadToCloudinary = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = req.app.locals.cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'art-marketplace/products',
            transformation: [{ width: 800, height: 600, crop: 'fit', quality: 'auto' }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });
    };

    let images = productData.images || [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer)));
      images = uploadedImages.map(img => ({
        url: img.secure_url,
        publicId: img.public_id,
        alt: productData.name || 'artwork'
      }));
    }

    const product = new Product({
      ...productData,
      images,
      artist: req.user.userId
    });

    await product.save();
    await product.populate('artist', 'displayName photoURL');

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

    // Upload new images using Promise wrapper
    if (req.files && req.files.length > 0) {
      const uploadToCloudinary = (buffer) => {
        return new Promise((resolve, reject) => {
          const stream = req.app.locals.cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: 'art-marketplace/products' },
            (error, result) => { if (error) reject(error); else resolve(result); }
          );
          stream.end(buffer);
        });
      };
      const uploadedImages = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer)));
      const newImages = uploadedImages.map(img => ({
        url: img.secure_url,
        publicId: img.public_id,
        alt: updates.name || product.name
      }));
      updates.images = [...product.images, ...newImages];
    }

    Object.assign(product, updates);
    await product.save();
    await product.populate('artist', 'displayName photoURL');

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
