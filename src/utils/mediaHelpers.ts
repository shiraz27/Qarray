export interface MediaFile {
  url: string;
  type: 'image' | 'video' | 'audio' | 'pdf' | 'unknown';
  displayName: string;
}

export function extractMediaFromText(text: string): { text: string; media: MediaFile[] } {
  // Pre-process: encode spaces in URLs before extraction
  const processedText = text.replace(/(https?:\/\/[^\n]+?)(?=\s*(?:https?:\/\/|$|\n|Attachments:))/g, (match) => 
    match.replace(/ /g, '%20')
  );
  
  // Extract URLs from text
  const urlRegex = /(https?:\/\/[^\s\n]+)/g;
  const urls = processedText.match(urlRegex) || [];
  
  // Remove URLs from text to get clean text
  const cleanText = processedText.replace(urlRegex, '').replace(/Attachments:\s*/g, '').trim();
  
  // Categorize each URL
  const media: MediaFile[] = urls.map((url): MediaFile => {
    const lowerUrl = url.toLowerCase();
    
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
      // Extract recording number for archive.org URLs
      const recordingMatch = url.match(/recording-(\d+)/);
      if (recordingMatch) {
        return {
          url,
          type: 'audio' as const,
          displayName: `🎵 Recording #${recordingMatch[1]}`
        };
      }
      
      const filename = url.split('/').pop() || 'Audio';
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
