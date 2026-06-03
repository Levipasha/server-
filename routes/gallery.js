const express = require('express');
const GalleryItem = require('../models/GalleryItem');

const router = express.Router();

// Public: list gallery items
router.get('/', async (req, res) => {
  try {
    const { limit = 50, galleryType } = req.query;
    const query = { isActive: true };
    if (galleryType && ['gallery', '3d-gallery'].includes(String(galleryType))) {
      query.galleryType = String(galleryType);
    }
    const items = await GalleryItem.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 50, 200));
    res.json({ items });
  } catch (error) {
    console.error('Get gallery error:', error);
    res.status(500).json({ error: 'Failed to get gallery' });
  }
});

module.exports = router;

