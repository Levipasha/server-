const mongoose = require('mongoose');
require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI in environment variables');
  process.exit(1);
}

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected!');

    const db = mongoose.connection.db;
    const collection = db.collection('artistprofiles');

    // 1. Inspect existing documents
    console.log('\n--- Inspecting artist profiles ---');
    const totalCount = await collection.countDocuments();
    const emptyUsernames = await collection.countDocuments({ username: "" });
    const nullUsernames  = await collection.countDocuments({ username: null });
    const missingUsernames = await collection.countDocuments({ username: { $exists: false } });
    const emptyEmails  = await collection.countDocuments({ email: "" });
    const nullEmails   = await collection.countDocuments({ email: null });
    const missingEmails = await collection.countDocuments({ email: { $exists: false } });

    console.log(`Total documents: ${totalCount}`);
    console.log(`Usernames -> Empty: ${emptyUsernames}, Null: ${nullUsernames}, Missing: ${missingUsernames}`);
    console.log(`Emails    -> Empty: ${emptyEmails}, Null: ${nullEmails}, Missing: ${missingEmails}`);

    // 2. Clean up empty strings and nulls (belt-and-suspenders)
    console.log('\n--- Cleaning up empty strings / nulls ---');
    const uClean = await collection.updateMany(
      { $or: [{ username: "" }, { username: null }] },
      { $unset: { username: 1 } }
    );
    console.log(`Unset username on ${uClean.modifiedCount} documents.`);

    const eClean = await collection.updateMany(
      { $or: [{ email: "" }, { email: null }] },
      { $unset: { email: 1 } }
    );
    console.log(`Unset email on ${eClean.modifiedCount} documents.`);

    // 3. Drop ALL existing username / email indexes (any variant)
    console.log('\n--- Dropping old username / email indexes ---');
    const indexes = await collection.indexes();
    for (const idx of indexes) {
      const keys = Object.keys(idx.key);
      if (keys.length === 1 && (keys[0] === 'username' || keys[0] === 'email')) {
        console.log(`  Dropping index: ${idx.name}`);
        await collection.dropIndex(idx.name);
      }
    }

    // 4. Recreate as PARTIAL indexes so empty-string values are NEVER indexed
    //    partialFilterExpression: { field: { $gt: "" } }  →  only non-empty strings get indexed
    //    This means username:"" and email:"" are completely invisible to the unique constraint.
    console.log('\n--- Creating PARTIAL unique indexes ---');

    await collection.createIndex(
      { username: 1 },
      {
        unique: true,
        partialFilterExpression: { username: { $type: 'string', $gt: '' } },
        name: 'username_1',
      }
    );
    console.log('  ✅ username_1 partial unique index created');

    await collection.createIndex(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: { email: { $type: 'string', $gt: '' } },
        name: 'email_1',
      }
    );
    console.log('  ✅ email_1 partial unique index created');

    // 5. Print final state
    const finalIndexes = await collection.indexes();
    console.log('\n--- Final indexes ---');
    console.log(JSON.stringify(finalIndexes, null, 2));

  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  }
}

run();

