const mongoose = require('mongoose');
require('dotenv').config();
const ArtistProfile = require('../models/ArtistProfile');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');
  
  const artists = await ArtistProfile.find({});
  console.log(`\nTotal Artist Profiles: ${artists.length}`);
  
  const emptyUsernames = artists.filter(a => a.username === "");
  const nullUsernames = artists.filter(a => a.username === null);
  const undefinedUsernames = artists.filter(a => a.username === undefined);
  const stringUndefinedUsernames = artists.filter(a => a.username === "undefined");
  const otherUsernames = artists.filter(a => a.username !== "" && a.username !== null && a.username !== undefined && a.username !== "undefined");
  
  console.log(`\nUsernames Summary:`);
  console.log(`  Empty string (""): ${emptyUsernames.length}`);
  console.log(`  Null: ${nullUsernames.length}`);
  console.log(`  Undefined (missing): ${undefinedUsernames.length}`);
  console.log(`  String "undefined": ${stringUndefinedUsernames.length}`);
  console.log(`  Other values: ${otherUsernames.length}`);
  
  console.log('\n--- Details of Empty/Null/String-Undefined Usernames ---');
  artists.forEach(a => {
    if (a.username === "" || a.username === null || a.username === undefined || a.username === "undefined") {
      console.log(`ID: ${a._id} | Name: ${a.name} | Username: "${a.username}" (${typeof a.username}) | Email: ${a.email}`);
    }
  });
  
  await mongoose.disconnect();
}

check();
