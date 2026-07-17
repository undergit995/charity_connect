const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

const isEmailConfigured = () => {
  return !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

const createTransporter = () => {
  if (!isEmailConfigured()) {
    console.warn("Email credentials missing");
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  family: 4,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});
    transporter.verify((error) => {
      if (error) {
        console.error("SMTP CONNECTION FAILED");
        console.error(error);
        logger.error("SMTP verification failed", error);
      } else {
        console.log("SMTP CONNECTION SUCCESS");
      }
    });

    return transporter;

  } catch (error) {
    console.error("Failed to create transporter:", error);
    logger.error("Failed to create transporter:", error);
    return null;
  }
};


// Initialize transporter
const transporter = createTransporter();


const sendEmail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    return {
      messageId: "mock-development-id",
      skipped: true
    };
  }

  try {
    const mailOptions = {
      from: `CharityConnect <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    };

    return await transporter.sendMail(mailOptions);

  } catch (error) {
    console.error("Email send error:", error.message);
    logger.error("Email send error:", error);
    throw error;
  }
};


module.exports = {
  sendEmail,
};