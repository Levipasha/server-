const mongoose = require('mongoose');

const eventSubscriberSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      trim: true,
      default: ''
    },
    interests: [String], // e.g., ['exhibition', 'workshop', 'networking']
    isActive: {
      type: Boolean,
      default: true
    },
    source: {
      type: String,
      default: 'events_page'
    },
    unsubscribeToken: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

// Unique index on email to prevent duplicates
eventSubscriberSchema.index({ email: 1 }, { unique: true });
eventSubscriberSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('EventSubscriber', eventSubscriberSchema);
