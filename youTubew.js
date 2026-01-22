export default {
  async fetch(request) {
    const url = new URL(request.url);
    const youtubeUrl = url.searchParams.get('url');
    
    // CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (!youtubeUrl) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'YouTube URL parameter is required',
          example: '?url=https://www.youtube.com/watch?v=VIDEO_ID',
          channel: '@mrshaban282'
        }, null, 2),
        { status: 400, headers }
      );
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      return new Response(
        JSON.stringify({
          status: 'error',
          message: 'Invalid YouTube URL',
          channel: '@mrshaban282'
        }, null, 2),
        { status: 400, headers }
      );
    }

    try {
      // Method 1: Direct YouTube streaming data extraction
      const result1 = await extractYouTubeStreamingData(videoId);
      if (result1) return successResponse(result1, headers);

      // Method 2: YouTube player API
      const result2 = await getYouTubePlayerData(videoId);
      if (result2) return successResponse(result2, headers);

      // Method 3: YouTube embed data
      const result3 = await getYouTubeEmbedData(videoId);
      if (result3) return successResponse(result3, headers);

      // Method 4: Using invidious instance (open source YouTube frontend)
      const result4 = await tryInvidious(videoId);
      if (result4) return successResponse(result4, headers);

    } catch (err) {
      console.log('All methods failed:', err.message);
    }

    // Final fallback - provide direct tools
    return new Response(
      JSON.stringify({
        status: 'info',
        message: 'Use these direct tools for download',
        videoId: videoId,
        direct_tools: [
          `https://vd6s.com/watch?v=${videoId}`,
          `https://y2mate.com/youtube/${videoId}`,
          `https://en.y2mate.net/youtube/${videoId}`,
          `https://yt5s.com/en?q=https://youtube.com/watch?v=${videoId}`
        ],
        quick_method: 'Add "ss" before youtube in URL',
        example: `https://vd6s.com/watch?v=${videoId}`,
        channel: '@mrshaban282'
      }, null, 2),
      { headers }
    );
  }
};

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/,
    /youtube\.com\/embed\/([^&?#]+)/,
    /youtube\.com\/v\/([^&?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function successResponse(data, headers) {
  data.channel = '@mrshaban282';
  return new Response(JSON.stringify(data, null, 2), { headers });
}

// Method 1: Extract streaming data directly from YouTube
async function extractYouTubeStreamingData(videoId) {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });

    if (response.ok) {
      const html = await response.text();
      
      // Extract video title
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'YouTube Video';
      
      // Try to find ytInitialPlayerResponse
      const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*var/);
      if (playerResponseMatch) {
        const playerData = JSON.parse(playerResponseMatch[1]);
        return processYouTubePlayerData(playerData, videoId, title);
      }

      // Try alternative pattern
      const altMatch = html.match(/var ytInitialPlayerResponse = ({.+?});<\/script>/);
      if (altMatch) {
        const playerData = JSON.parse(altMatch[1]);
        return processYouTubePlayerData(playerData, videoId, title);
      }

      // Try window.ytInitialPlayerResponse pattern
      const windowMatch = html.match(/window\["ytInitialPlayerResponse"\] = ({.+?});<\/script>/);
      if (windowMatch) {
        const playerData = JSON.parse(windowMatch[1]);
        return processYouTubePlayerData(playerData, videoId, title);
      }
    }
  } catch (err) {
    console.log('YouTube streaming extraction failed:', err.message);
  }
  return null;
}

