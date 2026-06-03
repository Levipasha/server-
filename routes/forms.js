const express = require('express');
const EventForm = require('../models/EventForm');
const FormSubmission = require('../models/FormSubmission');
const Event = require('../models/Event');
const EventSubscriber = require('../models/EventSubscriber');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Admin auth middleware (same pattern as other admin routes)
const adminAuth = async (req, res, next) => {
  if (process.env.DISABLE_ADMIN_AUTH === 'true' || process.env.NODE_ENV === 'development') {
    return next();
  }
  try {
    await authenticate(req, res, () => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    });
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// ==================== ADMIN ROUTES ====================

// Get all forms (admin)
router.get('/admin/forms', adminAuth, async (req, res) => {
  try {
    const { eventId } = req.query;
    const query = {};
    if (eventId) query.eventId = eventId;

    const forms = await EventForm.find(query)
      .populate('eventId', 'title category date')
      .sort({ createdAt: -1 });

    // Get submission counts for each form
    const formsWithCounts = await Promise.all(forms.map(async (form) => {
      const submissionCount = await FormSubmission.countDocuments({ formId: form._id });
      return { ...form.toObject(), submissionCount };
    }));

    res.json({ forms: formsWithCounts });
  } catch (error) {
    console.error('Get forms error:', error);
    res.status(500).json({ error: 'Failed to fetch forms' });
  }
});

// Get single form (admin)
router.get('/admin/forms/:id', adminAuth, async (req, res) => {
  try {
    const form = await EventForm.findById(req.params.id)
      .populate('eventId', 'title category date');
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  } catch (error) {
    console.error('Get form error:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Create form (admin)
router.post('/admin/forms', adminAuth, async (req, res) => {
  try {
    const { eventId, title, description, fields, isActive, maxSubmissions } = req.body;

    if (!title || !fields || !fields.length) {
      return res.status(400).json({ error: 'title and at least one field are required' });
    }

    // If eventId provided, verify event exists and no duplicate
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const existing = await EventForm.findOne({ eventId });
      if (existing) {
        return res.status(400).json({ error: 'A form already exists for this event' });
      }
    }

    const form = await EventForm.create({
      eventId: eventId || null,
      title: String(title).trim(),
      description: String(description || '').trim(),
      fields: fields.map((f, i) => ({
        label: String(f.label).trim(),
        type: f.type,
        placeholder: String(f.placeholder || '').trim(),
        required: Boolean(f.required ?? false),
        options: f.options || [],
        order: i
      })),
      isActive: Boolean(isActive ?? true),
      maxSubmissions: maxSubmissions || null
    });

    res.status(201).json(form);
  } catch (error) {
    console.error('Create form error:', error);
    res.status(500).json({ error: 'Failed to create form' });
  }
});

// Update form (admin)
router.put('/admin/forms/:id', adminAuth, async (req, res) => {
  try {
    const { title, description, fields, isActive, maxSubmissions } = req.body;
    const updates = {};

    if (typeof title !== 'undefined') updates.title = String(title).trim();
    if (typeof description !== 'undefined') updates.description = String(description).trim();
    if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
    if (typeof maxSubmissions !== 'undefined') updates.maxSubmissions = maxSubmissions || null;
    if (fields && fields.length) {
      updates.fields = fields.map((f, i) => ({
        label: String(f.label).trim(),
        type: f.type,
        placeholder: String(f.placeholder || '').trim(),
        required: Boolean(f.required ?? false),
        options: f.options || [],
        order: i
      }));
    }

    const form = await EventForm.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!form) return res.status(404).json({ error: 'Form not found' });
    res.json(form);
  } catch (error) {
    console.error('Update form error:', error);
    res.status(500).json({ error: 'Failed to update form' });
  }
});

// Delete form (admin)
router.delete('/admin/forms/:id', adminAuth, async (req, res) => {
  try {
    const form = await EventForm.findByIdAndDelete(req.params.id);
    if (!form) return res.status(404).json({ error: 'Form not found' });

    // Delete all submissions for this form
    await FormSubmission.deleteMany({ formId: form._id });

    res.json({ message: 'Form and its submissions deleted' });
  } catch (error) {
    console.error('Delete form error:', error);
    res.status(500).json({ error: 'Failed to delete form' });
  }
});

// Get submissions for a form (admin)
router.get('/admin/forms/:id/submissions', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = { formId: req.params.id };
    if (status) query.status = status;

    const total = await FormSubmission.countDocuments(query);
    const submissions = await FormSubmission.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      submissions,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Update submission status (admin)
router.put('/admin/submissions/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const submission = await FormSubmission.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    res.json(submission);
  } catch (error) {
    console.error('Update submission status error:', error);
    res.status(500).json({ error: 'Failed to update submission status' });
  }
});

// Get all submissions grouped by event (admin dashboard overview)
router.get('/admin/submissions', adminAuth, async (req, res) => {
  try {
    const pipeline = [
      {
        $group: {
          _id: '$eventId',
          totalSubmissions: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          latestSubmission: { $max: '$createdAt' }
        }
      }
    ];

    const stats = await FormSubmission.aggregate(pipeline);

    // Populate event details
    const eventIds = stats.map(s => s._id);
    const events = await Event.find({ _id: { $in: eventIds } }, 'title category date');

    const result = stats.map(s => {
      const event = events.find(e => e._id.toString() === s._id.toString());
      return {
        eventId: s._id,
        eventTitle: event?.title || 'Unknown Event',
        eventCategory: event?.category || '',
        eventDate: event?.date?.start || null,
        totalSubmissions: s.totalSubmissions,
        pending: s.pending,
        approved: s.approved,
        rejected: s.rejected,
        latestSubmission: s.latestSubmission
      };
    });

    res.json({ submissionsByEvent: result });
  } catch (error) {
    console.error('Get submissions overview error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions overview' });
  }
});

// ==================== PUBLIC ROUTES ====================

// Get form by form ID directly (public) — for shareable form links
router.get('/:formId', async (req, res) => {
  try {
    const form = await EventForm.findById(req.params.formId)
      .populate('eventId', 'title category date');

    if (!form || !form.isActive) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    // Check max submissions
    if (form.maxSubmissions) {
      const count = await FormSubmission.countDocuments({ formId: form._id });
      if (count >= form.maxSubmissions) {
        return res.json({ form: null, message: 'Form is no longer accepting submissions' });
      }
    }

    res.json({ form });
  } catch (error) {
    console.error('Get form by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Submit form by form ID directly (public)
router.post('/:formId/submit', async (req, res) => {
  try {
    const { responses, guestName, guestEmail } = req.body;

    const form = await EventForm.findById(req.params.formId);
    if (!form || !form.isActive) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    // Check max submissions
    if (form.maxSubmissions) {
      const count = await FormSubmission.countDocuments({ formId: form._id });
      if (count >= form.maxSubmissions) {
        return res.status(400).json({ error: 'Maximum submissions reached' });
      }
    }

    // Validate required fields
    const missingFields = form.fields
      .filter(f => f.required)
      .filter(f => {
        const response = responses?.find(r => r.fieldLabel === f.label);
        return !response || !response.value || !response.value.toString().trim();
      });

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Required fields missing',
        missingFields: missingFields.map(f => f.label)
      });
    }

    const formResponses = form.fields.map(field => {
      const response = responses?.find(r => r.fieldLabel === field.label);
      return {
        fieldLabel: field.label,
        fieldType: field.type,
        value: response?.value || ''
      };
    });

    const submission = await FormSubmission.create({
      formId: form._id,
      eventId: form.eventId || null,
      guestName: String(guestName || '').trim(),
      guestEmail: String(guestEmail || '').trim().toLowerCase(),
      responses: formResponses
    });

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully',
      submissionId: submission._id
    });
  } catch (error) {
    console.error('Submit form by ID error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// Get form for a specific event (public)
router.get('/event/:eventId', async (req, res) => {
  try {
    const form = await EventForm.findOne({
      eventId: req.params.eventId,
      isActive: true
    });

    if (!form) {
      return res.json({ form: null });
    }

    // Check max submissions
    if (form.maxSubmissions) {
      const count = await FormSubmission.countDocuments({ formId: form._id });
      if (count >= form.maxSubmissions) {
        return res.json({ form: null, message: 'Form is no longer accepting submissions' });
      }
    }

    res.json({ form });
  } catch (error) {
    console.error('Get event form error:', error);
    res.status(500).json({ error: 'Failed to fetch form' });
  }
});

// Submit form (public)
router.post('/event/:eventId/submit', async (req, res) => {
  try {
    const { responses, guestName, guestEmail } = req.body;

    const form = await EventForm.findOne({
      eventId: req.params.eventId,
      isActive: true
    });

    if (!form) {
      return res.status(404).json({ error: 'Form not found or inactive' });
    }

    // Check max submissions
    if (form.maxSubmissions) {
      const count = await FormSubmission.countDocuments({ formId: form._id });
      if (count >= form.maxSubmissions) {
        return res.status(400).json({ error: 'Maximum submissions reached' });
      }
    }

    // Validate required fields
    const missingFields = form.fields
      .filter(f => f.required)
      .filter(f => {
        const response = responses.find(r => r.fieldLabel === f.label);
        return !response || !response.value || !response.value.trim();
      });

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Required fields missing',
        missingFields: missingFields.map(f => f.label)
      });
    }

    // Build responses array
    const formResponses = form.fields.map(field => {
      const response = responses.find(r => r.fieldLabel === field.label);
      return {
        fieldLabel: field.label,
        fieldType: field.type,
        value: response?.value || ''
      };
    });

    const submission = await FormSubmission.create({
      formId: form._id,
      eventId: req.params.eventId,
      userId: req.user?._id || null,
      guestName: String(guestName || '').trim(),
      guestEmail: String(guestEmail || '').trim().toLowerCase(),
      responses: formResponses
    });

    res.status(201).json({
      success: true,
      message: 'Form submitted successfully',
      submissionId: submission._id
    });
  } catch (error) {
    console.error('Submit form error:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

// ==================== EVENT SUBSCRIBER ROUTES ====================

// Subscribe to event notifications (public)
router.post('/subscribers', async (req, res) => {
  try {
    const { email, name, city, interests } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email' });
    }

    // Check if already subscribed
    const existing = await EventSubscriber.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'This email is already subscribed' });
    }

    const subscriber = await EventSubscriber.create({
      email: String(email).trim().toLowerCase(),
      name: String(name || '').trim(),
      city: String(city || '').trim(),
      interests: interests || [],
      source: 'events_page',
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Subscribed successfully!',
      subscriber: {
        id: subscriber._id,
        email: subscriber.email,
        name: subscriber.name
      }
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'This email is already subscribed' });
    }
    res.status(500).json({ error: 'Failed to subscribe. Please try again.' });
  }
});

