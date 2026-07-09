require('dotenv').config();
const Razorpay = require('razorpay');
const crypto = require('crypto');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Generate signature for webhook verification
const generateSignature = (orderId, paymentId) => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return signature;
};

// Verify payment signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  const expectedSignature = generateSignature(orderId, paymentId);
  return expectedSignature === signature;
};

module.exports = {
  razorpay,
  generateSignature,
  verifyPaymentSignature,
};