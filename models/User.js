const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  displayName: {
    type: String,
    required: true
  },
  photoURL: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'artist', 'admin'],
    default: 'user'
  },
  profile: {
    firstName: String,
    lastName: String,
    bio: String,
    location: String,
    website: String,
    socialLinks: {
      instagram: String,
      facebook: String,
      twitter: String,
      linkedin: String
    },
    artistInfo: {
      specialization: [String],
      experience: String,
      education: String,
      achievements: [String]
    }
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    privacy: {
      showEmail: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: true }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for faster queries
userSchema.index({ firebaseUid: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
