const mongoose = require("mongoose");


mongoose.connection.on('error', err => console.error('❌ MongoDB error:', err));
mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected. Mongoose will auto-reconnect...'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected successfully'));

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/New1';
    
    if (!process.env.MONGO_URI) {
        console.log('MONGO_URI missing. Falling back to local MongoDB.');
    }
    
    try {
        const conn = await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000, 
            maxPoolSize: 10,
            family: 4
        });
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("Initial MongoDB Connection Failed:", error.message);
        process.exit(1); 
    }
};

const gracefulShutdown = async () => {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
};

module.exports = { connectDB, gracefulShutdown };