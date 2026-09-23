import { expect, it } from 'vitest';
import { encodeWav } from './audio';

it('encodes microphone samples as the exact PCM format accepted by local Whisper', () => {
  const wav = encodeWav(new Float32Array([-1, 0, 1]));
  const view = new DataView(wav.buffer);
  expect(wav.length).toBe(50);
  expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
  expect(view.getUint32(24, true)).toBe(16_000);
  expect(view.getUint16(22, true)).toBe(1);
  expect(view.getInt16(44, true)).toBe(-32_768);
  expect(view.getInt16(48, true)).toBe(32_767);
});
