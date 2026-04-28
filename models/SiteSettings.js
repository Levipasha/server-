const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: 'ArtArtist', trim: true },
    siteDescription: { type: String, default: 'A vibrant community for artists to showcase, connect, and grow', trim: true },
    maintenanceMode: { type: Boolean, default: false },
    allowRegistrations: { type: Boolean, default: true },
    maxUploadSize: { type: String, default: '10MB' },
    supportedImageFormats: { type: [String], default: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'Asia/Kolkata' }
  },
  { timestamps: true }
);

// Singleton pattern — always use the first (and only) document
siteSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
