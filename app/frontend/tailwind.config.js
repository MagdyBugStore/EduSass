/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Alexandria', 'system-ui', 'sans-serif'], ruqaa: ['"Aref Ruqaa"', 'Alexandria', 'serif'] },
      colors: { brand: { DEFAULT: '#1C3F94', dark: '#142f6e', light: '#E8EEFB' }, paper: '#F2F5F9', rule: '#C9D6EA', 'rule-soft': '#E4EBF5', pencil: '#6B7385', margin: '#D93A3F', marker: '#FFE14D', graphite: '#262A33' },
    },
  },
  plugins: [],
};
