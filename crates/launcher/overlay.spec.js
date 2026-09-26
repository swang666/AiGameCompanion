import { expect, test } from '@playwright/test';

test('switching games keeps their chats separate and renders safe source links', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const callbacks = new Map();
    const listeners = new Map();
    const sent = [];
    const savedModels = [];
    const zoomValues = [];
    let nextCallback = 1;
    let nextCapture = 1;
    window.__fake = {
      sent,
      savedModels,
      zoomValues,
      listeners,
      emit(event, payload) {
        callbacks.get(listeners.get(event))?.({ event, payload, id: 1 });
      },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'overlay' },
        currentWebview: { label: 'overlay' },
      },
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
        if (command === 'get_settings')
          return {
            active_provider: 'claude',
            text_size: 'normal',
            model_overrides: { claude: 'haiku', openai: 'my-codex-model' },
          };
        if (command === 'plugin:webview|set_webview_zoom') {
          zoomValues.push(args.value);
          return null;
        }
        if (command === 'set_text_size') {
          window.__fake.emit('text-size-changed', args.size);
          return null;
        }
        if (command === 'set_model_override') {
          savedModels.push(args);
          return null;
        }
        if (command === 'available_providers')
          return { claude: true, openai: true, openai_images: true, gemini: true };
        if (command === 'voice_status') return { ready: true, message: 'Local voice' };
        if (command === 'transcribe_voice') {
          window.__fake.wav = args.wav;
          window.__fake.language = args.language;
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
  await expect(page.getByRole('combobox', { name: 'Model for claude' })).toHaveValue('haiku');
  await expect(page.locator('#model-choice option')).toHaveText([
    'Default (Sonnet)',
    'Sonnet',
    'Opus',
    'Haiku',
    'Custom model…',
  ]);
  await page.getByRole('combobox', { name: 'Model for claude' }).selectOption('opus');
  await page.getByRole('textbox', { name: 'Your question' }).fill('Question A');
  await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__fake.savedModels.some((x) => x.model === 'opus')))
    .toBe(true);
  expect((await page.evaluate(() => window.__fake.sent))[0].model).toBe('opus');
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
  await page.getByRole('button', { name: 'Codex' }).click();
  await expect(page.getByRole('combobox', { name: 'Model for openai' })).toHaveValue('custom');
  await expect(page.getByRole('textbox', { name: 'Custom model for openai' })).toHaveValue(
    'my-codex-model',
  );
  await page.getByRole('textbox', { name: 'Custom model for openai' }).fill('gpt-6-sol');
  await expect(page.getByRole('textbox', { name: 'Custom model for openai' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Model for openai' }).selectOption('gpt-6-sol');
  await expect(page.getByRole('textbox', { name: 'Custom model for openai' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Model for openai' }).selectOption('custom');
  await page.getByRole('textbox', { name: 'Your question' }).fill('Question B');
  await page.getByRole('textbox', { name: 'Custom model for openai' }).fill('bad/model');
  await expect(page.getByRole('button', { name: 'Send ↑' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Custom model for openai' }).fill('my-new-codex-model');
  await page.getByRole('button', { name: 'Send ↑' }).click();
  const sent = await page.evaluate(() => window.__fake.sent);
  expect(sent[1].messages).toEqual([{ role: 'user', content: 'Question B' }]);
  expect(sent[1].model).toBe('my-new-codex-model');
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();
  await page.getByRole('combobox', { name: 'Model for gemini' }).selectOption('gemini-3.8-flash');
  await expect
    .poll(() => page.evaluate(() => window.__fake.savedModels.at(-1)))
    .toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
  await page.getByRole('combobox', { name: 'Model for gemini' }).selectOption('');
  await expect
    .poll(() => page.evaluate(() => window.__fake.savedModels.at(-1)))
    .toEqual({ provider: 'gemini', model: '' });
  await page.getByRole('textbox', { name: 'Your question' }).fill('Use the default model');
  await page.getByRole('button', { name: 'Send ↑' }).click();
  await expect.poll(() => page.evaluate(() => window.__fake.sent.at(-1).model)).toBeNull();
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Model for claude' })).toHaveValue('opus');
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
  await expect(page.getByRole('combobox', { name: 'Speech language' })).toHaveValue('zh');
  await expect(page.getByRole('button', { name: '■ Finish speaking' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '■ Finish speaking' }).click();
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue(
    'Where should I go?',
  );
  expect(await page.evaluate(() => atob(window.__fake.wav).slice(0, 4))).toBe('RIFF');
  expect(await page.evaluate(() => window.__fake.language)).toBe('zh');
  await page.getByRole('combobox', { name: 'Speech language' }).selectOption('en');
  expect(await page.evaluate(() => localStorage.getItem('sage-speech-language'))).toBe('en');

  await page.getByRole('button', { name: 'Increase text size' }).click();
  await expect.poll(() => page.evaluate(() => window.__fake.zoomValues.at(-1))).toBe(1.15);
  await page.getByRole('button', { name: 'Increase text size' }).click();
  await expect.poll(() => page.evaluate(() => window.__fake.zoomValues.at(-1))).toBe(1.3);
  await expect(page.locator('.subtitle')).toBeHidden();
});

test('overlay updates when startup CLI detection finishes', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks = new Map();
    const listeners = new Map();
    let nextCallback = 1;
    let detected = false;
    window.__fake = {
      finishDetection() {
        detected = true;
        callbacks.get(listeners.get('provider-availability-changed'))?.({
          event: 'provider-availability-changed',
          payload: {
            claude: true,
            openai: false,
            openai_images: false,
            gemini: false,
          },
          id: 1,
        });
      },
    };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'overlay' },
        currentWebview: { label: 'overlay' },
      },
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
        if (command === 'plugin:webview|set_webview_zoom') return null;
        if (command === 'available_providers')
          return {
            claude: detected,
            openai: false,
            openai_images: false,
            gemini: false,
          };
        if (command === 'voice_status') return { ready: true, message: 'Local voice' };
        return null;
      },
    };
  });
  await page.goto('/');
  await expect(page.getByText(/No assistant detected/)).toBeVisible();
  await page.evaluate(() => window.__fake.finishDetection());
  await expect(page.getByText(/No assistant detected/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Claude' })).toBeEnabled();
});
