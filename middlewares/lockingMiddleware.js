const LockingService = require('../services/LockingService');

const lockMiddleware = async (req, res, next) => {
  const { id } = req.params;
  const userId = req.userId;
  const model = req.model || 'Donation';
  
  try {
    // Get the model from mongoose
    const Model = mongoose.model(model);
    
    // Acquire lock
    const document = await LockingService.acquireLock(Model, id, userId);
    
    // Attach document to request
    req.lockedDocument = document;
    req.lockAcquired = true;
    
    next();
  } catch (error) {
    if (error.message.includes('locked')) {
      return res.status(423).json({
        success: false,
        message: error.message,
        locked: true,
        lockInfo: {
          lockedBy: error.lockedBy,
          lockedUntil: error.lockedUntil,
        },
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Lock acquisition failed',
      error: error.message,
    });
  }
};

const versionCheckMiddleware = (req, res, next) => {
  const clientVersion = parseInt(req.headers['x-version'] || req.body.version || 0);
  const currentVersion = req.lockedDocument?.__v || 0;
  
  if (clientVersion !== currentVersion) {
    return res.status(409).json({
      success: false,
      message: 'Version conflict detected',
      current: req.lockedDocument,
      updates: req.body,
    });
  }
  
  next();
};

module.exports = {
  lockMiddleware,
  versionCheckMiddleware,
};