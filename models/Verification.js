const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
  documentId: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String },
  required: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'verified', 'rejected', 'needs-info'],
    default: 'pending',
  },
  fileUrl: { type: String },
  uploadedAt: { type: Date },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminNotes: { type: String },
});

const VerificationSchema = new mongoose.Schema(
  {
    charityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    documents: [DocumentSchema],
    status: {
      type: String,
      enum: ['pending', 'submitted', 'verified', 'rejected', 'needs-info'],
      default: 'pending',
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    feedback: { type: String },
  },
  { timestamps: true }
);


VerificationSchema.index({ charityId: 1 });
VerificationSchema.index({ status: 1 });

module.exports = mongoose.model('Verification', VerificationSchema);