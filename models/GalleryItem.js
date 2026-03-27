const mongoose = require('mongoose');

const galleryItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  galleryType: {
    type: String,
    enum: ['gallery', '3d-gallery'],
    default: 'gallery',
    index: true
  },
  image: {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: null },
    alt: { type: String, default: '' }
  },
  bio: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

galleryItemSchema.index({ name: 'text' });
galleryItemSchema.index({ createdAt: -1 });
galleryItemSchema.index({ isActive: 1 });

module.exports = mongoose.model('GalleryItem', galleryItemSchema);

