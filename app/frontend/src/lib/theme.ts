import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
const initial = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

// Chart colors can't read CSS variables from SVG attributes, so they come from here.
export const CHART = {
  light: { accent: '#0F5F56', accent2: '#C9A96A', go: '#0F8066', grid: '#E6E3D9', axis: '#6E7580', track: '#EFEDE5', tipBg: '#FFFFFF', tipBorder: '#E6E3D9', tipText: '#1F2937', danger: '#D64550' },
  dark: { accent: '#2AA08E', accent2: '#D6BA80', go: '#48CCA0', grid: '#223C38', axis: '#8EA39D', track: '#0E211F', tipBg: '#122825', tipBorder: '#223C38', tipText: '#ECF0EA', danger: '#EC6E7C' },
} as const;

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => ({
  theme: initial(),
  toggle: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
    try { localStorage.setItem(KEY, theme); } catch { /* private mode: theme just won't persist */ }
    set({ theme });
  },
}));
