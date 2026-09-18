/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        civic: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc7fb',
          400: '#38a9f8',
          500: '#0e8ee9',
          600: '#0271c7',
          700: '#035aa1',
          800: '#074c85',
          900: '#0c406e',
          950: '#082949',
        },
        slate: {
          850: '#151e2e',
          950: '#0b0f17'
        }
      }
    },
  },
  plugins: [],
}
