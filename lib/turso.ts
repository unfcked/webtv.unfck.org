import { createClient } from '@libsql/client/web';
import '@/lib/load-env';

const REQUIRED_VARS = ['TURSO_DB', 'TURSO_TOKEN'] as const;

REQUIRED_VARS.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required env var ${key} for Turso`);
  }
});

const client = createClient({
  url: process.env.TURSO_DB!,
  authToken: process.env.TURSO_TOKEN!,
});

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS speaker_mappings (
      transcript_id TEXT PRIMARY KEY,
      mapping TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  initialized = true;
}

export async function getTursoClient() {
  await ensureInitialized();
  return client;
}

