/**
 * One-time script to set a username on an existing ArtistProfile.
 * Usage:
 *   node scripts/set-username.js <search_name_or_email> <username>
 *
 * Examples:
 *   node scripts/set-username.js "uday" "udaymicroartist"
 *   node scripts/set-username.js "uday@example.com" "udaymicroartist"
 */

const mongoose = require('mongoose');
require('dotenv').config();
const ArtistProfile = require('../models/ArtistProfile');

async function setUsername(searchTerm, username) {
  if (!searchTerm || !username) {
    console.error('Usage: node scripts/set-username.js <name_or_email> <username>');
    process.exit(1);
  }

  // Validate username format
  if (!/^[a-z0-9_]+$/.test(username)) {
    console.error('Username must only contain lowercase letters, numbers, and underscores.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  try {
    // Search by name or email (case-insensitive)
    const query = {
      $or: [
        { name: { $regex: searchTerm, $options: 'i' } },
        { email: searchTerm.toLowerCase() }
      ]
    };

    const artists = await ArtistProfile.find(query);

    if (artists.length === 0) {
      console.error(`❌ No artist found matching: "${searchTerm}"`);
      process.exit(1);
    }

    if (artists.length > 1) {
      console.log(`⚠️  Found ${artists.length} artists matching "${searchTerm}":`);
      artists.forEach((a, i) => console.log(`  ${i + 1}. ${a.name} (${a.email}) [${a._id}]`));
      console.log('Please use the exact email to narrow down to one artist.');
      process.exit(1);
    }

    const artist = artists[0];
    console.log(`\n🎨 Found artist: ${artist.name} (${artist.email})`);
    console.log(`   Current username: "${artist.username || '(none)'}"`);

    // Check if username is already taken by someone else
    const existing = await ArtistProfile.findOne({ username, _id: { $ne: artist._id } });
    if (existing) {
      console.error(`❌ Username "${username}" is already taken by: ${existing.name} (${existing.email})`);
      process.exit(1);
    }

    // Set the username
    artist.username = username;
    await artist.save();

    console.log(`\n✅ Username set successfully!`);
    console.log(`   Artist: ${artist.name}`);
    console.log(`   Username: ${artist.username}`);
    console.log(`   Public URL: https://artartist.com/${artist.username}`);
    console.log(`   Local URL: http://localhost:3000/${artist.username}`);

  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

const [, , searchTerm, username] = process.argv;
setUsername(searchTerm, username);
