const mongoose = require('mongoose');

const eventFormSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    fields: [{
      label: { type: String, required: true, trim: true },
      type: {
        type: String,
        enum: ['text', 'email', 'phone', 'number', 'textarea', 'select', 'checkbox', 'date'],
        required: true
      },
      placeholder: { type: String, default: '' },
      required: { type: Boolean, default: false },
      options: [String], // for select type
      order: { type: Number, default: 0 }
    }],
    isActive: {
      type: Boolean,
      default: true
    },
    maxSubmissions: {
      type: Number,
      default: null // null = unlimited
    }
  },
  { timestamps: true }
);

eventFormSchema.index({ eventId: 1, isActive: 1 });

module.exports = mongoose.model('EventForm', eventFormSchema);
