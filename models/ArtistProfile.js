const mongoose = require('mongoose');

const artistProfileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    artistNumber: { type: String, default: '' },
    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: '' },
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

artistProfileSchema.pre('save', function (next) {
  if (!this.username || this.username.trim() === '') {
    this.unset('username');
  }
  if (!this.email || this.email.trim() === '') {
    this.unset('email');
  }
  next();
});

artistProfileSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update) {
    if (update.$set) {
      if (update.$set.username === '') {
        delete update.$set.username;
        update.$unset = update.$unset || {};
        update.$unset.username = 1;
      }
      if (update.$set.email === '') {
        delete update.$set.email;
        update.$unset = update.$unset || {};
        update.$unset.email = 1;
      }
    } else {
      if (update.username === '') {
        delete update.username;
        update.$unset = update.$unset || {};
        update.$unset.username = 1;
      }
      if (update.email === '') {
        delete update.email;
        update.$unset = update.$unset || {};
        update.$unset.email = 1;
      }
    }
  }
  next();
});

artistProfileSchema.index({ name: 'text', artForm: 'text', bio: 'text' });
artistProfileSchema.index({ isActive: 1, createdAt: -1 });
artistProfileSchema.index(
  { username: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { username: { $type: 'string', $gt: '' } }
  }
);
artistProfileSchema.index(
  { email: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { email: { $type: 'string', $gt: '' } }
  }
);

module.exports = mongoose.model('ArtistProfile', artistProfileSchema);

