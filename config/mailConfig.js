require("dotenv").config();
const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

const isEmailConfigured = () => {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  if (!emailUser || !emailPass) {
    console.warn('⚠️ Email credentials not configured. Email sending will be disabled.');
    return false;
  }
  return true;
};

// Create transporter only if credentials exist
const createTransporter = () => {
  if (!isEmailConfigured()) {
    return null;
  }

  try {
    const instance = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false,
      },
      pool: true, 
      maxConnections: 5,
      maxMessages: 100,
    });

    // Verify connection asynchronously once during bootup
    instance.verify((error) => {
      if (error) {
        console.error('❌ Email transporter verification failed:', error);
        logger.error('Email transporter verification failed:', error);
      }
    });

    return instance;
  } catch (error) {
    console.error('❌ Failed to create email transporter:', error);
    logger.error('Failed to create email transporter:', error);
    return null;
  }
};

// Initialize the transporter instance safely
const transporter = createTransporter();

/**
 * Universal Send Email Wrapper Function
 */
const sendEmail = async ({ to, subject, text,   html }) => {
  if (!transporter) {
    console.warn(`🛑 Skipping email send to <${to}> because email credentials are missing in .env.`);
    return { messageId: "mock-development-id", skipped: true };
  }

  try {
    const mailOptions = {
      from: `CharityConnect <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    console.error(`❌ Email send error executing sendMail:`, error.message);
    logger.error(`Email send error executing sendMail:`, error);
    throw error;
  }
};


module.exports = { sendEmail };