const mongoose = require('mongoose');
require('dotenv').config();
const ArtistProfile = require('../models/ArtistProfile');
const { parseCSV } = require('../utils/csvParser');
const { getDefaultArtistImage } = require('../constants/defaultArtistImage');

if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment variables');
  process.exit(1);
}

// Minimal CSV mockup helper matching parseCSV format
function mockExtractArtistId(row) {
  const allowedIdKeys = [
    'id', 's.no', 'sno', 'sl.no', 'slno', 's.no.', 'sl.no.',
    'number', 'no', 'no.', 'artist number', 'artist_number',
    'artist number / id', 'artist number/id', 'artist_id',
    'artist id', 'artistid', 'artist no', 'artist no.', 'artist_no'
  ];
  const emailHeaderKeys = ['email', 'e-mail', 'mail', 'mail id', 'mailid'];
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (allowedIdKeys.includes(k)) {
      const val = String(row[key] ?? '').trim();
      if (val) return val;
    }
  }
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (!emailHeaderKeys.includes(k)) {
      const val = String(row[key] ?? '').trim();
      if (val) return val;
    }
  }
  return '';
}

function mockExtractEmail(row) {
  const emailHeaderKeys = ['email', 'e-mail', 'mail', 'mail id', 'mailid'];
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (emailHeaderKeys.includes(k)) {
      return String(row[key] ?? '').trim().toLowerCase();
    }
  }
  return String(row.email || row.Email || row.EMAIL || '').trim().toLowerCase();
}

