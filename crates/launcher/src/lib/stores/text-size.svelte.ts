import { getCurrentWebview } from '@tauri-apps/api/webview';

export const TEXT_SIZES = [
  { id: 'small', label: 'Small', zoom: 0.9 },
  { id: 'normal', label: 'Normal', zoom: 1 },
  { id: 'large', label: 'Large', zoom: 1.15 },
  { id: 'larger', label: 'Larger', zoom: 1.3 },
] as const;

export type TextSize = (typeof TEXT_SIZES)[number]['id'];

let current = $state<TextSize>('normal');

export function getTextSize(): TextSize {
  return current;
}

export function normalizeTextSize(value: unknown): TextSize {
  return TEXT_SIZES.find((option) => option.id === value)?.id ?? 'normal';
}

export function stepTextSize(size: TextSize, direction: -1 | 1): TextSize {
  const index = TEXT_SIZES.findIndex((option) => option.id === size);
  const next = Math.max(0, Math.min(TEXT_SIZES.length - 1, index + direction));
  return TEXT_SIZES[next]?.id ?? 'normal';
}

export async function applyTextSize(value: unknown): Promise<void> {
  const size = normalizeTextSize(value);
  const zoom = TEXT_SIZES.find((option) => option.id === size)?.zoom ?? 1;
  await getCurrentWebview().setZoom(zoom);
  current = size;
}
