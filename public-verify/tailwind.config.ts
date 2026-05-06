import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b172a',
        mint: '#10b981',
        sand: '#f7f1e5',
        sky: '#0ea5e9',
      },
    },
  },
  plugins: [],
};

export default config;
