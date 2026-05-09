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

// Validate mandatory environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`❌ CRITICAL ERROR: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please ensure these are set in your AWS environment or .env file.');
  // Don't exit yet, but functionality will be severely limited
} else {
  console.log('✅ Basic environment variables validated');
}

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
const formRoutes = require('./routes/forms');
const SiteSettings = require('./models/SiteSettings');

const app = express();

// Needed when running behind a proxy / dev proxy that sets X-Forwarded-For
// (required by express-rate-limit to identify clients correctly)
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);

// Custom logging middleware to debug CORS and requests on AWS
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No Origin'}`);
  }
  next();
});

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'https://artiest-dashbaord.vercel.app',
      'https://art-love-website.vercel.app',
      'https://admin-eosin-nine-51.vercel.app',
      'https://www.artartist.in',
      'https://artartist.in',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174'
    ];
    
    // Check if the origin matches any allowed origin or is a subdomain of a trusted domain
    const isAllowed = allowedOrigins.includes(origin) || 
                      allowedOrigins.includes(origin.replace(/\/$/, ''));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // In production, log the blocked origin for debugging
      console.warn(`[CORS] Blocking origin: ${origin}`);
      
      // For development, allow any origin
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        // If it's a known issue on AWS, we might want to be more lenient temporarily
        // or provide a better error message.
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Cache-Control', 
    'Pragma', 
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
};

// Middleware (CORS first so preflights always get headers)
app.use(cors(corsOptions));
// Explicitly handle OPTIONS for all routes
app.options('*', cors(corsOptions));

// Configure helmet to allow CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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
console.log('Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
})
.then(() => {
  console.log('✅ Connected to MongoDB');
  // Log database name (safely)
  const dbName = mongoose.connection.name;
  console.log(`Using database: ${dbName}`);
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  if (err.message.includes('IP not whitelisted')) {
    console.error('PRO TIP: Check if your AWS server IP is whitelisted in MongoDB Atlas.');
  }
});

// Handle connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB runtime error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Reconnecting...');
});

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
app.use('/api/forms', formRoutes);
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
