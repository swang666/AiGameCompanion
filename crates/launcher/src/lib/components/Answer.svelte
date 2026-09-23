<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { answerParts } from '../utils/research';
  let { text }: { text: string } = $props();
  let error = $state('');
  const parts = $derived(answerParts(text));
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
