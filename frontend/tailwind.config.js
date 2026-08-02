/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        'brand-dark': '#0F1117',
        'brand-light': '#F8F8F8',
        'brand-orange': '#F97316',
        'brand-text': '#1A1A1A',
        'brand-text-muted': '#6B7280',
        'brand-success': '#22C55E',
        'brand-warning': '#F97316',
        'brand-danger': '#EF4444',
      },
      fontFamily: {
        inter: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
