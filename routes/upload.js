const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const { uploadImage } = require('../services/mediaStorage');

const router = express.Router();

// Multer configuration for general uploads
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

// Upload single image
router.post('/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const provider = process.env.BUNNY_STORAGE_ZONE ? 'bunny' : 'cloudinary';
    const result = await uploadImage({
      provider,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      filename: req.file.originalname,
      folder: 'website',
      cloudinary: req.app.locals.cloudinary,
      bunny: {
        storageZone: process.env.BUNNY_STORAGE_ZONE,
        accessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
        cdnBaseUrl: process.env.BUNNY_CDN_BASE_URL,
        storageHost: process.env.BUNNY_STORAGE_HOST,
        pathPrefix: process.env.BUNNY_PATH_PREFIX || 'art-marketplace'
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Upload multiple images
router.post('/images', auth, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const provider = process.env.BUNNY_STORAGE_ZONE ? 'bunny' : 'cloudinary';
    const results = await Promise.all(
      req.files.map((file) =>
        uploadImage({
          provider,
          buffer: file.buffer,
          mimetype: file.mimetype,
          filename: file.originalname,
          folder: 'website',
          cloudinary: req.app.locals.cloudinary,
          bunny: {
            storageZone: process.env.BUNNY_STORAGE_ZONE,
            accessKey: process.env.BUNNY_STORAGE_ACCESS_KEY,
            cdnBaseUrl: process.env.BUNNY_CDN_BASE_URL,
            storageHost: process.env.BUNNY_STORAGE_HOST,
            pathPrefix: process.env.BUNNY_PATH_PREFIX || 'art-marketplace'
          }
        })
      )
    );

    res.json(results);
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
});

// Delete image
router.delete('/image/:publicId', auth, async (req, res) => {
  try {
    const { publicId } = req.params;
    
    await req.app.locals.cloudinary.uploader.destroy(publicId);
    
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

module.exports = router;
