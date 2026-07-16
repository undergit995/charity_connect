const express = require('express');
const router = express.Router();
const { authAndRole, optionalAuth } = require('../../middlewares/auth.js');
const paymentController = require('../../Controllers/payment/paymentController.js');

/**
 * @route POST /api/payments/create-order
 * @desc Create Razorpay order
 * @access Public (with optional auth)
 */
router.post('/create-order', optionalAuth, paymentController.createOrder);

/**
 * @route POST /api/payments/verify
 * @desc Verify Razorpay payment
 * @access Private
 */
router.post('/verify', paymentController.verifyPayment);

/**
 * @route POST /api/payments/webhook
 * @desc Razorpay webhook handler
 * @access Public (with signature verification)
 */
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;