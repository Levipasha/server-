const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['exhibition', 'workshop', 'networking', 'auction', 'festival', 'webinar', 'meetup']
  },
  images: [{
    url: String,
    publicId: String,
    alt: String
  }],
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    start: {
      type: Date,
      required: true
    },
    end: {
      type: Date,
      required: true
    }
  },
  location: {
    type: {
      type: String,
      enum: ['physical', 'virtual', 'hybrid'],
      required: true
    },
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    virtualLink: String,
    platform: String
  },
  pricing: {
    type: {
      type: String,
      enum: ['free', 'paid', 'donation'],
      required: true
    },
    amount: Number,
    currency: {
      type: String,
      default: 'INR',
      enum: ['INR', 'USD', 'EUR']
    }
  },
  capacity: {
    max: Number,
    current: {
      type: Number,
      default: 0
    },
    waitlist: {
      type: Number,
      default: 0
    }
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['registered', 'attended', 'cancelled'],
      default: 'registered'
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'refunded'],
      default: 'paid'
    }
  }],
  tags: [String],
  requirements: [String],
  agenda: [{
    time: String,
    title: String,
    description: String,
    speaker: String
  }],
  speakers: [{
    name: String,
    bio: String,
    photo: String,
    social: {
      twitter: String,
      linkedin: String,
      website: String
    }
  }],
  sponsors: [{
    name: String,
    logo: String,
    website: String,
    tier: {
      type: String,
      enum: ['platinum', 'gold', 'silver', 'bronze']
    }
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'draft'
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String
  }
}, {
  timestamps: true
});

// Indexes
eventSchema.index({ title: 'text', description: 'text', tags: 'text' });
eventSchema.index({ category: 1 });
eventSchema.index({ organizer: 1 });
eventSchema.index({ 'date.start': 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ featured: 1 });
eventSchema.index({ 'location.city': 1 });

module.exports = mongoose.model('Event', eventSchema);
