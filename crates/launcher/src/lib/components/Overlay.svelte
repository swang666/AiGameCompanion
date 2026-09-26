<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import { invoke, Channel } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import Answer from './Answer.svelte';
  import { VoiceRecorder } from '../utils/audio';
  import {
    acceptsEvent,
    gameKey,
    history,
    type ChatMessage,
    type GameTarget,
  } from '../utils/research';
  import type { Provider } from '../stores/companion.svelte';

  interface Availability {
    gemini: boolean;
    claude: boolean;
    openai: boolean;
    openai_images: boolean;
  }
  interface Preview {
    id: number;
    dataUrl: string;
    capturedAt: string;
  }
  interface SageEvent {
    kind: 'chunk' | 'status' | 'done' | 'error';
    requestId: number;
    conversationId: number;
    text?: string;
    message?: string;
  }
  interface Session {
    title: string;
    messages: ChatMessage[];
    draft: string;
  }
  const providers: { id: Provider; name: string }[] = [
    { id: 'claude', name: 'Claude' },
    { id: 'openai', name: 'Codex' },
    { id: 'gemini', name: 'Gemini' },
  ];
  const sessions = new SvelteMap<string, Session>();
  const recorder = new VoiceRecorder();
  let game = $state<GameTarget | null>(null);
  let session = $state<Session>({ title: '', messages: [], draft: '' });
  let provider = $state<Provider>('claude');
  let models = $state<Record<Provider, string>>({ claude: '', openai: '', gemini: '' });
  const modelPlaceholders: Record<Provider, string> = {
    claude: 'sonnet (default)',
    openai: 'Codex default',
    gemini: 'Gemini config default',
  };
  const modelValid = $derived(
    !models[provider].trim() || /^[A-Za-z0-9._-]{1,128}$/.test(models[provider].trim()),
  );
  let availability = $state<Availability>({
    gemini: false,
    claude: false,
    openai: false,
    openai_images: false,
  });
  let preview = $state<Preview | null>(null);
  let attach = $state(true);
  let hintOnly = $state(true);
  let capturing = $state(false);
  let captureError = $state('');
  let error = $state('');
  let asking = $state(false);
  let voicePhase = $state<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  let voiceReady = $state(false);
  let voiceInfo = $state('Checking local voice…');
  let microphones = $state<MediaDeviceInfo[]>([]);
  let microphone = $state('');
  let input = $state<HTMLTextAreaElement | null>(null);
  let messageList = $state<HTMLElement | null>(null);
  let sequence = 0;
  let activeRequest = 0;
  let conversation = 1;
  let captureSequence = 0;
  let voiceSequence = 0;
  let activeVoice = 0;
  let capturePending: Promise<void> | null = null;
  let availabilityRevision = 0;
  const canSend = $derived(
    Boolean(game) &&
      availability[provider] &&
      modelValid &&
      !asking &&
      !capturing &&
      voicePhase === 'idle' &&
      (!attach || Boolean(preview)),
  );
  const imageSupported = $derived(provider !== 'openai' || availability.openai_images);

  $effect.pre(() => {
    const length = session.messages.length + (session.messages.at(-1)?.content.length ?? 0);
    const el = messageList;
    if (!el || !length || el.scrollHeight - el.scrollTop - el.clientHeight > 70) return;
    void tick().then(() => {
      el.scrollTop = el.scrollHeight;
    });
  });

  function applyAvailability(next: Availability) {
    availability = next;
    if (!availability[provider])
      provider = providers.find((p) => availability[p.id])?.id ?? 'claude';
    if (provider === 'openai' && !availability.openai_images && attach) toggleCapture();
  }
  async function refresh() {
    const revision = ++availabilityRevision;
    try {
      const next = await invoke<Availability>('available_providers');
      if (revision !== availabilityRevision) return;
      applyAvailability(next);
      const status = await invoke<{ ready: boolean; message: string }>('voice_status');
      voiceReady = status.ready;
      voiceInfo = status.message;
    } catch (e) {
      error = String(e);
    }
  }
  async function selectProvider(value: Provider) {
    void saveModel(provider);
    provider = value;
    if (value === 'openai' && !availability.openai_images && attach) toggleCapture();
    try {
      await invoke('set_active_provider', { provider });
    } catch (e) {
      error = String(e);
    }
  }
  async function saveModel(value: Provider) {
    const model = models[value].trim();
    if (model && !/^[A-Za-z0-9._-]{1,128}$/.test(model)) return;
    try {
      await invoke('set_model_override', { provider: value, model });
    } catch (e) {
      error = `Could not save model: ${String(e)}`;
    }
  }
  function stop() {
    const id = activeRequest;
    activeRequest = 0;
    asking = false;
    const last = session.messages.at(-1);
    if (last && !last.complete) last.status = 'Stopped';
    if (id)
      void invoke('cancel_sage', { requestId: id }).catch(() => {
        /* cancellation is best effort */
      });
  }
  function cancelVoice() {
    const id = activeVoice;
    activeVoice = 0;
    voiceSequence++;
    voicePhase = 'idle';
    recorder.cancel();
    if (id)
      void invoke('cancel_voice', { requestId: id }).catch(() => {
        /* cancellation is best effort */
      });
  }
  function newChat() {
    stop();
    cancelVoice();
    conversation++;
    error = '';
    session.messages = [];
    session.draft = '';
  }
  function useGame(next: GameTarget | null) {
    if (gameKey(next) !== gameKey(game) || next?.pid !== game?.pid) {
      stop();
      cancelVoice();
      conversation++;
      error = '';
      if (gameKey(game)) sessions.set(gameKey(game), $state.snapshot(session));
      session = sessions.get(gameKey(next)) ?? {
        title: next?.title ?? '',
        messages: [],
        draft: '',
      };
      if (sessions.size > 8) {
        const oldest = sessions.keys().next().value;
        if (oldest) sessions.delete(oldest);
      }
    }
    game = next;
    preview = null;
    captureError = '';
    captureSequence++;
    capturing = false;
    capturePending = null;
    if (attach && game) void retake();
    void refresh();
    void tick().then(() => input?.focus());
  }
  function retake(): Promise<void> {
    const target = game;
    if (!target) return Promise.resolve();
    const seq = ++captureSequence;
    preview = null;
    captureError = '';
    capturing = true;
    const pending = (async () => {
      try {
        const result = await invoke<Preview>('capture_game', {
          hwnd: target.hwnd,
          pid: target.pid,
        });
        if (seq === captureSequence) preview = result;
      } catch (e) {
        if (seq === captureSequence) captureError = String(e);
      } finally {
        if (seq === captureSequence) {
          capturing = false;
          capturePending = null;
        }
      }
    })();
    capturePending = pending;
    return pending;
  }
  function toggleCapture() {
    attach = !attach;
    if (attach) void retake();
    else {
      captureSequence++;
      preview = null;
      capturing = false;
      captureError = '';
      capturePending = null;
    }
  }
  async function send(question = session.draft) {
    const text = question.trim();
    const target = game;
    if (!text || text.length > 4000 || !canSend || !target) return;
    const id = ++sequence;
    const convo = conversation;
    const shot = attach ? preview : null;
    const outgoing = [...history(session.messages), { role: 'user', content: text }];
    activeRequest = id;
    asking = true;
    error = '';
    session.messages = [
      ...session.messages.slice(-38),
      { role: 'user', content: text, screenshot: shot?.capturedAt },
      { role: 'assistant', content: '', status: 'Connecting…' },
    ];
    const index = session.messages.length - 1;
    session.draft = '';
    const channel = new Channel<SageEvent>();
    channel.onmessage = (event) => {
      if (!acceptsEvent(activeRequest, conversation, event)) return;
      const message = session.messages[index];
      if (!message) return;
      if (event.kind === 'chunk') message.content += event.text ?? '';
      else if (event.kind === 'status') message.status = event.text ?? '';
      else {
        asking = false;
        activeRequest = 0;
        if (event.kind === 'done') {
          message.complete = true;
          message.status =
            message.status === 'Web results received' ? 'Web research complete' : 'Answer complete';
        } else {
          message.status = 'Failed';
          error = event.message ?? 'Request failed';
          session.draft = text;
        }
      }
    };
    try {
      await invoke('ask_sage', {
        request: {
          requestId: id,
          conversationId: convo,
          provider,
          model: models[provider].trim() || null,
          messages: outgoing,
          hwnd: target.hwnd,
          pid: target.pid,
          gameTitle: session.title,
          captureId: shot?.id ?? null,
          hintOnly,
        },
        channel,
      });
    } catch (e) {
      if (id !== activeRequest || convo !== conversation) return;
      const message = session.messages[index];
      if (message) message.status = 'Failed';
      session.draft = text;
      asking = false;
      activeRequest = 0;
      error = String(e);
    }
  }
  async function startVoice() {
    if (voicePhase !== 'idle' || asking || !game) return;
    const seq = ++voiceSequence;
    voicePhase = 'starting';
    error = '';
    await refresh();
    if (seq !== voiceSequence) return;
    if (!voiceReady) {
      error = voiceInfo;
      voicePhase = 'idle';
      return;
    }
    if (attach) void retake();
    try {
      await recorder.start(microphone, () => {
        void finishVoice();
      });
      if (seq !== voiceSequence) return;
      voicePhase = 'recording';
      microphones = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'audioinput',
      );
    } catch (e) {
      if (seq !== voiceSequence) return;
      recorder.cancel();
      voicePhase = 'idle';
      error = `Microphone unavailable: ${String(e)}`;
    }
  }
  async function finishVoice() {
    if (voicePhase === 'starting') {
      cancelVoice();
      return;
    }
    if (voicePhase !== 'recording') return;
    const seq = voiceSequence;
    const id = ++sequence;
    activeVoice = id;
    voicePhase = 'transcribing';
    try {
      const wav = await recorder.finish();
      if (seq !== voiceSequence) return;
      const text = await invoke<string>('transcribe_voice', { requestId: id, wav });
      if (seq !== voiceSequence) return;
      session.draft = [session.draft, text].filter(Boolean).join(' ').slice(0, 4000);
      void tick().then(() => input?.focus());
    } catch (e) {
      if (seq === voiceSequence) error = String(e);
    } finally {
      if (seq === voiceSequence) {
        activeVoice = 0;
        voicePhase = 'idle';
      }
    }
  }
  function toggleVoice() {
    if (voicePhase === 'idle') void startVoice();
    else if (voicePhase === 'recording' || voicePhase === 'starting') void finishVoice();
    else cancelVoice();
  }
  async function hide() {
    await saveModel(provider);
    cancelVoice();
    try {
      await invoke('hide_overlay');
    } catch (e) {
      error = String(e);
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      void hide();
    }
  }
  async function quickAsk(text: string) {
    const convo = conversation;
    if (capturePending) await capturePending;
    if (convo === conversation) await send(text);
  }
  onMount(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void (async () => {
      try {
        const settings = await invoke<{
          active_provider: Provider;
          model_overrides?: Partial<Record<Provider, string>>;
        }>('get_settings');
        models = { ...models, ...settings.model_overrides };
        if (providers.some((p) => p.id === settings.active_provider))
          provider = settings.active_provider;
      } catch {
        /* first launch */
      }
      await refresh();
    })();
    const listeners = [
      listen<GameTarget | null>('overlay-status', (event) => {
        useGame(event.payload);
      }),
      listen<Availability>('provider-availability-changed', (event) => {
        availabilityRevision++;
        applyAvailability(event.payload);
      }),
      listen('overlay-hidden', cancelVoice),
      listen('voice-request', toggleVoice),
      listen('quick-ask', () => {
        void quickAsk('Give me a small hint about what to do next here.');
      }),
      listen('translate-request', () => {
        void quickAsk('Translate the text on this screen into English.');
      }),
    ];
    return () => {
      stop();
      cancelVoice();
      for (const listener of listeners)
        void listener.then((off) => {
          off();
        });
    };
  });
