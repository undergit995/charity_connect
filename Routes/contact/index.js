const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth');
const Contact = require('../../models/Contact');
const { sendEmail } = require('../../utils/emailService');

/**
 * @route POST /api/contact
 * @desc Send contact message
 * @access Public
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate
    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
      });
    }

    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters',
      });
    }

    // Save to database
    const contact = new Contact({
      name,
      email,
      subject,
      message,
      status: 'pending',
    });
    await contact.save();

    // Send email to admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL || 'admin@charityconnect.com',
      subject: `New Contact Message: ${subject}`,
      html: `
        <h2>New Contact Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong></p>
        <p>${message}</p>
        <p><a href="${process.env.FRONTEND_URL}/admin/contacts/${contact._id}">View in Admin</a></p>
      `,
    });

    // Send auto-reply to user
    await sendEmail({
      to: email,
      subject: 'Thank you for contacting CharityConnect',
      html: `
        <h2>Thank you for reaching out!</h2>
        <p>Dear ${name},</p>
        <p>We have received your message and will get back to you within 24-48 hours.</p>
        <p>Your message:</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p>Best regards,</p>
        <p>CharityConnect Team</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: 'Message sent successfully',
      data: { id: contact._id },
    });
  } catch (error) {
    //console.error('Contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/contacts
 * @desc Get all contact messages (Admin only)
 * @access Private (Admin only)
 */
router.get('/', authMiddleware.authAndRole('admin'), async (req, res) => {
  try {
    const admin = await User.findById(req.userId);
    if (!admin || admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.',
      });
    }

    const { page = 1, limit = 20, status = 'all' } = req.query;
    const query = status !== 'all' ? { status } : {};

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: contacts,
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
 * @route PUT /api/contacts/:id
 * @desc Update contact status (Admin only)
 * @access Private (Admin only)
 */
router.put('/:id', authMiddleware.authAndRole('admin'), async (req, res) => {
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

    await contact.save();

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: contact,
    });
  } catch (error) {
    //console.error('Update contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update contact',
      error: error.message,
    });
  }
});

module.exports = router;