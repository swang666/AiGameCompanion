<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { answerParts } from '../utils/research';
  import { answerVideos } from '../utils/video';
  import VideoCard from './VideoCard.svelte';
  let {
    text,
    showVideos = false,
    videoKey = '',
    activeVideo = '',
    onvideo = () => {
      /* Text-only callers do not play videos. */
    },
  }: {
    text: string;
    showVideos?: boolean;
    videoKey?: string;
    activeVideo?: string;
    onvideo?: (key: string) => void;
  } = $props();
  let error = $state('');
  const parts = $derived(answerParts(text));
  const videos = $derived(showVideos ? answerVideos(text) : []);
  async function open(url: string) {
    try {
      await invoke('open_url', { url });
    } catch (e) {
      error = String(e);
    }
  }
</script>

<div class="answer">
  {#each parts as part, i (i)}{#if part.url}<button
        onclick={() => part.url && open(part.url)}
        title={part.url}
        type="button">{part.text}</button
      >{:else}{part.text}{/if}{/each}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

{#each videos as video (video.id)}
  <VideoCard
    active={activeVideo === `${videoKey}:${video.id}`}
    onplay={() => {
      onvideo(`${videoKey}:${video.id}`);
    }}
    onstop={() => {
      onvideo('');
    }}
    {video}
  />
{/each}

<style>
  .answer {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.6;
  }
  button {
    color: #b4ddfa;
    text-decoration: underline;
    text-underline-offset: 3px;
    background: transparent;
    border: 0;
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  button:hover {
    color: white;
  }
  p {
    color: #fca5a5;
  }
</style>
