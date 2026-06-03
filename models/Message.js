const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Sender — always a logged-in User (Firebase/JWT user)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'senderModel',
    required: true
  },
  senderModel: {
    type: String,
    enum: ['User', 'ArtistProfile'],
    default: 'User'
  },

  // Recipient — can be a User OR an ArtistProfile (different collection)
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'recipientModel',
    required: true
  },
  recipientModel: {
    type: String,
    enum: ['User', 'ArtistProfile'],
    default: 'ArtistProfile'
  },

  text: {
    type: String,
    required: true,
    trim: true
  },
  senderType: {
    type: String,
    enum: ['user', 'artist', 'admin'],
    default: 'user'
  },
  recipientType: {
    type: String,
    enum: ['user', 'artist', 'admin'],
    default: 'artist'
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
messageSchema.index({ sender: 1, recipient: 1 });
messageSchema.index({ recipient: 1 });

module.exports = mongoose.model('Message', messageSchema);
