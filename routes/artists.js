const express = require('express');
const ArtistProfile = require('../models/ArtistProfile');

const router = express.Router();

// City name aliases for common misspellings / alternate names
const cityAliases = {
  hyderabad: ['hydrabad', 'hyd', 'secunderabad'],
  mumbai: ['bombay', 'bom'],
  delhi: ['new delhi', 'ncr', 'delhi ncr', 'noida', 'gurgaon', 'gurugram'],
  bangalore: ['bengaluru', 'blr'],
  chennai: ['madras'],
  kolkata: ['calcutta'],
  pune: ['poona'],
  varanasi: ['banaras', 'benares'],
  trivandrum: ['thiruvananthapuram'],
  cochin: ['kochi'],
  mysore: ['mysuru'],
  baroda: ['vadodara'],
  calicut: ['kozhikode'],
};

// Build a regex that matches the term and its known aliases
const buildFlexibleRegex = (term) => {
  const lower = term.toLowerCase().trim();
  const aliases = cityAliases[lower] || [];
  const allTerms = [lower, ...aliases].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(allTerms.join('|'), 'i');
};

// Public search/suggestions for hero search
router.get('/search', async (req, res) => {
  try {
    const { q = '', limit = 8, artForm, location } = req.query;
    const safeLimit = Math.min(parseInt(limit, 10) || 8, 100);

    const query = { isActive: true };
    const hasFilter = (artForm && String(artForm).trim()) || (location && String(location).trim());

    if (hasFilter) {
      // When specific filters are provided, use them as the primary match
      const andConditions = [];

      if (artForm && String(artForm).trim()) {
        andConditions.push({
          $or: [
            { artForm: { $regex: String(artForm).trim(), $options: 'i' } },
            { name: { $regex: String(artForm).trim(), $options: 'i' } }
          ]
        });
      }

      if (location && String(location).trim()) {
        const locRegex = buildFlexibleRegex(String(location).trim());
        andConditions.push({
          $or: [
            { 'location.city': locRegex },
            { 'location.state': locRegex },
            { 'location.country': locRegex }
          ]
        });
      }

      if (andConditions.length === 1) {
        // Single filter: merge $or conditions into top-level query
        const orClause = andConditions[0].$or;
        if (andConditions[0].artForm !== undefined) {
          // artForm filter only
          query.$or = orClause;
        } else {
          // location filter only
          query.$or = orClause;
        }
      } else if (andConditions.length > 1) {
        query.$and = andConditions;
      }
    } else if (q && String(q).trim()) {
      // General text search (no specific filters)
      const text = String(q).trim();
      const locRegex = buildFlexibleRegex(text);
      query.$or = [
        { name: { $regex: text, $options: 'i' } },
        { artForm: { $regex: text, $options: 'i' } },
        { bio: { $regex: text, $options: 'i' } },
        { 'location.city': locRegex },
        { 'location.state': locRegex },
        { 'location.country': locRegex }
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

