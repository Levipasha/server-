const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  badge: {
    type: String,
    default: 'Version 7.8'
  },
  message: {
    type: String,
    required: true,
    default: 'New feature is ready to use, let\'s try'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  link: {
    type: String,
    default: null
  },
  backgroundColor: {
    type: String,
    default: 'gray'
  },
  textColor: {
    type: String,
    default: 'gray-800'
  },
  badgeColor: {
    type: String,
    default: 'white'
  },
  badgeTextColor: {
    type: String,
    default: 'gray-800'
  },
  heroImage: {
    type: String,
    default: '',
    trim: true
  },
  heroLogo: {
    type: String,
    default: '',
    trim: true
  },
  titleText: {
    type: String,
    default: 'Discover Amazing Artists',
    trim: true
  },
  titleType: {
    type: String,
    enum: ['text', 'image'],
    default: 'text'
  },
  subtitleText: {
    type: String,
    default: 'Search by artist name, art form, or location to find talented creators across India',
    trim: true
  },
  titleAccentColor: {
    type: String,
    default: '#D71920',
    trim: true
  },
  subtitleColor: {
    type: String,
    default: '#6B7280',
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
announcementSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get active announcement
announcementSchema.statics.getActive = async function() {
  return this.findOne({ isActive: true }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Announcement', announcementSchema);