function placeholderNameFromEmail(email, artistNumber) {
  const local = email.split('@')[0]?.replace(/[._+-]/g, ' ').trim();
  if (local && local.length >= 2) {
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return artistNumber ? `Artist ${artistNumber}` : 'Artist';
}

async function runVerification() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected successfully!');

    // 1. Clean up any existing test artists from previous runs
    console.log('Cleaning up existing test artists...');
    await ArtistProfile.deleteMany({ email: /@test-verification\.com$/i });

    // 2. Insert one baseline artist to simulate a pre-existing email and username in the database
    console.log('Inserting baseline artist...');
    await ArtistProfile.create({
      artistNumber: 'TEST-BASE-99',
      name: 'Baseline Artist',
      email: 'preexisting@test-verification.com',
      username: 'test-base-99',
      phone: '',
      artForm: 'Artist',
      image: getDefaultArtistImage('Baseline Artist'),
      location: { city: '', state: '', country: '' },
      social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
      bio: '',
      isActive: true
    });

    // 3. Define the CSV data to test
    const csvText = `Artist ID,Email
TEST-BASE-99,new-email@test-verification.com
TEST-NEW-01,new-email@test-verification.com
TEST-NEW-02,preexisting@test-verification.com
TEST-NEW-03,duplicate-in-batch@test-verification.com
TEST-NEW-04,duplicate-in-batch@test-verification.com
TEST-BASE-99,another-new-email@test-verification.com
,no-id@test-verification.com
TEST-NEW-05,
TEST-NEW-06,invalidemailtest
`;

    console.log('Parsing mock CSV data...');
    const rows = parseCSV(csvText);
    console.log(`Parsed ${rows.length} rows.`);

    const results = {
      created: [],
      updated: [],
      failed: [],
      emailsSent: 0,
      emailsFailed: 0
    };

    const processedEmails = new Set();
    const processedUsernames = new Set();

    // 4. Run the exact route loop logic to verify correctness
    console.log('\nProcessing bulk upload rows...');
    for (const row of rows) {
      try {
        const id = String(mockExtractArtistId(row) || '').trim().slice(0, 64);
        const email = mockExtractEmail(row);

        if (!email) {
          results.failed.push({ row, reason: 'Email is required' });
          continue;
        }
        if (!id) {
          results.failed.push({ row, reason: 'Artist ID is required (letters, numbers, or both)' });
          continue;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          results.failed.push({ row, reason: 'Invalid email address' });
          continue;
        }

        // Skip duplicate emails in current CSV batch gracefully
        if (processedEmails.has(email)) {
          results.failed.push({ row, reason: 'Duplicate email in CSV batch' });
          continue;
        }
        processedEmails.add(email);

        // Skip duplicate emails that already exist in database gracefully
        const existingArtistByEmail = await ArtistProfile.findOne({ email });
        if (existingArtistByEmail) {
          results.failed.push({ row, reason: 'Email already exists in database' });
          continue;
        }

        const artistId = id;
        const baseUsername = artistId.toLowerCase().trim();
        let username = baseUsername;

        if (!username) {
          results.failed.push({ row, reason: 'Cannot generate a valid username from Artist ID' });
          continue;
        }

        const existingUser = await ArtistProfile.findOne({ username });
        if (existingUser || processedUsernames.has(username)) {
          username = `${baseUsername}_${Date.now()}`;
          let attempts = 0;
          while ((await ArtistProfile.findOne({ username })) || processedUsernames.has(username)) {
            username = `${baseUsername}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            attempts++;
            if (attempts > 10) break;
          }
        }
        processedUsernames.add(username);

        const placeholderName = placeholderNameFromEmail(email, artistId);
        const artist = await ArtistProfile.create({
          artistNumber: artistId,
          name: placeholderName,
          email,
          username,
          phone: '',
          artForm: 'Artist',
          image: getDefaultArtistImage(placeholderName),
          location: { city: '', state: '', country: '' },
          social: { instagram: '', facebook: '', twitter: '', linkedin: '', website: '' },
          bio: '',
          isActive: true
        });
        results.created.push({ id: artist._id, name: artist.name, email: artist.email, username: artist.username });
        console.log(`  ✅ Created artist: ${artist.name} | Username: ${artist.username} | Email: ${artist.email}`);

      } catch (rowErr) {
        console.error('Bulk upload row error:', rowErr);
        results.failed.push({ row, reason: rowErr.message });
      }
    }

    console.log('\n--- VERIFICATION SUMMARY ---');
    console.log(`Total Rows parsed: ${rows.length}`);
    console.log(`Created: ${results.created.length}`);
    console.log(`Failed: ${results.failed.length}`);

    console.log('\n--- Failed Rows Details ---');
    results.failed.forEach((f, idx) => {
      console.log(`  ${idx+1}. Row: ${JSON.stringify(f.row)} | Reason: "${f.reason}"`);
    });

    // Verify expectations:
    // Row 1: TEST-BASE-99, new-email@test-verification.com
    //   -> TEST-BASE-99 username already exists in DB as 'test-base-99'. Should generate 'test-base-99_<timestamp>'!
    // Row 2: TEST-NEW-01, new-email@test-verification.com
    //   -> Duplicate email in current batch (since row 1 used new-email@test-verification.com). Should be skipped!
    // Row 3: TEST-NEW-02, preexisting@test-verification.com
    //   -> Already exists in DB. Should be skipped!
    // Row 4: TEST-NEW-03, duplicate-in-batch@test-verification.com
    //   -> Should succeed. Username: 'test-new-03'
    // Row 5: TEST-NEW-04, duplicate-in-batch@test-verification.com
    //   -> Duplicate email in current batch. Should be skipped!
    // Row 6: TEST-BASE-99, another-new-email@test-verification.com
    //   -> Username 'test-base-99' already exists in DB. Should generate 'test-base-99_<timestamp>' and succeed!
    // Row 7: , no-id@test-verification.com
    //   -> No ID. Should be skipped!
    // Row 8: TEST-NEW-05,
    //   -> No email. Should be skipped!
    // Row 9: TEST-NEW-06, invalidemailtest
    //   -> Invalid email. Should be skipped!

    console.log('\nChecking test assertions...');
    const assert = (condition, message) => {
      if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
      }
      console.log(`  ✔ ${message}`);
    };

    assert(results.created.length === 3, 'Exactly 3 artists should have been created successfully.');
    assert(results.failed.length === 6, 'Exactly 6 rows should have failed / been skipped.');

    // Assert that usernames are lowercase, trimmed, unique, and generated using Artist ID
    const user1 = results.created.find(c => c.email === 'new-email@test-verification.com');
    assert(user1 !== undefined, 'Artist for new-email@test-verification.com created.');
    assert(user1.username.startsWith('test-base-99_'), `Username should starts with 'test-base-99_' (got: ${user1.username})`);

    const user3 = results.created.find(c => c.email === 'duplicate-in-batch@test-verification.com');
    assert(user3 !== undefined, 'Artist for duplicate-in-batch@test-verification.com created.');
    assert(user3.username === 'test-new-03', `Username should be 'test-new-03' (got: ${user3.username})`);

    const user5 = results.created.find(c => c.email === 'another-new-email@test-verification.com');
    assert(user5 !== undefined, 'Artist for another-new-email@test-verification.com created.');
    assert(user5.username.startsWith('test-base-99_'), `Username should starts with 'test-base-99_' (got: ${user5.username})`);

    console.log('\nCleaning up verification records from DB...');
    await ArtistProfile.deleteMany({ email: /@test-verification\.com$/i });
    console.log('✅ Cleaned up successfully!');
    console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runVerification();
