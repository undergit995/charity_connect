const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
require("dotenv").config();
const corsOptions = require("./config/corsConfig.js");
const { connectDB, gracefulShutdown } = require("./config/connectDb.js");
const auth = require("./Routes/auth/auth.js");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
    // const { globalErrorHandler } = require('./utils/errorHandler');
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT EXCEPTION:");
    console.error(err);
    process.exit(1);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED REJECTION:");
    console.error(err);
    process.exit(1);
});
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
app.use("/api/maintenance", require("./Routes/Maintenance/index.js"));
app.use("/api/otp", require("./Routes/auth/otpRoute.js"));
app.use("/api/admin", require("./Routes/admin/admin.js"));
app.use("/api/charity", require("./Routes/charity/index.js"));
app.use("/api/donations", require("./Routes/donation/donation.js"));
app.use("/api/campaigns", require("./Routes/campaign/campaign.js"));
app.use("/api/payments", require("./Routes/payment/index.js"));
app.use("/api/verification", require("./Routes/verification/verification.js"));
app.use("/api/contact", require("./Routes/contact/index.js"));
app.use("/api/info", require("./Routes/admin/settings.js"));
app.use("/api/donor", require("./Routes/donor/index.js"));
// Global error handler
// app.use(globalErrorHandler);

// 404 handler
// app.use('(*/)', (req, res) => {
//     res.status(404).json({
//         status: 'fail',
//         message: `Route ${req.originalUrl} not found`
//     });
// });

const PORT = process.env.PORT || 7000;

// Initialize server
const server = app.listen(PORT, '0.0.0.0', async() => {

  try {
    await connectDB();
    console.log("Database connection ");
  } catch (error) {
    console.error("Database connection failed:");
    console.error(error);
    process.exit(1);
  }
});

// Graceful shutdown handling
const shutdown = async () => {
    // console.log('Received shutdown signal. Starting graceful shutdown...');
    server.close(async () => {
        // console.log('HTTP server closed.');
        await gracefulShutdown();
        process.exit(0);
    });
};

// Handle various shutdown signals
// process.on('SIGTERM', shutdown);
// process.on('SIGINT', shutdown);
// process.on('uncaughtException', (err) => {
//     // console.error('Uncaught Exception:', err);
//     shutdown();
// });
// process.on('unhandledRejection', (err) => {
//     // console.error('Unhandled Rejection:', err);
//     shutdown();
// });

module.exports = app;