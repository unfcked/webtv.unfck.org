import { getTursoClient } from './turso';

export interface SpeakerInfo {
  name: string | null;
  function: string | null;
  affiliation: string | null;
  group: string | null;
}

export type SpeakerMapping = Record<string, SpeakerInfo>;

export async function getSpeakerMapping(transcriptId: string): Promise<SpeakerMapping | null> {
  const client = await getTursoClient();
  const result = await client.execute({
    sql: 'SELECT mapping FROM speaker_mappings WHERE transcript_id = ?',
    args: [transcriptId],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const mappingJson = result.rows[0].mapping;
  if (typeof mappingJson !== 'string') {
    return null;
  }
  return JSON.parse(mappingJson) as SpeakerMapping;
}

export async function setSpeakerMapping(transcriptId: string, mapping: SpeakerMapping) {
  const client = await getTursoClient();
  await client.execute({
    sql: `
      INSERT INTO speaker_mappings (transcript_id, mapping)
      VALUES (?, ?)
      ON CONFLICT(transcript_id) DO UPDATE SET
        mapping = excluded.mapping,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [transcriptId, JSON.stringify(mapping)],
  });
}

