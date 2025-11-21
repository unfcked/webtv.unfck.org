import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { transcriptId } = await request.json();
    
    if (!transcriptId) {
      return NextResponse.json({ error: 'Transcript ID required' }, { status: 400 });
    }

    // Check transcript status
    const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
    });

    if (!pollResponse.ok) {
      return NextResponse.json({ error: 'Failed to poll status' }, { status: 500 });
    }

    const transcript = await pollResponse.json();

    if (transcript.status === 'completed') {
      // Fetch paragraphs
      const paragraphsResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}/paragraphs`, {
        headers: { 'Authorization': process.env.ASSEMBLYAI_API_KEY! },
      });

      const paragraphsData = paragraphsResponse.ok ? await paragraphsResponse.json() : null;

      return NextResponse.json({
        status: 'completed',
        text: transcript.text,
        words: transcript.words || [],
        paragraphs: paragraphsData?.paragraphs || null,
        language: transcript.language_code,
        transcriptId,
      });
    } else if (transcript.status === 'error') {
      return NextResponse.json({
        status: 'error',
        error: transcript.error,
      });
    } else {
      return NextResponse.json({
        status: transcript.status, // 'queued' or 'processing'
      });
    }
    
  } catch (error) {
    console.error('Poll error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

