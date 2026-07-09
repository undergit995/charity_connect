require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require('path');
const corsOptions = require("./config/corsConfig");
const { connectDB, gracefulShutdown } = require("./config/connectDb");
const auth = require("./Routes/auth/auth")
    // const { globalErrorHandler } = require('./utils/errorHandler');

const app = express();

// CORS configuration
app.use(cors(corsOptions));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`Request from ${req.headers.origin} → ${req.method} ${req.originalUrl}`);
    next();
});

// Other middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// API routes
app.use("/api/auth", auth);
app.use("/api/maintenance", require("./routes/maintenance/index"));
app.use("/api/otp", require("./routes/auth/otpRoute"));
app.use("/api/admin", require("./routes/admin/admin"));
app.use("/api/charity", require("./routes/charity/index"));
app.use("/api/donations", require("./Routes/donation/donation"));
app.use("/api/campaigns", require("./routes/campaign/campaign"));
app.use("/api/payments", require("./Routes/payment/index"));
// app.use("/api/public", require("./routes/public/index"));
// app.use("/api/user", require("./routes/user/index"));
// app.use("/api/donor", require("./routes/donor/index"));


// Global error handler
// app.use(globalErrorHandler);

// 404 handler
// app.use('(*/)', (req, res) => {
//     res.status(404).json({
//         status: 'fail',
//         message: `Route ${req.originalUrl} not found`
//     });
// });

const PORT = process.env.PORT || 5000;

// Initialize server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    connectDB();
});

// Graceful shutdown handling
const shutdown = async () => {
    console.log('Received shutdown signal. Starting graceful shutdown...');
    server.close(async () => {
        console.log('HTTP server closed.');
        await gracefulShutdown();
        process.exit(0);
    });
};

// Handle various shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    shutdown();
});
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    shutdown();
});

module.exports = app;