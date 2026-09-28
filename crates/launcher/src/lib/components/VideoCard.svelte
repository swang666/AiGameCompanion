<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { onMount } from 'svelte';
  import { embedUrl, videoTime, type Video } from '../utils/video';

  let {
    video,
    active,
    onplay,
    onstop,
  }: {
    video: Video;
    active: boolean;
    onplay: () => void;
    onstop: () => void;
  } = $props();
  let error = $state('');
  let origin = $state('');
  onMount(() => {
    origin = window.location.origin;
  });
  async function open() {
    try {
      await invoke('open_url', { url: video.url });
    } catch (cause) {
      error = String(cause);
    }
  }
</script>

<section class="video-card" aria-label="Video: {video.title}">
  <div class="video-heading">
    <span>YouTube{video.start ? ` · from ${videoTime(video.start)}` : ''}</span>
  </div>
  <p class="video-title">{video.title}</p>
  {#if active}
    <iframe
      allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      src={embedUrl(video, origin)}
      title={video.title}
    ></iframe>
  {/if}
  <div class="video-actions">
    {#if active}<button onclick={onstop} type="button">Close video</button>
    {:else}<button class="play" onclick={onplay} type="button">▶ Play in chat</button>{/if}
    <button onclick={open} type="button">Open in browser ↗</button>
  </div>
  {#if active}<p class="help">
      If playback is unavailable, open in your browser. Ctrl+Shift+G returns to the game.
    </p>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
  .video-card {
    white-space: normal;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid #41526c;
    border-radius: 12px;
    background: #162235;
  }
  .video-heading,
  .help {
    color: #a8b9d0;
    font-size: 0.8em;
  }
  .video-title {
    margin: 6px 0 12px;
    font-weight: 600;
  }
  iframe {
    display: block;
    width: 100%;
    min-width: 200px;
    min-height: 200px;
    aspect-ratio: 16 / 9;
    border: 0;
    background: #000;
  }
  .video-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  button {
    cursor: pointer;
    font: inherit;
    font-size: 0.85em;
    border: 1px solid #546a87;
    color: #dbedff;
    border-radius: 7px;
    padding: 7px 10px;
    background: #24364e;
  }
  button:hover {
    background: #354f70;
  }
  .play {
    background: #2b4a70;
  }
  .help {
    margin: 10px 0 0;
  }
  [role='alert'] {
    color: #fca5a5;
  }
</style>