</script>

<svelte:window onkeydown={keydown} />
<main class="overlay">
  <header data-tauri-drag-region>
    <div class="brand" data-tauri-drag-region>
      <span class="spark">✦</span> SAGE <span class="subtitle">game companion</span>
    </div>
    <button
      class="icon"
      aria-label="New chat"
      onclick={newChat}
      title="New conversation for this game"
      type="button">＋</button
    >
    <button
      class="icon"
      aria-label="Close overlay"
      onclick={hide}
      title="Return to game · Esc"
      type="button">×</button
    >
  </header>
  <section class="context">
    <label for="game-title">PLAYING <span>edit if needed</span></label>
    <input
      id="game-title"
      class="game-title"
      disabled={!game || asking}
      maxlength="200"
      placeholder="Open with Ctrl+Shift+G over your game"
      bind:value={session.title}
    />
    <div class="options">
      <div class="providers" aria-label="Assistant">
        {#each providers as item (item.id)}<button
            class:chosen={provider === item.id}
            disabled={!availability[item.id] || asking}
            onclick={() => selectProvider(item.id)}
            type="button">{item.name}</button
          >{/each}
      </div>
      <label class="hint"><input type="checkbox" bind:checked={hintOnly} />Hints first</label>
    </div>
    <div class="model-row">
      <label for="model-choice">MODEL</label>
      <input
        id="model-choice"
        aria-invalid={!modelValid}
        aria-label="Model for {provider}"
        disabled={asking}
        list={provider === 'claude' ? 'claude-models' : undefined}
        maxlength="128"
        onblur={() => void saveModel(provider)}
        oninput={(event) => {
          models[provider] = event.currentTarget.value;
        }}
        placeholder={modelPlaceholders[provider]}
        value={models[provider]}
      />
      <datalist id="claude-models"
        ><option value="sonnet"></option><option value="opus"></option><option value="haiku"
        ></option></datalist
      >
      <span>Blank = default</span>
    </div>
    {#if !modelValid}<div class="model-error" role="alert">
        Use a model ID with letters, numbers, dots, hyphens, or underscores.
      </div>{/if}
    <div class="capture-bar">
      <label
        ><input
          checked={attach}
          disabled={!game || !imageSupported}
          onchange={toggleCapture}
          type="checkbox"
        />Screenshot</label
      >
      {#if attach}<button disabled={capturing || !game} onclick={retake} type="button"
          >{capturing ? 'Capturing…' : 'Retake'}</button
        >{/if}
      <span
        >{!imageSupported
          ? 'Native Codex needed for images'
          : attach
            ? (preview?.capturedAt ?? 'No frame yet')
            : 'Text only'}</span
      >
    </div>
    {#if attach && preview}<img
        class="preview"
        alt="Game frame that will be sent with your question"
        src={preview.dataUrl}
      />{/if}
    {#if attach && captureError}<div class="notice" role="alert">
        {captureError} Retake, or uncheck Screenshot to send text only.
      </div>{/if}
  </section>
  <section bind:this={messageList} class="messages" aria-label="Conversation" aria-live="polite">
    {#if session.messages.length === 0}<div class="welcome">
        <span class="eyebrow">A LITTLE HELP, RIGHT HERE</span>
        <h1>Stay in the game.</h1>
        <p>
          Ask a question by voice or text. Your assistant can use the captured frame and search for
          an answer.
        </p>
        {#if game}<div class="suggestions">
            {#each ['Where should I go next?', 'How does this work?'] as suggestion (suggestion)}<button
                disabled={!canSend}
                onclick={() => send(suggestion)}
                type="button">{suggestion} ↗</button
              >{/each}
          </div>{/if}
      </div>{/if}
    {#each session.messages as message, i (i)}<article class:user={message.role === 'user'}>
        <div class="message-label">
          {message.role === 'user' ? 'YOU' : 'SAGE'}{#if message.screenshot}<span
              >frame {message.screenshot}</span
            >{/if}
        </div>
        <Answer text={message.content} />
        {#if message.status}<div
            class="status"
            class:pulse={asking && i === session.messages.length - 1}
          >
            {message.status}
          </div>{/if}
      </article>{/each}
  </section>
  <footer>
    {#if error}<div class="notice" role="alert">
        {error}<button aria-label="Dismiss error" onclick={() => (error = '')} type="button"
          >×</button
        >
      </div>{/if}
    {#if !availability.claude && !availability.openai && !availability.gemini}<div class="notice">
        No assistant detected. Sign in to Claude Code or Codex, then <button
          onclick={async () => {
            await invoke('recheck_clis');
            await refresh();
          }}
          type="button">recheck</button
        >.
      </div>{/if}
    {#if provider === 'gemini'}<div class="voice-info">
        Gemini uses its knowledge and the image. Choose Claude or Codex for live search.
      </div>{/if}
    <textarea
      bind:this={input}
      aria-label="Your question"
      disabled={!game || voicePhase === 'transcribing'}
      maxlength="4000"
      onkeydown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void send();
        }
      }}
      placeholder={game ? 'Ask about the game…' : 'Focus your game, then press Ctrl+Shift+G'}
      rows="2"
      bind:value={session.draft}></textarea>
    <div class="actions">
      <button
        class="speak"
        class:recording={voicePhase === 'recording'}
        disabled={!game || asking}
        onclick={toggleVoice}
        title="Speak · Ctrl+Shift+V"
        type="button"
        >{voicePhase === 'idle'
          ? '● Speak'
          : voicePhase === 'starting'
            ? 'Cancel microphone'
            : voicePhase === 'recording'
              ? '■ Finish speaking'
              : 'Cancel transcription'}</button
      >
      <span class="voice-info"
        >{voicePhase === 'recording'
          ? 'Listening · up to 44s'
          : voicePhase === 'transcribing'
            ? 'Transcribing locally…'
            : 'Review, then send'}</span
      >
      {#if asking}<button class="send" onclick={stop} type="button">Stop</button>{:else}<button
          class="send"
          disabled={!canSend || !session.draft.trim()}
          onclick={() => send()}
          type="button">Send ↑</button
        >{/if}
    </div>
    {#if microphones.length > 1}<select
        aria-label="Microphone"
        disabled={voicePhase !== 'idle'}
        bind:value={microphone}
        ><option value="">Default microphone</option
        >{#each microphones as mic (mic.deviceId)}<option value={mic.deviceId}
            >{mic.label || 'Microphone'}</option
          >{/each}</select
      >{/if}
    <div class="shortcut">
      <span title={voiceInfo}
        >{voiceReady ? 'Voice stays on this PC' : 'Win+H also works in the input'}</span
      ><span>Ctrl+Shift+V to start/stop · Esc to return</span>
    </div>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
  }
  .overlay {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    width: 100%;
    overflow: hidden;
    color: #e9e9ed;
    background: #15171ded;
    border: 1px solid #ffffff20;
    border-radius: 14px;
    font:
      13px/1.5 'Segoe UI',
      sans-serif;
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border-bottom: 1px solid #ffffff12;
  }
  .brand {
    flex: 1;
    font-weight: 700;
    letter-spacing: 2px;
    font-size: 12px;
  }
  .spark {
    color: #e4bf7c;
    margin-right: 7px;
  }
  .subtitle {
    color: #8c929f;
    font-weight: 400;
    letter-spacing: 0;
    margin-left: 5px;
  }
  button {
    border: 1px solid #ffffff1c;
    background: #ffffff07;
    color: inherit;
    border-radius: 7px;
    padding: 5px 9px;
    cursor: pointer;
    font: inherit;
  }
  button:hover:not(:disabled) {
    background: #ffffff16;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: 2px solid #e4bf7c;
    outline-offset: 2px;
  }
  .icon {
    border: 0;
    font-size: 21px;
    line-height: 1;
    padding: 3px 6px;
    color: #aeb3bd;
  }
  .context {
    padding: 12px 16px;
    border-bottom: 1px solid #ffffff12;
  }
  .context > label {
    color: #b8a787;
    font-size: 9px;
    letter-spacing: 1.5px;
  }
  .context > label span {
    color: #737b88;
    letter-spacing: 0;
    margin-left: 8px;
  }
  .game-title {
    box-sizing: border-box;
    display: block;
    width: 100%;
    color: #f2ece2;
    background: transparent;
    border: none;
    font:
      600 15px/1.6 'Segoe UI',
      sans-serif;
    padding: 2px 0 8px;
  }
  .options,
  .capture-bar,
  .actions,
  .shortcut {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .options {
    justify-content: space-between;
    margin-top: 5px;
  }
  .providers {
    display: flex;
    gap: 4px;
  }
  .providers button {
    font-size: 11px;
    padding: 4px 8px;
  }
  .providers .chosen {
    color: #f1d6a4;
    border-color: #e4bf7c70;
    background: #e4bf7c13;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  input[type='checkbox'] {
    accent-color: #d8b67f;
  }
  .hint,
  .capture-bar {
    font-size: 11px;
    color: #adb3bf;
  }
  .model-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 9px;
  }
  .model-row label {
    color: #b8a787;
    font-size: 9px;
    letter-spacing: 1.5px;
  }
  .model-row input {
    box-sizing: border-box;
    min-width: 0;
    flex: 1;
    padding: 4px 7px;
    border: 1px solid #ffffff20;
    border-radius: 6px;
    color: #e9e9ed;
    background: #ffffff08;
    font: inherit;
    font-size: 11px;
  }
  .model-row input[aria-invalid='true'] {
    border-color: #e8a383;
  }
  .model-row span,
  .model-error {
    color: #9ba3b1;
    font-size: 10px;
  }
  .model-error {
    margin-top: 4px;
    color: #e8a383;
  }
  .capture-bar {
    margin-top: 10px;
  }
  .capture-bar button {
    font-size: 10px;
    padding: 1px 6px;
  }
  .capture-bar > span {
    margin-left: auto;
    color: #7f899b;
    font-size: 10px;
  }
  .preview {
    display: block;
    width: 100%;
    max-height: 100px;
    object-fit: contain;
    border-radius: 6px;
    background: #090b10;
    margin-top: 8px;
  }
  .messages {
    flex: 1;
    min-height: 70px;
    overflow-y: auto;
    padding: 18px 16px;
    scrollbar-width: thin;
    scrollbar-color: #49515f transparent;
  }
  .welcome {
    padding: 17px 0;
  }
  .eyebrow {
    color: #a6aabb;
    font-size: 9px;
    letter-spacing: 1.5px;
  }
  h1 {
    font-size: 24px;
    font-weight: 500;
    margin: 8px 0;
    letter-spacing: -0.5px;
  }
  .welcome p {
    color: #a3aab8;
    font-size: 12px;
    line-height: 1.8;
  }
  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 18px;
  }
  .suggestions button {
    font-size: 11px;
  }
  article {
    margin-bottom: 20px;
  }
  article.user {
    margin-left: 24px;
    border: 1px solid #ffffff0b;
    background: #ffffff06;
    border-radius: 9px;
    padding: 10px 12px;
  }
  .message-label {
    color: #c6b086;
    font-size: 9px;
    letter-spacing: 1.5px;
    margin-bottom: 6px;
  }
  .user .message-label {
    color: #929dad;
  }
  .message-label span {
    float: right;
    font-size: 9px;
    letter-spacing: 0;
  }
  .status {
    color: #8e9aa9;
    font-size: 10px;
    margin-top: 8px;
  }
  .pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.45;
    }
  }
  footer {
    padding: 12px 14px 9px;
    border-top: 1px solid #ffffff15;
    background: #11141aaa;
  }
  textarea {
    display: block;
    box-sizing: border-box;
    width: 100%;
    resize: vertical;
    max-height: 120px;
    min-height: 52px;
    border: 1px solid #ffffff20;
    border-radius: 8px;
    background: #090c12;
    color: #eee;
    padding: 9px 10px;
    font: inherit;
  }
  textarea::placeholder {
    color: #777f8f;
  }
  .actions {
    margin-top: 9px;
  }
  .speak {
    font-size: 11px;
    white-space: nowrap;
  }
  .recording {
    color: #ffd2cb;
    border-color: #ea8b7f;
    background: #bc503430;
  }
  .voice-info {
    flex: 1;
    font-size: 9px;
    color: #96a1b1;
  }
  .send {
    color: #171717;
    background: #e2c18b;
    border: none;
    font-size: 11px;
    font-weight: 600;
  }
  .send:hover:not(:disabled) {
    background: #f0d4a6;
  }
  .shortcut {
    justify-content: space-between;
    font-size: 9px;
    color: #747d8e;
    margin-top: 9px;
  }
  .notice {
    color: #edb69d;
    font-size: 11px;
    padding: 8px 0;
    overflow-wrap: anywhere;
  }
  .notice button {
    margin-left: 5px;
    padding: 0 5px;
  }
  select {
    margin-top: 6px;
    width: 100%;
    color: #bcc5d4;
    background: #1a1d25;
    border: 1px solid #ffffff15;
    border-radius: 5px;
    font-size: 10px;
    padding: 3px;
  }
  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
