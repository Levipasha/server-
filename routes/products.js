const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

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

    // Build query
    const query = { status };
    
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
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const productData = JSON.parse(req.body.productData);
    
    // Handle image uploads to Cloudinary
    const imagePromises = req.files.map(async (file) => {
      const result = await req.app.locals.cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: 'art-marketplace/products',
          transformation: [
            { width: 800, height: 600, crop: 'fit', quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) throw error;
          return result;
        }
      ).end(file.buffer);

      return result;
    });

    const uploadedImages = await Promise.all(imagePromises);
    
    const images = uploadedImages.map(img => ({
      url: img.secure_url,
      publicId: img.public_id,
      alt: productData.name
    }));

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
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Update product (requires authentication and ownership)
router.put('/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.artist.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this product' });
    }

    const updates = JSON.parse(req.body.productData);
    
    // Handle new image uploads if any
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(async (file) => {
        const result = await req.app.locals.cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'art-marketplace/products'
          },
          (error, result) => {
            if (error) throw error;
            return result;
          }
        ).end(file.buffer);

        return result;
      });

      const uploadedImages = await Promise.all(imagePromises);
      
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
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete product (requires authentication and ownership)
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (product.artist.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this product' });
    }

    // Delete images from Cloudinary
    if (product.images && product.images.length > 0) {
      const deletePromises = product.images.map(async (image) => {
        if (image.publicId) {
          await req.app.locals.cloudinary.uploader.destroy(image.publicId);
        }
      });
      await Promise.all(deletePromises);
    }

    await Product.findByIdAndDelete(req.params.id);

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Like/unlike product
router.post('/:id/like', auth, async (req, res) => {
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
router.post('/:id/reviews', auth, async (req, res) => {
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
