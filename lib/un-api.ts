export interface Video {
  id: string;
  url: string;
  title: string;
  cleanTitle: string;
  category: string;
  duration: string;
  date: string;
  scheduledTime: string | null;
  status: 'finished' | 'live' | 'scheduled';
  eventCode: string | null;
  eventType: string | null;
  body: string | null; // UN body (committee, council, assembly, etc.)
  sessionNumber: string | null;
  partNumber: number | null;
}

function extractTextContent(html: string): string {
  const text = html.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ');
  // Decode HTML entities
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function calculateStatus(scheduledTime: string | null, duration: string): 'finished' | 'live' | 'scheduled' {
  if (!scheduledTime) return 'finished';
  
  const now = new Date();
  const startTime = new Date(scheduledTime);
  
  // Parse duration (format: HH:MM:SS)
  const [hours, minutes, seconds] = duration.split(':').map(Number);
  const durationMs = (hours * 3600 + minutes * 60 + seconds) * 1000;
  const endTime = new Date(startTime.getTime() + durationMs);
  
  if (now < startTime) {
    return 'scheduled';
  } else if (now >= startTime && now <= endTime) {
    return 'live';
  } else {
    return 'finished';
  }
}

function decodeEventCode(code: string): string {
  const eventTypes: Record<string, string> = {
    'EM': 'Event - Ministerial',
    'GO': 'Global Occasion',
    'IM': 'Interactive Meeting',
    'WD': 'Water Dialogue',
    'SD': 'Strategic Dialogue',
    'ST': 'Strategic Session',
    'YM': 'Youth Meeting',
  };
  
  const prefix = code.substring(0, 2);
  return eventTypes[prefix] || `Event ${code}`;
}

function cleanTitle(title: string, metadata: {
  eventCode: string | null;
  body: string | null;
  sessionNumber: string | null;
  partNumber: number | null;
}): string {
  let cleaned = title;
  
  // Remove event code prefix only
  if (metadata.eventCode) {
    cleaned = cleaned.replace(new RegExp(`^${metadata.eventCode}\\s*-\\s*`), '');
  }
  
  return cleaned.trim();
}

function extractMetadataFromTitle(title: string, category?: string) {
  const metadata = {
    eventCode: null as string | null,
    eventType: null as string | null,
    body: null as string | null,
    sessionNumber: null as string | null,
    partNumber: null as number | null,
  };

  // Extract event code (e.g., "EM07", "GO19")
  const eventCodeMatch = title.match(/^([A-Z]{2}\d{2})\s*-\s*/);
  if (eventCodeMatch) {
    metadata.eventCode = eventCodeMatch[1];
    metadata.eventType = decodeEventCode(eventCodeMatch[1]);
  }

  // Extract committee (First, Second, Third, Fourth, Fifth, Sixth)
  const committeeMatch = title.match(/(First|Second|Third|Fourth|Fifth|Sixth) Committee/);
  if (committeeMatch) {
    metadata.body = committeeMatch[0];
  }
  
  // If no committee found, check category for councils/assemblies
  if (!metadata.body && category) {
    const councilMatch = category.match(/General Assembly|Security Council|Economic and Social Council|Trusteeship Council/i);
    if (councilMatch) {
      metadata.body = councilMatch[0];
    }
  }

  // Extract session number (e.g., "9th plenary meeting", "80th session")
  const sessionMatch = title.match(/(\d+)(?:st|nd|rd|th) (?:plenary meeting|session)/);
  if (sessionMatch) metadata.sessionNumber = sessionMatch[0];

  // Extract part number
  const partMatch = title.match(/\(Part (\d+)\)/i);
  if (partMatch) metadata.partNumber = parseInt(partMatch[1]);

  return metadata;
}

async function fetchVideosForDate(date: string): Promise<Video[]> {
  const response = await fetch(`https://webtv.un.org/en/schedule/${date}`, {
    next: { revalidate: 300 }
  });
  
  const html = await response.text();
  const videos: Video[] = [];
  const seen = new Set<string>();
  
  const videoBlockPattern = /<h6[^>]*>([^<]+)<\/h6>[\s\S]*?<h4[^>]*>[\s\S]*?href="\/en\/asset\/([^"]+)"[^>]*>[\s\S]*?<div class="field__item">([^<]+)<\/div>/g;
  
  for (const match of html.matchAll(videoBlockPattern)) {
    const [, category, assetId, title] = match;
    
    if (seen.has(assetId)) continue;
    seen.add(assetId);
    
    // Extract duration
    const durationPattern = new RegExp(`<span class="badge[^"]*">(\\d{2}:\\d{2}:\\d{2})<\\/span>[\\s\\S]{0,500}?href="\\/en\\/asset\\/${assetId.replace(/\//g, '\\/')}"`);
    const durationMatch = html.match(durationPattern);
    
    // Extract scheduled time (ISO timestamp with timezone)
    const timePattern = new RegExp(`<div class="d-none mediaun-timezone"[^>]*>([^<]+)</div>[\\s\\S]{0,500}?href="\\/en\\/asset\\/${assetId.replace(/\//g, '\\/').replace(/\(/g, '\\(').replace(/\)/g, '\\)')}"`);
    const timeMatch = html.match(timePattern);
    const scheduledTime = timeMatch?.[1] || null;
    
    // Extract metadata from title and category
    const rawTitle = extractTextContent(title);
    const categoryText = extractTextContent(category);
    const titleMetadata = extractMetadataFromTitle(rawTitle, categoryText);
    const titleCleaned = cleanTitle(rawTitle, titleMetadata);
    
    const duration = durationMatch?.[1] || '00:00:00';
    const status = calculateStatus(scheduledTime, duration);
    
    videos.push({
      id: assetId,
      url: `https://webtv.un.org/en/asset/${assetId}`,
      title: rawTitle,
      cleanTitle: titleCleaned,
      category: categoryText,
      duration,
      date,
      scheduledTime,
      status,
      ...titleMetadata,
    });
  }
  
  return videos;
}

export async function getScheduleVideos(days: number = 7): Promise<Video[]> {
  const dates: string[] = [];
  const today = new Date();
  
  // Fetch tomorrow's videos
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  dates.push(formatDate(tomorrow));
  
  // Fetch videos from the past N days
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(formatDate(date));
  }
  
  // Fetch all dates in parallel
  const results = await Promise.all(dates.map(fetchVideosForDate));
  const allVideos = results.flat();
  
  // Remove duplicates by ID
  const uniqueVideos = Array.from(
    new Map(allVideos.map(v => [v.id, v])).values()
  );
  
  // Sort by date descending (newest first)
  return uniqueVideos.sort((a, b) => b.date.localeCompare(a.date));
}

