import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { MongoClient } from 'mongodb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const SOURCE_DB_PATH = process.env.SOURCE_DB_PATH
  ? resolvePath(process.env.SOURCE_DB_PATH)
  : path.join(projectRoot, 'darkscan.predeploy.backup.db');
const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URL ||
  process.env.DATABASE_URL ||
  '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'darkscan_ai';

const TABLES = [
  'users',
  'threats',
  'monitoring_tasks',
  'login_logs',
  'admin_audit_logs'
] as const;

function resolvePath(value: string) {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}

async function main() {
  if (!MONGODB_URI) {
    throw new Error('Missing MongoDB connection string. Set MONGODB_URI, MONGO_URL, MONGODB_URL, or DATABASE_URL before running the migration.');
  }

  const sqlite = new Database(SOURCE_DB_PATH, { readonly: true });
  const mongoClient = new MongoClient(MONGODB_URI);

  try {
    console.log(`[Migration] Reading SQLite data from: ${SOURCE_DB_PATH}`);
    await mongoClient.connect();
    const mongoDb = mongoClient.db(MONGODB_DB_NAME);
    console.log(`[Migration] Connected to MongoDB database: ${MONGODB_DB_NAME}`);

    for (const table of TABLES) {
      const rows = sqlite.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
      const collection = mongoDb.collection(table);
      await collection.deleteMany({});

      if (rows.length > 0) {
        await collection.insertMany(rows);
      }

      console.log(`[Migration] ${table}: ${rows.length} records migrated.`);
    }

    console.log('[Migration] SQLite to MongoDB migration completed successfully.');
  } finally {
    sqlite.close();
    await mongoClient.close();
  }
}

main().catch((error) => {
  console.error('[Migration] Failed:', error);
  process.exitCode = 1;
});
