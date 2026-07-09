const express = require('express');
const router = express.Router();
const { authAndRole } = require('../../middlewares/auth');
const paymentController = require('../../Controllers/payment/paymentController');

/**
 * @route POST /api/payments/create-order
 * @desc Create Razorpay order
 * @access Private
 */
router.post('/create-order', paymentController.createOrder);

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