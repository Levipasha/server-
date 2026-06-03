const mongoose = require('mongoose');

const artDistrictRegistrationSchema = new mongoose.Schema({
  fullName:      { type: String, required: true, trim: true },
  email:         { type: String, required: true, trim: true, lowercase: true },
  insta:         { type: String, default: '', trim: true },
  category:      { type: String, default: '', trim: true },
  passType:      { type: String, required: true, trim: true },
  price:         { type: String, default: '', trim: true },
  initials:      { type: String, default: '', trim: true },
  memberId:      { type: String, required: true, unique: true, trim: true },
  validFrom:     { type: String, default: '', trim: true },
  validThru:     { type: String, default: '', trim: true },
  qrCodeUrl:     { type: String, default: '', trim: true },
  paymentMethod: { type: String, default: 'UPI', trim: true },
  // 'manual' = issued by admin desk, 'online' = user self-registered
  source:        { type: String, enum: ['manual', 'online'], default: 'online' }
}, { timestamps: true });

module.exports = mongoose.model('ArtDistrictRegistration', artDistrictRegistrationSchema);
