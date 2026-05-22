const mongoose = require('mongoose');

const ApprovalRequestSchema = new mongoose.Schema({
  requesterEmail: {
    type: String,
    required: true
  },
  requestedChanges: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    enum: ['profile_update', 'tutor_registration'],
    default: 'profile_update'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ApprovalRequest', ApprovalRequestSchema);
