const mongoose = require('mongoose');

const artistProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: {
      url: { type: String, required: true, trim: true },
      publicId: { type: String, default: null },
      alt: { type: String, default: '' }
    },
    artForm: { type: String, required: true, trim: true },
    teamRole: { type: String, default: '', trim: true },
    isTeamMember: { type: Boolean, default: false, index: true },
    displayOrder: { type: Number, default: 0, index: true },
    location: {
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' }
    },
    social: {
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      twitter: { type: String, default: '' },
      linkedin: { type: String, default: '' },
      website: { type: String, default: '' }
    },
    bio: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

artistProfileSchema.index({ name: 'text', artForm: 'text', bio: 'text' });
artistProfileSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('ArtistProfile', artistProfileSchema);

