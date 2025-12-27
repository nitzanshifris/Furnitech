/**
 * Production-safe logging utility
 * Only logs in development, sanitizes messages in production
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (message, data = null) => {
    if (isDevelopment) {
      console.log(message, data);
    }
  },
  
  warn: (message, data = null) => {
    if (isDevelopment) {
      console.warn(message, data);
    } else {
      console.warn('Warning occurred');
    }
  },
  
  error: (message, data = null) => {
    if (isDevelopment) {
      console.error(message, data);
    } else {
      console.error('Operation failed');
    }
  },
  
  debug: (message, data = null) => {
    if (isDevelopment) {
      console.log('[DEBUG]', message, data);
    }
  }
};

// Client-side version (for HTML files)
export const clientLogger = `
const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const logger = {
  info: (msg, data) => isDev && console.log(msg, data),
  warn: (msg, data) => isDev ? console.warn(msg, data) : console.warn('Warning occurred'),
  error: (msg, data) => isDev ? console.error(msg, data) : console.error('Operation failed'),
  debug: (msg, data) => isDev && console.log('[DEBUG]', msg, data)
};
`;