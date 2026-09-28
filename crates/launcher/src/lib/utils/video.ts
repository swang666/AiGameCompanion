import { answerParts } from './research';

export interface Video {
  id: string;
  title: string;
  start: number;
  url: string;
}

function timestamp(value: string): number {
  if (/^\d+$/.test(value)) return Math.min(Number(value), 604800);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return 0;
  return Math.min(
    Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0),
    604800,
  );
}

/** Accept exact provider hosts and video IDs, never model-provided embed markup. */
export function youtubeVideo(raw: string, title = ''): Video | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const path = url.pathname.split('/').filter(Boolean);
    let id: string | null = null;
    if (url.hostname === 'youtu.be' && path.length === 1) id = path[0] ?? null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (path.length === 2 && ['embed', 'shorts', 'live'].includes(path[0] ?? ''))
        id = path[1] ?? null;
    }
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const fragment = new URLSearchParams(url.hash.slice(1));
    const start = timestamp(
      url.searchParams.get('t') ?? url.searchParams.get('start') ?? fragment.get('t') ?? '',
    );
    const canonical = `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;
    return {
      id,
      start,
      url: canonical,
      title: title && title !== raw ? title : 'Related YouTube video',
    };
  } catch {
    return null;
  }
}

export function answerVideos(text: string): Video[] {
  const videos: Video[] = [];
  for (const part of answerParts(text)) {
    if (!part.url) continue;
    const video = youtubeVideo(part.url, part.text);
    if (video && !videos.some((item) => item.id === video.id)) videos.push(video);
    if (videos.length === 2) break;
  }
  return videos;
}

export function embedUrl(video: Video, origin: string): string {
  const url = new URL(`https://www.youtube.com/embed/${video.id}`);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('origin', origin);
  if (video.start) url.searchParams.set('start', String(video.start));
  return url.href;
}

export function videoTime(seconds: number): string {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .slice(seconds >= 3600 ? 0 : 1)
    .map((part, index) => (index ? String(part).padStart(2, '0') : String(part)))
    .join(':');
}
