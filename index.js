require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const corsOptions = require("./config/corsConfig.js");
const { connectDB, gracefulShutdown } = require("./config/connectDb");
const auth = require("./Routes/auth/auth")
    // const { globalErrorHandler } = require('./utils/errorHandler');

const app = express();

// --- Middleware ---

// Enable CORS
app.use(cors(corsOptions));

// Built-in middleware for json and urlencoded form data
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));




app.use("/api/auth", auth);
app.use("/api/maintenance", require("./routes/maintenance/index"));
app.use("/api/otp", require("./routes/auth/otpRoute"));
app.use("/api/admin", require("./routes/admin/admin"));
app.use("/api/charity", require("./routes/charity/index"));
app.use("/api/donations", require("./Routes/donation/donation"));
app.use("/api/campaigns", require("./routes/campaign/campaign"));
app.use("/api/payments", require("./Routes/payment/index"));
app.use("/api/verification", require("./routes/verification/verification"));
app.use("/api/contact", require("./routes/contact/index"));
app.use("/api/donor", require("./routes/donor/index"));


// Global error handler
// app.use(globalErrorHandler);


const PORT = process.env.PORT || 7000;

// Initialize server
const server = app.listen(PORT, '0.0.0.0', () => {
    connectDB();
});

// Graceful shutdown handling
const shutdown = async () => {
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