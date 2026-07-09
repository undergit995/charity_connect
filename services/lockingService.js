// services/LockingService.js
const mongoose = require("mongoose");

class LockingService {
  constructor() {
    this.lockTimeout = 30000; // 30 seconds
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Acquire a lock on a document
   */
  async acquireLock(model, documentId, userId, timeout = this.lockTimeout) {
    const now = new Date();
    const lockExpiry = new Date(now.getTime() + timeout);

    const result = await model.findOneAndUpdate(
      {
        _id: documentId,
        $or: [
          { lockedUntil: { $lt: now } },
          { lockedUntil: null },
          { lockedBy: userId }
        ]
      },
      {
        lockedUntil: lockExpiry,
        lockedBy: userId,
        lastModifiedAt: now
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!result) {
      const lockedDoc = await model.findById(documentId);
      if (lockedDoc && lockedDoc.lockedBy) {
        const lockedByUser = await mongoose.model("User").findById(lockedDoc.lockedBy);
        const timeRemaining = Math.ceil((lockedDoc.lockedUntil - now) / 1000);
        throw new Error(
          `Document is currently locked by ${lockedByUser?.fullName || 'another user'}. ` +
          `Please wait ${timeRemaining} seconds and try again.`
        );
      }
      throw new Error("Failed to acquire lock. Please try again.");
    }

    return result;
  }

  /**
   * Release a lock on a document
   */
  async releaseLock(model, documentId, userId) {
    const result = await model.findOneAndUpdate(
      {
        _id: documentId,
        lockedBy: userId
      },
      {
        lockedUntil: null,
        lockedBy: null,
        lastModifiedAt: new Date()
      },
      {
        new: true,
        runValidators: true
      }
    );

    return result;
  }

  /**
   * Update with optimistic locking
   */
  async updateWithLock(model, documentId, userId, updateData, version) {
    let attempts = 0;
    let lastError = null;

    while (attempts < this.retryAttempts) {
      try {
        // Try to acquire lock
        await this.acquireLock(model, documentId, userId);

        // Perform update with version check
        const result = await model.findOneAndUpdate(
          {
            _id: documentId,
            __v: version,
            lockedBy: userId
          },
          {
            ...updateData,
            $inc: { __v: 1 },
            lockedUntil: null,
            lockedBy: null,
            lastModifiedAt: new Date(),
            lastModifiedBy: userId
          },
          {
            new: true,
            runValidators: true
          }
        );

        if (!result) {
          // Version mismatch
          const current = await model.findById(documentId);
          if (!current) {
            throw new Error("Document not found");
          }

          // Handle conflict
          const conflictResolution = await this.handleConflict(current, updateData, userId);
          
          if (conflictResolution.resolved) {
            return conflictResolution.result;
          }

          throw new Error(
            "Version conflict detected. Another user has modified this document. " +
            "Please review the changes and try again."
          );
        }

        return result;

      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts < this.retryAttempts) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Failed to update after multiple attempts");
  }

  /**
   * Handle version conflicts
   */
  async handleConflict(currentDoc, updateData, userId) {
    const strategy = process.env.CONFLICT_RESOLUTION_STRATEGY || "auto";
    const result = {
      resolved: false,
      result: null,
      strategy: "auto"
    };

    switch (strategy) {
      case "latest":
        // Use the latest version, ignore conflict
        result.resolved = true;
        result.result = currentDoc;
        result.strategy = "latest";
        break;

      case "merge":
        // Merge updates with current document
        const mergedData = this.mergeUpdates(currentDoc.toObject(), updateData);
        const merged = await currentDoc.constructor.findByIdAndUpdate(
          currentDoc._id,
          {
            ...mergedData,
            __v: currentDoc.__v + 1,
            lastModifiedAt: new Date(),
            lastModifiedBy: userId,
            "conflictResolution.resolved": true,
            "conflictResolution.resolvedAt": new Date(),
            "conflictResolution.resolvedBy": userId,
            "conflictResolution.resolutionStrategy": "merge",
            "conflictResolution.previousVersion": currentDoc.__v
          },
          { new: true }
        );
        result.resolved = true;
        result.result = merged;
        result.strategy = "merge";
        break;

      case "auto":
      default:
        // Auto-resolve by prioritizing current version
        result.resolved = true;
        result.result = currentDoc;
        result.strategy = "auto";
        break;
    }

    return result;
  }

  /**
   * Merge updates with current document
   */
  mergeUpdates(current, updates) {
    const merged = { ...current };
    
    // Define which fields should be merged vs replaced
    const mergeFields = ['amount', 'message', 'status', 'donorName', 'donorEmail'];
    const replaceFields = ['razorpayPaymentId', 'transactionId', 'paymentMethod'];

    for (const [key, value] of Object.entries(updates)) {
      if (mergeFields.includes(key)) {
        // For merge fields, only update if the new value is newer
        if (updates.lastModifiedAt > current.lastModifiedAt) {
          merged[key] = value;
        }
      } else if (replaceFields.includes(key)) {
        // For replace fields, always use the new value
        merged[key] = value;
      } else {
        // For other fields, use the new value if it's an update
        if (updates[key] !== undefined && updates[key] !== null) {
          merged[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Extend lock if operation takes longer
   */
  async extendLock(model, documentId, userId, additionalTime = 30000) {
    const result = await model.findOneAndUpdate(
      {
        _id: documentId,
        lockedBy: userId
      },
      {
        lockedUntil: new Date(Date.now() + additionalTime)
      },
      { new: true }
    );

    return result;
  }
}

module.exports = new LockingService();