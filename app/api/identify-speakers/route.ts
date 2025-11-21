import { NextRequest, NextResponse } from 'next/server';
import { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { setSpeakerMapping } from '@/lib/speakers';
import '@/lib/load-env';

const SpeakerMapping = z.object({
  speakers: z.array(z.object({
    label: z.string().describe('The speaker label (e.g., "A", "B", "C")'),
    name: z.string().nullable().describe(''),
    function: z.string().nullable(),
    affiliation: z.string().nullable(),
    group: z.string().nullable()
  }))
});

export async function POST(request: NextRequest) {
  try {
    const { paragraphs, transcriptId } = await request.json();
    
    if (!paragraphs || paragraphs.length === 0) {
      return NextResponse.json({ error: 'No paragraphs provided' }, { status: 400 });
    }

    // Extract unique speakers and build full transcript
    const speakers = new Set<string>();
    const transcriptParts: string[] = [];
    
    paragraphs.forEach((para: { words: Array<{ speaker?: string; text: string }> }) => {
      const firstWord = para.words?.[0];
      if (firstWord?.speaker) {
        speakers.add(firstWord.speaker);
      }
      const text = para.words.map(w => w.text).join(' ');
      transcriptParts.push(`[Speaker ${firstWord?.speaker || 'Unknown'}]: ${text}`);
    });

    const fullTranscript = transcriptParts.join('\n\n');
    const speakerList = Array.from(speakers).sort().join(', ');

    const API_VERSION = '2025-01-01-preview'

    // Initialize Azure OpenAI client
    console.log('Azure OpenAI config:', {
      hasApiKey: !!process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: API_VERSION,
    });
    
    const client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: API_VERSION,
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
      {
        role: 'system',
        content: `You are an expert at identifying speakers in UN proceedings. Extract names, functions/titles, affiliation codes, and country-group information strictly from the transcript text.

RULES:
- Look for explicit introductions (e.g., "I invite... Mr. X", "I give the floor to...")
- Track "Thank you" statements that reference previous speakers
- Extract both personal names AND official functions when available
- For country representatives, provide ISO 3166-1 alpha-3 country codes (e.g., PRY, USA, CHN)
- For UN bodies/agencies, use standard abbreviations (e.g., ACABQ, UNICEF, UNDP, OHCHR)
- If a representative is speaking on behalf of a group (e.g., G77, EU), capture that group code
- If identity cannot be determined, return null for name/function/affiliation/group

SCHEMA DEFINITIONS:

name: Person name as best as can be identified from text. Do not use your world knowledge to guess the name, only use what is literally in the text. Fixing spelling/transcription errors is fine. Depending on what is in the text, this may be a given name, a surname, or ideally a full name. When it is only a surname, and when the gender is explicitly known, add a "Mr." or "Ms.". Do not otherwise add "Mr."/"Ms.". E.g., "Yassin Hamazoui", "Mr. Hamasu", "Dave".  Use null if unknown.

function: Function/title of the person. This should be concise and use canonical abbreviations if available. E.g. "SG", "PGA", "Chair", [Permanent/...] "Representative", "Spokesperson", "USG Policy". Use null if unknown.

affiliation: For country representatives, use ISO 3166-1 alpha-3 country codes of their country, e.g. "PRY", "KEN". For organizations use the canonical abbreviation of the organization, e.g. "OECD", "OHCHR", "UN Secretariat", "GA". Use null if unknown/not applicable.

group: If applicable, group of countries that a country representative is speaking on behalf of. Use the canonical abbreviation, e.g. "G77", "EU", "AU". Use null if not applicable.

EXAMPLES:
✓ "I invite Mr. Yassin Hamazoui to introduce the report"
  → name: "Yassin Hamazoui", function: null, affiliation: null, group: null

✓ "The Chair of the Fifth Committee"
  → name: null, function: "Chair", affiliation: "5h Committee", group: null

✓ "Mr. Carlo Iacobucci, Vice Chair of ACABQ"
  → name: "Carlo Iacobucci", function: "Vice‑Chair", affiliation: "ACABQ", group: null

✓ "The permanent representative of Germany has the floor"
  → name: null, function: "Representative", affiliation: "DEU", group: null

✓ "Mr. Laureano Bentancourt of Uruguay"
  → name: "Laureano Bentancourt", function: "Representative", affiliation: "URY", group: null

✓ "Yes, Carlo?"
  → name: "Carlo", function: null, affiliation: null, group: null

✓ "The distinct representative of Iraq!" ... "I am speaking on behalf of the group of seventyseven and China"
  → name: null, function: "Representative", affiliation: "IRQ", group: "G77"

✓ "I invite the officer in charge of the Program Planning and Budget Division of the Office of Program Planning, Finance and Budget, Mr. Yassin Hamazoui, to introduce the 23rd Annual Progress Report of the Secretary General"
  → name: "Yassin Hamazoui", function: "Officer", affiliation: "OPPFB", group: null

`
      },
      {
        role: 'user',
        content: `Analyze the following UN transcript and identify speakers (${speakerList}).

Transcript:
${fullTranscript.substring(0, 50000)}`
      }
      ],
      response_format: zodResponseFormat(SpeakerMapping, 'speaker_mapping')
    });

    const result = completion.choices[0]?.message?.content;
    
    if (!result) {
      return NextResponse.json({ error: 'Failed to parse speaker mappings' }, { status: 500 });
    }

    // Parse the JSON response
    const parsed = JSON.parse(result) as z.infer<typeof SpeakerMapping>;
    
    // Create structured mapping object
    const mapping: Record<string, { name: string | null; function: string | null; affiliation: string | null; group: string | null }> = {};
    parsed.speakers.forEach((speaker) => {
      mapping[speaker.label] = {
        name: speaker.name,
        function: speaker.function,
        affiliation: speaker.affiliation,
        group: speaker.group,
      };
    });

    console.log('Speaker mapping identified:', mapping);

    // Store mapping if transcriptId provided
    if (transcriptId) {
      await setSpeakerMapping(transcriptId, mapping);
    }

    return NextResponse.json({ mapping });
    
  } catch (error) {
    console.error('Speaker identification error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

