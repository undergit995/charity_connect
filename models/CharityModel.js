const { default: mongoose } = require("mongoose");

// Charity Details Schema
const CharityDetailsSchema = new mongoose.Schema({
  organizationName: {
    type: String,
    trim: true,
  },
  organizationType: {
    type: String,
    enum: ['Non-Profit', 'NGO', 'Trust', 'Foundation', 'Society', 'Other'],
    default: 'Non-Profit',
  },
  registrationNumber: {
    type: String,
    trim: true,
  },
  registrationDate: {
    type: Date,
  },
  registrationAuthority: {
    type: String,
    trim: true,
  },
  taxExemptionCertificate: {
    type: String,
  },
  panNumber: {
    type: String,
    trim: true,
  },
  tanNumber: {
    type: String,
    trim: true,
  },
  gstNumber: {
    type: String,
    trim: true,
  },
  website: {
    type: String,
    trim: true,
  },
  socialMedia: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String,
  },
  missionStatement: {
    type: String,
    trim: true,
  },
  visionStatement: {
    type: String,
    trim: true,
  },
  foundingYear: {
    type: Number,
  },
  teamSize: {
    type: Number,
  },
  verified: {
    type: Boolean,
    default: false,
  },
  verificationDate: {
    type: Date,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifscCode: String,
    bankName: String,
    branchName: String,
    accountType: {
      type: String,
      enum: ['Savings', 'Current', 'Other'],
      default: 'Current',
    },
  },
});

const CharityDetailsModel = mongoose.model("charitydetail",CharityDetailsSchema)

module.exports = CharityDetailsModel