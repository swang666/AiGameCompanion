import { expect, test } from '@playwright/test';

test('switching games keeps their chats separate and renders safe source links', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const callbacks = new Map();
    const listeners = new Map();
    const sent = [];
    let nextCallback = 1;
    let nextCapture = 1;
    window.__fake = {
      sent,
      listeners,
      emit(event, payload) {
        callbacks.get(listeners.get(event))?.({ event, payload, id: 1 });
      },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'overlay' } },
      transformCallback(callback) {
        const id = nextCallback++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id) {
        callbacks.delete(id);
      },
      async invoke(command, args = {}) {
        if (command === 'plugin:event|listen') {
          listeners.set(args.event, args.handler);
          return nextCallback++;
        }
        if (command === 'get_settings') return { active_provider: 'claude' };
        if (command === 'available_providers')
          return { claude: true, openai: true, openai_images: true, gemini: false };
        if (command === 'voice_status') return { ready: true, message: 'Local voice' };
        if (command === 'transcribe_voice') {
          window.__fake.wav = args.wav;
          return 'Where should I go?';
        }
        if (command === 'capture_game')
          return {
            id: nextCapture++,
            capturedAt: '10:30:00',
            dataUrl:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/hJ0AAAAASUVORK5CYII=',
          };
        if (command === 'ask_sage') {
          sent.push(args.request);
          const callback = callbacks.get(args.channel.id);
          queueMicrotask(() => {
            callback({
              index: 0,
              message: {
                kind: 'status',
                requestId: args.request.requestId,
                conversationId: args.request.conversationId,
                text: 'Searching the web…',
              },
            });
            callback({
              index: 1,
              message: {
                kind: 'chunk',
                requestId: args.request.requestId,
                conversationId: args.request.conversationId,
                text: 'See [Steam](https://store.steampowered.com/app/251290/). <script>bad()</script>',
              },
            });
            callback({
              index: 2,
              message: {
                kind: 'done',
                requestId: args.request.requestId,
                conversationId: args.request.conversationId,
              },
            });
          });
          return null;
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => window.__fake.listeners.has('overlay-status')))
    .toBe(true);
  await page.evaluate(() =>
    window.__fake.emit('overlay-status', {
      hwnd: 10,
      pid: 20,
      exe: 'C:\\Games\\A.exe',
      title: 'Game A',
    }),
  );
  await expect(page.getByAltText('Game frame that will be sent with your question')).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question' }).fill('Question A');
  await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect(page.getByRole('button', { name: 'Steam' })).toBeVisible();
  await page.screenshot({ path: 'test-results/overlay.png' });
  expect(await page.evaluate(() => typeof window.bad)).toBe('undefined');
  await page.evaluate(() =>
    window.__fake.emit('overlay-status', {
      hwnd: 11,
      pid: 21,
      exe: 'C:\\Games\\B.exe',
      title: 'Game B',
    }),
  );
  await expect(page.getByRole('textbox', { name: 'PLAYING edit if needed' })).toHaveValue('Game B');
  await expect(page.getByText('Question A')).toHaveCount(0);
  await expect(page.getByAltText('Game frame that will be sent with your question')).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question' }).fill('Question B');
  await page.getByRole('button', { name: 'Send ↑' }).click();
  const sent = await page.evaluate(() => window.__fake.sent);
  expect(sent[1].messages).toEqual([{ role: 'user', content: 'Question B' }]);
  await page.evaluate(() =>
    window.__fake.emit('overlay-status', {
      hwnd: 12,
      pid: 20,
      exe: 'C:\\Games\\A.exe',
      title: 'Game A',
    }),
  );
  await expect(page.getByText('Question A')).toBeVisible();
  await page.getByRole('button', { name: '● Speak' }).click();
  await expect(page.getByRole('button', { name: '■ Finish speaking' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '■ Finish speaking' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue(
    'Where should I go?',
  );
  expect(await page.evaluate(() => atob(window.__fake.wav).slice(0, 4))).toBe('RIFF');
});
