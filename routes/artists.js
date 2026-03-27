const express = require('express');
const ArtistProfile = require('../models/ArtistProfile');

const router = express.Router();

// Public search/suggestions for hero search
router.get('/search', async (req, res) => {
  try {
    const { q = '', limit = 8 } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 8, 30);

    const query = { isActive: true };
    if (q && String(q).trim()) {
      const text = String(q).trim();
      query.$or = [
        { name: { $regex: text, $options: 'i' } },
        { artForm: { $regex: text, $options: 'i' } },
        { bio: { $regex: text, $options: 'i' } },
        { 'location.city': { $regex: text, $options: 'i' } }
      ];
    }

    const artists = await ArtistProfile.find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json({ artists });
  } catch (error) {
    console.error('Artist search error:', error);
    res.status(500).json({ error: 'Failed to search artists' });
  }
});

router.get('/team', async (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 12, 50);
    const artists = await ArtistProfile.find({ isActive: true, isTeamMember: true })
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(safeLimit);
    res.json({ artists });
  } catch (error) {
    console.error('Get team artists error:', error);
    res.status(500).json({ error: 'Failed to get team artists' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const artist = await ArtistProfile.findById(req.params.id);
    if (!artist || !artist.isActive) {
      return res.status(404).json({ error: 'Artist not found' });
    }
    res.json(artist);
  } catch (error) {
    console.error('Get artist error:', error);
    res.status(500).json({ error: 'Failed to get artist' });
  }
});

module.exports = router;

