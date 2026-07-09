const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'CharityConnectSecretKey';

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login to access this resource.',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Please login to access this resource.',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.',
        });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. Please login again.',
        });
      }
      throw error;
    }

    // Check if user exists
    const user = await User.findById(decoded.id || decoded.userId)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.',
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    // Check if user is deleted
    if (user.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deleted. Please contact support.',
      });
    }

    // Attach user to request
    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    req.userPermissions = user.permissions || [];

    // Log user activity (optional - can be moved to a separate middleware)
    // logger.info(`User ${user.email} accessed ${req.method} ${req.path}`);

    next();
  } catch (error) {
    // logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error. Please try again.',
    });
  }
};

/**
 * Role-based Authorization Middleware
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${roles.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Permission-based Authorization Middleware
 * @param {...string} permissions - Required permissions
 */
const hasPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    // Admin has all permissions
    if (req.user.role === 'admin') {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    
    // Check if user has any of the required permissions
    const hasRequiredPermission = permissions.some(permission => 
      userPermissions.includes(permission) || userPermissions.includes('*')
    );

    if (!hasRequiredPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permissions: ${permissions.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Optional Authentication Middleware
 * Tries to authenticate but continues even if not authenticated
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          const user = await User.findById(decoded.id || decoded.userId)
            .select('-password -resetPasswordToken -resetPasswordExpires');
          
          if (user && user.isActive && !user.isDeleted) {
            req.user = user;
            req.userId = user._id;
            req.userRole = user.role;
            req.userPermissions = user.permissions || [];
          }
        } catch (error) {
          // Token invalid - continue without user
          logger.debug('Optional auth: Invalid token');
        }
      }
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next();
  }
};

/**
 * API Key Authentication Middleware
 * For external API integrations
 */
const apiKeyAuth = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required',
      });
    }

    // Check API key against environment
    const validApiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',') : [];
    
    if (!validApiKeys.includes(apiKey)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid API key',
      });
    }

    // Attach API key info to request
    req.apiKey = apiKey;
    req.isApiRequest = true;

    next();
  } catch (error) {
    logger.error('API key auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'API authentication error',
    });
  }
};

/**
 * Rate Limiting Middleware (Simple implementation)
 * Can be replaced with express-rate-limit package
 */
const rateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // Max requests per window
    key = 'ip', // Key to track (ip, userId, etc.)
  } = options;

  const requests = new Map();

  return (req, res, next) => {
    const identifier = key === 'userId' && req.userId 
      ? req.userId.toString() 
      : req.ip;

    const now = Date.now();
    const windowStart = now - windowMs;

    // Clean expired requests
    if (requests.has(identifier)) {
      const userRequests = requests.get(identifier)
        .filter(timestamp => timestamp > windowStart);
      
      if (userRequests.length >= max) {
        return res.status(429).json({
          success: false,
          message: `Too many requests. Please try again later.`,
          retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000),
        });
      }
      
      userRequests.push(now);
      requests.set(identifier, userRequests);
    } else {
      requests.set(identifier, [now]);
    }

    // Clean up old entries periodically (every 100 requests)
    if (Math.random() < 0.01) {
      const cutoff = now - windowMs;
      for (const [key, timestamps] of requests) {
        const filtered = timestamps.filter(t => t > cutoff);
        if (filtered.length === 0) {
          requests.delete(key);
        } else {
          requests.set(key, filtered);
        }
      }
    }

    next();
  };
};

// ==================== COMPOSED MIDDLEWARE ====================

/**
 * Auth and Role Middleware
 * @param {...string} roles - Allowed roles
 */
const authAndRole = (...roles) => {
  return [authMiddleware, authorize(...roles)];
};


const authAndPermission = (...permissions) => {
  return [authMiddleware, hasPermission(...permissions)];
};


module.exports = {
  authMiddleware,
  authorize,
  hasPermission,
  optionalAuth,
  apiKeyAuth,
  rateLimit,
  authAndRole,
  authAndPermission,
};


module.exports.default = authMiddleware;