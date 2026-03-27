const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// Middleware to verify Firebase token (mocked for development)
const verifyFirebaseToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // For development, accept any token and create a mock user
    // TODO: Replace with real Firebase verification when you have credentials
    const decodedToken = {
      uid: 'mock-user-' + Math.random().toString(36).substr(2, 9),
      email: 'user@example.com',
      displayName: 'Demo User'
    };
    
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Login/Register with Firebase
router.post('/login', verifyFirebaseToken, async (req, res) => {
  try {
    const { email, uid, displayName, photoURL } = req.user;

    // Check if user exists in our database
    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      // Create new user
      user = new User({
        firebaseUid: uid,
        email,
        displayName,
        photoURL,
        lastLogin: new Date()
      });
      await user.save();
    } else {
      // Update last login
      user.lastLogin = new Date();
      await user.save();
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, firebaseUid: user.firebaseUid },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: user.role,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user
router.get('/me', verifyFirebaseToken, async (req, res) => {
  try {
    const user = await User.findOne({ firebaseUid: req.user.uid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      profile: user.profile,
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user profile
router.put('/profile', verifyFirebaseToken, async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findOneAndUpdate(
      { firebaseUid: req.user.uid },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      role: user.role,
      profile: user.profile,
      preferences: user.preferences
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Logout (client-side token removal)
router.post('/logout', verifyFirebaseToken, async (req, res) => {
  try {
    // For development, just return success
    // TODO: Add Firebase token revocation when you have real credentials
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
