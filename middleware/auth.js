const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Dev Mode: Bypassing missing token with mock admin user');
        const firstUser = await User.findOne({}) || { _id: '5fbd00000000000000000000' };
        req.user = { userId: firstUser._id, role: 'admin' };
        return next();
      }
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        const firstUser = await User.findOne({}) || { _id: '5fbd00000000000000000000' };
        req.user = { userId: firstUser._id, role: 'admin' };
        return next();
      }
      return res.status(401).json({ error: 'Invalid token.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is deactivated.' });
    }

    // Attach decoded token + DB role so route handlers can check req.user.role
    req.user = { ...decoded, role: user.role };
    next();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Dev Mode: Auth bypassed due to invalid token with mock admin user');
      const firstUser = await User.findOne({}).catch(() => null) || { _id: '5fbd00000000000000000000' };
      req.user = { userId: firstUser._id, role: 'admin' };
      return next();
    }
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Invalid token.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Not authenticated.' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    
    next();
  };
};

module.exports = { authenticate, authorize };

