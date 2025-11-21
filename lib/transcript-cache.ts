import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const CACHE_DIR = join(process.cwd(), '.cache');
const CACHE_FILE = join(CACHE_DIR, 'transcripts.json');

interface TranscriptCache {
  [key: string]: string; // "entryId:start:end" -> transcriptId
}

async function ensureCacheDir() {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

async function readCache(): Promise<TranscriptCache> {
  try {
    const data = await readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function writeCache(cache: TranscriptCache) {
  await ensureCacheDir();
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function getCacheKey(entryId: string, startTime?: number, endTime?: number): string {
  if (startTime !== undefined && endTime !== undefined) {
    return `${entryId}:${startTime}:${endTime}`;
  }
  return `${entryId}:complete`;
}

export async function getTranscriptId(entryId: string, startTime?: number, endTime?: number): Promise<string | null> {
  const cache = await readCache();
  const key = getCacheKey(entryId, startTime, endTime);
  return cache[key] || null;
}

export async function setTranscriptId(entryId: string, transcriptId: string, startTime?: number, endTime?: number) {
  const cache = await readCache();
  const key = getCacheKey(entryId, startTime, endTime);
  cache[key] = transcriptId;
  await writeCache(cache);
}

export async function getAllTranscriptsForEntry(entryId: string): Promise<Array<{start: number, end: number, transcriptId: string}>> {
  const cache = await readCache();
  const results: Array<{start: number, end: number, transcriptId: string}> = [];
  
  for (const [key, transcriptId] of Object.entries(cache)) {
    if (key.startsWith(`${entryId}:`)) {
      const parts = key.split(':');
      if (parts.length === 2 && parts[1] === 'complete') {
        // Complete transcript - we'll need to get duration from elsewhere
        continue;
      } else if (parts.length === 3) {
        results.push({
          start: parseFloat(parts[1]),
          end: parseFloat(parts[2]),
          transcriptId,
        });
      }
    }
  }
  
  return results.sort((a, b) => a.start - b.start);
}

