import { NextRequest, NextResponse } from 'next/server';
import { getAllTranscriptsForEntry } from '@/lib/transcript-cache';

interface Gap {
  start: number;
  end: number;
}

interface Word {
  text: string;
  speaker?: string | null;
  start: number;
  end: number;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
  words: Word[];
}

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, currentTime, totalDuration, isComplete } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }

    // Resolve Kaltura ID to actual entry ID
    const apiResponse = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        '1': {
          service: 'session',
          action: 'startWidgetSession',
          widgetId: '_2503451',
        },
        '2': {
          service: 'baseEntry',
          action: 'list',
          ks: '{1:result:ks}',
          filter: { redirectFromEntryId: kalturaId },
          responseProfile: { type: 1, fields: 'id' },
        },
        apiVersion: '3.3.0',
        format: 1,
        ks: '',
        clientTag: 'html5:v3.17.30',
        partnerId: 2503451,
      }),
    });

    if (!apiResponse.ok) {
      return NextResponse.json({ error: 'Failed to query Kaltura API' }, { status: 500 });
    }

    const apiData = await apiResponse.json();
    const entryId = apiData[1]?.objects?.[0]?.id;
    
    if (!entryId) {
      return NextResponse.json({ error: 'No entry found' }, { status: 404 });
    }
    
    // Get existing segments from cache
    const existingSegments = await getAllTranscriptsForEntry(entryId);

    // Sort segments by start time
    existingSegments.sort((a, b) => a.start - b.start);

    // Fetch actual transcript content for existing segments
    const segmentsWithContent = await Promise.all(
      existingSegments.map(async (seg) => {
        try {
          // Fetch paragraphs
          const paragraphsRes = await fetch(`https://api.assemblyai.com/v2/transcript/${seg.transcriptId}/paragraphs`, {
            headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
          });
          
          if (!paragraphsRes.ok) {
            console.error(`Failed to fetch paragraphs for ${seg.transcriptId}`);
            return null;
          }
          
          const paragraphsData = await paragraphsRes.json();
          
          // Adjust timestamps to video time
          return paragraphsData.paragraphs?.map((para: Paragraph) => ({
            ...para,
            start: (para.start / 1000) + seg.start,
            end: (para.end / 1000) + seg.start,
            words: para.words?.map((w: Word) => ({
              ...w,
              start: (w.start / 1000) + seg.start,
              end: (w.end / 1000) + seg.start,
            })) || [],
          })) || [];
        } catch (err) {
          console.error(`Error fetching transcript ${seg.transcriptId}:`, err);
          return null;
        }
      })
    );
    
    // Flatten and filter out nulls
    const existingParagraphs = (segmentsWithContent
      .filter(Boolean)
      .flat() as Paragraph[])
      .sort((a, b) => a.start - b.start);

    // For finished videos, check if we have a complete transcript
    if (isComplete) {
      const hasCompleteTranscript = existingSegments.some(
        seg => seg.start === 0 && seg.end >= (totalDuration || 0)
      );
      
      if (hasCompleteTranscript) {
        return NextResponse.json({
          existingSegments: existingParagraphs,
          gaps: [],
          needsFullRetranscription: false,
        });
      } else if (existingSegments.length > 0) {
        // Has partial transcripts but no complete one
        return NextResponse.json({
          existingSegments: existingParagraphs,
          gaps: [],
          needsFullRetranscription: true,
        });
      } else {
        // No transcripts at all
        return NextResponse.json({
          existingSegments: [],
          gaps: [{ start: 0, end: totalDuration || 0 }],
          needsFullRetranscription: false,
        });
      }
    }

    // For live videos, find gaps up to current time
    const targetEnd = currentTime || totalDuration || 0;
    const gaps: Gap[] = [];
    
    if (existingSegments.length === 0) {
      // No transcripts at all
      gaps.push({ start: 0, end: targetEnd });
    } else {
      // Check for gap at the start
      if (existingSegments[0].start > 0) {
        gaps.push({ start: 0, end: existingSegments[0].start });
      }
      
      // Check for gaps between segments
      for (let i = 0; i < existingSegments.length - 1; i++) {
        const currentEnd = existingSegments[i].end;
        const nextStart = existingSegments[i + 1].start;
        
        if (nextStart > currentEnd) {
          gaps.push({ start: currentEnd, end: nextStart });
        }
      }
      
      // Check for gap at the end
      const lastSegment = existingSegments[existingSegments.length - 1];
      if (lastSegment.end < targetEnd) {
        gaps.push({ start: lastSegment.end, end: targetEnd });
      }
    }

    return NextResponse.json({
      existingSegments: existingParagraphs,
      gaps,
      needsFullRetranscription: false,
    });
    
  } catch (error) {
    console.error('Segment analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

