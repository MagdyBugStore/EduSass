/** @type {import('tailwindcss').Config} */
// Every color is a CSS variable (an "r g b" triplet in src/index.css), so one class works in light and dark.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const shades = (hue, list) => Object.fromEntries(list.map((s) => [s, v(`${hue}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Tajawal', 'system-ui', 'sans-serif'] },
      colors: {
        canvas: v('canvas'), app: v('app'), sidebar: v('sidebar'), surface: v('surface'), sunken: v('sunken'), panel: v('panel'), go: v('go'), value: v('value'), danger: v('danger'),
        brand: { DEFAULT: v('accent'), dark: v('accent-strong'), light: v('accent-soft') },
        paper: v('app'), rule: v('border'), 'rule-soft': v('border-soft'),
        graphite: v('text'), pencil: v('muted'), margin: v('danger'), marker: v('highlight'),
        red: shades('red', [50, 200, 300, 600, 700, 800]),
        emerald: shades('emerald', [50, 300, 600, 700, 800]),
        amber: shades('amber', [50, 300, 500, 700, 800]),
        blue: shades('blue', [50, 300, 600]),
      },
      borderRadius: { panel: '14px' },
    },
  },
  plugins: [],
};
