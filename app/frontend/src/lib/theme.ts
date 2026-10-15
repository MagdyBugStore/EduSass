import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
const initial = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

// Chart colors can't read CSS variables from SVG attributes, so they come from here.
export const CHART = {
  light: { accent: '#4F46E5', grid: '#E3E7F1', axis: '#667091', tipBg: '#FFFFFF', tipBorder: '#E3E7F1', tipText: '#121633', danger: '#DC2626' },
  dark: { accent: '#818CF8', grid: '#1E2850', axis: '#8C95B8', tipBg: '#0E1430', tipBorder: '#2A3566', tipText: '#E7EAF6', danger: '#F87171' },
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
