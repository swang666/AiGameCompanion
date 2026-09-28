import { describe, expect, it } from 'vitest';
import { answerVideos, embedUrl, youtubeVideo } from './video';

describe('video cards', () => {
  it('accepts supported YouTube URLs, preserves timestamps, and strips tracking', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=1m23s&si=tracking',
      'https://youtu.be/M7lc1UVf-VE?t=83',
      'https://m.youtube.com/shorts/M7lc1UVf-VE#t=83s',
      'https://www.youtube.com/live/M7lc1UVf-VE?start=83',
      'https://www.youtube.com/embed/M7lc1UVf-VE?start=83',
    ]) {
      expect(youtubeVideo(url)).toMatchObject({
        id: 'M7lc1UVf-VE',
        start: 83,
        url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=83s',
      });
    }
  });

  it('rejects lookalike hosts, credentials, arbitrary embeds, and invalid IDs', () => {
    for (const url of [
      'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',
      'https://evil.test/youtube.com/watch?v=M7lc1UVf-VE',
      'http://youtube.com/watch?v=M7lc1UVf-VE',
      'https://u:p@youtube.com/watch?v=M7lc1UVf-VE',
      'https://youtube.com:8443/watch?v=M7lc1UVf-VE',
      'https://youtube.com/playlist?list=M7lc1UVf-VE',
      'https://youtube.com/watch?v=partial',
      'https://youtu.be/M7lc1UVf-VE/extra',
      '<iframe src="https://youtube.com/embed/M7lc1UVf-VE"></iframe>',
    ])
      expect(youtubeVideo(url)).toBeNull();
  });

  it('deduplicates videos and caps each answer at two', () => {
    const videos = answerVideos(
      '[Puzzle guide](https://youtu.be/M7lc1UVf-VE?t=30) https://www.youtube.com/watch?v=M7lc1UVf-VE https://youtu.be/abcdefghijk https://youtu.be/12345678901',
    );
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ title: 'Puzzle guide', start: 30 });
    const first = videos[0];
    if (!first) throw new Error('Missing video card');
    expect(embedUrl(first, 'http://tauri.localhost')).toContain('/embed/M7lc1UVf-VE?');
    expect(new URL(embedUrl(first, 'http://tauri.localhost')).searchParams.get('start')).toBe('30');
  });

  it('ignores invalid timestamps and leaves ordinary answers alone', () => {
    expect(youtubeVideo('https://youtu.be/M7lc1UVf-VE?t=-20')?.start).toBe(0);
    expect(youtubeVideo('https://youtu.be/M7lc1UVf-VE?t=2h3m4s')?.start).toBe(7384);
    expect(answerVideos('No suitable video found. [Guide](https://example.com)')).toEqual([]);
  });
});
