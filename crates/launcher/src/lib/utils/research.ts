export interface GameTarget {
  hwnd: number;
  pid: number;
  exe: string;
  title: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  complete?: boolean;
  status?: string;
  screenshot?: string | undefined;
}

export function gameKey(game: GameTarget | null): string {
  if (!game) return '';
  return game.exe ? game.exe.replaceAll('\\', '/').toLowerCase() : `${game.pid}:${game.title}`;
}

/** Keep complete exchanges only; interrupted or failed answers are not context. */
export function history(messages: ChatMessage[]): { role: string; content: string }[] {
  const pairs: ChatMessage[][] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const question = messages[i];
    const answer = messages[i + 1];
    if (question?.role === 'user' && answer?.role === 'assistant' && answer.complete) {
      pairs.push([question, answer]);
      i++;
    }
  }
  return pairs
    .slice(-8)
    .flat()
    .map(({ role, content }) => ({ role, content: content.slice(0, 4000) }));
}

export function acceptsEvent(
  active: number,
  conversation: number,
  event: { requestId: number; conversationId: number },
): boolean {
  return active !== 0 && event.requestId === active && event.conversationId === conversation;
}

export interface AnswerPart {
  text: string;
  url?: string;
}

/** Render model text as text, never HTML. Only HTTPS links become interactive. */
export function answerParts(text: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  const pattern = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)|(https:\/\/[^\s<>]+)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    parts.push({ text: text.slice(cursor, index) });
    const raw = (match[2] ?? match[3] ?? '').replace(/[.,;!?]+$/, '');
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Unsafe URL');
      parts.push({ text: match[1] ?? raw, url: url.href });
      if (!match[2]) parts.push({ text: match[0].slice(raw.length) });
    } catch {
      parts.push({ text: match[0] });
    }
    cursor = index + match[0].length;
  }
  parts.push({ text: text.slice(cursor) });
  return parts;
}
