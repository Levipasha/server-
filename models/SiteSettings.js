const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
  {
    siteName: { type: String, default: 'ArtArtist', trim: true },
    siteDescription: { type: String, default: 'A vibrant community for artists to showcase, connect, and grow', trim: true },
    maintenanceMode: { type: Boolean, default: false },
    allowRegistrations: { type: Boolean, default: true },
    maxUploadSize: { type: String, default: '10MB' },
    supportedImageFormats: { type: [String], default: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'Asia/Kolkata' },

    // About Hero Section
    aboutHeroTitleLine1: { type: String, default: 'We are one by blood,' },
    aboutHeroTitleLine2: { type: String, default: 'Blood group is Art+.' },
    aboutHeroSubtitle: { type: String, default: 'Join us to celebrate creativity and connect with fellow artists in our vibrant community.' },
    aboutHeroJoinButtonText: { type: String, default: 'Join' },

    // About Stats Section
    aboutStat1Number: { type: String, default: '10,000+' },
    aboutStat1Label: { type: String, default: 'Artists' },
    aboutStat2Number: { type: String, default: '50,000+' },
    aboutStat2Label: { type: String, default: 'Artworks' },
    aboutStat3Number: { type: String, default: '100+' },
    aboutStat3Label: { type: String, default: 'Cities' },
    aboutStat4Number: { type: String, default: '1M+' },
    aboutStat4Label: { type: String, default: 'Art Lovers' },

    // Story Section
    aboutStoryTitle: { type: String, default: 'About ArtArtist' },
    aboutStoryDescription: { type: String, default: 'ArtArtist was founded by an artist who deeply understood the challenges creatives face in getting visibility and building real connections. It was started with a simple yet powerful vision — to create a vibrant community where artists across India can showcase their work, collaborate, learn, and grow together. At ArtArtist, we host regular meetups, art markets, exhibitions, and discussions, providing a platform for artists of all ages to express themselves, network, and find new opportunities. It\'s a space where creativity meets community, and every artist finds their voice.' },

    // Community Section
    aboutCommunitySubtitle: { type: String, default: 'Inspiring community of artists.' },
    aboutCommunityTitle: { type: String, default: 'Creative Community' },
    aboutCommunityDescription: { type: String, default: 'Join a vibrant community where artists connect, share, and grow through creativity and collaboration.' },

    // Meetups Card
    aboutMeetupsTitle: { type: String, default: 'Meetups' },
    aboutMeetupsSubtitle: { type: String, default: 'Regular gatherings to connect and create together' },
    aboutMeetupsStat1Number: { type: String, default: 'Monthly' },
    aboutMeetupsStat1Label: { type: String, default: 'Artist meetups in major cities' },
    aboutMeetupsStat2Number: { type: String, default: '50+' },
    aboutMeetupsStat2Label: { type: String, default: 'Cities with active communities' },
    aboutMeetupsStat3Number: { type: String, default: '1000+' },
    aboutMeetupsStat3Label: { type: String, default: 'Artists connected monthly' },
    aboutMeetupsBottomDescription: { type: String, default: 'Discover and connect with talented artists in our creative and supportive network community.' },
    aboutMeetupsButtonText: { type: String, default: 'View Upcoming Meetups' },

    // Values Section
    aboutValuesTitle: { type: String, default: 'Our Values' },
    aboutValue1Title: { type: String, default: 'Passion for Art' },
    aboutValue1Description: { type: String, default: 'We believe in the transformative power of art and its ability to inspire, connect, and enrich lives.' },
    aboutValue2Title: { type: String, default: 'Artist First' },
    aboutValue2Description: { type: String, default: 'We prioritize artists\' success, providing them with tools, exposure, and fair compensation for their creativity.' },
    aboutValue3Title: { type: String, default: 'Global Community' },
    aboutValue3Description: { type: String, default: 'Building a worldwide network of artists, collectors, and art enthusiasts united by their love for creativity.' },
    aboutValue4Title: { type: String, default: 'Excellence' },
    aboutValue4Description: { type: String, default: 'Committed to maintaining the highest standards in art curation, user experience, and service quality.' },

    // Journey Section
    aboutJourneyTitle: { type: String, default: 'Our Journey' },
    aboutMilestone1Year: { type: String, default: '2020' },
    aboutMilestone1Title: { type: String, default: 'ArtArtist Founded' },
    aboutMilestone1Description: { type: String, default: 'Started with a vision to democratize art access' },
    aboutMilestone2Year: { type: String, default: '2021' },
    aboutMilestone2Title: { type: String, default: '1,000 Artists' },
    aboutMilestone2Description: { type: String, default: 'Reached our first major milestone' },
    aboutMilestone3Year: { type: String, default: '2022' },
    aboutMilestone3Title: { type: String, default: 'NFT Launch' },
    aboutMilestone3Description: { type: String, default: 'Pioneered digital art marketplace' },
    aboutMilestone4Year: { type: String, default: '2023' },
    aboutMilestone4Title: { type: String, default: 'Global Expansion' },
    aboutMilestone4Description: { type: String, default: 'Expanded to 50+ countries' },
    aboutMilestone5Year: { type: String, default: '2024' },
    aboutMilestone5Title: { type: String, default: 'Artist Hub' },
    aboutMilestone5Description: { type: String, default: 'Launched comprehensive artist support program' },

    // CTA Section
    aboutCtaTitle: { type: String, default: 'Join Our Creative Community' },
    aboutCtaSubtitle: { type: String, default: 'Whether you\'re an artist, collector, or art enthusiast, there\'s a place for you at ArtArtist.' },
    aboutCtaButton1Text: { type: String, default: 'Join as Artist' },
    aboutCtaButton2Text: { type: String, default: 'Explore Events' }
  },
  { timestamps: true }
);

// Singleton pattern — always use the first (and only) document
siteSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
