import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import dsPreset from './lib/design-system/tailwind.config';

const config: Config = {
  presets: [dsPreset],
  // Οι `dark:` κλάσεις ακολουθούν το ΘΕΜΑ της εφαρμογής (.dark / data-theme="dark"), όχι το
  // prefers-color-scheme του λειτουργικού. Η προεπιλογή του Tailwind ('media') άναβε το `dark:` σε
  // Mac με σκούρο θέμα ενώ το φόντο μένει λευκό → ανοιχτό κείμενο σε λευκό, δυσανάγνωστο
  // (ίδιος κανόνας με το components/admin/home/home.css).
  darkMode: ['variant', ['&:is(.dark *)', '&:is([data-theme="dark"] *)']],
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './lib/design-system/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // Τα default μεγέθη του Tailwind (που χρησιμοποιούν τα shadcn components) πάνω στα ρευστά
      // rem tokens του app/globals.css — στο desktop ίδια px με τα defaults, στο κινητό κατά τον κανόνα.
      fontSize: {
        xs: ['var(--fs-12)', { lineHeight: '1rem' }],
        sm: ['var(--fs-14)', { lineHeight: '1.25rem' }],
        base: ['var(--fs-16)', { lineHeight: '1.5rem' }],
        lg: ['var(--fs-18)', { lineHeight: '1.75rem' }],
        xl: ['var(--fs-20)', { lineHeight: '1.75rem' }],
        '2xl': ['var(--fs-24)', { lineHeight: '2rem' }],
        '3xl': ['var(--fs-30)', { lineHeight: '2.25rem' }],
        '4xl': ['var(--fs-36)', { lineHeight: '2.5rem' }],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        sidebar: {
          DEFAULT: 'var(--sidebar)',
          foreground: 'var(--sidebar-foreground)',
          primary: 'var(--sidebar-primary)',
          'primary-foreground': 'var(--sidebar-primary-foreground)',
          accent: 'var(--sidebar-accent)',
          'accent-foreground': 'var(--sidebar-accent-foreground)',
          border: 'var(--sidebar-border)',
          ring: 'var(--sidebar-ring)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
        cta: 'var(--shadow-cta)',
      },
      keyframes: {
        ocrProgress: {
          '0%':   { left: '-33%' },
          '100%': { left: '100%' },
        },
      },
      animation: {
        ocrProgress: 'ocrProgress 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [forms, typography],
};

export default config;
