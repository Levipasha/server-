const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
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
    enum: ['painting', 'sculpture', 'digital-art', 'photography', 'print', 'supplies', 'other']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD', 'EUR']
  },
  images: [{
    url: String,
    publicId: String,
    alt: String
  }],
  artist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  artistProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ArtistProfile',
    default: null
  },
  status: {
    type: String,
    enum: ['available', 'sold', 'reserved', 'draft'],
    default: 'available'
  },
  condition: {
    type: String,
    enum: ['new', 'like-new', 'good', 'fair'],
    default: 'new'
  },
  dimensions: {
    width: Number,
    height: Number,
    depth: Number,
    unit: {
      type: String,
      enum: ['cm', 'inches'],
      default: 'cm'
    }
  },
  weight: {
    value: Number,
    unit: {
      type: String,
      enum: ['kg', 'g', 'lbs', 'oz'],
      default: 'kg'
    }
  },
  materials: [String],
  techniques: [String],
  year: Number,
  tags: [String],
  views: {
    type: Number,
    default: 0
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
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
  shipping: {
    available: { type: Boolean, default: true },
    cost: { type: Number, default: 0 },
    methods: [{
      type: String,
      enum: ['standard', 'express', 'pickup']
    }],
    locations: [String]
  },
  inventory: {
    quantity: {
      type: Number,
      default: 1
    },
    trackQuantity: {
      type: Boolean,
      default: true
    }
  },
  featured: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ artist: 1 });
productSchema.index({ artistProfile: 1 });
productSchema.index({ price: 1 });
productSchema.index({ status: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
