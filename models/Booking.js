const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
  studentEmail: {
    type: String,
    required: true
  },
  tutorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tutor',
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  sessionDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['booked', 'cancelled'],
    default: 'booked'
  },
  bookedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', BookingSchema);
