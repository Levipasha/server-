const mongoose = require('mongoose');

const galleryImageSchema = new mongoose.Schema({
  url:     { type: String, required: true, trim: true },
  alt:     { type: String, default: '',    trim: true },
  caption: { type: String, default: '',    trim: true },
  order:   { type: Number, default: 0 }
}, { _id: true });

const passSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  price: { type: String, required: true },
  period: { type: String, default: '' },
  features: [{ type: String }],
  iconType: { type: String, default: 'palette' },
  paymentLink: { type: String, default: '', trim: true },
  themeColor: { type: String, default: 'black' } // e.g. black, red
}, { _id: true });

const defaultPasses = [
  {
    title: 'DAILY',
    subtitle: 'SKETCH PASS',
    price: '299',
    period: 'per day',
    features: ['Flexi-desk access in standard zone', 'High-speed creative Wi-Fi network', 'Access to pantry and lounge areas', 'Basic stationery and tools access'],
    iconType: 'palette',
    themeColor: 'black',
    paymentLink: ''
  },
  {
    title: 'WEEKLY',
    subtitle: 'STUDIO PASS',
    price: '999',
    period: 'per week',
    features: ['Flexi-desk workspace access', 'Content creation corner access (2h/week)', 'Standard storage locker facility', 'Walk-in entry to community talks', 'Free entry to weekend workshop popups', 'Perfect choice for visiting creators'],
    iconType: 'layers',
    themeColor: 'white',
    paymentLink: ''
  },
  {
    title: 'MONTHLY',
    subtitle: 'STUDIO PASS',
    price: '2499',
    period: 'per month',
    features: ['Dedicated co-creative desk area', 'Unlimited content creation corner access', 'Personal secure storage locker', 'Physical art gallery display option', 'Free entry to all premium artist workshops', 'Priority network collaboration events'],
    iconType: 'crown',
    themeColor: 'red',
    paymentLink: ''
  }
];

const testimonialSchema = new mongoose.Schema({
  text: { type: String, required: true },
  name: { type: String, required: true },
  jobtitle: { type: String, default: '' },
  image: { type: String, default: '' },
  social: { type: String, default: '' }
}, { _id: true });

const statSchema = new mongoose.Schema({
  num: { type: String, required: true },
  label: { type: String, required: true }
}, { _id: true });

const defaultHeroImages = [
  'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
  'https://images.unsplash.com/photo-1541961017774-22349e4a1262?w=600&q=80',
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
  'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80',
  'https://images.unsplash.com/photo-1499364615650-ec38552f4f34?w=600&q=80'
];

const defaultTestimonials = [
  { text: 'ArtDistrict completely changed how I create. I found two collaborators here for my next gallery exhibition within three weeks of joining!', name: 'Ananya Reddy', jobtitle: 'Fine Artist', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80' },
  { text: 'Having a dedicated space that has zero-commission art popups allowed me to showcase my work to real buyers and focus 100% on my sculptures.', name: 'Kabir Sen', jobtitle: 'Sculptor', image: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=150&q=80' },
  { text: 'The energy here is infectious. Surrounded by other painters, sculptors, and digital designers, my creative output has literally doubled.', name: 'Meera Nair', jobtitle: 'Digital Illustrator', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&q=80' },
  { text: 'From late-night coffee brainstorming to premium workshops, this is more than a desk. It\'s a supportive family for every creator.', name: 'Rohan Varma', jobtitle: 'Creative Director', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80' }
];

const artDistrictConfigSchema = new mongoose.Schema({
  passes: { type: [passSchema], default: defaultPasses },
  heroImages: { type: [String], default: defaultHeroImages },
  testimonials: { type: [testimonialSchema], default: defaultTestimonials },
  // Community gallery images shown on /art-district page
  galleryImages: { type: [galleryImageSchema], default: [] },
  stats: { 
    type: [statSchema], 
    default: [
      { num: '450+', label: 'Artists' },
      { num: '20+', label: 'Events' },
      { num: '₹0', label: 'Commission' },
      { num: '01', label: 'Ecosystem' }
    ]
  }
}, { timestamps: true });

// Singleton — always use / upsert the single config document
artDistrictConfigSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('ArtDistrictConfig', artDistrictConfigSchema);
