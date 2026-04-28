const dns = require('dns');

// Force IPv4 DNS resolution first
// This fixes AggregateError: ETIMEDOUT issues on Windows with Node.js 17+
dns.setDefaultResultOrder('ipv4first');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Firebase Admin
const admin = require('firebase-admin');

// Detect placeholder / missing Firebase credentials
const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
const firebasePrivateKey = rawKey
  .trim()
  .replace(/^["']|["']$/g, '') // Remove surrounding quotes
  .replace(/\\n/g, '\n');      // Convert literal \n to actual newlines

if (process.env.NODE_ENV === 'development' && rawKey) {
  console.log('Firebase Key Debug: length=', firebasePrivateKey.length);
  console.log('Firebase Key Debug: starts with BEGIN=', firebasePrivateKey.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('Firebase Key Debug: ends with END=', firebasePrivateKey.trim().endsWith('-----END PRIVATE KEY-----'));
}
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
const isFirebaseConfigured =
  firebasePrivateKey &&
  !firebasePrivateKey.includes('...') &&          // not a placeholder
  firebasePrivateKey.includes('-----BEGIN PRIVATE KEY-----') &&
  firebaseClientEmail &&
  !firebaseClientEmail.includes('xxx');            // not a placeholder

let firebaseInitialized = false;

if (!isFirebaseConfigured) {
  console.warn(
    '⚠️  Firebase Admin is not initialized. Login/signup is disabled.\n' +
    '   Add real Firebase service account credentials to server/.env to enable it.'
  );
} else {
  const serviceAccount = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: firebasePrivateKey,
    client_email: firebaseClientEmail,
  };

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('Firebase Admin initialization error:', error.message);
  }
}

// Cloudinary
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const productRoutes = require('./routes/products');
const eventRoutes = require('./routes/events');
const uploadRoutes = require('./routes/upload');
const adminRoutes = require('./routes/admin');
const galleryRoutes = require('./routes/gallery');
const artistRoutes = require('./routes/artists');
const announcementRoutes = require('./routes/announcements');
const sitemapRoutes = require('./routes/sitemap');
const chatbotRoutes = require('./routes/chatbot');
const SiteSettings = require('./models/SiteSettings');

const app = express();

// Needed when running behind a proxy / dev proxy that sets X-Forwarded-For
// (required by express-rate-limit to identify clients correctly)
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);

const corsOptions = {
  origin: true,                // reflect the request origin → allows ANY origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Middleware (CORS first so preflights always get headers)
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(helmet());

// Rate limiting (skip OPTIONS preflight)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.method === 'OPTIONS'
});
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Make admin available globally (only expose if properly initialized)
app.locals.firebase = firebaseInitialized ? admin : null;
app.locals.firebaseInitialized = firebaseInitialized;
app.locals.cloudinary = cloudinary;

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/', sitemapRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Public hero image endpoint (no auth required)
app.get('/api/settings/hero', async (req, res) => {
  try {
    const settings = await SiteSettings.getSingleton();
    res.json({ heroImage: settings.heroImage || '' });
  } catch (error) {
    console.error('Get hero image error:', error);
    res.json({ heroImage: '' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

// Set server timeout to 10 minutes for large uploads
server.timeout = 600000;
server.keepAliveTimeout = 600000;
server.headersTimeout = 610000;
