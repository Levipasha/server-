const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const Product = require('../models/Product');
const ArtistProfile = require('../models/ArtistProfile');
const Event = require('../models/Event');

// Generate sitemap.xml
router.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = 'https://artartist.com';
    const currentDate = new Date().toISOString().split('T')[0];
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    // Static pages
    const staticPages = [
      { url: '', priority: '1.0', changefreq: 'daily' },
      { url: '/art-store', priority: '0.9', changefreq: 'daily' },
      { url: '/artists', priority: '0.9', changefreq: 'daily' },
      { url: '/events', priority: '0.8', changefreq: 'daily' },
      { url: '/virtual-gallery', priority: '0.8', changefreq: 'weekly' },
      { url: '/art-supplies', priority: '0.7', changefreq: 'weekly' },
      { url: '/workshops', priority: '0.8', changefreq: 'daily' },
      { url: '/studio-finder', priority: '0.7', changefreq: 'weekly' },
      { url: '/about', priority: '0.5', changefreq: 'monthly' },
      { url: '/careers', priority: '0.4', changefreq: 'monthly' },
      { url: '/press-kit', priority: '0.4', changefreq: 'monthly' },
      { url: '/terms', priority: '0.3', changefreq: 'yearly' },
      { url: '/privacy-policy', priority: '0.3', changefreq: 'yearly' },
      { url: '/cookie-policy', priority: '0.3', changefreq: 'yearly' },
    ];
    
    staticPages.forEach(page => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
      xml += `    <lastmod>${currentDate}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += `  </url>\n`;
    });
    
    // Dynamic pages - Products
    const products = await Product.find({ status: 'active' }).select('_id updatedAt').limit(1000);
    products.forEach(product => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/art-store/product/${product._id}</loc>\n`;
      xml += `    <lastmod>${product.updatedAt.toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });
    
    // Dynamic pages - Artists
    const artists = await ArtistProfile.find({}).select('_id updatedAt').limit(1000);
    artists.forEach(artist => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/artists/${artist._id}</loc>\n`;
      xml += `    <lastmod>${artist.updatedAt.toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += `  </url>\n`;
    });
    
    // Dynamic pages - Events
    const events = await Event.find({}).select('_id updatedAt').limit(500);
    events.forEach(event => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}/events/${event._id}</loc>\n`;
      xml += `    <lastmod>${event.updatedAt.toISOString().split('T')[0]}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.7</priority>\n`;
      xml += `  </url>\n`;
    });
    
    xml += `</urlset>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

module.exports = router;
