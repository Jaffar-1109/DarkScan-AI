import type Database from 'better-sqlite3';
import { MongoClient, type Db } from 'mongodb';

type Logger = Pick<Console, 'log' | 'error'>;

type TableConfig = {
  name: string;
  columns: string[];
};

type MongoPersistenceOptions = {
  sqlite: Database.Database;
  mongoUri?: string;
  mongoDbName?: string;
  logger?: Logger;
};

type MongoPersistence = {
  enabled: boolean;
  restoreFromMongo: () => Promise<boolean>;
  queueSync: (reason: string) => Promise<boolean>;
  close: () => Promise<void>;
};

const TABLES: TableConfig[] = [
  {
    name: 'users',
    columns: ['id', 'username', 'email', 'password', 'role', 'alert_email', 'alert_webhook_url', 'created_at']
  },
  {
    name: 'threats',
    columns: ['id', 'user_id', 'platform', 'content', 'risk_score', 'severity', 'prediction', 'links', 'ip_address', 'is_false_positive', 'detected_at']
  },
  {
    name: 'monitoring_tasks',
    columns: ['id', 'user_id', 'keyword', 'alert_email', 'alert_webhook_url', 'interval_hours', 'last_run', 'status']
  },
  {
    name: 'login_logs',
    columns: ['id', 'user_id', 'ip_address', 'status', 'timestamp']
  },
  {
    name: 'admin_audit_logs',
    columns: ['id', 'admin_user_id', 'action', 'target_user_id', 'details', 'ip_address', 'created_at']
  }
];

export async function createMongoPersistence(options: MongoPersistenceOptions): Promise<MongoPersistence> {
  const logger = options.logger || console;
  const mongoUri = (options.mongoUri || '').trim();
  const mongoDbName = (options.mongoDbName || 'darkscan_ai').trim() || 'darkscan_ai';

  if (!mongoUri) {
    return {
      enabled: false,
      restoreFromMongo: async () => false,
      queueSync: async () => false,
      close: async () => undefined
    };
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  const mongoDb = client.db(mongoDbName);
  logger.log(`[Mongo] Connected to database "${mongoDbName}".`);

  await ensureIndexes(mongoDb);

  let syncQueue = Promise.resolve(false);

  return {
    enabled: true,
    restoreFromMongo: async () => restoreSqliteFromMongo(options.sqlite, mongoDb, logger),
    queueSync: async (reason: string) => {
      syncQueue = syncQueue
        .catch(() => false)
        .then(() => syncSqliteToMongo(options.sqlite, mongoDb, logger, reason));
      return syncQueue;
    },
    close: async () => {
      await client.close();
    }
  };
}

async function ensureIndexes(mongoDb: Db) {
  await mongoDb.collection('users').createIndex({ id: 1 }, { unique: true });
  await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
  await mongoDb.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
  await mongoDb.collection('threats').createIndex({ id: 1 }, { unique: true });
  await mongoDb.collection('monitoring_tasks').createIndex({ id: 1 }, { unique: true });
  await mongoDb.collection('login_logs').createIndex({ id: 1 }, { unique: true });
  await mongoDb.collection('admin_audit_logs').createIndex({ id: 1 }, { unique: true });
}

async function restoreSqliteFromMongo(sqlite: Database.Database, mongoDb: Db, logger: Logger) {
  const snapshots = await Promise.all(
    TABLES.map(async (table) => {
      const rows = await mongoDb
        .collection(table.name)
        .find({}, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
      return { table, rows };
    })
  );

  const totalRows = snapshots.reduce((sum, entry) => sum + entry.rows.length, 0);
  if (totalRows === 0) {
    logger.log('[Mongo] No persisted records found; keeping local SQLite data.');
    return false;
  }

  const deleteOrder = ['admin_audit_logs', 'login_logs', 'monitoring_tasks', 'threats', 'users'];
  const restoreTransaction = sqlite.transaction(() => {
    for (const tableName of deleteOrder) {
      sqlite.prepare(`DELETE FROM ${tableName}`).run();
    }

    sqlite.exec('DELETE FROM sqlite_sequence;');

    for (const { table, rows } of snapshots) {
      if (rows.length === 0) {
        continue;
      }

      const placeholders = table.columns.map(() => '?').join(', ');
      const statement = sqlite.prepare(
        `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        statement.run(...table.columns.map((column) => (row as Record<string, unknown>)[column] ?? null));
      }
    }
  });

  restoreTransaction();
  logger.log(`[Mongo] Restored ${totalRows} records from MongoDB into SQLite cache.`);
  return true;
}

async function syncSqliteToMongo(sqlite: Database.Database, mongoDb: Db, logger: Logger, reason: string) {
  for (const table of TABLES) {
    const rows = sqlite.prepare(`SELECT * FROM ${table.name} ORDER BY id ASC`).all();
    const collection = mongoDb.collection(table.name);
    await collection.deleteMany({});

    if (rows.length > 0) {
      await collection.insertMany(rows);
    }
  }

  logger.log(`[Mongo] Synced SQLite data to MongoDB (${reason}).`);
  return true;
}
