const express = require('express');
const multer = require('multer');
const Event = require('../models/Event');
const auth = require('../middleware/auth');

const router = express.Router();

// Multer configuration for event images
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

// Get all events with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      city,
      search,
      sortBy = 'date.start',
      sortOrder = 'asc',
      featured,
      status = 'published'
    } = req.query;

    // Build query - 'all' shows every status (for admin), otherwise filter
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (category) query.category = category;
    if (city) query['location.city'] = new RegExp(city, 'i');
    if (featured) query.featured = featured === 'true';
    
    if (search) {
      query.$text = { $search: search };
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const events = await Event.find(query)
      .populate('organizer', 'displayName photoURL')
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
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('organizer', 'displayName photoURL profile')
      .populate('attendees.user', 'displayName photoURL')
      .populate('reviews.user', 'displayName photoURL');

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Increment views
    event.views += 1;
    await event.save();

    res.json(event);
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to get event' });
  }
});

// Create new event (requires authentication)
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const eventData = req.body.eventData ? JSON.parse(req.body.eventData) : req.body;
    
    // Upload images to Cloudinary using Promise wrapper
    const uploadToCloudinary = (buffer) => {
      return new Promise((resolve, reject) => {
        const stream = req.app.locals.cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: 'art-marketplace/events',
            transformation: [{ width: 1200, height: 630, crop: 'fit', quality: 'auto' }]
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(buffer);
      });
    };

    let images = eventData.images || [];
    if (req.files && req.files.length > 0) {
      const uploadedImages = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer)));
      images = uploadedImages.map(img => ({
        url: img.secure_url,
        publicId: img.public_id,
        alt: eventData.title || 'event image'
      }));
    }

    const event = new Event({
      ...eventData,
      images,
      organizer: req.user.userId
    });

    await event.save();
    await event.populate('organizer', 'displayName photoURL');

    res.status(201).json(event);
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event', message: error.message });
  }
});

// Update event (requires authentication - admin can edit any)
router.put('/:id', auth, upload.array('images', 5), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (req.user.role !== 'admin' && event.organizer.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to update this event' });
    }

    const updates = req.body.eventData ? JSON.parse(req.body.eventData) : req.body;
    
    // Upload new images using Promise wrapper
    if (req.files && req.files.length > 0) {
      const uploadToCloudinary = (buffer) => {
        return new Promise((resolve, reject) => {
          const stream = req.app.locals.cloudinary.uploader.upload_stream(
            { resource_type: 'image', folder: 'art-marketplace/events' },
            (error, result) => { if (error) reject(error); else resolve(result); }
          );
          stream.end(buffer);
        });
      };
      const uploadedImages = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer)));
      const newImages = uploadedImages.map(img => ({
        url: img.secure_url,
        publicId: img.public_id,
        alt: updates.title || event.title
      }));
      updates.images = [...event.images, ...newImages];
    }

    Object.assign(event, updates);
    await event.save();
    await event.populate('organizer', 'displayName photoURL');

    res.json(event);
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event', message: error.message });
  }
});

// Delete event (requires authentication - admin can delete any)
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (req.user.role !== 'admin' && event.organizer.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized to delete this event' });
    }

    // Delete images from Cloudinary
    if (event.images && event.images.length > 0) {
      await Promise.all(
        event.images
          .filter(img => img.publicId)
          .map(img => req.app.locals.cloudinary.uploader.destroy(img.publicId))
      );
    }

    await Event.findByIdAndDelete(req.params.id);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event', message: error.message });
  }
});

// Register for event
router.post('/:id/register', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const userId = req.user.userId;
    
    // Check if already registered
    const existingRegistration = event.attendees.find(
      attendee => attendee.user.toString() === userId
    );

    if (existingRegistration) {
      return res.status(400).json({ error: 'Already registered for this event' });
    }

    // Check capacity
    if (event.capacity.max && event.capacity.current >= event.capacity.max) {
      return res.status(400).json({ error: 'Event is full' });
    }

    // Add attendee
    event.attendees.push({
      user: userId,
      registeredAt: new Date(),
      status: 'registered'
    });

    event.capacity.current += 1;
    await event.save();

    res.status(201).json({ message: 'Successfully registered for event' });
  } catch (error) {
    console.error('Register for event error:', error);
    res.status(500).json({ error: 'Failed to register for event' });
  }
});

// Unregister from event
router.delete('/:id/register', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const userId = req.user.userId;
    
    // Find and remove attendee
    const attendeeIndex = event.attendees.findIndex(
      attendee => attendee.user.toString() === userId
    );

    if (attendeeIndex === -1) {
      return res.status(400).json({ error: 'Not registered for this event' });
    }

    event.attendees.splice(attendeeIndex, 1);
    event.capacity.current -= 1;
    await event.save();

    res.json({ message: 'Successfully unregistered from event' });
  } catch (error) {
    console.error('Unregister from event error:', error);
    res.status(500).json({ error: 'Failed to unregister from event' });
  }
});

// Add review to event
router.post('/:id/reviews', auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const event = await Event.findById(req.params.id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Check if user attended the event
    const attended = event.attendees.some(
      attendee => attendee.user.toString() === req.user.userId && 
      attendee.status === 'attended'
    );

    if (!attended) {
      return res.status(403).json({ error: 'Must attend event to leave review' });
    }

    // Check if user already reviewed
    const existingReview = event.reviews.find(
      review => review.user.toString() === req.user.userId
    );

    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this event' });
    }

    event.reviews.push({
      user: req.user.userId,
      rating,
      comment
    });

    await event.save();
    await event.populate('reviews.user', 'displayName photoURL');

    res.status(201).json(event.reviews[event.reviews.length - 1]);
  } catch (error) {
    console.error('Add review error:', error);
    res.status(500).json({ error: 'Failed to add review' });
  }
});

module.exports = router;
