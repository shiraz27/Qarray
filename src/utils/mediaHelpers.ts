import { isMediaToken, tokenInnerPath } from '@/utils/mediaToken';

export interface MediaFile {
  url: string;
  type: 'image' | 'video' | 'audio' | 'pdf' | 'unknown';
  displayName: string;
}

export function extractMediaFromText(text: string): { text: string; media: MediaFile[] } {
  // Pre-process: encode spaces in plain http(s) URLs before extraction.
  // Tokens (arc1://) never contain spaces, so they are safe to leave alone.
  const processedText = text.replace(/(https?:\/\/[^\n]+?)(?=\s*(?:https?:\/\/|arc1:\/\/|$|\n|Attachments:))/g, (match) =>
    match.replace(/ /g, '%20'),
  );

  // Extract opaque tokens AND raw URLs (legacy data).
  const tokenOrUrlRegex = /(arc1:\/\/[A-Za-z0-9_-]+|https?:\/\/[^\s\n]+)/g;
  const urls = processedText.match(tokenOrUrlRegex) || [];

  // Strip extracted refs from the visible text.
  const cleanText = processedText
    .replace(tokenOrUrlRegex, '')
    .replace(/Attachments:\s*/g, '')
    .trim();

  const media: MediaFile[] = urls.map((url): MediaFile => {
    // For type detection, work against the token's *decoded* path so the
    // existing `-pdf` / `-png` heuristics keep working. For raw URLs this is
    // a no-op.
    const detectionTarget = isMediaToken(url) ? tokenInnerPath(url) : url;
    const lowerUrl = detectionTarget.toLowerCase();
    
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
      return {
        url,
        type: 'video' as const,
        displayName: '📹 YouTube Video'
      };
    }

    // Split-PDF manifest: render as a single PDF attachment.
    if (
      lowerUrl.includes('/pages/manifest.json') ||
      lowerUrl.includes('/pages/manifest-json')
    ) {
      return {
        url,
        type: 'pdf' as const,
        displayName: '📄 PDF Document (multi-page)',
      };
    }

    // Check for PDF (with dot or dash for Archive.org sanitized URLs)
    if (lowerUrl.includes('.pdf') || lowerUrl.endsWith('-pdf') || lowerUrl.includes('-pdf/') || lowerUrl.includes('-pdf?')) {
      return {
        url,
        type: 'pdf' as const,
        displayName: '📄 PDF Document'
      };
    }
    
    // Check for images (with dot or dash for Archive.org sanitized URLs)
    if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)/i) || 
        lowerUrl.match(/-(jpg|jpeg|png|gif|webp)($|[/?#])/i) ||
        lowerUrl.includes('image')) {
      return {
        url,
        type: 'image' as const,
        displayName: '📷 Image'
      };
    }
    
    // Check for audio (with dot or dash for Archive.org sanitized URLs)
    if (lowerUrl.match(/\.(mp3|wav|webm|ogg|m4a)/i) || 
        lowerUrl.match(/-(mp3|wav|webm|ogg|m4a)($|[/?#])/i) ||
        lowerUrl.includes('audio')) {
      // Extract recording number from the decoded path when present.
      const recordingMatch = detectionTarget.match(/recording-(\d+)/);
      if (recordingMatch) {
        return {
          url,
          type: 'audio' as const,
          displayName: `🎵 Recording #${recordingMatch[1]}`
        };
      }
      
      const filename = detectionTarget.split('/').pop() || 'Audio';
      return {
        url,
        type: 'audio' as const,
        displayName: `🎤 ${decodeURIComponent(filename)}`
      };
    }
    
    return {
      url,
      type: 'unknown' as const,
      displayName: '📎 File'
    };
  });
  
  return { text: cleanText, media };
}
