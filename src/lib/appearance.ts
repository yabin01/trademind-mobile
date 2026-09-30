import { useSettings } from '@tm/store/settings';

/**
 * 外观主题：默认「红涨绿跌」（与桌面端一致）。
 * up = 涨（红 #ef4444），down = 跌（绿 #22c55e）。
 * 全库统一：图表/文本颜色必须来自本主题，禁止写死 hex。
 */
export type Palette = {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  up: string;
  down: string;
  accent: string;
  warn: string;
  dark: boolean;
};

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#F7F8FA',
    card: '#FFFFFF',
    text: '#0B0E14',
    sub: '#6B7280',
    border: '#E5E7EB',
    up: '#ef4444',
    down: '#22c55e',
    accent: '#3B82F6',
    warn: '#F59E0B',
    dark: false,
  },
  dark: {
    bg: '#0B0E14',
    card: '#151A23',
    text: '#E5E7EB',
    sub: '#9AA4B2',
    border: '#1F2937',
    up: '#ef4444',
    down: '#22c55e',
    accent: '#3B82F6',
    warn: '#F59E0B',
    dark: true,
  },
};

export function useAppearance(): Palette {
  const mode = useSettings((s) => s.mode);
  return PALETTES[mode];
}

export { PALETTES };
