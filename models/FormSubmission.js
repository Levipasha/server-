const mongoose = require('mongoose');

const formSubmissionSchema = new mongoose.Schema(
  {
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EventForm',
      required: true,
      index: true
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    guestEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    guestName: {
      type: String,
      trim: true,
      default: ''
    },
    responses: [{
      fieldLabel: { type: String, required: true },
      fieldType: { type: String, required: true },
      value: { type: String, default: '' }
    }],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    }
  },
  { timestamps: true }
);

formSubmissionSchema.index({ formId: 1, createdAt: -1 });
formSubmissionSchema.index({ eventId: 1, createdAt: -1 });

module.exports = mongoose.model('FormSubmission', formSubmissionSchema);
