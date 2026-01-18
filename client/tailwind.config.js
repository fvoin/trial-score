/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        'display': ['Oswald', 'sans-serif'],
        'body': ['Source Sans 3', 'sans-serif'],
      },
      colors: {
        'trials': {
          'orange': '#FF6B35',
          'dark': '#1A1A2E',
          'darker': '#0F0F1A',
          'accent': '#00D9FF',
          'success': '#00FF88',
          'warning': '#FFD93D',
          'danger': '#FF4757',
        }
      }
    },
  },
  plugins: [],
}
