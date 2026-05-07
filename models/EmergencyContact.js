const mongoose = require('mongoose');

// EmergencyContact model
// Stores per-user emergency contacts (name, phone, relationship)
const emergencyContactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      // Accept common phone formats: digits, spaces, +, -, (), optional
      match: [
        /^\+?[0-9\s().-]{7,20}$/, // lightweight regex (E.164-like)
        'Please enter a valid phone number',
      ],
      index: true,
    },
    relationship: {
      type: String,
      required: [true, 'Relationship is required'],
      trim: true,
      minlength: [2, 'Relationship must be at least 2 characters'],
      maxlength: [60, 'Relationship cannot exceed 60 characters'],
    },
  },
  {
    timestamps: true,
  }
);

// Ensure one user doesn't store exact duplicate contacts (best-effort)
emergencyContactSchema.index({ user: 1, phoneNumber: 1 });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);

