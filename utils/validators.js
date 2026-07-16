
const validator = require('validator');

class Validators {
    static validateEmail(email) {
        if (!email || !validator.isEmail(email)) {
            throw new Error('Please provide a valid email address');
        }
        return true;
    }

    static validatePasswordDetailed = (password, options = {}) => {
      const {
        minLength = 8,
        requireUppercase = true,
        requireLowercase = true,
        requireNumbers = true,
        requireSpecialChars = true,
      } = options;
    
      const errors = [];
    
      if (!password || password.length === 0) {
        errors.push('Password is required');
        return { isValid: false, errors };
      }
    
      if (password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters long`);
      }
      if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }
      if (requireNumbers && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
      }
      if (requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
        errors.push('Password must contain at least one special character');
      }
    
      return {
        isValid: errors.length === 0,
        errors,
      };
    };

    static validatePhoneNumber(phone) {
        if (!phone || !validator.isMobilePhone(phone, 'any')) {
            throw new Error('Please provide a valid phone number');
        }
        return true;
    }

    static validateObjectId(id) {
        if (!id || !validator.isMongoId(id)) {
            throw new Error('Please provide a valid ID');
        }
        return true;
    }

    static validateRole(role) {
        const validRoles = ['ngo', 'company', 'admin', 'donor'];
        if (!role || !validRoles.includes(role.toLowerCase())) {
            throw new Error('Please provide a valid role');
        }
        return true;
    }

    static sanitizeInput(input) {
        if (typeof input === 'string') {
            return validator.escape(input.trim());
        }
        return input;
    }
}

module.exports = Validators;
