import { describe, expect, it } from 'vitest';
import { acceptsEvent, answerParts, gameKey, history, type ChatMessage } from './research';

describe('conversation boundaries', () => {
  it('keeps only complete exchanges when building the next request', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Where now?' },
      { role: 'assistant', content: 'Head north', complete: true },
      { role: 'user', content: 'What about this?', screenshot: '10:30:00' },
      { role: 'assistant', content: 'partial answer', status: 'Stopped' },
    ];
    expect(history(messages)).toEqual([
      { role: 'user', content: 'Where now?' },
      { role: 'assistant', content: 'Head north' },
    ]);
    expect(acceptsEvent(7, 3, { requestId: 7, conversationId: 3 })).toBe(true);
    expect(acceptsEvent(7, 4, { requestId: 7, conversationId: 3 })).toBe(false);
    expect(acceptsEvent(0, 3, { requestId: 7, conversationId: 3 })).toBe(false);
    expect(gameKey({ hwnd: 1, pid: 4, exe: 'C:\\Games\\A.exe', title: 'A' })).not.toBe(
      gameKey({ hwnd: 2, pid: 5, exe: 'C:\\Games\\B.exe', title: 'B' }),
    );
  });
});

describe('source rendering', () => {
  it('opens only HTTPS URLs without embedded credentials and never parses HTML', () => {
    const parts = answerParts(
      'Guide [Steam](https://store.steampowered.com/app/251150/) <script>bad()</script> https://u:p@example.com',
    );
    expect(parts.some((p) => p.url?.includes('steampowered.com'))).toBe(true);
    expect(parts.some((p) => p.url?.includes('example.com'))).toBe(false);
    expect(parts.map((p) => p.text).join('')).toContain('<script>bad()</script>');
  });
});
