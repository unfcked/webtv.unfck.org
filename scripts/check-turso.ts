import { getTursoClient, getAllTranscriptedEntries } from '../lib/turso';

async function checkTurso() {
  const client = await getTursoClient();
  
  // List all transcripts
  const result = await client.execute('SELECT entry_id, transcript_id, status, LENGTH(content) as content_length FROM transcripts');
  
  console.log('All transcripts in Turso:');
  console.log(result.rows);
  
  // Get all transcripted entries
  const entries = await getAllTranscriptedEntries();
  console.log('\nCompleted transcript entries:', entries);
}

checkTurso().catch(console.error);

