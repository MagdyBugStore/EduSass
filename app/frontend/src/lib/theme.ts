import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const KEY = 'theme';
const initial = (): Theme => (document.documentElement.classList.contains('dark') ? 'dark' : 'light');

// Chart colors can't read CSS variables from SVG attributes, so they come from here.
export const CHART = {
  light: { accent: '#4F6BF5', accent2: '#4C8DF6', go: '#12A671', grid: '#E2E7F1', axis: '#7A86A6', track: '#E6EAF3', tipBg: '#FFFFFF', tipBorder: '#E2E7F1', tipText: '#1E2540', danger: '#E24C65' },
  dark: { accent: '#7B8CFF', accent2: '#4C8DF6', go: '#3DDC97', grid: '#38426A', axis: '#8F9AB8', track: '#1D2339', tipBg: '#1D2339', tipBorder: '#38426A', tipText: '#E8ECF8', danger: '#EE6A7F' },
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