function processYouTubePlayerData(playerData, videoId, title) {
  const formats = [];
  
  // Extract streaming formats
  if (playerData.streamingData && playerData.streamingData.formats) {
    playerData.streamingData.formats.forEach(format => {
      if (format.url || format.signatureCipher) {
        const quality = format.qualityLabel || `${format.height}p` || 'unknown';
        let url = format.url;
        
        // Handle signatureCipher if present
        if (format.signatureCipher) {
          const cipherParams = new URLSearchParams(format.signatureCipher);
          url = cipherParams.get('url');
        }
        
        if (url) {
          formats.push({
            quality: quality,
            url: url,
            type: format.mimeType || 'video/mp4',
            width: format.width || null,
            height: format.height || null,
            fps: format.fps || null
          });
        }
      }
    });
  }

  // Extract adaptive formats (higher quality)
  if (playerData.streamingData && playerData.streamingData.adaptiveFormats) {
    playerData.streamingData.adaptiveFormats.forEach(format => {
      if (format.url || format.signatureCipher) {
        const quality = format.qualityLabel || 
                       (format.audioQuality ? 'audio' : 'unknown') ||
                       `${format.height}p` || 'unknown';
        
        let url = format.url;
        
        if (format.signatureCipher) {
          const cipherParams = new URLSearchParams(format.signatureCipher);
          url = cipherParams.get('url');
        }
        
        if (url) {
          const isAudio = format.mimeType && format.mimeType.includes('audio');
          
          formats.push({
            quality: quality,
            url: url,
            type: format.mimeType || (isAudio ? 'audio/mp4' : 'video/mp4'),
            width: format.width || null,
            height: format.height || null,
            fps: format.fps || null,
            audio: isAudio
          });
        }
      }
    });
  }

  if (formats.length > 0) {
    // Get video details
    const videoDetails = playerData.videoDetails || {};
    
    return {
      status: 'success',
      videoId: videoId,
      title: videoDetails.title || title,
      duration: formatDuration(videoDetails.lengthSeconds),
      author: videoDetails.author || '',
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      formats: formats,
      source: 'youtube-direct',
      message: 'Direct streaming links from YouTube'
    };
  }

  return null;
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Method 2: YouTube player API
async function getYouTubePlayerData(videoId) {
  try {
    const embedUrl = `https://www.youtube.com/embed/${videoId}`;
    
    const response = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.ok) {
      const html = await response.text();
      
      // Extract player config
      const configMatch = html.match(/yt\.setConfig\(({.+?})\);/);
      if (configMatch) {
        const config = JSON.parse(configMatch[1]);
        if (config.VIDEO_INFO) {
          const videoInfo = new URLSearchParams(config.VIDEO_INFO);
          const title = videoInfo.get('title') || 'YouTube Video';
          
          return {
            status: 'success',
            videoId: videoId,
            title: title,
            thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            message: 'Video information extracted',
            direct_download: `https://vd6s.com/watch?v=${videoId}`,
            source: 'youtube-embed'
          };
        }
      }
    }
  } catch (err) {
    console.log('YouTube player API failed:', err.message);
  }
  return null;
}

// Method 3: YouTube embed data
async function getYouTubeEmbedData(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.ok) {
      const data = await response.json();
      
      return {
        status: 'success',
        videoId: videoId,
        title: data.title || 'YouTube Video',
        author: data.author_name || '',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        message: 'Use direct download tools below',
        download_tools: [
          `https://vd6s.com/watch?v=${videoId}`,
          `https://y2mate.com/youtube/${videoId}`,
          `https://en.y2mate.net/youtube/${videoId}`
        ],
        source: 'youtube-oembed'
      };
    }
  } catch (err) {
    console.log('YouTube oembed failed:', err.message);
  }
  return null;
}

// Method 4: Invidious (open source YouTube frontend)
async function tryInvidious(videoId) {
  try {
    // Try different invidious instances
    const instances = [
      'https://invidious.snopyta.org',
      'https://yewtu.be',
      'inv.nadeko.net'
    ];

    for (const instance of instances) {
      try {
        const apiUrl = `${instance}/api/v1/videos/${videoId}`;
        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const data = await response.json();
          
          const formats = [];
          if (data.formatStreams) {
            data.formatStreams.forEach(stream => {
              if (stream.url) {
                formats.push({
                  quality: stream.quality || 'unknown',
                  url: stream.url,
                  type: stream.type || 'video/mp4',
                  container: stream.container || 'mp4'
                });
              }
            });
          }

          return {
            status: 'success',
            videoId: videoId,
            title: data.title || 'YouTube Video',
            duration: data.duration ? formatDuration(data.duration) : '',
            author: data.author || '',
            thumbnail: data.videoThumbnails ? data.videoThumbnails[0]?.url : `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
            formats: formats,
            source: 'invidious'
          };
        }
      } catch (err) {
        continue;
      }
    }
  } catch (err) {
    console.log('Invidious failed:', err.message);
  }
  return null;
}
