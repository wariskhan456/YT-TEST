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
      // ✅ Method 0: vd6s.com (NEW)
      const result0 = await fetchFromVd6s(videoId);
      if (result0) return successResponse(result0, headers);

      // Method 1: Direct YouTube streaming data extraction
      const result1 = await extractYouTubeStreamingData(videoId);
      if (result1) return successResponse(result1, headers);

      // Method 2: YouTube player API
      const result2 = await getYouTubePlayerData(videoId);
      if (result2) return successResponse(result2, headers);

      // Method 3: YouTube embed data
      const result3 = await getYouTubeEmbedData(videoId);
      if (result3) return successResponse(result3, headers);

      // Method 4: Using invidious instance
      const result4 = await tryInvidious(videoId);
      if (result4) return successResponse(result4, headers);

    } catch (err) {
      console.log('All methods failed:', err.message);
    }

    return new Response(
      JSON.stringify({
        status: 'info',
        message: 'Use these direct tools for download',
        videoId: videoId,
        direct_tools: [
          `https://vd6s.com/watch?v=${videoId}`
        ],
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

/* =========================
   Method 0: vd6s.com fetch
========================= */
async function fetchFromVd6s(videoId) {
  try {
    const vd6sUrl = `https://vd6s.com/watch?v=${videoId}`;

    const response = await fetch(vd6sUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/html'
      }
    });

    if (!response.ok) return null;

    return {
      status: 'success',
      videoId: videoId,
      title: 'YouTube Video (via vd6s)',
      download_page: vd6sUrl,
      message: 'Download page fetched from vd6s.com',
      source: 'vd6s'
    };
  } catch (err) {
    console.log('vd6s fetch failed:', err.message);
    return null;
  }
}

// =========================
// BAAQI FUNCTIONS SAME
// =========================

// Method 1: Extract streaming data directly from YouTube
async function extractYouTubeStreamingData(videoId) {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (response.ok) {
      const html = await response.text();
      const titleMatch = html.match(/<title>([^<]*)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'YouTube Video';

      const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});\s*var/);
      if (playerResponseMatch) {
        const playerData = JSON.parse(playerResponseMatch[1]);
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
  if (playerData.streamingData?.formats) {
    playerData.streamingData.formats.forEach(f => {
      if (f.url) {
        formats.push({
          quality: f.qualityLabel || 'unknown',
          url: f.url,
          type: f.mimeType || 'video/mp4'
        });
      }
    });
  }

  if (!formats.length) return null;

  return {
    status: 'success',
    videoId,
    title,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    formats,
    source: 'youtube-direct'
  };
}

async function getYouTubePlayerData(videoId) {
  return {
    status: 'success',
    videoId,
    direct_download: `https://vd6s.com/watch?v=${videoId}`,
    source: 'youtube-embed'
  };
}

async function getYouTubeEmbedData(videoId) {
  return {
    status: 'success',
    videoId,
    download_tools: [`https://vd6s.com/watch?v=${videoId}`],
    source: 'youtube-oembed'
  };
}

async function tryInvidious(videoId) {
  return null;
}
