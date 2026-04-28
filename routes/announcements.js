const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { authenticate, authorize } = require('../middleware/auth');

// Get active announcement (public)
router.get('/active', async (req, res) => {
  try {
    const announcement = await Announcement.getActive();
    res.json({ success: true, data: announcement });
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch announcement' });
  }
});

// Get all announcements (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json({ success: true, data: announcements });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch announcements' });
  }
});

// Create new announcement (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const {
      badge,
      message,
      isActive,
      link,
      backgroundColor,
      textColor,
      badgeColor,
      badgeTextColor,
      heroImage,
      heroLogo
    } = req.body;

    // If setting this as active, deactivate all others
    if (isActive) {
      await Announcement.updateMany({}, { isActive: false });
    }

    const announcement = new Announcement({
      badge,
      message,
      isActive,
      link,
      backgroundColor,
      textColor,
      badgeColor,
      badgeTextColor,
      heroImage,
      heroLogo
    });

    await announcement.save();

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, error: 'Failed to create announcement' });
  }
});

// Update announcement (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // If setting this as active, deactivate all others
    if (updateData.isActive) {
      await Announcement.updateMany(
        { _id: { $ne: id } },
        { isActive: false }
      );
    }

    const announcement = await Announcement.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!announcement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ success: false, error: 'Failed to update announcement' });
  }
});

// Delete announcement (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const announcement = await Announcement.findByIdAndDelete(id);

    if (!announcement) {
      return res.status(404).json({ success: false, error: 'Announcement not found' });
    }

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ success: false, error: 'Failed to delete announcement' });
  }
});

module.exports = router;
