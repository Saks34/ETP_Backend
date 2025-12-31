const { MongoClient, ObjectId } = require('mongodb');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DB; // If undefined, uses URI database

let client;
let db;

async function connectMongo() {
  if (db) return db;
  client = new MongoClient(MONGO_URI, {
    maxPoolSize: 20,
    minPoolSize: 2,
    retryWrites: true,
    w: 'majority',
  });
  await client.connect();
  db = client.db(DB_NAME);
  return db;
}

function getDB() {
  if (!db) throw new Error('MongoDB not connected. Call connectMongo() first.');
  return db;
}

async function closeMongo() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

module.exports = { connectMongo, getDB, closeMongo, ObjectId };