// Get all subscribers (admin)
router.get('/admin/subscribers', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, isActive, search } = req.query;
    const query = {};

    if (typeof isActive !== 'undefined') {
      query.isActive = isActive === 'true';
    }

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await EventSubscriber.countDocuments(query);
    const subscribers = await EventSubscriber.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Get stats
    const stats = {
      total: await EventSubscriber.countDocuments(),
      active: await EventSubscriber.countDocuments({ isActive: true }),
      inactive: await EventSubscriber.countDocuments({ isActive: false }),
      thisMonth: await EventSubscriber.countDocuments({
        createdAt: { $gte: new Date(new Date().setDate(1)) }
      })
    };

    res.json({
      subscribers,
      stats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get subscribers error:', error);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// Update subscriber status (admin)
router.put('/admin/subscribers/:id', adminAuth, async (req, res) => {
  try {
    const { isActive, name, city, interests } = req.body;
    const updates = {};

    if (typeof isActive !== 'undefined') updates.isActive = Boolean(isActive);
    if (typeof name !== 'undefined') updates.name = String(name).trim();
    if (typeof city !== 'undefined') updates.city = String(city).trim();
    if (interests) updates.interests = interests;

    const subscriber = await EventSubscriber.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!subscriber) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(subscriber);
  } catch (error) {
    console.error('Update subscriber error:', error);
    res.status(500).json({ error: 'Failed to update subscriber' });
  }
});

// Delete subscriber (admin)
router.delete('/admin/subscribers/:id', adminAuth, async (req, res) => {
  try {
    const subscriber = await EventSubscriber.findByIdAndDelete(req.params.id);
    if (!subscriber) return res.status(404).json({ error: 'Subscriber not found' });
    res.json({ message: 'Subscriber deleted' });
  } catch (error) {
    console.error('Delete subscriber error:', error);
    res.status(500).json({ error: 'Failed to delete subscriber' });
  }
});

module.exports = router;
