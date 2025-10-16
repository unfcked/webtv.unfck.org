import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function POST(request: NextRequest) {
  try {
    const { kalturaId, checkOnly, force } = await request.json();
    
    if (!kalturaId) {
      return NextResponse.json({ error: 'Kaltura ID is required' }, { status: 400 });
    }

    // If force is true, delete the cache
    if (force) {
      console.log('Force retranscribe: deleting cache for', kalturaId);
      await redis.del(`transcript:${kalturaId}`);
    }

    // Check if we already have a cached transcript for this video (unless force is true)
    if (!force) {
      const cachedStr = await redis.get(`transcript:${kalturaId}`);
      const cached = cachedStr ? JSON.parse(cachedStr) as { transcription_id: string; created_at: string } : null;
      
      if (cached?.transcription_id) {
        try {
          const getResponse = await fetch(
            `https://api.elevenlabs.io/v1/speech-to-text/transcripts/${cached.transcription_id}`,
            {
              headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY!,
              },
            }
          );

          if (getResponse.ok) {
            const transcription = await getResponse.json();
            return NextResponse.json({
              text: transcription.text,
              words: transcription.words,
              language: transcription.language_code,
              cached: true,
            });
          }
        } catch (error) {
          console.log('Failed to fetch cached transcript, will regenerate:', error);
        }
      }
    }

    // If checkOnly is true, don't generate a new transcript
    if (checkOnly) {
      return NextResponse.json({ cached: false, text: null });
    }

    // Get video metadata and download URL from Kaltura API
    const apiResponse = await fetch('https://cdnapisec.kaltura.com/api_v3/service/multirequest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
          filter: {
            redirectFromEntryId: kalturaId,
          },
          responseProfile: {
            type: 1,
            fields: 'id,downloadUrl,duration',
          },
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
    
    // Extract download URL from the response
    const downloadUrl = apiData[1]?.objects?.[0]?.downloadUrl;
    
    if (!downloadUrl) {
      return NextResponse.json({ error: 'No download URL found for this video' }, { status: 404 });
    }

    // Use cloud_storage_url instead of uploading the file directly
    // This lets ElevenLabs fetch the video directly from Kaltura
    console.log('Using cloud storage URL for transcription:', downloadUrl);
    
    // Prepare form data for ElevenLabs API
    const formData = new FormData();
    formData.append('model_id', 'scribe_v1_experimental');
    formData.append('cloud_storage_url', downloadUrl);
    formData.append('diarize', 'true');
    formData.append('timestamps_granularity', 'word');
    
    console.log('Sending transcription request to ElevenLabs...');
    const transcriptionResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: formData,
    });
    
    console.log('ElevenLabs response status:', transcriptionResponse.status);
    
    if (!transcriptionResponse.ok) {
      const error = await transcriptionResponse.text();
      console.error('ElevenLabs error:', error);
      return NextResponse.json({ error: `Transcription failed: ${error}` }, { status: 500 });
    }
    
    const transcription = await transcriptionResponse.json();
    console.log('Transcription response keys:', Object.keys(transcription));
    console.log('Transcription response:', JSON.stringify(transcription).substring(0, 500));
    
    // Debug: Check word structure
    if (transcription.words && transcription.words.length > 0) {
      console.log('First word sample:', JSON.stringify(transcription.words[0]));
      console.log('Total words:', transcription.words.length);
    }
    
    // Store the transcription_id in Redis for future use
    if (transcription.transcription_id) {
      console.log('Storing transcription_id in Redis:', transcription.transcription_id);
      try {
        await redis.set(
          `transcript:${kalturaId}`,
          JSON.stringify({
            transcription_id: transcription.transcription_id,
            created_at: new Date().toISOString(),
          })
        );
        console.log('Successfully stored in Redis');
      } catch (redisError) {
        console.error('Failed to store in Redis:', redisError);
      }
    } else {
      console.log('No transcription_id in response, cannot cache');
    }
    
    return NextResponse.json({
      text: transcription.text,
      words: transcription.words,
      language: transcription.language_code,
      cached: false,
    });
    
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

