export function encodeWav(samples: Float32Array): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export function asBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

/** MediaRecorder owns microphone capture; Web Audio decodes/resamples before local STT. */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  async start(deviceId: string, onLimit: () => void): Promise<void> {
    const generation = ++this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      return;
    }
    this.stream = stream;
    this.chunks = [];
    const recorder = new MediaRecorder(stream);
    this.recorder = recorder;
    const chunks = this.chunks;
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.start(200);
    this.timer = setTimeout(onLimit, 44000);
  }

  async finish(): Promise<string> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') throw new Error('No active recording.');
    clearTimeout(this.timer);
    const stream = this.stream;
    const chunks = this.chunks;
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    await new Promise<void>((resolve, reject) => {
      recorder.onstop = () => {
        resolve();
      };
      recorder.onerror = () => {
        reject(new Error('Microphone recording failed.'));
      };
      recorder.stop();
    });
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
    const blob = new Blob(chunks, { type: recorder.mimeType });
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(await blob.arrayBuffer());
      if (audio.duration < 0.2)
        throw new Error('Hold the microphone button longer, or click to record.');
      const length = Math.min(45 * 16000, Math.ceil(audio.duration * 16000));
      const resampler = new OfflineAudioContext(1, length, 16000);
      const source = resampler.createBufferSource();
      source.buffer = audio;
      source.connect(resampler.destination);
      source.start();
      const resampled = await resampler.startRendering();
      return asBase64(encodeWav(resampled.getChannelData(0)));
    } finally {
      await context.close();
    }
  }

  cancel(): void {
    this.generation++;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    this.release();
    this.chunks = [];
  }

  private release(): void {
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => {
      t.stop();
    });
    this.stream = null;
    this.recorder = null;
  }
}
