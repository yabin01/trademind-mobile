import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';

/** 默认时间窗（与桌面端一致：近 90 天对齐 OKX 3 个月限制） */
export type RangeKey = '7d' | '30d' | '90d' | 'all';

interface SettingsState {
  mode: ThemeMode;
  range: RangeKey;
  setMode: (m: ThemeMode) => void;
  toggleMode: () => void;
  setRange: (r: RangeKey) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  mode: 'light',
  range: '90d',
  setMode: (mode) => set({ mode }),
  toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
  setRange: (range) => set({ range }),
}));

export function rangeDays(r: RangeKey): number | null {
  switch (r) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'all':
      return null;
  }
}
