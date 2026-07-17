// models/Settings.js
const mongoose = require('mongoose');

/**
 * Settings Schema
 * Stores all dynamic settings for the platform
 * Type: 'footer', 'contact', 'general', 'social', 'pages', 'seo', 'payment'
 */
const SettingsSchema = new mongoose.Schema(
  {
    // Setting type to distinguish different setting groups
    type: {
      type: String,
      enum: [
        'footer',
        'contact',
        'general',
        'social',
        'pages',
        'seo',
        'payment',
        'email',
        'security',
        'features',
        'branding',
        'notifications',
      ],
      required: true,
      unique: true,
    },

    // Setting data (flexible structure for different setting types)
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Metadata
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
SettingsSchema.index({ isActive: 1 });
SettingsSchema.index({ updatedAt: -1 });

// ==================== PRE-SAVE MIDDLEWARE ====================

SettingsSchema.pre('save', function() {
  this.updatedAt = new Date();
  if (this.isModified('data')) {
    this.version = this.version + 1;
  }
});

// ==================== STATIC METHODS ====================

/**
 * Get settings by type
 * @param {string} type - Setting type
 * @param {boolean} createIfMissing - Create default if not found
 * @returns {Object} - Settings data
 */
SettingsSchema.statics.getSettings = async function(type, createIfMissing = true) {
  let settings = await this.findOne({ type });

  if (!settings && createIfMissing) {
    // Create default settings based on type
    const defaultData = this.getDefaultData(type);
    settings = new this({
      type,
      data: defaultData,
    });
    await settings.save();
  }

  return settings;
};

/**
 * Get default data for a setting type
 * @param {string} type - Setting type
 * @returns {Object} - Default data
 */
SettingsSchema.statics.getDefaultData = function(type) {
  const currentYear = new Date().getFullYear();
  const defaults = {
    footer: {
      brandName: 'CharityConnect',
      tagline: 'Connecting donors with verified charities to make a difference in communities around the world.',
      quickLinks: [
        { label: 'About Us', path: '/about' },
        { label: 'Campaigns', path: '/campaigns' },
        { label: 'How It Works', path: '/how-it-works' },
        { label: 'Contact', path: '/contact' },
      ],
      supportLinks: [
        { label: 'Help Center', path: '/help' },
        { label: 'FAQ', path: '/faq' },
        { label: 'Privacy Policy', path: '/privacy' },
        { label: 'Terms of Service', path: '/terms' },
      ],
      contactInfo: {
        email: 'support@charityconnect.com',
        phone: '+91 7345677890',
        address: 'Metro JNTU Street,Hyderabad,Telangana',
        workingHours: 'Mon-Fri: 9:00 AM - 6:00 PM',
      },
      socialLinks: [
        { platform: 'facebook', url: 'https://facebook.com/charityconnect' },
        { platform: 'twitter', url: 'https://twitter.com/charityconnect' },
        { platform: 'instagram', url: 'https://instagram.com/charityconnect' },
        { platform: 'linkedin', url: 'https://linkedin.com/company/charityconnect' },
        { platform: 'youtube', url: 'https://youtube.com/charityconnect' },
      ],
      copyright: `© ${currentYear} CharityConnect. All rights reserved.`,
      madeWithLove: 'Made with ❤️ for a better world',
    },

    contact: {
      email: 'support@charityconnect.com',
      phone: '+91 9234-567-890',
      address: '123 JNTU, GC 12345',
      workingHours: 'Mon-Fri: 9:00 AM - 6:00 PM',
      mapEmbedUrl: 'https://www.google.com/maps/embed?pb=...',
      contactFormEnabled: true,
      autoReplyEnabled: true,
      autoReplyMessage: 'Thank you for contacting us. We will get back to you within 24-48 hours.',
    },

    general: {
      siteName: 'CharityConnect',
      siteDescription: 'A platform connecting donors with verified charities',
      siteUrl: 'https://charityconnect.com',
      adminEmail: 'admin@charityconnect.com',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      currency: 'USD',
      language: 'en',
      maintenanceMode: false,
      maintenanceMessage: 'We are currently under maintenance. Please check back later.',
    },

    social: {
      facebook: 'https://facebook.com/charityconnect',
      twitter: 'https://twitter.com/charityconnect',
      instagram: 'https://instagram.com/charityconnect',
      linkedin: 'https://linkedin.com/company/charityconnect',
      youtube: 'https://youtube.com/charityconnect',
      github: 'https://github.com/charityconnect',
    },

    pages: {
      about: {
        title: 'About Us',
        content: 'CharityConnect is a platform dedicated to connecting donors with verified charities...',
        metaTitle: 'About Us - CharityConnect',
        metaDescription: 'Learn about CharityConnect and our mission to connect donors with verified charities.',
      },
      privacy: {
        title: 'Privacy Policy',
        content: 'Your privacy is important to us...',
        metaTitle: 'Privacy Policy - CharityConnect',
        metaDescription: 'Read our privacy policy to understand how we protect your data.',
      },
      terms: {
        title: 'Terms of Service',
        content: 'Terms and conditions for using CharityConnect...',
        metaTitle: 'Terms of Service - CharityConnect',
        metaDescription: 'Read our terms of service for using CharityConnect.',
      },
    },

    seo: {
      metaTitle: 'CharityConnect - Donate to Verified Charities',
      metaDescription: 'Connect with verified charities and make a difference in communities around the world.',
      metaKeywords: 'charity, donate, fundraising, nonprofit, social impact',
      ogImage: '/images/og-image.jpg',
      twitterCard: 'summary_large_image',
      twitterSite: '@charityconnect',
      robots: 'index, follow',
    },

    payment: {
      razorpay: {
        keyId: '',
        keySecret: '',
        webhookSecret: '',
        enabled: true,
      },
      stripe: {
        publishableKey: '',
        secretKey: '',
        webhookSecret: '',
        enabled: false,
      },
      paypal: {
        clientId: '',
        clientSecret: '',
        enabled: false,
      },
      currency: 'USD',
      minimumDonation: 1,
      maximumDonation: 100000,
    },

    email: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPass: '',
      fromEmail: 'noreply@charityconnect.com',
      fromName: 'CharityConnect',
      adminEmails: ['admin@charityconnect.com'],
      templates: {
        welcome: {
          subject: 'Welcome to CharityConnect! 🎉',
          body: 'Thank you for joining CharityConnect...',
        },
        donationReceipt: {
          subject: 'Donation Receipt - CharityConnect',
          body: 'Thank you for your generous donation...',
        },
        campaignApproved: {
          subject: 'Campaign Approved! 🎉',
          body: 'Your campaign has been approved...',
        },
      },
    },

    security: {
      jwtExpiry: '24h',
      refreshTokenExpiry: '7d',
      sessionTimeout: 3600,
      maxLoginAttempts: 5,
      lockoutDuration: 15,
      passwordMinLength: 8,
      passwordRequireUppercase: true,
      passwordRequireLowercase: true,
      passwordRequireNumbers: true,
      passwordRequireSpecialChars: true,
      twoFactorAuth: false,
    },

    features: {
      allowGuestDonations: true,
      allowAnonymousDonations: true,
      allowRecurringDonations: true,
      allowCorporateDonations: true,
      requireCharityVerification: true,
      requireCharityApproval: true,
      campaignModeration: true,
      commentsEnabled: true,
      ratingsEnabled: true,
      sharingEnabled: true,
      reportsEnabled: true,
    },

    branding: {
      primaryColor: '#667eea',
      secondaryColor: '#764ba2',
      accentColor: '#2ecc71',
      logo: '/images/logo.png',
      logoDark: '/images/logo-dark.png',
      favicon: '/favicon.ico',
      fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
    },

    notifications: {
      email: {
        donations: true,
        campaigns: true,
        updates: true,
        marketing: false,
        systemAlerts: true,
      },
      push: {
        donations: true,
        campaigns: true,
        updates: true,
        marketing: false,
        systemAlerts: true,
      },
      sms: {
        donations: false,
        campaigns: false,
        updates: false,
        systemAlerts: true,
      },
    },
  };

  return defaults[type] || {};
};

// ==================== INSTANCE METHODS ====================

/**
 * Update settings data
 * @param {Object} newData - New data to merge with existing
 * @param {string} userId - User ID who is updating
 * @returns {Object} - Updated settings
 */
SettingsSchema.methods.updateData = async function(newData, userId) {
  // Deep merge with existing data
  this.data = this.deepMerge(this.data, newData);
  this.updatedBy = userId;
  this.updatedAt = new Date();
  this.version = this.version + 1;
  await this.save();
  return this;
};

/**
 * Deep merge utility
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} - Merged object
 */
SettingsSchema.methods.deepMerge = function(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = this.deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
};

/**
 * Get a specific setting value
 * @param {string} key - Dot notation key (e.g., 'contact.email')
 * @returns {*} - Setting value
 */
SettingsSchema.methods.getSettings = function (key) {
  const keys = key.split(".");
  let value = this.data;

  for (const k of keys) {
    if (value && typeof value === "object") {
      value = value[k];
    } else {
      return undefined;
    }
  }

  return value;
};                             

/**
 * Set a specific setting value
 * @param {string} key - Dot notation key (e.g., 'contact.email')
 * @param {*} value - Value to set
 * @param {string} userId - User ID who is updating
 */
SettingsSchema.methods.set = async function(key, value, userId) {
  const keys = key.split('.');
  let current = this.data;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
  this.updatedBy = userId;
  this.updatedAt = new Date();
  this.version = this.version + 1;
  await this.save();
  return this;
};

// ==================== TOJSON TRANSFORM ====================

SettingsSchema.set('toJSON', {
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  },
});

// ==================== EXPORT ====================

module.exports = mongoose.model('Settings', SettingsSchema);