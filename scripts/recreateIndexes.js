const mongoose = require('mongoose');
require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI in environment variables');
  process.exit(1);
}

async function recreateIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected successfully!');

    const db = mongoose.connection.db;
    const collection = db.collection('artistprofiles');

    // Clean up empty strings and nulls to avoid duplicate key errors on sparse unique index
    console.log('Cleaning up empty/null username fields in existing artist profiles...');
    const cleanResult = await collection.updateMany(
      { $or: [{ username: "" }, { username: null }] },
      { $unset: { username: 1 } }
    );
    console.log(`🧹 Unset empty/null usernames on ${cleanResult.modifiedCount} documents.`);

    // Drop the existing index
    console.log('Dropping existing username_1 index...');
    try {
      await collection.dropIndex("username_1");
      console.log('✅ Successfully dropped index: username_1');
    } catch (err) {
      console.log('⚠️  Note: username_1 index did not exist or could not be dropped:', err.message);
    }

    // Create the sparse unique index
    console.log('Creating sparse unique index for username...');
    await collection.createIndex(
      { username: 1 },
      { unique: true, sparse: true, name: "username_1" }
    );
    console.log('✅ Sparse unique index on username created successfully!');

    // Output final indexes list to verify
    const indexes = await collection.indexes();
    console.log('\n--- Current Indexes on artistprofiles ---');
    console.log(JSON.stringify(indexes, null, 2));

  } catch (error) {
    console.error('❌ Error during index recreation:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

recreateIndexes();
