/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          800: '#102a43',
          900: '#0f172a',
        },
        institutional: {
          blue: '#1e40af',
          saffron: '#ea580c',
          green: '#16a34a',
          amber: '#d97706',
          red: '#dc2626',
        }
      }
    },
  },
  plugins: [],
}
