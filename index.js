require("dotenv").config();

console.log("STARTING APP");

console.log("Loading cors config...");
const corsOptions = require("./config/corsConfig.js");
console.log("cors config loaded");

console.log("Loading database...");
const { connectDB, gracefulShutdown } = require("./config/connectDb.js");
console.log("database module loaded");

console.log("Loading auth routes...");
const auth = require("./Routes/auth/auth.js");
console.log("auth routes loaded");

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
console.log({
  PORT: process.env.PORT,
  MONGO_URI: !!process.env.MONGO_URI,
  JWT_SECRET: !!process.env.JWT_SECRET
});
const app = express();

// CORS configuration
// app.use(cors(corsOptions));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
    // console.log(`Request from ${req.headers.origin} → ${req.method} ${req.originalUrl}`);
    next();
});

// Other middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// API routes
app.use("/api/auth", auth);
console.log("Loading routes...");

console.log("maintenance");
app.use("/api/maintenance", require("./Routes/maintenance/index.js"));

console.log("otp");
app.use("/api/otp", require("./Routes/auth/otpRoute.js"));

console.log("admin");
app.use("/api/admin", require("./Routes/admin/admin.js"));

console.log("charity");
app.use("/api/charity", require("./Routes/charity/index.js"));

console.log("donations");
app.use("/api/donations", require("./Routes/donation/donation.js"));

console.log("campaigns");
app.use("/api/campaigns", require("./Routes/campaign/campaign.js"));

console.log("payments");
app.use("/api/payments", require("./Routes/payment/index.js"));

console.log("verification");
app.use("/api/verification", require("./Routes/verification/verification.js"));

console.log("contact");
app.use("/api/contact", require("./Routes/contact/index.js"));

console.log("settings");
app.use("/api/info", require("./Routes/admin/settings.js"));

console.log("donor");
app.use("/api/donor", require("./Routes/donor/index.js"));

console.log("All routes loaded");
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
const server = app.listen(PORT, '0.0.0.0', async() => {
    // console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`Server running on port ${PORT}`);

  try {
    await connectDB();
    console.log("Database connected");
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