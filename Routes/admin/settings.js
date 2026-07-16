const express = require('express');
const router = express.Router();
const { authAndRole } = require('../../middlewares/auth.js');
const Settings = require('../../models/Settings.js');
const User = require('../../models/User.js');

/**
 * @route GET /api/settings/footer
 * @desc Get footer settings
 * @access Public
 */
router.get('/footer', async (req, res) => {
  try {
    let settings = await Settings.findOne({ type: 'footer' });
    
    if (!settings) {
      // Create default footer settings
      const currentYear = new Date().getFullYear();
      settings = new Settings({
        type: 'footer',
        data: {
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
            phone: '+1 (234) 567-890',
            address: '123 Charity Street, Giving City, GC 12345',
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
      });
      await settings.save();
    }

    res.status(200).json({
      success: true,
      data: settings.data,
    });
  } catch (error) {
    // Check for duplicate key error during creation race condition
    if (error.code === 11000) {
      const settings = await Settings.findOne({ type: 'footer' });
      return res.status(200).json({
        success: true,
        data: settings.data,
      });
    }
    //console.error('Get footer settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch footer settings',
      error: error.message,
    });
  }
});


/**
 * @route GET /api/settings/:type
 * @desc Get settings by type
 * @access Public
 */
router.get('/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { create = 'true' } = req.query;

    // Validate type
    const validTypes = [
      'footer', 'contact', 'general', 'social', 'pages',
      'seo', 'payment', 'email', 'security', 'features',
      'branding', 'notifications'
    ];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid settings type',
      });
    }

    const settings = await Settings.getSettings(type, create === 'true');
    
    res.status(200).json({
      success: true,
      data: settings.data,
      version: settings.version,
      updatedAt: settings.updatedAt,
    });
  } catch (error) {
    //console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/settings/:type
 * @desc Update settings by type
 * @access Private (Admin only)
 */
router.put('/:type', authAndRole('admin'), async (req, res) => {
  try {
    const { type } = req.params;

    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const settings = await Settings.findOne({ type });
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Settings not found',
      });
    }

    await settings.updateData(req.body, req.userId);

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      data: settings.data,
      version: settings.version,
    });
  } catch (error) {
    //console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/settings/:type/:key
 * @desc Update specific setting value
 * @access Private (Admin only)
 */
router.put('/:type/:key', authAndRole('admin'), async (req, res) => {
  try {
    const { type, key } = req.params;
    const { value } = req.body;

    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const settings = await Settings.findOne({ type });
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Settings not found',
      });
    }

    await settings.set(key, value, req.userId);

    res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: settings.data,
    });
  } catch (error) {
    //console.error('Update setting error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update setting',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/settings/:type/reset
 * @desc Reset settings to default
 * @access Private (Admin only)
 */
router.post('/:type/reset', authAndRole('admin'), async (req, res) => {
  try {
    const { type } = req.params;

    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const defaultData = Settings.getDefaultData(type);
    
    let settings = await Settings.findOne({ type });
    if (!settings) {
      settings = new Settings({ type });
    }

    settings.data = defaultData;
    settings.updatedBy = req.userId;
    settings.updatedAt = new Date();
    settings.version = 1;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Settings reset to default successfully',
      data: settings.data,
    });
  } catch (error) {
    //console.error('Reset settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset settings',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/settings/footer
 * @desc Update footer settings (Admin only)
 * @access Private (Admin only)
 */
router.put('/footer', authAndRole('admin'), async (req, res) => {
  try {
    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { brandName, tagline, quickLinks, supportLinks, contactInfo, socialLinks, copyright, madeWithLove } = req.body;

    let settings = await Settings.findOne({ type: 'footer' });
    
    if (!settings) {
      settings = new Settings({ type: 'footer' });
    }

    // Update only provided fields
    if (brandName) settings.data.brandName = brandName;
    if (tagline) settings.data.tagline = tagline;
    if (quickLinks) settings.data.quickLinks = quickLinks;
    if (supportLinks) settings.data.supportLinks = supportLinks;
    if (contactInfo) settings.data.contactInfo = contactInfo;
    if (socialLinks) settings.data.socialLinks = socialLinks;
    if (copyright) settings.data.copyright = copyright;
    if (madeWithLove) settings.data.madeWithLove = madeWithLove;

    settings.updatedBy = req.userId;
    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Footer settings updated successfully',
      data: settings.data,
    });
  } catch (error) {
    //console.error('Update footer settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update footer settings',
      error: error.message,
    });
  }
});

module.exports = router;