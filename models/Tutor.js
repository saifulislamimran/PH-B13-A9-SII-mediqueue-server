const mongoose = require('mongoose');

const TutorSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    default: 0
  },
  totalSlot: {
    type: Number,
    required: true,
    default: 0
  },
  subjects: {
    type: [String],
    default: []
  },
  specialties: {
    type: [String],
    default: []
  },
  image: {
    type: String,
    default: ''
  },
  details: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'removed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Tutor', TutorSchema);
