// routes/contactRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const Contact = require('../models/Contact');
const Settings = require('../models/Settings');
const { sendEmail } = require('../utils/emailService');
const { rateLimit } = require('express-rate-limit');

// Rate limiting for contact form
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Too many contact requests. Please try again later.',
  },
});

/**
 * @route POST /api/contact
 * @desc Send contact message
 * @access Public
 */
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, subject, message, phone } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, subject, and message are required',
      });
    }

    // Validate email format
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }

    // Validate message length
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters',
      });
    }

    // Get admin email from settings
    const settings = await Settings.getSettings('general');
    const adminEmails = settings.data?.adminEmail 
      ? [settings.data.adminEmail] 
      : ['admin@charityconnect.com'];

    // Get contact settings
    const contactSettings = await Settings.getSettings('contact');
    const autoReplyEnabled = contactSettings.data?.autoReplyEnabled !== false;
    const autoReplyMessage = contactSettings.data?.autoReplyMessage || 
      'Thank you for contacting us. We will get back to you within 24-48 hours.';

    // Save to database
    const contact = new Contact({
      name,
      email,
      subject,
      message,
      phone: phone || '',
      status: 'pending',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    await contact.save();

    // Send email to admin(s)
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
          .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
          .content { padding: 30px; }
          .info-box { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .label { color: #6c757d; font-size: 12px; font-weight: 600; text-transform: uppercase; }
          .value { color: #1a1a2e; font-size: 14px; margin-top: 2px; }
          .message-box { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          .button { display: inline-block; padding: 10px 25px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📧 New Contact Message</h1>
          </div>
          <div class="content">
            <p><strong>You have received a new message from the contact form.</strong></p>
            
            <div class="info-box">
              <div class="label">From</div>
              <div class="value">${name} (${email})</div>
            </div>

            ${phone ? `
              <div class="info-box">
                <div class="label">Phone</div>
                <div class="value">${phone}</div>
              </div>
            ` : ''}

            <div class="info-box">
              <div class="label">Subject</div>
              <div class="value">${subject}</div>
            </div>

            <div class="info-box">
              <div class="label">Date</div>
              <div class="value">${new Date().toLocaleString()}</div>
            </div>

            <div class="message-box">
              <div class="label">Message</div>
              <div class="value" style="white-space: pre-wrap; margin-top: 8px;">${message}</div>
            </div>

            <p style="text-align: center; margin-top: 20px;">
              <a href="${process.env.FRONTEND_URL}/admin/contacts/${contact._id}" class="button">View in Admin</a>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // Send to all admin emails
    for (const adminEmail of adminEmails) {
      await sendEmail({
        to: adminEmail,
        subject: `New Contact Message: ${subject}`,
        html: adminEmailHtml,
      });
    }

    // Send auto-reply to user (if enabled)
    if (autoReplyEnabled) {
      const autoReplyHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background: #f8f9fa; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
            .header { text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 8px; }
            .content { padding: 30px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; font-size: 12px; color: #adb5bd; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Thank You for Contacting Us! 🙏</h1>
            </div>
            <div class="content">
              <h2>Dear ${name},</h2>
              <p>Thank you for reaching out to CharityConnect.</p>
              <p>${autoReplyMessage}</p>
              <p>Best regards,</p>
              <p><strong>CharityConnect Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} CharityConnect. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail({
        to: email,
        subject: 'Thank You for Contacting CharityConnect',
        html: autoReplyHtml,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: contact._id,
        status: contact.status,
      },
    });

  } catch (error) {
    //console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message. Please try again.',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/contacts
 * @desc Get all contact messages (Admin only)
 * @access Private (Admin only)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if admin
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { page = 1, limit = 20, status = 'all', search = '' } = req.query;

    const query = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(query),
    ]);

    // Get stats
    const stats = await Contact.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    const statsMap = stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: contacts,
      stats: {
        total: await Contact.countDocuments(),
        pending: statsMap.pending || 0,
        read: statsMap.read || 0,
        replied: statsMap.replied || 0,
        resolved: statsMap.resolved || 0,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    //console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/contacts/:id
 * @desc Get single contact message (Admin only)
 * @access Private (Admin only)
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID',
      });
    }

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    // Mark as read if pending
    if (contact.status === 'pending') {
      contact.status = 'read';
      await contact.save();
    }

    res.status(200).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    //console.error('Get contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contact',
      error: error.message,
    });
  }
});

/**
 * @route PUT /api/contacts/:id/status
 * @desc Update contact status (Admin only)
 * @access Private (Admin only)
 */
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { id } = req.params;
    const { status, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID',
      });
    }

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    contact.status = status || contact.status;
    contact.notes = notes || contact.notes;
    contact.updatedAt = new Date();

    if (status === 'replied') {
      contact.repliedAt = new Date();
    }
    if (status === 'resolved') {
      contact.resolvedAt = new Date();
    }

    await contact.save();

    res.status(200).json({
      success: true,
      message: 'Contact status updated successfully',
      data: contact,
    });
  } catch (error) {
    //console.error('Update contact status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact status',
      error: error.message,
    });
  }
});

/**
 * @route DELETE /api/contacts/:id
 * @desc Delete contact message (Admin only)
 * @access Private (Admin only)
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID',
      });
    }

    const contact = await Contact.findById(id);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    await contact.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Contact deleted successfully',
    });
  } catch (error) {
    //console.error('Delete contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact',
      error: error.message,
    });
  }
});

module.exports = router;