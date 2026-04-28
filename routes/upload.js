const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../services/mediaStorage');

const router = express.Router();

// Multer configuration for general uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'image/gif') {
      cb(null, true);
    } else {
      cb(new Error('Only image files (including GIF) are allowed'), false);
    }
  }
});

// Upload single image
router.post('/image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await uploadImage({
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'website'
    });

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload multiple images
router.post('/images', authenticate, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const results = await Promise.all(
      req.files.map((file) =>
        uploadImage({
          buffer: file.buffer,
          mimetype: file.mimetype,
          filename: file.originalname,
          folder: 'website'
        })
      )
    );

    res.json(results);
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

const cloudinary = require('cloudinary').v2;

router.delete('/image/:publicId', authenticate, async (req, res) => {
  try {
    const { publicId } = req.params;
    
    await cloudinary.uploader.destroy(publicId);
    
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

module.exports = router;
