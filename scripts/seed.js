const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');
const Product = require('../models/Product');
const Event = require('../models/Event');
const ArtistProfile = require('../models/ArtistProfile');

function image(url, alt) {
  return { url, alt };
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Sample data (matches current Mongoose schemas)
const sampleUsers = [
  {
    firebaseUid: 'seed-admin-001',
    email: 'admin@artartist.com',
    displayName: 'Admin',
    photoURL: 'https://picsum.photos/seed/admin/200/200',
    role: 'admin',
    profile: {
      firstName: 'Admin',
      lastName: 'User',
      bio: 'System administrator',
      location: 'India',
    },
    preferences: {
      notifications: { email: true, push: true },
      privacy: { showEmail: false, showLocation: true },
    },
  },
  {
    firebaseUid: 'seed-artist-001',
    email: 'artist1@artartist.com',
    displayName: 'Aarohi Artist',
    photoURL: 'https://picsum.photos/seed/artist1/200/200',
    role: 'artist',
    profile: {
      firstName: 'Aarohi',
      lastName: 'Sharma',
      bio: 'Contemporary artist',
      location: 'Mumbai',
      artistInfo: {
        specialization: ['painting', 'print'],
        experience: '6 years',
        education: 'BFA',
        achievements: ['Gallery showcase'],
      },
    },
    preferences: {
      notifications: { email: true, push: true },
      privacy: { showEmail: false, showLocation: true },
    },
  },
  {
    firebaseUid: 'seed-artist-002',
    email: 'artist2@artartist.com',
    displayName: 'Vikram Lens',
    photoURL: 'https://picsum.photos/seed/artist2/200/200',
    role: 'artist',
    profile: {
      firstName: 'Vikram',
      lastName: 'Kumar',
      bio: 'Photographer',
      location: 'Bangalore',
      artistInfo: {
        specialization: ['photography', 'digital-art'],
        experience: '4 years',
        education: 'Self-taught',
        achievements: ['Featured online'],
      },
    },
    preferences: {
      notifications: { email: true, push: true },
      privacy: { showEmail: false, showLocation: true },
    },
  },
  {
    firebaseUid: 'seed-user-001',
    email: 'user1@artartist.com',
    displayName: 'Collector One',
    photoURL: 'https://picsum.photos/seed/user1/200/200',
    role: 'user',
    profile: {
      firstName: 'Ravi',
      lastName: 'Patel',
      bio: 'Art collector',
      location: 'Hyderabad',
    },
    preferences: {
      notifications: { email: true, push: false },
      privacy: { showEmail: false, showLocation: true },
    },
  },
];

const sampleProducts = [
  {
    name: 'Abstract Sunset',
    description: 'Vibrant abstract painting with warm tones.',
    category: 'painting',
    price: 850,
    currency: 'USD',
    images: [
      image('https://picsum.photos/seed/p1/900/600', 'Abstract Sunset'),
      image('https://picsum.photos/seed/p1b/900/600', 'Abstract Sunset close-up'),
    ],
    artist: null, // set later
    status: 'available',
    condition: 'new',
    dimensions: { width: 60, height: 90, unit: 'cm' },
    materials: ['Oil', 'Canvas'],
    techniques: ['Abstract'],
    year: new Date().getFullYear(),
    tags: ['abstract', 'sunset'],
    shipping: {
      available: true,
      cost: 499,
      methods: ['standard', 'express'],
      locations: ['India'],
    },
    inventory: { quantity: 1, trackQuantity: true },
    featured: true,
  },
  {
    name: 'Digital Dreams',
    description: 'Modern digital artwork with nature + tech theme.',
    category: 'digital-art',
    price: 450,
    currency: 'USD',
    images: [image('https://picsum.photos/seed/p2/900/600', 'Digital Dreams')],
    artist: null,
    status: 'available',
    condition: 'new',
    dimensions: { width: 50, height: 50, unit: 'cm' },
    materials: ['Digital'],
    techniques: ['Mixed Media'],
    year: new Date().getFullYear(),
    tags: ['digital', 'modern'],
    shipping: {
      available: true,
      cost: 0,
      methods: ['standard'],
      locations: ['Worldwide'],
    },
    inventory: { quantity: 10, trackQuantity: true },
  },
  {
    name: 'Monochrome Streets',
    description: 'Black & white street photography print.',
    category: 'photography',
    price: 320,
    currency: 'USD',
    images: [image('https://picsum.photos/seed/p3/900/600', 'Monochrome Streets')],
    artist: null,
    status: 'available',
    condition: 'like-new',
    dimensions: { width: 40, height: 60, unit: 'cm' },
    materials: ['Archival paper'],
    techniques: ['Photography'],
    year: new Date().getFullYear(),
    tags: ['photo', 'street'],
    shipping: {
      available: true,
      cost: 299,
      methods: ['standard'],
      locations: ['India'],
    },
    inventory: { quantity: 5, trackQuantity: true },
  },
];

const sampleEvents = [
  {
    title: 'Summer Art Exhibition',
    description: 'Contemporary works across multiple mediums.',
    category: 'exhibition',
    images: [image('https://picsum.photos/seed/e1/900/600', 'Exhibition banner')],
    organizer: null, // set later
    date: {
      start: addDays(new Date(), 10),
      end: addDays(new Date(), 10),
    },
    location: {
      type: 'physical',
      address: 'ArtArtist Gallery, 123 Art Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      coordinates: { lat: 19.076, lng: 72.8777 },
    },
    pricing: { type: 'paid', amount: 499, currency: 'INR' },
    capacity: { max: 200, current: 0, waitlist: 0 },
    tags: ['exhibition', 'summer'],
    agenda: [
      { time: '18:00', title: 'Welcome', description: 'Registration & entry' },
      { time: '18:30', title: 'Showcase', description: 'Open gallery viewing' },
    ],
    status: 'published',
    featured: true,
  },
  {
    title: 'Digital Art Workshop',
    description: 'Hands-on intro to digital art tools.',
    category: 'workshop',
    images: [image('https://picsum.photos/seed/e2/900/600', 'Workshop banner')],
    organizer: null,
    date: {
      start: addDays(new Date(), 20),
      end: addDays(new Date(), 20),
    },
    location: {
      type: 'virtual',
      virtualLink: 'https://example.com/meet',
      platform: 'Google Meet',
      city: 'Online',
      country: 'India',
    },
    pricing: { type: 'paid', amount: 999, currency: 'INR' },
    capacity: { max: 50, current: 0, waitlist: 0 },
    tags: ['workshop', 'digital'],
    requirements: ['Laptop', 'Drawing tablet (optional)'],
    agenda: [
      { time: '10:00', title: 'Setup', description: 'Tools + workflow' },
      { time: '11:00', title: 'Practice', description: 'Create a simple piece' },
    ],
    status: 'published',
  },
];

const sampleArtistProfiles = [
  {
    name: 'Priya Sharma',
    artForm: 'Leadership',
    teamRole: 'Founder & CEO',
    isTeamMember: true,
    displayOrder: 1,
    image: image('https://images.unsplash.com/photo-1494790108755-2616b332c5ca?w=400&h=400&fit=crop&crop=face', 'Priya Sharma'),
    bio: 'Art enthusiast with 15+ years in the creative industry.',
    location: { city: 'Mumbai', state: 'Maharashtra', country: 'India' },
    social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
    isActive: true
  },
  {
    name: 'Rahul Verma',
    artForm: 'Technology',
    teamRole: 'CTO',
    isTeamMember: true,
    displayOrder: 2,
    image: image('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop&crop=face', 'Rahul Verma'),
    bio: 'Tech innovator passionate about merging art with technology.',
    location: { city: 'Bangalore', state: 'Karnataka', country: 'India' },
    social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
    isActive: true
  },
  {
    name: 'Ananya Patel',
    artForm: 'Creative Direction',
    teamRole: 'Creative Director',
    isTeamMember: true,
    displayOrder: 3,
    image: image('https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&h=400&fit=crop&crop=face', 'Ananya Patel'),
    bio: 'Curator and artist with a vision for contemporary art.',
    location: { city: 'Delhi', state: 'Delhi', country: 'India' },
    social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
    isActive: true
  },
  {
    name: 'Vikram Singh',
    artForm: 'Operations',
    teamRole: 'Head of Operations',
    isTeamMember: true,
    displayOrder: 4,
    image: image('https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&h=400&fit=crop&crop=face', 'Vikram Singh'),
    bio: 'Operations expert ensuring smooth artist and user experiences.',
    location: { city: 'Hyderabad', state: 'Telangana', country: 'India' },
    social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
    isActive: true
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Product.deleteMany({});
    await Event.deleteMany({});
    await ArtistProfile.deleteMany({});
    console.log('Cleared existing data');

    // Create users
    const createdUsers = await User.create(sampleUsers);
    console.log(`Created ${createdUsers.length} users`);

    // Find admin and artist users for reference
    const adminUser = createdUsers.find(u => u.role === 'admin');
    const artistUsers = createdUsers.filter(u => u.role === 'artist');

    // Create products with artist reference
    const productsWithArtist = sampleProducts.map((product, idx) => ({
      ...product,
      artist: artistUsers[idx % artistUsers.length]._id
    }));
    const createdProducts = await Product.create(productsWithArtist);
    console.log(`Created ${createdProducts.length} products`);

    // Create events with admin reference
    const eventsWithOrganizer = sampleEvents.map(event => ({
      ...event,
      organizer: adminUser._id
    }));
    const createdEvents = await Event.create(eventsWithOrganizer);
    console.log(`Created ${createdEvents.length} events`);

    const createdArtists = await ArtistProfile.create(sampleArtistProfiles);
    console.log(`Created ${createdArtists.length} artist profiles`);

    console.log('Database seeded successfully!');
    console.log('\n=== Admin User ===');
    console.log('Email:', adminUser.email);
    console.log('Role:', adminUser.role);
    console.log('ID:', adminUser._id);
    console.log('\n=== Artist Users ===');
    for (const au of artistUsers) {
      console.log('-', au.email, au._id.toString());
    }

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the seed function
seedDatabase();
