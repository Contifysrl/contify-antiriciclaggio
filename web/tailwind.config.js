/** @type {import('tailwindcss').Config} */
export default {
  // NB: percorsi relativi alla cwd (la root del repo, da cui girano gli
  // script npm), non alla posizione di questo file. Stesso schema di Assist.
  content: ['./web/index.html', './web/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Stesse scale di Assist: variabili CSS "R G B" (per le trasparenze
        // tipo bg-teal-600/10). Il tema colore utente arriverà con AR-M2;
        // qui i valori di partenza sono la palette Contify Pantone 7474 C.
        teal: {
          50: 'rgb(var(--c-50) / <alpha-value>)',
          100: 'rgb(var(--c-100) / <alpha-value>)',
          200: 'rgb(var(--c-200) / <alpha-value>)',
          300: 'rgb(var(--c-300) / <alpha-value>)',
          400: 'rgb(var(--c-400) / <alpha-value>)',
          500: 'rgb(var(--c-500) / <alpha-value>)',
          600: 'rgb(var(--c-600) / <alpha-value>)',
          700: 'rgb(var(--c-700) / <alpha-value>)',
          800: 'rgb(var(--c-800) / <alpha-value>)',
          900: 'rgb(var(--c-900) / <alpha-value>)',
        },
        accento: { on: 'rgb(var(--c-on) / <alpha-value>)' },
        ink: {
          0: 'rgb(var(--k-0) / <alpha-value>)',
          50: 'rgb(var(--k-50) / <alpha-value>)',
          100: 'rgb(var(--k-100) / <alpha-value>)',
          200: 'rgb(var(--k-200) / <alpha-value>)',
          300: 'rgb(var(--k-300) / <alpha-value>)',
          400: 'rgb(var(--k-400) / <alpha-value>)',
          500: 'rgb(var(--k-500) / <alpha-value>)',
          600: 'rgb(var(--k-600) / <alpha-value>)',
          700: 'rgb(var(--k-700) / <alpha-value>)',
          800: 'rgb(var(--k-800) / <alpha-value>)',
          900: 'rgb(var(--k-900) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--rd-50) / <alpha-value>)', 100: 'rgb(var(--rd-100) / <alpha-value>)',
          200: 'rgb(var(--rd-200) / <alpha-value>)', 300: 'rgb(var(--rd-300) / <alpha-value>)',
          400: 'rgb(var(--rd-400) / <alpha-value>)', 500: 'rgb(var(--rd-500) / <alpha-value>)',
          600: 'rgb(var(--rd-600) / <alpha-value>)', 700: 'rgb(var(--rd-700) / <alpha-value>)',
          800: 'rgb(var(--rd-800) / <alpha-value>)', 900: 'rgb(var(--rd-900) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--am-50) / <alpha-value>)', 100: 'rgb(var(--am-100) / <alpha-value>)',
          200: 'rgb(var(--am-200) / <alpha-value>)', 300: 'rgb(var(--am-300) / <alpha-value>)',
          400: 'rgb(var(--am-400) / <alpha-value>)', 500: 'rgb(var(--am-500) / <alpha-value>)',
          600: 'rgb(var(--am-600) / <alpha-value>)', 700: 'rgb(var(--am-700) / <alpha-value>)',
          800: 'rgb(var(--am-800) / <alpha-value>)', 900: 'rgb(var(--am-900) / <alpha-value>)',
        },
        green: {
          50: 'rgb(var(--gr-50) / <alpha-value>)', 100: 'rgb(var(--gr-100) / <alpha-value>)',
          200: 'rgb(var(--gr-200) / <alpha-value>)', 300: 'rgb(var(--gr-300) / <alpha-value>)',
          400: 'rgb(var(--gr-400) / <alpha-value>)', 500: 'rgb(var(--gr-500) / <alpha-value>)',
          600: 'rgb(var(--gr-600) / <alpha-value>)', 700: 'rgb(var(--gr-700) / <alpha-value>)',
          800: 'rgb(var(--gr-800) / <alpha-value>)', 900: 'rgb(var(--gr-900) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
